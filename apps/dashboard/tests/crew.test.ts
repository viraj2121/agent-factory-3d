import { describe, expect, it } from 'vitest'
import { SEAT_SHAPES } from '../src/bayShapes'
import { basisLabel, bayLabel, workLine, clipForCrew, crewFor, crewLine, stateLabel, crewShape, crewSummary, eyeMood } from '../src/crew'
import type { Project } from '../src/projects'
import type { Department } from '../src/hallLayout'
import type { RosterEntry } from '../src/live/wire'

let n = 0
function entry(over: Partial<RosterEntry>): RosterEntry {
  return {
    id: 'e' + n++,
    name: 'agent',
    agent: 'claude-code',
    agentLabel: 'Claude Code',
    role: 'definition',
    source: 'files',
    scope: 'project',
    definedIn: 'x.md',
    description: null,
    model: null,
    tools: null,
    department: 'development',
    departmentBasis: 'name',
    state: 'standby',
    stateNote: '',
    lastSeenAt: null,
    currentTool: null,
    parentId: null,
    runs: 0,
    seated: true,
    ...over,
  }
}
const agents = (planning = 0, development = 0, review = 0): Record<Department, number> => ({ planning, development, review })
function project(over: Partial<Project> & { roster?: RosterEntry[] }): Project {
  const { roster, ...rest } = over
  return {
    id: 'p',
    name: 'P',
    accent: '#fff',
    status: 'idle',
    activity: 0.15,
    progress: 0,
    agents: agents(),
    source: roster ? 'live' : 'demo',
    live: roster ? ({ roster } as unknown as Project['live']) : undefined,
    ...rest,
  }
}

describe('crewFor', () => {
  it('seats the working and waiting agents of a live project in the bay of their department; the asleep and standing-by ones rest in the docks instead', () => {
    const roster = [entry({ name: 'a', state: 'running' }), entry({ name: 'b', department: 'review', state: 'idle' }), entry({ name: 'c', state: 'standby' })]
    const crew = crewFor(project({ roster }), 3)
    expect(crew.development.seats.map((s) => (s.state === 'empty' ? 'empty' : `${s.entry?.name}:${s.state}`))).toEqual(['a:running', 'empty', 'empty'])
    expect(crew.review.seats.map((s) => s.state)).toEqual(['empty', 'empty', 'empty'])
    expect(crew.planning.seats.every((s) => s.state === 'empty')).toBe(true)
  })

  it('counts the agents that do not fit a bay in `more`, and all of them in `total`', () => {
    const roster = Array.from({ length: 7 }, (_, i) => entry({ name: 'dev' + i, state: 'running' }))
    const bay = crewFor(project({ roster }), 3).development
    expect(bay.seats).toHaveLength(3)
    expect(bay.more).toBe(4)
    expect(bay.total).toBe(7)
  })

  it('leaves agents without a seat out (account-level agents that never ran here)', () => {
    const roster = [entry({ name: 'shared', seated: false, scope: 'user' }), entry({ name: 'mine', state: 'running' })]
    const bay = crewFor(project({ roster }), 3).development
    expect(bay.total).toBe(1)
    expect(bay.seats[0]).toMatchObject({ state: 'running' })
  })

  it('a demo project (no roster) still seats working robots from its counts, with no agent behind them', () => {
    const crew = crewFor(project({ agents: agents(0, 2, 0) }), 3)
    expect(crew.development.seats.map((s) => s.state)).toEqual(['running', 'running', 'empty'])
    expect(crew.development.seats[0]).toMatchObject({ entry: null })
    expect(crew.development.more).toBe(0)
  })

  it('a live project from a service without a roster falls back to the counts', () => {
    const live = { agents: agents(1, 0, 0) } as unknown as Project['live']
    const crew = crewFor(project({ agents: agents(1, 0, 0), source: 'live', live }), 3)
    expect(crew.planning.seats.map((s) => s.state)).toEqual(['running', 'empty', 'empty'])
  })
})

describe('crewShape', () => {
  it('gives the same agent the same shape every time, one of the bay shapes', () => {
    const a = entry({ name: 'backend-dev' })
    expect(crewShape(a)).toBe(crewShape({ ...a, id: 'other' }))
    expect(SEAT_SHAPES).toContain(crewShape(a))
  })

  it('uses all kinds of shapes across many names', () => {
    const shapes = new Set(Array.from({ length: 60 }, (_, i) => crewShape(entry({ name: 'agent-' + i }))))
    expect(shapes.size).toBeGreaterThanOrEqual(6)
  })

  it('tells a Claude agent and a Codex agent of the same name apart', () => {
    const names = Array.from({ length: 30 }, (_, i) => 'x' + i)
    const same = names.filter((name) => crewShape(entry({ name, agent: 'claude-code' })) === crewShape(entry({ name, agent: 'codex' })))
    expect(same.length).toBeLessThan(names.length)
  })
})

describe('clipForCrew and eyeMood', () => {
  it('works when running, waves when it needs you, and sits calmly when asleep or standing by', () => {
    expect(clipForCrew('running', 'developer', 1)).toBe('typing')
    expect(clipForCrew('needs-you', 'developer', 1)).toBe('wave')
    expect(clipForCrew('idle', 'developer', 1)).toBe('idle')
    expect(clipForCrew('standby', 'developer', 1)).toBe('idle')
  })

  it('dims the eyes of sleeping and standing-by robots only', () => {
    expect(eyeMood('running')).toBe('bright')
    expect(eyeMood('needs-you')).toBe('bright')
    expect(eyeMood('idle')).toBe('asleep')
    expect(eyeMood('standby')).toBe('off')
  })
})

describe('crewSummary', () => {
  it('counts the seated agents of a project by state, for the tabs and the panel', () => {
    const roster = [
      entry({ state: 'running' }),
      entry({ state: 'running' }),
      entry({ state: 'needs-you' }),
      entry({ state: 'idle' }),
      entry({ state: 'standby' }),
      entry({ state: 'standby', seated: false }),
    ]
    expect(crewSummary(project({ roster }))).toEqual({ total: 5, working: 2, waiting: 1, asleep: 1, standby: 1 })
  })

  it('has no summary for a demo project', () => {
    expect(crewSummary(project({}))).toBeNull()
  })
})

describe('counts and bayLabel', () => {
  it('counts only the agents of a bay that work or wait (the rest are in the rest docks)', () => {
    const roster = [entry({ state: 'running' }), entry({ state: 'idle' }), entry({ state: 'idle' }), entry({ state: 'standby' }), entry({ state: 'standby' }), entry({ state: 'standby' })]
    const bay = crewFor(project({ roster }), 3).development
    expect(bay.counts).toEqual({ running: 1, 'needs-you': 0, idle: 0, standby: 0 })
  })

  it('says what the bay is doing in a few words', () => {
    const label = (roster: RosterEntry[]) => bayLabel(crewFor(project({ roster }), 3).development)
    expect(label([])).toBe('idle')
    expect(label([entry({ state: 'running' }), entry({ state: 'idle' }), entry({ state: 'standby' }), entry({ state: 'standby' })])).toBe('1 working')
    expect(label([entry({ state: 'standby' })])).toBe('idle')
    expect(label([entry({ state: 'needs-you' }), entry({ state: 'running' })])).toBe('! needs you · 1 working')
  })

  it('keeps the old wording for a demo project: "2 working" or "idle"', () => {
    expect(bayLabel(crewFor(project({ agents: agents(0, 2, 0) }), 3).development)).toBe('2 working')
    expect(bayLabel(crewFor(project({}), 3).development)).toBe('idle')
  })
})

describe('words for the panels', () => {
  it('names each state in plain words', () => {
    expect(stateLabel('running')).toBe('working')
    expect(stateLabel('needs-you')).toBe('waiting for you')
    expect(stateLabel('idle')).toBe('asleep')
    expect(stateLabel('standby')).toBe('standing by')
  })

  it('says how the bay of an agent was decided, and calls a guess a guess', () => {
    expect(basisLabel('activity')).toBe('bay from what it did')
    expect(basisLabel('name')).toBe('bay guessed from its name')
    expect(basisLabel('description')).toBe('bay guessed from its description')
    expect(basisLabel('tools')).toBe('bay guessed from its tools')
    expect(basisLabel('unknown')).toBe('bay unknown, put in Planning')
  })

  it('sums a crew up in one line for the tabs', () => {
    expect(crewLine({ total: 4, working: 1, waiting: 0, asleep: 1, standby: 2 })).toBe('4 agents · 1 working')
    expect(crewLine({ total: 4, working: 0, waiting: 1, asleep: 0, standby: 3 })).toBe('4 agents · 1 waiting for you')
    expect(crewLine({ total: 3, working: 0, waiting: 0, asleep: 1, standby: 2 })).toBe('3 agents · resting')
    expect(crewLine({ total: 1, working: 0, waiting: 0, asleep: 0, standby: 1 })).toBe('1 agent · standing by')
    expect(crewLine({ total: 0, working: 0, waiting: 0, asleep: 0, standby: 0 })).toBe('no agents')
  })
})

describe('workLine: what a working agent is doing', () => {
  const w = (over: Partial<RosterEntry>) => workLine(entry({ state: 'running', role: 'session', ...over }))

  it('puts the tool in plain words and adds the title the session wrote', () => {
    expect(w({ currentTool: 'Edit', description: 'Fix the cart bug' })).toBe('editing files · Fix the cart bug')
    expect(w({ currentTool: 'Grep' })).toBe('reading code')
    expect(w({ currentTool: 'Bash' })).toBe('running a command')
    expect(w({ currentTool: 'Task' })).toBe('handing work to a subagent')
    expect(w({ currentTool: 'mcp__github__create_issue' })).toBe('using github')
    expect(w({ currentTool: 'SomethingNew' })).toBe('using SomethingNew')
  })

  it('shows the title alone when no tool is known, and nothing when there is neither', () => {
    expect(w({ currentTool: null, description: 'Fix the cart bug' })).toBe('Fix the cart bug')
    expect(w({ currentTool: null, description: null })).toBeNull()
  })

  it('shows it for an agent that waits for you, and for nobody who is asleep or standing by', () => {
    expect(workLine(entry({ state: 'needs-you', currentTool: 'Bash' }))).toBe('running a command')
    expect(workLine(entry({ state: 'idle', currentTool: 'Bash', description: 'x' }))).toBeNull()
    expect(workLine(entry({ state: 'standby', description: 'Builds things.' }))).toBeNull()
  })

  it('does not present the role text of an agent file as the work it is doing', () => {
    expect(w({ role: 'definition', currentTool: 'Write', description: 'Builds REST endpoints.' })).toBe('editing files')
    expect(w({ role: 'definition', currentTool: null, description: 'Builds REST endpoints.' })).toBeNull()
  })

  it('cuts a long title', () => {
    expect((w({ currentTool: null, description: 'word '.repeat(40) }) ?? '').length).toBeLessThanOrEqual(60)
  })
})

