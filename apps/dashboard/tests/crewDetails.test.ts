import { describe, expect, it } from 'vitest'
import type { RosterEntry } from '../src/live/wire'
import type { Project } from '../src/projects'
import { agoText, crewDetails, isActive, vscodeUrl } from '../src/crewDetails'

const NOW = Date.parse('2026-11-10T12:00:00Z')
const MIN = 60_000

const entry = (over: Partial<RosterEntry> = {}): RosterEntry => ({
  id: 'session:claude:abc',
  name: 'Claude Code',
  agent: 'claude',
  agentLabel: 'Claude Code',
  role: 'session',
  source: 'files',
  scope: null,
  definedIn: null,
  description: 'Fix the login bug',
  model: 'claude-opus',
  tools: null,
  department: 'development',
  departmentBasis: 'activity',
  state: 'running',
  stateNote: 'working: wrote a record 20 s ago (inferred from timing)',
  lastSeenAt: NOW - 3 * MIN,
  currentTool: 'Edit',
  parentId: null,
  runs: 0,
  seated: true,
  ...over,
})

const project = (over: Partial<Project> = {}, roster: RosterEntry[] = [], sessions: unknown[] = []): Project => ({
  id: 'p',
  name: 'P',
  accent: '#fff',
  status: 'running',
  activity: 0.5,
  progress: 0,
  agents: { planning: 0, development: 0, review: 0 },
  source: 'live',
  live: { path: 'E:/Projects/App', roster, sessions } as unknown as Project['live'],
  ...over,
})

describe('agoText', () => {
  it('says how long ago in plain words', () => {
    expect(agoText(NOW - 5_000, NOW)).toBe('just now')
    expect(agoText(NOW - 3 * MIN, NOW)).toBe('3 min ago')
    expect(agoText(NOW - 2 * 3600_000, NOW)).toBe('2 h ago')
    expect(agoText(NOW - 3 * 86400_000, NOW)).toBe('3 days ago')
  })
  it('never says negative time (a clock a little ahead)', () => {
    expect(agoText(NOW + 10 * MIN, NOW)).toBe('just now')
  })
})

describe('vscodeUrl', () => {
  it('opens a Windows path, with spaces escaped and slashes forward', () => {
    expect(vscodeUrl('E:\\Projects\\App\\README.md')).toBe('vscode://file/E:/Projects/App/README.md')
  })
  it('opens a Unix path', () => {
    expect(vscodeUrl('/home/me/app/notes.md')).toBe('vscode://file/home/me/app/notes.md')
  })
  it('adds a line number when asked', () => {
    expect(vscodeUrl('/a/b.md', 12)).toBe('vscode://file/a/b.md:12')
  })
})

describe('isActive', () => {
  it('is true only for working and waiting agents', () => {
    expect(isActive(entry({ state: 'running' }))).toBe(true)
    expect(isActive(entry({ state: 'needs-you' }))).toBe(true)
    expect(isActive(entry({ state: 'idle' }))).toBe(false)
    expect(isActive(entry({ state: 'standby' }))).toBe(false)
  })
})

describe('crewDetails for a session', () => {
  const e = entry()
  const sessions = [{ id: 'abc', agent: 'claude', toolCount: 41, mcpCalls: { github: 3, notes: 1 }, plan: { done: 2, total: 5 }, title: 'Fix the login bug' }]
  const d = crewDetails(e, project({}, [e], sessions), NOW)
  const row = (label: string) => d.rows.find((r) => r.label === label)?.value

  it('names the session by the title it wrote and says what kind it is', () => {
    expect(d.title).toBe('Fix the login bug')
    expect(d.kind).toBe('Session of Claude Code')
  })

  it('shows its state with the reason, and that it is inferred', () => {
    expect(row('State')).toContain('Working')
    expect(row('State')).toContain('inferred from timing')
  })

  it('shows what it is doing, when it was last active and its model', () => {
    expect(row('Doing now')).toContain('editing files')
    expect(row('Last activity')).toContain('3 min ago')
    expect(row('Model')).toBe('claude-opus')
  })

  it("adds the session's own counts: tool calls, MCP servers, plan", () => {
    expect(row('Tool calls')).toBe('41')
    expect(row('MCP servers')).toBe('github ×3, notes ×1')
    expect(row('Plan')).toBe('2 of 5 tasks done')
  })

  it('says which bay it is in and how that was decided', () => {
    expect(row('Bay')).toContain('development')
    expect(row('Bay')).toContain('from what it did')
  })

  it('offers the project folder in VS Code, and no agent file (a session has none)', () => {
    expect(d.links).toEqual([{ label: 'Open the project folder in VS Code', href: 'vscode://file/E:/Projects/App' }])
  })
})

describe('crewDetails for other kinds', () => {
  it('an agent file offers that file in VS Code and lists its tools and model', () => {
    const def = entry({ id: 'def:claude:project:reviewer', role: 'definition', name: 'reviewer', description: 'Reviews code', definedIn: 'E:\\Projects\\App\\.claude\\agents\\reviewer.md', scope: 'project', tools: ['Read', 'Grep'], state: 'standby', lastSeenAt: null, currentTool: null, departmentBasis: 'description', model: null })
    const d = crewDetails(def, project({}, [def]), NOW)
    expect(d.kind).toBe('Agent defined for Claude Code (this project)')
    expect(d.rows.find((r) => r.label === 'Last activity')?.value).toBe('never seen running')
    expect(d.rows.find((r) => r.label === 'Tools')?.value).toBe('Read, Grep')
    expect(d.rows.find((r) => r.label === 'Model')?.value).toBe('not set in the file')
    expect(d.rows.find((r) => r.label === 'Bay')?.value).toContain('guessed')
    expect(d.links[0]).toEqual({ label: 'Open the agent file in VS Code', href: 'vscode://file/E:/Projects/App/.claude/agents/reviewer.md' })
  })

  it('a helper agent says which session started it, when that session is live', () => {
    const parent = entry()
    const sub = entry({ id: 'sub:claude:explore', role: 'subagent', name: 'Explore', description: 'Look for the router', parentId: parent.id, runs: 4 })
    const d = crewDetails(sub, project({}, [parent, sub]), NOW)
    expect(d.kind).toBe('Helper agent of Claude Code')
    expect(d.rows.find((r) => r.label === 'Started by')?.value).toBe('Fix the login bug')
    expect(d.rows.find((r) => r.label === 'Runs')?.value).toBe('4 in the last 7 days')
  })

  it('a project with no known folder offers no VS Code link', () => {
    const e = entry()
    const p = project({ live: { path: '', roster: [e], sessions: [] } as unknown as Project['live'] }, [e])
    expect(crewDetails(e, p, NOW).links).toEqual([])
  })

  it('copes with a session whose record is missing: no counts, no crash', () => {
    const e = entry()
    const d = crewDetails(e, project({}, [e], []), NOW)
    expect(d.rows.find((r) => r.label === 'Tool calls')).toBeUndefined()
    expect(d.rows.find((r) => r.label === 'Plan')).toBeUndefined()
  })
})
