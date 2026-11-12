import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { departmentFor } from './department.ts'
import type { AgentKind, AgentSession, Department, DepartmentBasis, RosterEntry, RosterState, SubagentRun } from './model.ts'
import { parseToml } from './mcp.ts'
import { asString, readHead } from './util.ts'

// The roster: every agent that exists in a project, whether or not it is working. Sources are the agent files of the
// three tools (definitions) and the sessions seen on this computer. Only names, descriptions, tool names and models
// are read from an agent file; its instructions are never read out.

export interface AgentDefinition {
  name: string
  agent: AgentKind
  scope: 'user' | 'project'
  /** The agent file. */
  path: string
  description: string | null
  model: string | null
  tools: string[] | null
}

export interface ParsedAgentFile {
  name: string
  description: string | null
  tools: string[] | null
  model: string | null
}

const MAX_FILE_BYTES = 16 * 1024
const MAX_FILES_PER_FOLDER = 200
const MAX_DESCRIPTION = 200

// ---- reading one agent file

const oneLine = (text: string): string => text.replace(/\s+/g, ' ').trim()
const cut = (text: string): string => (text.length > MAX_DESCRIPTION ? text.slice(0, MAX_DESCRIPTION - 1).trimEnd() + '…' : text)

function unquote(value: string): string {
  const v = value.trim()
  if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) return v.slice(1, -1)
  return v
}

function splitList(value: string): string[] {
  return value
    .split(',')
    .map((part) => unquote(part))
    .filter((part) => part.length > 0)
}

/** Key/value pairs of the `---` block at the top of a markdown file. Values are text, or a list for a flow array or `- item` lines. */
function frontMatter(text: string): Record<string, string | string[]> {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/)
  const out: Record<string, string | string[]> = {}
  if (lines[0]?.trim() !== '---') return out
  let end = lines.findIndex((line, i) => i > 0 && line.trim() === '---')
  if (end === -1) end = lines.length
  for (let i = 1; i < end; i++) {
    const m = lines[i].match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/)
    if (!m) continue
    const key = m[1].toLowerCase()
    const raw = m[2].trim()
    if (raw.startsWith('[')) {
      out[key] = splitList(raw.replace(/^\[/, '').replace(/\]\s*$/, ''))
    } else if (raw === '' || raw === '>' || raw === '|' || raw === '>-' || raw === '|-') {
      // the indented lines after the key belong to it
      let j = i + 1
      while (j < end && /^\s+\S/.test(lines[j])) j++
      const block = lines.slice(i + 1, j).map((l) => l.trim())
      i = j - 1
      if (raw === '') {
        const listed = block.filter((l) => l.startsWith('- ')).map((l) => unquote(l.slice(2)))
        out[key] = listed.length > 0 ? listed : block.join(' ')
      } else out[key] = block.join(' ')
    } else out[key] = unquote(raw)
  }
  return out
}

function toList(value: string | string[] | undefined): string[] | null {
  if (value === undefined) return null
  const list = Array.isArray(value) ? value : splitList(value)
  return list.length > 0 ? list : null
}

function fileStem(file: string): string {
  return (file.split(/[\\/]/).pop() ?? file).replace(/\.agent\.md$/i, '').replace(/\.(md|toml)$/i, '')
}

/** Name, description, tool names and model of one agent file (Claude `.md`, Copilot `.agent.md`, Codex `.toml`). Never reads the instructions. */
export function parseAgentFile(text: string, fileName: string): ParsedAgentFile {
  const stem = fileStem(fileName)
  if (/\.toml$/i.test(fileName)) {
    let doc: Record<string, unknown> = {}
    try {
      // the instructions are a long quoted block: cut them out before parsing
      doc = parseToml(text.replace(/"""[\s\S]*?"""/g, '""').replace(/'''[\s\S]*?'''/g, "''")) as Record<string, unknown>
    } catch {
      doc = {}
    }
    const description = asString(doc.description)
    return { name: asString(doc.name) ?? stem, description: description ? cut(oneLine(description)) : null, tools: null, model: asString(doc.model) }
  }
  const fm = frontMatter(text)
  const text1 = (v: string | string[] | undefined): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
  const description = text1(fm.description)
  return { name: text1(fm.name) ?? stem, description: description ? cut(oneLine(description)) : null, tools: toList(fm.tools), model: text1(fm.model) }
}

// ---- finding the agent files of a project

const AGENT_FOLDERS = (project: string, home: string): [string, AgentKind, 'user' | 'project', string][] => [
  [join(project, '.claude', 'agents'), 'claude-code', 'project', '.md'],
  [join(home, '.claude', 'agents'), 'claude-code', 'user', '.md'],
  [join(project, '.github', 'agents'), 'copilot', 'project', '.agent.md'],
  [join(project, '.codex', 'agents'), 'codex', 'project', '.toml'],
]

export function scanAgentDefinitions(projectPath: string, home: string): AgentDefinition[] {
  const out: AgentDefinition[] = []
  for (const [dir, agent, scope, ext] of AGENT_FOLDERS(projectPath, home)) {
    let files: string[] = []
    try {
      files = readdirSync(dir)
    } catch {
      continue
    }
    for (const file of files.filter((f) => f.endsWith(ext)).slice(0, MAX_FILES_PER_FOLDER)) {
      const path = join(dir, file)
      const parsed = parseAgentFile(readHead(path, MAX_FILE_BYTES), file)
      out.push({ ...parsed, agent, scope, path })
    }
  }
  return out
}

// ---- which bay an agent sits in

// A guess from words. Order matters: "code-reviewer" is about review, not code; "api-designer" about design, not the API.
type Words = { prefixes: string[]; exact: string[] }
const WORDS: [Department, Words][] = [
  ['review', { prefixes: ['test', 'review', 'audit', 'secur', 'lint', 'accessib', 'verif', 'validat', 'qualit', 'inspect', 'critic'], exact: ['qa', 'a11y'] }],
  ['planning', { prefixes: ['plan', 'design', 'architect', 'research', 'specif', 'analy', 'product', 'requirement', 'strateg', 'scope', 'brainstorm', 'roadmap'], exact: ['ux', 'pm', 'spec'] }],
  ['development', { prefixes: ['release', 'deploy', 'ship', 'publish', 'merge', 'changelog', 'integrat', 'devops', 'docs', 'document', 'rollout', 'develop', 'engineer', 'backend', 'frontend', 'code', 'implement', 'build', 'fix', 'refactor', 'database', 'migrat', 'program', 'api', 'python', 'postgres', 'spark', 'typescript', 'javascript', 'react', 'node', 'java', 'rust', 'golang'], exact: ['ci', 'cd', 'pr', 'dev', 'ui', 'db', 'sql', 'be', 'fe', 'etl', 'go'] }],
]

function wordsOf(text: string): string[] {
  return text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

function departmentOfWord(word: string): Department | null {
  for (const [dept, { prefixes, exact }] of WORDS) {
    if (exact.includes(word) || prefixes.some((p) => word.startsWith(p))) return dept
  }
  return null
}

function departmentOfTools(tools: string[] | null): Department | null {
  if (!tools || tools.length === 0) return null
  const found = tools.map((t) => departmentFor(t.replace(/\(.*$/, '').trim()))
  if (found.includes('development')) return 'development'
  if (found.includes('planning')) return 'planning'
  return found[0] ?? null
}

/** The bay an agent that has not run belongs in: its name, then the first subject word of its description, then its tools. Always a guess, and says so. */
export function guessDepartment(def: Pick<AgentDefinition, 'name' | 'description' | 'tools'>): { department: Department; basis: DepartmentBasis } {
  const nameWords = wordsOf(def.name)
  for (const [dept] of WORDS) {
    if (nameWords.some((w) => departmentOfWord(w) === dept)) return { department: dept, basis: 'name' }
  }
  for (const w of wordsOf(def.description ?? '')) {
    const dept = departmentOfWord(w)
    if (dept) return { department: dept, basis: 'description' }
  }
  const byTools = departmentOfTools(def.tools)
  if (byTools) return { department: byTools, basis: 'tools' }
  return { department: 'planning', basis: 'unknown' }
}

// ---- the roster of one project

const STATE_ORDER: Record<RosterState, number> = { running: 0, 'needs-you': 1, idle: 2, standby: 3 }
const ENDED_NOTE = 'Inferred: its last session had no activity for over 24 hours.'

function fromDefinition(def: AgentDefinition): RosterEntry {
  const { department, basis } = guessDepartment(def)
  const file = def.path.split(/[\\/]/).slice(-3).join('/')
  return {
    id: `def:${def.agent}:${def.scope}:${def.name.toLowerCase()}`,
    name: def.name,
    agent: def.agent,
    agentLabel: def.agent === 'claude-code' ? 'Claude Code' : def.agent === 'codex' ? 'Codex' : def.agent === 'copilot' ? 'GitHub Copilot' : 'Other',
    role: 'definition',
    source: 'files',
    scope: def.scope,
    definedIn: def.path,
    description: def.description,
    model: def.model,
    tools: def.tools,
    department,
    departmentBasis: basis,
    state: 'standby',
    stateNote: def.agent === 'claude-code' ? `Defined in ${file}. No run of it was seen in the last 7 days.` : `Defined in ${file}. Never seen running (subagent runs are not read yet).`,
    lastSeenAt: null,
    currentTool: null,
    parentId: null,
    runs: 0,
    seated: def.scope === 'project',
  }
}

function fromSession(s: AgentSession, state: RosterState, id: string, note: string): RosterEntry {
  return {
    id,
    name: s.agentLabel,
    agent: s.agent,
    agentLabel: s.agentLabel,
    role: 'session',
    source: s.source,
    scope: null,
    definedIn: null,
    description: s.title,
    model: s.model,
    tools: null,
    department: s.department ?? 'planning',
    departmentBasis: s.department ? 'activity' : 'unknown',
    state,
    stateNote: note,
    lastSeenAt: s.lastActivityAt,
    currentTool: state === 'running' || state === 'needs-you' ? s.currentTool : null,
    parentId: null,
    runs: 0,
    seated: true,
  }
}

const typeKey = (agent: AgentKind, type: string): string => `${agent}:${type.toLowerCase()}`
const times = (n: number): string => `${n} time${n === 1 ? '' : 's'}`

/** An agent that ran as a subagent: working while any run works, otherwise idle (asleep), never waiting for a person. */
function withRuns(entry: RosterEntry, runs: SubagentRun[]): RosterEntry {
  const newest = [...runs].sort((a, b) => b.lastActivityAt - a.lastActivityAt)
  const working = newest.some((r) => r.state === 'running')
  const withDepartment = newest.find((r) => r.department !== null)
  return {
    ...entry,
    state: working ? 'running' : 'idle',
    stateNote: working ? `Working now as a subagent. ${newest.find((r) => r.state === 'running')?.stateNote ?? ''}`.trim() : `Ran ${times(runs.length)} as a subagent in the last 7 days; newest: ${newest[0].stateNote}`,
    lastSeenAt: newest[0].lastActivityAt,
    currentTool: working ? (newest.find((r) => r.state === 'running')?.currentTool ?? null) : null,
    runs: runs.length,
    department: withDepartment?.department ?? entry.department,
    departmentBasis: withDepartment?.department ? 'activity' : entry.departmentBasis,
    seated: true,
  }
}

/** Every agent of one project as a robot: agent files (standing by) and sessions (working, waiting or idle), most active first. */
export function buildRoster(defs: AgentDefinition[], sessions: AgentSession[], _now: number, runs: SubagentRun[] = []): RosterEntry[] {
  const runsByType = new Map<string, SubagentRun[]>()
  for (const r of runs) {
    const key = typeKey(r.agent, r.agentType)
    const list = runsByType.get(key)
    if (list) list.push(r)
    else runsByType.set(key, [r])
  }
  const out: RosterEntry[] = []
  const matched = new Set<string>()
  for (const def of defs) {
    const key = typeKey(def.agent, def.name)
    const mine = runsByType.get(key)
    const entry = fromDefinition(def)
    if (mine && mine.length > 0) {
      matched.add(key)
      out.push(withRuns(entry, mine))
    } else out.push(entry)
  }
  const liveOf = new Set<string>()
  const liveIds = new Set<string>()
  for (const s of sessions) {
    if (s.state === 'ended') continue
    liveOf.add(`${s.agent}:${s.agentLabel}`)
    liveIds.add(`session:${s.agent}:${s.id}`)
    out.push(fromSession(s, s.state === 'running' ? 'running' : s.state === 'needs-you' ? 'needs-you' : 'idle', `session:${s.agent}:${s.id}`, s.stateNote))
  }
  // agent types without an agent file (built-in ones such as Explore) become their own robot
  for (const [key, list] of runsByType) {
    if (matched.has(key)) continue
    const newest = [...list].sort((a, b) => b.lastActivityAt - a.lastActivityAt)[0]
    const guess = guessDepartment({ name: newest.agentType, description: null, tools: null })
    const parent = `session:${newest.agent}:${newest.parentId}`
    const base: RosterEntry = {
      id: `sub:${key}`,
      name: newest.agentType,
      agent: newest.agent,
      agentLabel: newest.agent === 'claude-code' ? 'Claude Code' : newest.agent === 'codex' ? 'Codex' : newest.agent === 'copilot' ? 'GitHub Copilot' : 'Other',
      role: 'subagent',
      source: 'files',
      scope: null,
      definedIn: null,
      description: newest.description,
      model: newest.model,
      tools: null,
      department: guess.department,
      departmentBasis: guess.basis,
      state: 'idle',
      stateNote: '',
      lastSeenAt: newest.lastActivityAt,
      currentTool: null,
      parentId: liveIds.has(parent) ? parent : null,
      runs: 0,
      seated: true,
    }
    out.push(withRuns(base, list))
  }
  // old sessions fold into one sleeping robot per tool, unless that tool has a live session
  const newestEnded = new Map<string, AgentSession>()
  for (const s of sessions) {
    if (s.state !== 'ended') continue
    const key = `${s.agent}:${s.agentLabel}`
    if (liveOf.has(key)) continue
    const held = newestEnded.get(key)
    if (!held || s.lastActivityAt > held.lastActivityAt) newestEnded.set(key, s)
  }
  for (const [key, s] of newestEnded) out.push(fromSession(s, 'idle', `session:${key}:ended`, ENDED_NOTE))

  out.sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state] || (b.lastSeenAt ?? -1) - (a.lastSeenAt ?? -1) || a.name.localeCompare(b.name))
  return out
}
