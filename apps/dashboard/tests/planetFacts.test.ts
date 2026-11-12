import { describe, expect, it } from 'vitest'
import type { Project } from '../src/projects'
import { planetFacts, recencyHours } from '../src/planetFacts'

const NOW = 1_800_000_000_000
const H = 3_600_000
const base = (over: Partial<Project> = {}): Project => ({ id: 'p', name: 'P', accent: '#fff', status: 'idle', activity: 0, progress: 0, agents: { planning: 0, development: 0, review: 0 }, source: 'live', planKnown: false, ...over })
const live = (over: Record<string, unknown> = {}, p: Partial<Project> = {}): Project => base({ live: { path: 'E:/a', sessions: [], roster: [], mcp: [], docs: [], docsTruncated: false, ...over } as unknown as Project['live'], ...p })

describe('recencyHours', () => {
  it('is the hours since the newest session activity', () => {
    const p = live({ sessions: [{ lastActivityAt: NOW - 5 * H }, { lastActivityAt: NOW - 30 * H }] })
    expect(recencyHours(p, NOW)).toBeCloseTo(5, 5)
  })
  it('counts the roster too (an agent that ran lately)', () => {
    const p = live({ roster: [{ lastSeenAt: NOW - 2 * H }, { lastSeenAt: null }] })
    expect(recencyHours(p, NOW)).toBeCloseTo(2, 5)
  })
  it('is almost zero while a project is working or waiting', () => {
    expect(recencyHours(live({ sessions: [{ lastActivityAt: NOW - 50 * H }] }, { status: 'running' }), NOW)).toBeLessThan(0.1)
    expect(recencyHours(live({}, { status: 'needs-you' }), NOW)).toBeLessThan(0.1)
  })
  it('is null when nothing is known (a demo project, or no activity at all)', () => {
    expect(recencyHours(base({ source: 'demo' }), NOW)).toBeNull()
    expect(recencyHours(live(), NOW)).toBeNull()
  })
  it('never goes negative for a clock a little ahead', () => {
    expect(recencyHours(live({ sessions: [{ lastActivityAt: NOW + 5 * H }] }), NOW)).toBe(0)
  })
})

describe('planetFacts', () => {
  it('reports status, counts, files, MCP servers and plan for a live project', () => {
    const p = live({ mcp: [{}, {}], docs: [{}, {}, {}], sessions: [{ lastActivityAt: NOW - H }], roster: [{ seated: true, state: 'running', lastSeenAt: NOW - H }, { seated: true, state: 'running', lastSeenAt: NOW - H }] }, { status: 'running', planKnown: true, progress: 0.4 })
    const f = planetFacts(p, NOW)
    expect(f).toMatchObject({ status: 'working', files: 3, mcp: 2, plan: 0.4 })
    expect(f.working).toBe(2)
    expect(f.lastActivityAt).toBe(NOW - H)
  })
  it('says the plan is unknown (null) when no agent wrote one', () => {
    expect(planetFacts(live(), NOW).plan).toBeNull()
  })
  it('a waiting project has one waiting agent and the status needs-you', () => {
    const f = planetFacts(live({ roster: [{ seated: true, state: 'needs-you', lastSeenAt: NOW }] }, { status: 'needs-you' }), NOW)
    expect(f.status).toBe('needs')
    expect(f.waiting).toBe(1)
  })
  it('a demo project has no files, MCP or activity time (they are not known), and says so with nulls', () => {
    const f = planetFacts(base({ source: 'demo', status: 'running', agents: { planning: 1, development: 0, review: 0 } }), NOW)
    expect(f.files).toBeNull()
    expect(f.mcp).toBeNull()
    expect(f.lastActivityAt).toBeNull()
  })
  it('a resting project has nothing working', () => {
    const f = planetFacts(live(), NOW)
    expect(f.status).toBe('resting')
    expect(f.working).toBe(0)
  })
})
