import { describe, expect, it } from 'vitest'
import { DEMO_PROJECTS } from '../src/projects'
import { LIVE_ACCENTS, WAITING_PROJECT, accentFor, bannerFor, groupHarness, parseSnapshot, projectsFromSnapshot, serviceUrl, timeAgo, toProject } from '../src/live/liveProjects'
import { dataTag } from '../src/live/tags'
import type { ProjectView, Snapshot } from '../src/live/wire'

const view = (over: Partial<ProjectView> = {}): ProjectView => ({
  id: 'app-123abc',
  name: 'App',
  path: 'E:/Work/App',
  status: 'running',
  activity: 0.6,
  progress: null,
  attention: null,
  agents: { planning: 0, development: 2, review: 1 },
  discovered: false,
  roster: [],
  sessions: [],
  mcp: [],
  harness: [],
  docs: [],
  docsTruncated: false,
  ...over,
})
const snapshot = (projects: ProjectView[]): Snapshot => ({ generatedAt: 1, version: 1, projects, capabilities: [] })

describe('toProject', () => {
  it('maps a service project onto what the 3D scene reads, marked as live', () => {
    const p = toProject(view({ status: 'needs-you', attention: 'review' }))
    expect(p).toMatchObject({ id: 'app-123abc', name: 'App', status: 'needs-you', attention: 'review', source: 'live', activity: 0.6 })
    expect(p.agents).toEqual({ planning: 0, development: 2, review: 1 })
    expect(p.live?.path).toBe('E:/Work/App')
  })

  it('uses the real plan progress, or zero when no agent wrote a plan (never a made-up number)', () => {
    expect(toProject(view({ progress: 0.4 })).progress).toBe(0.4)
    expect(toProject(view({ progress: null })).progress).toBe(0)
    expect(toProject(view({ progress: null })).planKnown).toBe(false)
    expect(toProject(view({ progress: 0.4 })).planKnown).toBe(true)
    expect(toProject(view({ progress: 7 })).progress).toBe(1)
  })

  it('keeps seats between 0 and 3 whatever the service says', () => {
    const p = toProject(view({ agents: { planning: -2, development: 99, review: 1.7 } }))
    expect(p.agents).toEqual({ planning: 0, development: 3, review: 1 })
  })
})

describe('accentFor', () => {
  it('is stable for an id, from the palette, and spreads different ids', () => {
    expect(accentFor('a-1')).toBe(accentFor('a-1'))
    expect(LIVE_ACCENTS).toContain(accentFor('zzz'))
    expect(new Set(['a', 'b', 'c', 'd', 'e', 'f'].map(accentFor)).size).toBeGreaterThan(2)
  })
})

describe('parseSnapshot', () => {
  it('accepts a snapshot from the service', () => {
    expect(parseSnapshot(snapshot([view()]))?.projects).toHaveLength(1)
  })

  it('refuses a roster that is not a list, and accepts a service without a roster (older version)', () => {
    expect(parseSnapshot(snapshot([view({ roster: 'no' as unknown as ProjectView['roster'] })]))).toBeNull()
    const { roster: _gone, ...older } = view()
    expect(parseSnapshot(snapshot([older as unknown as ProjectView]))?.projects).toHaveLength(1)
  })

  it('refuses anything else instead of showing it', () => {
    for (const bad of [null, 'x', 5, [], {}, { version: 2, projects: [] }, { version: 1, projects: 'no' }, { version: 1, projects: [{ id: 5 }] }, { version: 1, projects: [{ id: 'a', name: 'A', status: 'weird', agents: {}, sessions: [], mcp: [], harness: [] }] }])
      expect(parseSnapshot(bad)).toBeNull()
  })
})

describe('projectsFromSnapshot', () => {
  it('lists the live projects', () => {
    expect(projectsFromSnapshot(snapshot([view(), view({ id: 'b-1', name: 'B' })])).map((p) => p.name)).toEqual(['App', 'B'])
  })

  it('shows one honest placeholder when no agent is active, not demo projects', () => {
    const list = projectsFromSnapshot(snapshot([]))
    expect(list).toHaveLength(1)
    expect(list[0]).toBe(WAITING_PROJECT)
    expect(WAITING_PROJECT.source).toBe('live')
    expect(WAITING_PROJECT.status).toBe('idle')
    expect(Object.values(WAITING_PROJECT.agents)).toEqual([0, 0, 0])
  })
})

describe('demo projects', () => {
  it('are marked as demo', () => {
    expect(DEMO_PROJECTS.every((p) => p.source === 'demo')).toBe(true)
  })
})

describe('bannerFor', () => {
  it('says plainly where the data comes from', () => {
    expect(bannerFor('live')).toMatch(/^LIVE/)
    expect(bannerFor('connecting')).toMatch(/looking for/i)
    expect(bannerFor('offline')).toMatch(/LOOK TEST/)
    expect(bannerFor('offline')).toMatch(/not real/i)
    expect(bannerFor('off')).toMatch(/LOOK TEST/)
  })
})

describe('timeAgo', () => {
  it('writes short readable ages', () => {
    const now = 1_000_000_000_000
    expect(timeAgo(now - 4000, now)).toBe('just now')
    expect(timeAgo(now - 45_000, now)).toBe('45 s ago')
    expect(timeAgo(now - 5 * 60_000, now)).toBe('5 min ago')
    expect(timeAgo(now - 3 * 3600_000, now)).toBe('3 h ago')
    expect(timeAgo(now - 50 * 3600_000, now)).toBe('2 d ago')
    expect(timeAgo(Number.NaN, now)).toBe('unknown')
  })
})

describe('serviceUrl', () => {
  it('defaults to the local port and only accepts a local address from the page address', () => {
    expect(serviceUrl(null)).toBe('http://127.0.0.1:4317')
    expect(serviceUrl('http://127.0.0.1:5000')).toBe('http://127.0.0.1:5000')
    expect(serviceUrl('http://localhost:5000/')).toBe('http://localhost:5000')
    expect(serviceUrl('https://evil.example')).toBe('http://127.0.0.1:4317')
    expect(serviceUrl('javascript:alert(1)')).toBe('http://127.0.0.1:4317')
  })
})

describe('groupHarness', () => {
  it('groups by kind in a fixed order and lists each name once, sorted', () => {
    const item = (kind: string, name: string, scope = 'project') => ({ kind, agent: 'claude-code', name, scope, path: 'p' }) as never
    expect(groupHarness([item('skill', 'b'), item('hook', 'Stop'), item('skill', 'a'), item('skill', 'a', 'user'), item('instructions', 'CLAUDE.md')])).toEqual([
      ['instructions', ['CLAUDE.md']],
      ['skill', ['a', 'b']],
      ['hook', ['Stop']],
    ])
    expect(groupHarness([])).toEqual([])
  })
})

describe('dataTag', () => {
  it('ends scene labels with where the number comes from, and never calls live data demo', () => {
    expect(dataTag(DEMO_PROJECTS[0])).toBe('demo')
    expect(dataTag(toProject(view({ progress: 0.5 })))).toBe('agent plan')
    expect(dataTag(toProject(view({ progress: null })))).toBe('no plan data')
    expect(dataTag(WAITING_PROJECT)).toBe('no plan data')
  })
})
