import { describe, expect, it } from 'vitest'
import { activeNow } from '../src/activeNow'
import type { Project } from '../src/projects'

const base = (over: Partial<Project> = {}): Project => ({ id: 'p', name: 'P', accent: '#fff', status: 'idle', activity: 0, progress: 0, agents: { planning: 0, development: 0, review: 0 }, source: 'live', planKnown: false, ...over })
const live = (roster: Record<string, unknown>[]): Project => base({ live: { path: 'E:/a', sessions: [], roster, mcp: [], docs: [], docsTruncated: false } as unknown as Project['live'] })
const e = (id: string, state: string, over: Record<string, unknown> = {}) => ({ id, name: id, agent: 'claude-code', agentLabel: 'Claude Code', role: 'session', description: null, currentTool: null, seated: true, state, ...over })

describe('activeNow', () => {
  it('lists working and waiting agents, waiting first, then by name', () => {
    const p = live([e('zed', 'running'), e('amy', 'running'), e('bob', 'needs-you'), e('sleepy', 'idle'), e('shelf', 'standby')])
    expect(activeNow(p).map((a) => a.entry.id)).toEqual(['bob', 'amy', 'zed'])
  })
  it('says in words what each one is doing, and marks the waiting ones', () => {
    const p = live([e('a', 'running', { currentTool: 'Edit' }), e('b', 'needs-you')])
    const [b, a] = activeNow(p)
    expect(b.waiting).toBe(true)
    expect(a.waiting).toBe(false)
    expect(a.line).toBe('editing files')
  })
  it('is empty for a demo project (no real agents behind it) and for a quiet one', () => {
    expect(activeNow(base())).toEqual([])
    expect(activeNow(live([e('s', 'idle')]))).toEqual([])
  })
})
