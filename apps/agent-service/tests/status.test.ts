import { describe, expect, it } from 'vitest'
import { inferState, inferSubagentState } from '../src/status.ts'

const now = 1_000_000_000_000
const ago = (s: number) => now - s * 1000

describe('inferSubagentState', () => {
  it('is working while there was activity in the last 90 seconds', () => {
    expect(inferSubagentState({ now, lastActivityAt: ago(5), lastKind: 'tool-call' }).state).toBe('running')
    expect(inferSubagentState({ now, lastActivityAt: ago(80), lastKind: 'tool-result' }).state).toBe('running')
  })

  it('is idle, not waiting for you, once it finished its task: its result goes to the parent agent, not to a person', () => {
    const r = inferSubagentState({ now, lastActivityAt: ago(5), lastKind: 'turn-ended' })
    expect(r.state).toBe('idle')
    expect(r.note).toMatch(/^Inferred: .*finished/)
  })

  it('is idle when quiet for more than 90 seconds, and ended after a day', () => {
    expect(inferSubagentState({ now, lastActivityAt: ago(200), lastKind: 'tool-call' }).state).toBe('idle')
    expect(inferSubagentState({ now, lastActivityAt: ago(25 * 3600), lastKind: 'tool-call' }).state).toBe('ended')
    expect(inferSubagentState({ now, lastActivityAt: Number.NaN, lastKind: 'other' }).state).toBe('ended')
  })
})

describe('inferState', () => {
  it('is running right after a tool result or a prompt', () => {
    expect(inferState({ now, lastActivityAt: ago(5), lastKind: 'tool-result' }).state).toBe('running')
    expect(inferState({ now, lastActivityAt: ago(5), lastKind: 'user-prompt' }).state).toBe('running')
  })

  it('is running while a tool call is fresh and needs you when it has had no result for a while', () => {
    expect(inferState({ now, lastActivityAt: ago(8), lastKind: 'tool-call' }).state).toBe('running')
    expect(inferState({ now, lastActivityAt: ago(40), lastKind: 'tool-call' }).state).toBe('needs-you')
  })

  it('needs you after the agent finished its turn, for ten minutes, then idles', () => {
    expect(inferState({ now, lastActivityAt: ago(30), lastKind: 'turn-ended' }).state).toBe('needs-you')
    expect(inferState({ now, lastActivityAt: ago(11 * 60), lastKind: 'turn-ended' }).state).toBe('idle')
  })

  it('needs you when the agent itself asks for input', () => {
    expect(inferState({ now, lastActivityAt: ago(120), lastKind: 'waiting-input' }).state).toBe('needs-you')
  })

  it('goes idle when quiet for a while mid-turn, and ended after a day', () => {
    expect(inferState({ now, lastActivityAt: ago(5 * 60), lastKind: 'tool-result' }).state).toBe('idle')
    expect(inferState({ now, lastActivityAt: ago(25 * 3600), lastKind: 'turn-ended' }).state).toBe('ended')
  })

  it('always says the state is inferred', () => {
    expect(inferState({ now, lastActivityAt: ago(5), lastKind: 'other' }).note).toMatch(/inferred/i)
  })

  it('never lets a timestamp in the future or NaN break it', () => {
    expect(inferState({ now, lastActivityAt: now + 5000, lastKind: 'tool-result' }).state).toBe('running')
    expect(inferState({ now, lastActivityAt: Number.NaN, lastKind: 'tool-result' }).state).toBe('ended')
  })
})
