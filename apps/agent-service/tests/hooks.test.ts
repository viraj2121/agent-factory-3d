import { describe, expect, it } from 'vitest'
import { HookStore, parseHookEvent } from '../src/adapters/hooks.ts'

const now = 1_700_000_100_000

describe('parseHookEvent', () => {
  it('accepts a minimal event and a full one', () => {
    expect(parseHookEvent({ agent: 'Cursor', sessionId: 's1', cwd: 'E:\\Work\\App', event: 'start' })).toMatchObject({ ok: true })
    expect(parseHookEvent({ agent: 'Aider', sessionId: 's2', cwd: '/home/me/app', event: 'tool', tool: 'Edit', command: 'ls', title: 'T', model: 'm', time: now })).toMatchObject({ ok: true })
  })

  it('refuses what is not an object, misses fields, has an unknown event or is far too long', () => {
    for (const bad of [null, 'x', [], {}, { agent: 'a', sessionId: 's', cwd: '/x', event: 'explode' }, { agent: '', sessionId: 's', cwd: '/x', event: 'start' }, { agent: 'a', sessionId: 's'.repeat(500), cwd: '/x', event: 'start' }, { agent: 'a', sessionId: 's', cwd: 'relative/path', event: 'start' }])
      expect(parseHookEvent(bad)).toMatchObject({ ok: false })
  })
})

describe('HookStore', () => {
  const ev = (over: Record<string, unknown>) => {
    const r = parseHookEvent({ agent: 'Cursor', sessionId: 's1', cwd: 'E:\\Work\\App', event: 'start', ...over })
    if (!r.ok) throw new Error(r.error)
    return r.event
  }

  it('builds a session from events: tool call, tool result, waiting, stop', () => {
    const store = new HookStore()
    store.ingest(ev({ event: 'start' }), now)
    store.ingest(ev({ event: 'tool', tool: 'Bash', command: 'npx vitest run' }), now + 1000)
    let [s] = store.sessions(now + 2000)
    expect(s).toMatchObject({ agent: 'other', agentLabel: 'Cursor', source: 'hook', state: 'running', currentTool: 'Bash', department: 'review', toolCount: 1 })
    store.ingest(ev({ event: 'tool_result' }), now + 3000)
    store.ingest(ev({ event: 'waiting' }), now + 4000)
    ;[s] = store.sessions(now + 5000)
    expect(s.state).toBe('needs-you')
    store.ingest(ev({ event: 'stop' }), now + 6000)
    ;[s] = store.sessions(now + 7000)
    expect(s.state).toBe('needs-you')
    expect(s.stateNote).toMatch(/inferred/i)
  })

  it('maps a known agent name to its kind, and keeps sessions apart by agent and id', () => {
    const store = new HookStore()
    store.ingest(ev({ agent: 'Claude Code', sessionId: 'a' }), now)
    store.ingest(ev({ agent: 'Gemini CLI', sessionId: 'a' }), now)
    const kinds = store.sessions(now).map((s) => s.agent).sort()
    expect(kinds).toEqual(['claude-code', 'other'])
  })

  it('forgets sessions that have been quiet for a day and caps how many it holds', () => {
    const store = new HookStore(5)
    for (let i = 0; i < 9; i++) store.ingest(ev({ sessionId: 's' + i }), now + i)
    expect(store.sessions(now + 100).length).toBe(5)
    expect(store.sessions(now + 25 * 3600 * 1000).length).toBe(0)
  })

  it('does not keep the command line, only the department it decided', () => {
    const store = new HookStore()
    store.ingest(ev({ event: 'tool', tool: 'Bash', command: 'echo SECRET' }), now)
    expect(JSON.stringify(store.sessions(now))).not.toMatch(/SECRET/)
  })
})
