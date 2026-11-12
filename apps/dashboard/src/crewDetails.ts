import type { AgentSession, RosterEntry } from './live/wire'
import type { Project } from './projects'
import { basisLabel, stateLabel, workLine } from './crew'

// What the panel shows when you click a robot: the facts the agent service already knows about that agent (a session, a
// helper agent or an agent file). Titles, tool names, counts and times only; never message text, tool inputs or results.

export interface DetailRow {
  label: string
  value: string
}
export interface DetailLink {
  label: string
  href: string
}
export interface CrewDetails {
  title: string
  /** A short line under the title, e.g. "Session of Claude Code". */
  kind: string
  rows: DetailRow[]
  links: DetailLink[]
}

/** A robot that is working or waiting for you gets the marker over its head. */
export const isActive = (entry: RosterEntry): boolean => entry.state === 'running' || entry.state === 'needs-you'

/** "just now", "3 min ago", "2 h ago", "3 days ago". A time a little in the future counts as just now. */
export function agoText(at: number, now: number): string {
  const s = Math.max(0, (now - at) / 1000)
  if (s < 45) return 'just now'
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  return `${Math.round(s / 86400)} days ago`
}

/** A link that opens a file or folder in VS Code (the browser asks before it leaves the page). */
export function vscodeUrl(path: string, line?: number): string {
  const forward = path.replace(/\\/g, '/')
  return `vscode://file${forward.startsWith('/') ? '' : '/'}${encodeURI(forward)}${line ? `:${line}` : ''}`
}

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

/** The name to call an agent by: the title a session wrote, otherwise its name. */
const titleOf = (e: RosterEntry): string => (e.role === 'session' ? e.description ?? e.name : e.name)

function sessionRecord(entry: RosterEntry, project: Project): AgentSession | undefined {
  return project.live?.sessions.find((s) => `session:${s.agent}:${s.id}` === entry.id)
}

export function crewDetails(entry: RosterEntry, project: Project, now: number): CrewDetails {
  const rows: DetailRow[] = []
  const add = (label: string, value: string | null | undefined) => {
    if (value) rows.push({ label, value })
  }

  const kind =
    entry.role === 'session'
      ? `Session of ${entry.agentLabel}`
      : entry.role === 'subagent'
        ? `Helper agent of ${entry.agentLabel}`
        : `Agent defined for ${entry.agentLabel}${entry.scope === 'project' ? ' (this project)' : entry.scope === 'user' ? ' (your account)' : ''}`

  const inferred = entry.role !== 'definition' && !/inferred/i.test(entry.stateNote) ? ' (inferred from timing)' : ''
  add('State', `${cap(stateLabel(entry.state))} · ${entry.stateNote}${inferred}`)
  add('Doing now', workLine(entry) ?? 'nothing right now')
  add('Last activity', entry.lastSeenAt === null ? 'never seen running' : `${agoText(entry.lastSeenAt, now)} · ${new Date(entry.lastSeenAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`)
  add('Model', entry.model ?? (entry.role === 'definition' ? 'not set in the file' : 'not reported'))

  if (entry.role === 'session') {
    const record = sessionRecord(entry, project)
    if (record) {
      add('Tool calls', String(record.toolCount))
      const mcp = Object.entries(record.mcpCalls).sort((a, b) => b[1] - a[1])
      if (mcp.length > 0) add('MCP servers', mcp.map(([name, n]) => `${name} ×${n}`).join(', '))
      if (record.plan && record.plan.total > 0) add('Plan', `${record.plan.done} of ${record.plan.total} tasks done`)
    }
  }
  if (entry.role === 'definition') add('Tools', entry.tools && entry.tools.length > 0 ? entry.tools.join(', ') : "the tool's default tools")
  if (entry.role === 'subagent') {
    const parent = entry.parentId ? project.live?.roster.find((r) => r.id === entry.parentId) : undefined
    add('Started by', parent ? titleOf(parent) : null)
    add('Task', entry.description)
  }
  if (entry.role === 'definition') add('Purpose', entry.description)
  if (entry.runs > 0) add('Runs', `${entry.runs} in the last 7 days`)
  add('Bay', `${entry.department} · ${basisLabel(entry.departmentBasis)}`)
  if (entry.role === 'definition') add('File', entry.definedIn)

  const links: DetailLink[] = []
  if (entry.definedIn) links.push({ label: 'Open the agent file in VS Code', href: vscodeUrl(entry.definedIn) })
  if (project.live?.path) links.push({ label: 'Open the project folder in VS Code', href: vscodeUrl(project.live.path) })

  return { title: titleOf(entry), kind, rows, links }
}
