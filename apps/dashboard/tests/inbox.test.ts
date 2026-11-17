import { describe, expect, it } from 'vitest'
import { inboxItems, inboxWords, STALE_AFTER_MS, toolFilter, waitingText } from '../src/inbox'
import type { Project } from '../src/projects'

const MIN = 60_000
const NOW = 1_700_000_000_000
const base = (id: string, over: Partial<Project> = {}): Project => ({ id, name: id.toUpperCase(), accent: '#fff', status: 'idle', activity: 0, progress: 0, agents: { planning: 0, development: 0, review: 0 }, source: 'live', planKnown: false, ...over })
const live = (id: string, roster: Record<string, unknown>[]): Project => base(id, { live: { path: `C:/work/${id}`, sessions: [], roster, mcp: [], docs: [], docsTruncated: false } as unknown as Project['live'] })
const e = (id: string, state: string, over: Record<string, unknown> = {}) => ({ id, name: id, agent: 'claude-code', agentLabel: 'Claude Code', role: 'session', seated: true, state, stateNote: '', lastSeenAt: NOW - 3 * MIN, currentTool: null, ...over })

describe('inboxItems', () => {
  it('collects the agents that wait for you, from every project, and nothing else', () => {
    const projects = [live('a', [e('wait-a', 'needs-you'), e('run-a', 'running'), e('sleep-a', 'idle'), e('stand-a', 'standby')]), live('b', [e('wait-b', 'needs-you')])]
    expect(inboxItems(projects, NOW).map((i) => i.entry.id).sort()).toEqual(['wait-a', 'wait-b'])
  })
  it('says which project each one is in, and where to open it', () => {
    const [item] = inboxItems([live('alpha', [e('x', 'needs-you')])], NOW)
    expect(item.projectId).toBe('alpha')
    expect(item.projectName).toBe('ALPHA')
    expect(item.folder).toBe('C:/work/alpha')
  })
  it('puts the longest waiting first; one with no known time goes last', () => {
    const p = live('a', [e('new', 'needs-you', { lastSeenAt: NOW - 1 * MIN }), e('unknown', 'needs-you', { lastSeenAt: null }), e('old', 'needs-you', { lastSeenAt: NOW - 9 * MIN })])
    expect(inboxItems([p], NOW).map((i) => i.entry.id)).toEqual(['old', 'new', 'unknown'])
  })
  it('measures how long it has waited, never negative, and marks long waits as stale', () => {
    const p = live('a', [e('fresh', 'needs-you', { lastSeenAt: NOW - 2 * MIN }), e('long', 'needs-you', { lastSeenAt: NOW - STALE_AFTER_MS - MIN }), e('future', 'needs-you', { lastSeenAt: NOW + 5 * MIN }), e('none', 'needs-you', { lastSeenAt: null })])
    const by = Object.fromEntries(inboxItems([p], NOW).map((i) => [i.entry.id, i]))
    expect(by.fresh.waitingMs).toBe(2 * MIN)
    expect(by.fresh.stale).toBe(false)
    expect(by.long.stale).toBe(true)
    expect(by.future.waitingMs).toBe(0)
    expect(by.none.waitingMs).toBeNull()
    expect(by.none.stale).toBe(false)
  })
  it('has nothing for a demo project (no real agents) or for no projects', () => {
    expect(inboxItems([base('d', { source: 'demo', status: 'needs-you' })], NOW)).toEqual([])
    expect(inboxItems([], NOW)).toEqual([])
  })
  it('keeps the tool of each agent for the filter', () => {
    const p = live('a', [e('c', 'needs-you'), e('x', 'needs-you', { agent: 'codex', agentLabel: 'Codex' }), e('g', 'needs-you', { agent: 'copilot' })])
    const items = inboxItems([p], NOW)
    expect(toolFilter(items, 'all')).toHaveLength(3)
    expect(toolFilter(items, 'codex').map((i) => i.entry.id)).toEqual(['x'])
    expect(toolFilter(items, 'claude-code')).toHaveLength(1)
  })
})

describe('inboxWords (inferred, never more than the service knows)', () => {
  it('a finished turn waits for your reply', () => {
    expect(inboxWords(e('a', 'needs-you', { stateNote: 'finished its turn and is waiting for your reply.' }) as never).headline).toBe('Waiting for your reply')
  })
  it('an agent that asks for input needs your input', () => {
    expect(inboxWords(e('a', 'needs-you', { stateNote: 'the agent says it needs your input.' }) as never).headline).toBe('Needs your input')
  })
  it('a tool call with no result may be waiting for your permission, and says it is not sure; it names the tool in plain words', () => {
    const w = inboxWords(e('a', 'needs-you', { stateNote: 'a tool call has had no result for a while: a long command, or waiting for your permission.', currentTool: 'Bash' }) as never)
    expect(w.headline).toBe('A step is waiting (maybe for your permission)')
    expect(w.detail).toBe('running a command')
  })
  it('falls back to a plain line for anything else, and never invents a reason', () => {
    expect(inboxWords(e('a', 'needs-you', { stateNote: '' }) as never)).toEqual({ headline: 'Waiting for you', detail: null })
  })
})

describe('waitingText', () => {
  it('says how long in plain words', () => {
    expect(waitingText(10_000)).toBe('waiting just now')
    expect(waitingText(4 * 60_000)).toBe('waiting 4 min')
    expect(waitingText(2 * 3_600_000)).toBe('waiting 2 h')
    expect(waitingText(null)).toBe('waiting')
  })
})
