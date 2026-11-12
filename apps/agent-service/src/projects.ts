import { createHash } from 'node:crypto'
import type { AgentSession, Department, DocFile, HarnessItem, McpServer, ProjectView, SubagentRun } from './model.ts'
import type { Discovered } from './discover.ts'
import { buildRoster, type AgentDefinition } from './roster.ts'
import { baseName, cleanPath, projectKey } from './util.ts'

export interface ProjectDeps {
  now: number
  mcpFor(projectPath: string): McpServer[]
  harnessFor(projectPath: string): HarnessItem[]
  /** Markdown files of the project. Without it the list is empty. */
  docsFor?(projectPath: string): { files: DocFile[]; truncated: boolean }
  /** Agent files (Claude, Copilot, Codex) of the project and the user. Without it the roster holds sessions only. */
  definitionsFor?(projectPath: string): AgentDefinition[]
  /** Subagent runs of all projects; each goes to the project of its folder. */
  runs?: SubagentRun[]
  /** Project folders (projectKey) left out of the hub by the settings. */
  hidden?: ReadonlySet<string>
  /** Display names from the settings, keyed by projectKey. */
  names?: Record<string, string>
  /** Folders with agent setup files but maybe no recent session; added as idle projects. */
  discovered?: Discovered[]
}

/** The sky arc has room for about this many islands. */
const MAX_PROJECTS = 8
const SEATS_PER_BAY = 3

function projectId(path: string): string {
  const slug = baseName(path).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'project'
  return `${slug}-${createHash('sha1').update(projectKey(path)).digest('hex').slice(0, 6)}`
}

/** Groups sessions of all agents by folder and turns each group into what the hub shows for one project. */
export function buildProjects(all: AgentSession[], deps: ProjectDeps): ProjectView[] {
  // one session per agent + id; a file-based record wins over a hook report of the same session
  const unique = new Map<string, AgentSession>()
  for (const s of all) {
    const key = `${s.agent}:${s.id}`
    const held = unique.get(key)
    if (!held || (held.source === 'hook' && s.source === 'files')) unique.set(key, s)
  }
  const runsOf = new Map<string, SubagentRun[]>()
  for (const r of deps.runs ?? []) {
    const key = projectKey(r.projectPath)
    const list = runsOf.get(key)
    if (list) list.push(r)
    else runsOf.set(key, [r])
  }
  const groups = new Map<string, AgentSession[]>()
  for (const s of unique.values()) {
    const key = projectKey(s.projectPath)
    const list = groups.get(key)
    if (list) list.push(s)
    else groups.set(key, [s])
  }

  const projects: ProjectView[] = []
  const hidden = deps.hidden ?? new Set<string>()
  const nameOf = (path: string) => deps.names?.[projectKey(path)] ?? baseName(path)
  for (const [groupKey, sessions] of groups) {
    if (hidden.has(groupKey)) continue
    sessions.sort((a, b) => b.lastActivityAt - a.lastActivityAt)
    const live = sessions.filter((s) => s.state !== 'ended')
    if (live.length === 0) continue
    const newest = sessions[0]
    const path = newest.projectPath

    const roster = buildRoster(deps.definitionsFor?.(path) ?? [], sessions, deps.now, runsOf.get(projectKey(path)) ?? [])
    // a seat is taken by every robot that works or waits, subagents included
    const agents = { planning: 0, development: 0, review: 0 } as Record<Department, number>
    for (const r of roster) {
      if (r.state !== 'running' && r.state !== 'needs-you') continue
      agents[r.department] = Math.min(SEATS_PER_BAY, agents[r.department] + 1)
    }
    const waiting = live.filter((s) => s.state === 'needs-you').sort((a, b) => b.lastActivityAt - a.lastActivityAt)
    const running = live.filter((s) => s.state === 'running')
    const status = waiting.length > 0 ? 'needs-you' : running.length > 0 ? 'running' : 'idle'
    const planned = live.find((s) => s.plan && s.plan.total > 0)
    const calls: Record<string, number> = {}
    for (const s of sessions) for (const [server, count] of Object.entries(s.mcpCalls)) calls[server] = (calls[server] ?? 0) + count

    const mcp = deps.mcpFor(path).map((m) => ({ ...m, recentCalls: calls[m.name] ?? 0 }))
    const configured = new Set(mcp.map((m) => m.name))
    for (const [name, count] of Object.entries(calls)) {
      if (!configured.has(name)) {
        mcp.push({ name, scope: 'user', agent: newest.agent, transport: 'unknown', target: '', envKeys: [], configFile: '(seen in tool calls)', status: 'seen-in-use', recentCalls: count })
      }
    }

    projects.push({
      id: projectId(path),
      name: nameOf(path),
      path,
      status,
      activity: status === 'idle' ? 0.15 : Math.max(0.3, Math.min(1, (running.length + waiting.length * 0.5) / Math.max(1, live.length))),
      progress: planned?.plan ? planned.plan.done / planned.plan.total : null,
      attention: waiting[0] ? (waiting[0].department ?? 'planning') : null,
      agents,
      discovered: false,
      sessions,
      roster,
      mcp,
      harness: deps.harnessFor(path),
      docs: deps.docsFor?.(path).files ?? [],
      docsTruncated: deps.docsFor?.(path).truncated ?? false,
    })
  }
  projects.sort((a, b) => b.sessions[0].lastActivityAt - a.sessions[0].lastActivityAt)
  const out = projects.slice(0, MAX_PROJECTS)
  const taken = new Set(out.map((p) => projectKey(p.path)))
  const idle = [...(deps.discovered ?? [])].sort((a, b) => b.mtime - a.mtime)
  for (const d of idle) {
    if (out.length >= MAX_PROJECTS) break
    const key = projectKey(d.path)
    if (taken.has(key) || hidden.has(key)) continue
    taken.add(key)
    const path = cleanPath(d.path)
    out.push({
      id: projectId(path),
      name: nameOf(path),
      path,
      status: 'idle',
      activity: 0.15,
      progress: null,
      attention: null,
      agents: { planning: 0, development: 0, review: 0 },
      discovered: true,
      sessions: [],
      roster: buildRoster(deps.definitionsFor?.(path) ?? [], [], deps.now, runsOf.get(key) ?? []),
      mcp: deps.mcpFor(path),
      harness: deps.harnessFor(path),
      docs: deps.docsFor?.(path).files ?? [],
      docsTruncated: deps.docsFor?.(path).truncated ?? false,
    })
  }
  return out
}
