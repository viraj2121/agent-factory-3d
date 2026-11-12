import type { LastKind, SessionState } from './model.ts'

// What an agent is doing is not told to us, it is read from timing and the kind of the newest record, so every
// result carries a note that says "inferred". The thresholds are tested in tests/status.test.ts.

const SECOND = 1000
const TOOL_WAIT = 20 * SECOND // a tool call with no result this long: slow command or waiting for permission
const WORKING = 90 * SECOND // quiet this long between records mid-turn: probably thinking
const NEEDS_YOU_FOR = 10 * 60 * SECOND // after a finished turn it is waiting for you for this long, then idle
const ENDED_AFTER = 24 * 3600 * SECOND

export interface StateInput {
  now: number
  lastActivityAt: number
  lastKind: LastKind
}

export function inferState({ now, lastActivityAt, lastKind }: StateInput): { state: SessionState; note: string } {
  if (!Number.isFinite(lastActivityAt) || !Number.isFinite(now)) return { state: 'ended', note: 'Inferred: no readable time in the session file.' }
  const age = Math.max(0, now - lastActivityAt)
  const say = (state: SessionState, why: string) => ({ state, note: `Inferred: ${why}` })
  if (age > ENDED_AFTER) return say('ended', 'nothing for more than a day.')
  switch (lastKind) {
    case 'turn-ended':
      return age <= NEEDS_YOU_FOR ? say('needs-you', 'finished its turn and is waiting for your reply.') : say('idle', 'finished its turn a while ago.')
    case 'waiting-input':
      return age <= NEEDS_YOU_FOR ? say('needs-you', 'the agent says it needs your input.') : say('idle', 'asked for your input a while ago.')
    case 'tool-call':
      if (age <= TOOL_WAIT) return say('running', 'a tool call started a moment ago.')
      return age <= NEEDS_YOU_FOR
        ? say('needs-you', 'a tool call has had no result for a while: a long command, or waiting for your permission.')
        : say('idle', 'a tool call never got a result and nothing happened since.')
    default:
      return age <= WORKING ? say('running', 'new activity in the last 90 seconds.') : say('idle', 'quiet for more than 90 seconds.')
  }
}

/**
 * A subagent reports to the agent that started it, not to a person: when it is done it is idle, never "waiting for you".
 * (If it needs a permission, the parent session shows that.)
 */
export function inferSubagentState({ now, lastActivityAt, lastKind }: StateInput): { state: SessionState; note: string } {
  if (!Number.isFinite(lastActivityAt) || !Number.isFinite(now)) return { state: 'ended', note: 'Inferred: no readable time in the subagent file.' }
  const age = Math.max(0, now - lastActivityAt)
  const say = (state: SessionState, why: string) => ({ state, note: `Inferred: ${why}` })
  if (age > ENDED_AFTER) return say('ended', 'nothing for more than a day.')
  if (lastKind === 'turn-ended') return say('idle', 'finished its task and handed the result back.')
  return age <= WORKING ? say('running', 'new activity in the last 90 seconds.') : say('idle', 'quiet for more than 90 seconds.')
}
