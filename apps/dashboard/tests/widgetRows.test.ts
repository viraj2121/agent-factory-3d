import { describe, expect, it } from 'vitest'
import { filterRows, widgetCounts, widgetRows } from '../src/widgetRows'
import type { Project } from '../src/projects'

const MIN = 60_000
const NOW = 1_700_000_000_000
const base = (id: string, over: Partial<Project> = {}): Project => ({ id, name: id.toUpperCase(), accent: '#fff', status: 'idle', activity: 0, progress: 0, agents: { planning: 0, development: 0, review: 0 }, source: 'live', planKnown: false, ...over })
const live = (id: string, roster: Record<string, unknown>[]): Project => base(id, { live: { path: `C:/work/${id}`, sessions: [], roster, mcp: [], docs: [], docsTruncated: false } as unknown as Project['live'] })
const e = (id: string, state: string, over: Record<string, unknown> = {}) => ({ id, name: id, agent: 'claude-code', agentLabel: 'Claude Code', role: 'session', seated: true, state, stateNote: '', lastSeenAt: NOW - 3 * MIN, currentTool: null, description: null, ...over })

describe('widgetRows', () => {
  it('lists the sessions of every project: waiting, working and resting; never the agent files that never ran', () => {
    const rows = widgetRows([live('a', [e('w', 'needs-you'), e('r', 'running'), e('s', 'idle'), e('never', 'standby')]), live('b', [e('r2', 'running')])], NOW)
    expect(rows.map((r) => r.key).sort()).toEqual(['a:r', 'a:s', 'a:w', 'b:r2'])
    expect(Object.fromEntries(rows.map((r) => [r.key, r.state]))).toEqual({ 'a:w': 'wait', 'a:r': 'run', 'a:s': 'rest', 'b:r2': 'run' })
  })
  it('orders waiting first (longest wait first), then working, then resting (both newest first)', () => {
    const p = live('a', [
      e('rest-old', 'idle', { lastSeenAt: NOW - 90 * MIN }), e('run-old', 'running', { lastSeenAt: NOW - 2 * MIN }), e('wait-new', 'needs-you', { lastSeenAt: NOW - 1 * MIN }),
      e('rest-new', 'idle', { lastSeenAt: NOW - 30 * MIN }), e('wait-old', 'needs-you', { lastSeenAt: NOW - 8 * MIN }), e('run-new', 'running', { lastSeenAt: NOW }),
    ])
    expect(widgetRows([p], NOW).map((r) => r.entry.id)).toEqual(['wait-old', 'wait-new', 'run-new', 'run-old', 'rest-new', 'rest-old'])
  })
  it('says what each one does in plain words, never more than the service knows', () => {
    const p = live('a', [
      e('w', 'needs-you', { stateNote: 'a tool call has had no result for a while: a long command, or waiting for your permission.', currentTool: 'Bash' }),
      e('r', 'running', { currentTool: 'Edit' }),
      e('s', 'idle'),
    ])
    const by = Object.fromEntries(widgetRows([p], NOW).map((r) => [r.entry.id, r]))
    expect(by.w.line).toBe('A step is waiting (maybe for your permission)')
    expect(by.w.detail).toBe('running a command')
    expect(by.r.line).toBe('editing files')
    expect(by.s.line).toBe('resting')
  })
  it('keeps the project, its folder, how long ago, and marks a long wait as stale', () => {
    const p = live('alpha', [e('w', 'needs-you', { lastSeenAt: NOW - 12 * MIN }), e('x', 'running', { lastSeenAt: null })])
    const [w, x] = widgetRows([p], NOW)
    expect(w.projectName).toBe('ALPHA')
    expect(w.folder).toBe('C:/work/alpha')
    expect(w.sinceMs).toBe(12 * MIN)
    expect(w.stale).toBe(true)
    expect(x.sinceMs).toBeNull()
    expect(x.stale).toBe(false)
  })
  it('has nothing for a demo project (no real agents behind it)', () => {
    expect(widgetRows([base('d', { source: 'demo', status: 'running', agents: { planning: 1, development: 2, review: 0 } })], NOW)).toEqual([])
  })
})

describe('widgetCounts and filterRows', () => {
  const rows = widgetRows([live('shop', [e('w', 'needs-you'), e('r1', 'running', { agent: 'codex', agentLabel: 'Codex' }), e('r2', 'running', { name: 'docs-writer' }), e('s', 'idle')])], NOW)
  it('counts each state', () => {
    expect(widgetCounts(rows)).toEqual({ wait: 1, run: 2, rest: 1 })
  })
  it('filters by state, by tool and by a search over agent, tool and project, ignoring case', () => {
    expect(filterRows(rows, { state: 'run', tool: 'all', query: '' }).map((r) => r.entry.id)).toEqual(['r1', 'r2'])
    expect(filterRows(rows, { state: 'all', tool: 'codex', query: '' }).map((r) => r.entry.id)).toEqual(['r1'])
    expect(filterRows(rows, { state: 'all', tool: 'all', query: 'DOCS' }).map((r) => r.entry.id)).toEqual(['r2'])
    expect(filterRows(rows, { state: 'all', tool: 'all', query: 'shop' })).toHaveLength(4)
    expect(filterRows(rows, { state: 'all', tool: 'all', query: '  ' })).toHaveLength(4)
  })
})
