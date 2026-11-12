import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { AgentSession, SubagentRun } from '../src/model.ts'
import { buildRoster, guessDepartment, parseAgentFile, scanAgentDefinitions, type AgentDefinition } from '../src/roster.ts'

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
function def(over: Partial<AgentDefinition>): AgentDefinition {
  return { name: 'helper', agent: 'claude-code', scope: 'project', path: 'E:/Work/App/.claude/agents/helper.md', description: null, model: null, tools: null, ...over }
}

let r = 0
function run(over: Partial<SubagentRun>): SubagentRun {
  return {
    id: 'r' + r++,
    parentId: 'p1',
    agent: 'claude-code',
    agentType: 'backend-dev',
    description: 'Add the cart endpoint',
    projectPath: 'E:/Work/App',
    model: null,
    lastActivityAt: now - 5000,
    state: 'running',
    stateNote: 'Inferred: new activity in the last 90 seconds.',
    currentTool: 'Edit',
    department: 'development',
    mcpCalls: {},
    toolCount: 3,
    ...over,
  }
}

describe('parseAgentFile', () => {
  it('reads name, description, tools and model from the front matter of a Claude agent file', () => {
    const text = '---\nname: backend-dev\ndescription: Builds REST endpoints.\ntools: Read, Edit, Write, Bash\nmodel: sonnet\n---\n\nYou are the backend developer. SECRET BODY'
    expect(parseAgentFile(text, 'backend-dev.md')).toEqual({ name: 'backend-dev', description: 'Builds REST endpoints.', tools: ['Read', 'Edit', 'Write', 'Bash'], model: 'sonnet' })
  })

  it('reads a Copilot tools array and quoted values, and falls back to the file name', () => {
    const text = "---\ndescription: 'Turns wireframes into a design.'\ntools: ['codebase', \"search\", 'editFiles']\n---\nbody"
    expect(parseAgentFile(text, 'ui-designer.agent.md')).toEqual({ name: 'ui-designer', description: 'Turns wireframes into a design.', tools: ['codebase', 'search', 'editFiles'], model: null })
  })

  it('reads a YAML list of tools', () => {
    const text = '---\nname: x\ntools:\n  - Read\n  - Grep\n---\n'
    expect(parseAgentFile(text, 'x.md').tools).toEqual(['Read', 'Grep'])
  })

  it('reads a Codex toml agent and never reads its instructions', () => {
    const text = 'name = "api-designer"\ndescription = "Designs endpoints."\nmodel = "gpt-5"\ndeveloper_instructions = """You are X.\ntools = [\'nope\']\nkeep secret"""\n'
    expect(parseAgentFile(text, 'api-designer.toml')).toEqual({ name: 'api-designer', description: 'Designs endpoints.', tools: null, model: 'gpt-5' })
  })

  it('does not fail on a file without front matter, an empty file or broken toml', () => {
    expect(parseAgentFile('just text', 'a.md')).toEqual({ name: 'a', description: null, tools: null, model: null })
    expect(parseAgentFile('', 'b.agent.md').name).toBe('b')
    expect(parseAgentFile('= = [[', 'c.toml').name).toBe('c')
  })

  it('cuts a long description to one line of at most 200 characters', () => {
    const text = '---\nname: a\ndescription: ' + 'word '.repeat(100) + '\n---\n'
    const d = parseAgentFile(text, 'a.md').description ?? ''
    expect(d.length).toBeLessThanOrEqual(200)
    expect(d).not.toContain('\n')
  })
})

describe('guessDepartment', () => {
  const dept = (name: string, extra: Partial<AgentDefinition> = {}) => guessDepartment(def({ name, ...extra }))

  it('uses words in the name first', () => {
    expect(dept('backend-dev')).toEqual({ department: 'development', basis: 'name' })
    expect(dept('frontend-dev')).toEqual({ department: 'development', basis: 'name' })
    expect(dept('planner')).toEqual({ department: 'planning', basis: 'name' })
    expect(dept('api-designer')).toEqual({ department: 'planning', basis: 'name' })
    expect(dept('ux-researcher')).toEqual({ department: 'planning', basis: 'name' })
    expect(dept('test-case-writer', { tools: ['Write'] })).toEqual({ department: 'review', basis: 'name' })
    expect(dept('code-reviewer')).toEqual({ department: 'review', basis: 'name' })
    expect(dept('security-auditor')).toEqual({ department: 'review', basis: 'name' })
    expect(dept('accessibility')).toEqual({ department: 'review', basis: 'name' })
    expect(dept('release-manager')).toEqual({ department: 'development', basis: 'name' })
    expect(dept('docs-writer')).toEqual({ department: 'development', basis: 'name' })
    expect(dept('3d-ui-builder')).toEqual({ department: 'development', basis: 'name' })
    expect(dept('handover-validator')).toEqual({ department: 'review', basis: 'name' })
    for (const n of ['python-specialist', 'postgres-specialist', 'spark-specialist', 'sql-specialist', 'aws-data-etl-specialist', 'typescript-helper'])
      expect(dept(n)).toEqual({ department: 'development', basis: 'name' })
  })

  it('does not match a keyword inside another word', () => {
    // "ci" is not in "specialist", "ux" not in "luxury"
    expect(dept('specialist').basis).not.toBe('name')
    expect(dept('luxury-bot').basis).not.toBe('name')
  })

  it('uses the first subject word of the description when the name says nothing', () => {
    expect(dept('helper', { description: 'Writes unit tests for new code.' })).toEqual({ department: 'review', basis: 'description' })
    expect(dept('helper', { description: 'Refactors modules and fixes bugs.' })).toEqual({ department: 'development', basis: 'description' })
  })

  it('uses the tools when name and description say nothing: edit tools mean Development, read-only tools mean Planning', () => {
    expect(dept('helper', { tools: ['Read', 'Edit'] })).toEqual({ department: 'development', basis: 'tools' })
    expect(dept('helper', { tools: ['codebase', 'search', 'editFiles'] })).toEqual({ department: 'development', basis: 'tools' })
    expect(dept('helper', { tools: ['Read', 'Grep', 'Glob'] })).toEqual({ department: 'planning', basis: 'tools' })
  })

  it('puts an agent with nothing to go on in Planning and says it is unknown', () => {
    expect(dept('helper')).toEqual({ department: 'planning', basis: 'unknown' })
  })
})

describe('scanAgentDefinitions', () => {
  function fixture() {
    const root = mkdtempSync(join(tmpdir(), 'roster-'))
    const home = join(root, 'home')
    const project = join(root, 'proj')
    const put = (file: string, text: string) => {
      mkdirSync(join(file, '..'), { recursive: true })
      writeFileSync(file, text)
    }
    return { home, project, put }
  }

  it('finds the agent files of all three tools at project and user level', () => {
    const { home, project, put } = fixture()
    put(join(project, '.claude', 'agents', 'planner.md'), '---\nname: planner\ndescription: Plans work.\n---\n')
    put(join(home, '.claude', 'agents', 'shared.md'), '---\nname: shared\n---\n')
    put(join(project, '.github', 'agents', 'ui-designer.agent.md'), '---\ndescription: Designs.\n---\n')
    put(join(project, '.codex', 'agents', 'api-designer.toml'), 'name = "api-designer"\n')
    put(join(project, '.claude', 'agents', 'notes.txt'), 'not an agent')
    const defs = scanAgentDefinitions(project, home)
    expect(defs.map((d) => [d.agent, d.scope, d.name]).sort()).toEqual([
      ['claude-code', 'project', 'planner'],
      ['claude-code', 'user', 'shared'],
      ['codex', 'project', 'api-designer'],
      ['copilot', 'project', 'ui-designer'],
    ])
    expect(defs.find((d) => d.name === 'planner')?.path).toBe(join(project, '.claude', 'agents', 'planner.md'))
  })

  it('returns nothing for a folder without agent files', () => {
    const { home, project } = fixture()
    expect(scanAgentDefinitions(project, home)).toEqual([])
  })
})

describe('buildRoster', () => {
  it('lists every defined agent as standing by, in the bay its name suggests, and says how it decided', () => {
    const roster = buildRoster([def({ name: 'backend-dev' }), def({ name: 'helper' })], [], now)
    const byName = Object.fromEntries(roster.map((r) => [r.name, r]))
    expect(byName['backend-dev']).toMatchObject({ role: 'definition', state: 'standby', department: 'development', departmentBasis: 'name', seated: true, lastSeenAt: null })
    expect(byName['helper']).toMatchObject({ department: 'planning', departmentBasis: 'unknown' })
    expect(byName['backend-dev'].stateNote).toMatch(/no run of it was seen/i)
  })

  it('does not seat agents defined for the whole user account, but lists them', () => {
    const [r] = buildRoster([def({ scope: 'user', name: 'shared' })], [], now)
    expect(r).toMatchObject({ scope: 'user', seated: false, state: 'standby' })
  })

  it('keeps same-named agents of different tools apart', () => {
    const roster = buildRoster([def({ name: 'backend-dev' }), def({ name: 'backend-dev', agent: 'codex', path: 'E:/Work/App/.codex/agents/backend-dev.toml' })], [], now)
    expect(roster).toHaveLength(2)
    expect(new Set(roster.map((r) => r.id)).size).toBe(2)
  })

  it('shows each live session as a robot in the bay of its newest tool, with the state of the session', () => {
    const roster = buildRoster([], [session({ state: 'running', department: 'review', title: 'Fix the cart' }), session({ state: 'needs-you', department: null })], now)
    expect(roster).toHaveLength(2)
    const running = roster.find((r) => r.state === 'running')
    expect(running).toMatchObject({ role: 'session', name: 'Claude Code', department: 'review', departmentBasis: 'activity', seated: true, description: 'Fix the cart' })
    const waiting = roster.find((r) => r.state === 'needs-you')
    expect(waiting).toMatchObject({ department: 'planning', departmentBasis: 'unknown' })
  })

  it('shows an idle session as idle (asleep), keeping the note the service wrote', () => {
    const [r] = buildRoster([], [session({ state: 'idle', stateNote: 'Inferred: quiet for 20 min' })], now)
    expect(r).toMatchObject({ state: 'idle', stateNote: 'Inferred: quiet for 20 min' })
  })

  it('folds old ended sessions of one tool into one idle robot, and none when that tool has a live session', () => {
    const ended = (over: Partial<AgentSession> = {}) => session({ state: 'ended', lastActivityAt: now - 3 * 86_400_000, ...over })
    const onlyEnded = buildRoster([], [ended(), ended({ lastActivityAt: now - 2 * 86_400_000 }), ended({ agent: 'codex', agentLabel: 'Codex' })], now)
    expect(onlyEnded.map((r) => [r.agent, r.state]).sort()).toEqual([['claude-code', 'idle'], ['codex', 'idle']])
    expect(onlyEnded.find((r) => r.agent === 'claude-code')?.lastSeenAt).toBe(now - 2 * 86_400_000)

    const withLive = buildRoster([], [ended(), session({ state: 'running' })], now)
    expect(withLive).toHaveLength(1)
    expect(withLive[0].state).toBe('running')
  })

  it('orders working first, then waiting, idle, standing by', () => {
    const roster = buildRoster([def({ name: 'a-standby' })], [session({ state: 'idle' }), session({ state: 'needs-you' }), session({ state: 'running' })], now)
    expect(roster.map((r) => r.state)).toEqual(['running', 'needs-you', 'idle', 'standby'])
  })

  it('marks a hook-reported agent as such', () => {
    const [r] = buildRoster([], [session({ source: 'hook', agent: 'other', agentLabel: 'Aider' })], now)
    expect(r).toMatchObject({ name: 'Aider', agent: 'other', source: 'hook' })
  })

  it('never contains message text or tool inputs: only the fields of the type', () => {
    const [r] = buildRoster([def({ name: 'x', description: 'Does x.' })], [], now)
    expect(Object.keys(r).sort()).toEqual(
      ['agent', 'agentLabel', 'currentTool', 'definedIn', 'department', 'departmentBasis', 'description', 'id', 'lastSeenAt', 'model', 'name', 'parentId', 'role', 'runs', 'scope', 'seated', 'source', 'state', 'stateNote', 'tools'].sort(),
    )
  })

  it('says which tool a working agent is using now, and nothing for one that is not working', () => {
    const roster = buildRoster([def({ name: 'a-standby' })], [session({ state: 'running', currentTool: 'Edit' }), session({ state: 'idle', currentTool: 'Read' })], now)
    expect(roster.map((r) => [r.state, r.currentTool])).toEqual([['running', 'Edit'], ['idle', null], ['standby', null]])
  })

  describe('with subagent runs', () => {
    it('a working subagent shows the tool its newest running run uses', () => {
      const roster = buildRoster([def({ name: 'backend-dev' })], [], now, [run({ state: 'running', currentTool: 'Write' }), run({ state: 'idle', currentTool: 'Read', lastActivityAt: now - 600_000 })])
      expect(roster[0]).toMatchObject({ state: 'running', currentTool: 'Write' })
    })

    it('a run of a defined agent wakes that agent: working while it runs, idle after, with the run count', () => {
      const d = def({ name: 'backend-dev' })
      const [working] = buildRoster([d], [], now, [run({ state: 'running' }), run({ state: 'idle', lastActivityAt: now - 600_000 })])
      expect(working).toMatchObject({ role: 'definition', state: 'running', runs: 2, lastSeenAt: now - 5000, departmentBasis: 'activity' })
      const [asleep] = buildRoster([d], [], now, [run({ state: 'idle' }), run({ state: 'ended', lastActivityAt: now - 2 * 86_400_000 })])
      expect(asleep).toMatchObject({ state: 'idle', runs: 2 })
      expect(asleep.stateNote).toMatch(/ran 2 times/i)
    })

    it('a run matches its agent file by type, ignoring case, and only within the same tool', () => {
      const roster = buildRoster([def({ name: 'Backend-Dev' }), def({ name: 'backend-dev', agent: 'codex', path: 'p.toml' })], [], now, [run({ agentType: 'backend-dev' })])
      expect(roster.find((e) => e.agent === 'claude-code')?.runs).toBe(1)
      expect(roster.find((e) => e.agent === 'codex')).toMatchObject({ runs: 0, state: 'standby' })
    })

    it('a run of an agent type with no file (Explore, general-purpose) becomes its own robot with the bay of what it did', () => {
      const roster = buildRoster([], [session({ id: 'p1', state: 'running' })], now, [run({ agentType: 'Explore', department: 'planning', description: 'Look around', parentId: 'p1' }), run({ agentType: 'Explore', state: 'idle', lastActivityAt: now - 90_000, department: 'planning', parentId: 'p1' })])
      const explore = roster.find((e) => e.name === 'Explore')
      expect(explore).toMatchObject({ role: 'subagent', state: 'running', runs: 2, department: 'planning', departmentBasis: 'activity', definedIn: null, scope: null, parentId: 'session:claude-code:p1', description: 'Look around' })
    })

    it('has no parent when the starting session is no longer live, and guesses the bay from the name if the run used no tool yet', () => {
      const [e] = buildRoster([], [], now, [run({ agentType: 'test-runner', department: null, currentTool: null, parentId: 'gone' })])
      expect(e).toMatchObject({ role: 'subagent', parentId: null, department: 'review', departmentBasis: 'name' })
    })

    it('does not seat an account-level agent file just because it ran: it ran here, so it is seated', () => {
      const [e] = buildRoster([def({ scope: 'user', name: 'shared' })], [], now, [run({ agentType: 'shared' })])
      expect(e).toMatchObject({ scope: 'user', seated: true, state: 'running' })
    })

    it('keeps Codex and Copilot files saying their runs are not read yet', () => {
      const [c] = buildRoster([def({ agent: 'codex', name: 'x', path: 'x.toml' })], [], now)
      expect(c.stateNote).toMatch(/runs are not read yet/i)
    })
  })
})
