import { describe, expect, it } from 'vitest'
import { moonTools, MOON_LOOK } from '../src/systemLayout'
import type { Project } from '../src/projects'

const base = (over: Partial<Project> = {}): Project => ({ id: 'p', name: 'P', accent: '#fff', status: 'idle', activity: 0, progress: 0, agents: { planning: 0, development: 0, review: 0 }, source: 'live', planKnown: false, ...over })
const live = (roster: Record<string, unknown>[], p: Partial<Project> = {}): Project => base({ live: { path: 'E:/a', sessions: [], roster, mcp: [], docs: [], docsTruncated: false } as unknown as Project['live'], ...p })
const e = (id: string, agent: string, state: string) => ({ id, agent, seated: true, state })

describe('moonTools', () => {
  it('gives each working agent a moon of its own tool, in a steady order', () => {
    const p = live([e('b', 'codex', 'running'), e('a', 'claude-code', 'running'), e('c', 'copilot', 'running')], { status: 'running' })
    expect(moonTools(p)).toEqual(['claude-code', 'codex', 'copilot'])
  })
  it('skips agents that are not working', () => {
    const p = live([e('a', 'claude-code', 'idle'), e('b', 'codex', 'needs-you'), e('c', 'codex', 'running')])
    expect(moonTools(p)).toEqual(['codex'])
  })
  it('stops at five moons', () => {
    const p = live(Array.from({ length: 8 }, (_, i) => e(`a${i}`, 'claude-code', 'running')))
    expect(moonTools(p)).toHaveLength(5)
  })
  it('a demo project has plain moons, no tool is claimed', () => {
    const p = base({ source: 'demo', status: 'running', agents: { planning: 1, development: 2, review: 0 } })
    expect(moonTools(p)).toEqual(['demo', 'demo', 'demo'])
  })
  it('has a look for every kind', () => {
    for (const k of ['claude-code', 'codex', 'copilot', 'other', 'demo'] as const) expect(MOON_LOOK[k].colour).toMatch(/^#/)
  })
})
