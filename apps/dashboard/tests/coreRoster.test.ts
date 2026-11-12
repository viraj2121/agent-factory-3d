import { describe, expect, it } from 'vitest'
import type { RosterEntry } from '../src/live/wire'
import type { Project } from '../src/projects'
import { CORE_MAX, coreGlow, coreRoster, coreSummary } from '../src/coreRoster'

const entry = (id: string, state: RosterEntry['state'], department: RosterEntry['department'] = 'development', seated = true): RosterEntry =>
  ({ id, name: id, agent: 'claude', agentLabel: 'Claude Code', role: 'session', source: 'files', scope: null, definedIn: null, description: null, model: null, tools: null, department, departmentBasis: 'activity', state, stateNote: '', lastSeenAt: 0, currentTool: null, parentId: null, runs: 0, seated }) as RosterEntry

const live = (roster: RosterEntry[], over: Partial<Project> = {}): Project => ({
  id: 'p',
  name: 'P',
  accent: '#fff',
  status: 'running',
  activity: 0.5,
  progress: 0,
  agents: { planning: 0, development: 0, review: 0 },
  source: 'live',
  live: { roster, sessions: [], path: '' } as unknown as Project['live'],
  ...over,
})
const demo = (status: Project['status'], agents: Project['agents']): Project => ({ id: 'd', name: 'D', accent: '#fff', status, activity: 0.5, progress: 0.4, agents, source: 'demo' })

describe('coreRoster for a live project', () => {
  it('has one light for every agent that has a seat, with its real state', () => {
    const p = live([entry('a', 'running'), entry('b', 'needs-you'), entry('c', 'idle'), entry('d', 'standby')])
    expect(coreRoster(p).map((l) => l.state).sort()).toEqual(['idle', 'needs-you', 'running', 'standby'])
  })

  it('leaves out agents that never ran here (no seat)', () => {
    const p = live([entry('a', 'running'), entry('far', 'standby', 'planning', false)])
    expect(coreRoster(p)).toHaveLength(1)
  })

  it('keeps an agent in the same place when another one changes state', () => {
    const before = coreRoster(live([entry('a', 'idle'), entry('b', 'idle'), entry('c', 'idle')]))
    const after = coreRoster(live([entry('a', 'idle'), entry('b', 'running'), entry('c', 'idle')]))
    expect(after.map((l) => l.id)).toEqual(before.map((l) => l.id))
  })

  it('orders by bay first, then id, so the ring reads the same on every scan', () => {
    const a = coreRoster(live([entry('z', 'idle', 'planning'), entry('a', 'idle', 'review'), entry('m', 'idle', 'planning')]))
    expect(a.map((l) => l.id)).toEqual(['m', 'z', 'a'])
  })

  it('never shows more than the ring holds, and keeps every active agent when it must cut', () => {
    const many = Array.from({ length: 30 }, (_, i) => entry(`idle-${String(i).padStart(2, '0')}`, 'idle'))
    const active = [entry('zz-work', 'running'), entry('zz-wait', 'needs-you')]
    const out = coreRoster(live([...many, ...active]))
    expect(out).toHaveLength(CORE_MAX)
    expect(out.map((l) => l.id)).toContain('zz-work')
    expect(out.map((l) => l.id)).toContain('zz-wait')
  })

  it('is empty when the project has no agents', () => {
    expect(coreRoster(live([]))).toEqual([])
  })
})

describe('coreRoster for a demo project', () => {
  it('shows the demo robots at work as working lights, and a couple resting', () => {
    const out = coreRoster(demo('running', { planning: 1, development: 2, review: 0 }))
    expect(out.filter((l) => l.state === 'running')).toHaveLength(3)
    expect(out.filter((l) => l.state === 'idle').length).toBeGreaterThan(0)
  })

  it('turns one light amber when the project needs you', () => {
    const out = coreRoster(demo('needs-you', { planning: 0, development: 1, review: 2 }))
    expect(out.filter((l) => l.state === 'needs-you')).toHaveLength(1)
    expect(out.filter((l) => l.state === 'running')).toHaveLength(2)
  })

  it('a resting demo project has no working lights', () => {
    const out = coreRoster(demo('idle', { planning: 0, development: 1, review: 0 }))
    expect(out.some((l) => l.state === 'running' || l.state === 'needs-you')).toBe(false)
  })
})

describe('coreSummary', () => {
  it('counts working and waiting lights', () => {
    const s = coreSummary([{ id: 'a', state: 'running' }, { id: 'b', state: 'running' }, { id: 'c', state: 'needs-you' }, { id: 'd', state: 'idle' }])
    expect(s).toEqual({ working: 2, waiting: 1, total: 4 })
  })
})

describe('coreGlow', () => {
  const idle = { working: 0, waiting: 0, total: 6 }
  const busy = { working: 3, waiting: 0, total: 6 }
  const wait = { working: 1, waiting: 1, total: 6 }

  it('stays between 0 and 1 for any time', () => {
    for (const s of [idle, busy, wait]) for (let t = 0; t < 60; t += 0.7) { const g = coreGlow(t, s); expect(g).toBeGreaterThanOrEqual(0); expect(g).toBeLessThanOrEqual(1) }
  })

  it('is dim when nothing runs and brighter when agents work, more so with more of them', () => {
    const mean = (s: typeof idle) => Array.from({ length: 80 }, (_, i) => coreGlow(i * 0.3, s)).reduce((a, b) => a + b, 0) / 80
    expect(mean(idle)).toBeLessThan(0.15)
    expect(mean(busy)).toBeGreaterThan(mean(idle) + 0.12)
    expect(mean({ working: 6, waiting: 0, total: 6 })).toBeGreaterThan(mean(busy))
  })

  it('breathes slowly: no sudden jumps from one frame to the next', () => {
    for (let t = 0; t < 30; t += 0.016) expect(Math.abs(coreGlow(t + 0.016, busy) - coreGlow(t, busy))).toBeLessThan(0.01)
  })

  it('breathes a little faster when something waits for you', () => {
    const crossings = (s: typeof idle) => { let n = 0; let prev = coreGlow(0, s); const mid = (Math.max(...Array.from({ length: 300 }, (_, i) => coreGlow(i * 0.05, s))) + Math.min(...Array.from({ length: 300 }, (_, i) => coreGlow(i * 0.05, s)))) / 2; for (let i = 1; i < 600; i++) { const g = coreGlow(i * 0.05, s); if ((prev - mid) * (g - mid) < 0) n++; prev = g } return n }
    expect(crossings(wait)).toBeGreaterThan(crossings(busy))
  })

  it('copes with no agents and with bad numbers', () => {
    expect(coreGlow(1, { working: 0, waiting: 0, total: 0 })).toBeLessThan(0.15)
    expect(Number.isFinite(coreGlow(NaN, busy))).toBe(true)
    expect(Number.isFinite(coreGlow(1, { working: NaN, waiting: 0, total: 0 }))).toBe(true)
  })
})
