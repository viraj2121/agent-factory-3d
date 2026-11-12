import { describe, expect, it } from 'vitest'
import type { AgentSession, McpServer } from '../src/model.ts'
import { buildProjects } from '../src/projects.ts'

const now = 1_700_000_000_000
let n = 0
function session(over: Partial<AgentSession>): AgentSession {
  return {
    id: 's' + n++,
    agent: 'claude-code',
    agentLabel: 'Claude Code',
    source: 'files',
    projectPath: 'E:/Work/App',
    title: null,
    model: null,
    lastActivityAt: now - 5000,
    state: 'running',
    stateNote: 'Inferred: x',
    currentTool: 'Edit',
    department: 'development',
    plan: null,
    mcpCalls: {},
    toolCount: 1,
    ...over,
  }
}
const mcp = (name: string): McpServer => ({ name, scope: 'project', agent: 'claude-code', transport: 'stdio', target: 'x', envKeys: [], configFile: 'f', status: 'configured', recentCalls: 0 })
const deps = { now, mcpFor: () => [mcp('blender')], harnessFor: () => [] }

describe('buildProjects', () => {
  it('groups sessions of different agents in one folder into one project, whatever the spelling of the path', () => {
    const [p, ...rest] = buildProjects([session({}), session({ agent: 'codex', agentLabel: 'Codex', projectPath: 'e:/work/app' }), session({ agent: 'copilot', agentLabel: 'GitHub Copilot', projectPath: 'E:/Work/App/' })], deps)
    expect(rest).toHaveLength(0)
    expect(p.name).toBe('App')
    expect(p.sessions).toHaveLength(3)
  })

  it('seats running and waiting agents in the bay of their department, at most three per bay', () => {
    const sessions = [
      ...Array.from({ length: 5 }, () => session({ department: 'development' })),
      session({ department: 'review', state: 'needs-you' }),
      session({ department: 'planning', state: 'idle' }),
      session({ department: null }),
    ]
    const [p] = buildProjects(sessions, deps)
    expect(p.agents).toEqual({ planning: 1, development: 3, review: 1 })
  })

  it('is needs-you when any agent waits for you, with the attention on its bay; else running; else idle', () => {
    const [waiting] = buildProjects([session({ state: 'needs-you', department: 'review' }), session({})], deps)
    expect(waiting.status).toBe('needs-you')
    expect(waiting.attention).toBe('review')
    const [running] = buildProjects([session({})], deps)
    expect(running.status).toBe('running')
    expect(running.attention).toBeNull()
    const [idle] = buildProjects([session({ state: 'idle' })], deps)
    expect(idle.status).toBe('idle')
  })

  it('leaves out projects where every session has ended, and orders the rest by latest activity', () => {
    const list = buildProjects([session({ projectPath: 'E:/old', state: 'ended' }), session({ projectPath: 'E:/a', lastActivityAt: now - 9000 }), session({ projectPath: 'E:/b', lastActivityAt: now - 1000 })], deps)
    expect(list.map((p) => p.name)).toEqual(['b', 'a'])
  })

  it('takes progress only from a real plan, else null', () => {
    expect(buildProjects([session({})], deps)[0].progress).toBeNull()
    const [p] = buildProjects([session({ plan: { done: 1, total: 4 } })], deps)
    expect(p.progress).toBe(0.25)
    const [q] = buildProjects([session({ plan: { done: 3, total: 4 }, lastActivityAt: now - 9000 }), session({ plan: { done: 1, total: 2 } })], deps)
    expect(q.progress).toBe(0.5) // the plan of the most recently active session
  })

  it('counts recent MCP calls for configured servers, and lists servers that were only seen in use', () => {
    const [p] = buildProjects([session({ mcpCalls: { blender: 4, claude_ai_Gmail: 2 } }), session({ mcpCalls: { blender: 1 } })], deps)
    const byName = Object.fromEntries(p.mcp.map((m) => [m.name, m]))
    expect(byName.blender.recentCalls).toBe(5)
    expect(byName.claude_ai_Gmail).toMatchObject({ status: 'seen-in-use', recentCalls: 2, configFile: '(seen in tool calls)' })
  })

  it('gives unique stable ids built from the folder', () => {
    const a = buildProjects([session({ projectPath: 'E:/x/App' }), session({ projectPath: 'E:/y/App' })], deps)
    expect(new Set(a.map((p) => p.id)).size).toBe(2)
    const b = buildProjects([session({ projectPath: 'e:/X/app/' })], deps)
    expect(b[0].id).toBe(buildProjects([session({ projectPath: 'E:/x/App' })], deps)[0].id)
    expect(b[0].id).toMatch(/^app-[0-9a-f]{6}$/)
  })

  it('drops the second copy of a session that both a file and a hook reported', () => {
    const [p] = buildProjects([session({ id: 'same', source: 'files' }), session({ id: 'same', source: 'hook' })], deps)
    expect(p.sessions).toHaveLength(1)
    expect(p.sessions[0].source).toBe('files')
  })

  it('adds folders found by their setup files as idle projects after the active ones, newest first, and marks them', () => {
    const extra = [{ path: 'E:/Work/Old', mtime: 10 }, { path: 'E:/Work/Newer', mtime: 20 }, { path: 'e:/work/app/', mtime: 30 }]
    const list = buildProjects([session({})], { ...deps, discovered: extra })
    expect(list.map((p) => p.name)).toEqual(['App', 'Newer', 'Old'])
    expect(list[0].discovered).toBe(false)
    expect(list[1]).toMatchObject({ discovered: true, status: 'idle', sessions: [], progress: null, attention: null })
    expect(list[1].agents).toEqual({ planning: 0, development: 0, review: 0 })
    expect(list[1].mcp.map((m) => m.name)).toEqual(['blender'])
  })

  it('keeps at most eight projects, active ones first', () => {
    const sessions = Array.from({ length: 3 }, (_, i) => session({ projectPath: 'E:/act/' + i }))
    const extra = Array.from({ length: 20 }, (_, i) => ({ path: 'E:/idle/' + i, mtime: i }))
    const list = buildProjects(sessions, { ...deps, discovered: extra })
    expect(list).toHaveLength(8)
    expect(list.slice(0, 3).every((p) => !p.discovered)).toBe(true)
  })

  it('gives every project a roster: agent files standing by, sessions by their state', () => {
    const definitionsFor = () => [{ name: 'backend-dev', agent: 'claude-code' as const, scope: 'project' as const, path: 'E:/Work/App/.claude/agents/backend-dev.md', description: null, model: null, tools: null }]
    const [p] = buildProjects([session({ state: 'running' }), session({ state: 'idle' })], { ...deps, definitionsFor })
    expect(p.roster.map((r) => [r.name, r.state])).toEqual([['Claude Code', 'running'], ['Claude Code', 'idle'], ['backend-dev', 'standby']])
  })

  it('shows the crew of a project found only by its setup files, all standing by, with the project still idle', () => {
    const definitionsFor = () => [{ name: 'planner', agent: 'claude-code' as const, scope: 'project' as const, path: 'E:/Work/Old/.claude/agents/planner.md', description: null, model: null, tools: null }]
    const [, found] = buildProjects([session({})], { ...deps, definitionsFor, discovered: [{ path: 'E:/Work/Old', mtime: 10 }] })
    expect(found).toMatchObject({ discovered: true, status: 'idle', agents: { planning: 0, development: 0, review: 0 } })
    expect(found.roster.map((r) => [r.name, r.state, r.department])).toEqual([['planner', 'standby', 'planning']])
  })

  it('has an empty roster when no agent files and no sessions exist (discovered by CLAUDE.md only)', () => {
    const [, found] = buildProjects([session({})], { ...deps, discovered: [{ path: 'E:/Work/Old', mtime: 10 }] })
    expect(found.roster).toEqual([])
  })

  it('adds the subagent runs of the project to its roster and seats a working subagent in its bay', () => {
    const run = (over: object = {}) => ({ id: 'r1', parentId: 's-main', agent: 'claude-code' as const, agentType: 'Explore', description: null, projectPath: 'e:/work/app/', model: null, lastActivityAt: now - 2000, state: 'running' as const, stateNote: 'Inferred: x', currentTool: 'Read', department: 'planning' as const, mcpCalls: {}, toolCount: 1, ...over })
    const [p] = buildProjects([session({ id: 's-main', department: 'development' })], { ...deps, runs: [run(), run({ id: 'other', projectPath: 'E:/Elsewhere' })] })
    expect(p.roster.map((r) => [r.name, r.role, r.state])).toEqual([['Explore', 'subagent', 'running'], ['Claude Code', 'session', 'running']])
    expect(p.agents).toEqual({ planning: 1, development: 1, review: 0 })
  })

  it('leaves hidden projects out, active or found by files, and lets the next ones take their place', () => {
    const sessions = [session({ projectPath: 'E:/Work/Secret' }), session({ projectPath: 'E:/Work/App' })]
    const extra = Array.from({ length: 10 }, (_, i) => ({ path: 'E:/idle/' + i, mtime: 100 - i }))
    const list = buildProjects(sessions, { ...deps, discovered: [...extra, { path: 'E:/Work/Hush', mtime: 999 }], hidden: new Set(['e:/work/secret', 'e:/work/hush']) })
    expect(list.map((p) => p.name)).not.toContain('Secret')
    expect(list.map((p) => p.name)).not.toContain('Hush')
    expect(list).toHaveLength(8)
  })

  it('shows the display name chosen in the settings, matched by folder without case', () => {
    const [p] = buildProjects([session({ projectPath: 'E:/Work/App' })], { ...deps, names: { 'e:/work/app': 'Shop front' } })
    expect(p.name).toBe('Shop front')
    expect(p.path).toBe('E:/Work/App')
    const [, found] = buildProjects([session({})], { ...deps, discovered: [{ path: 'E:/Work/Old', mtime: 1 }], names: { 'e:/work/old': 'Archive' } })
    expect(found.name).toBe('Archive')
  })

  it('returns nothing for no sessions', () => {
    expect(buildProjects([], deps)).toEqual([])
  })
})
