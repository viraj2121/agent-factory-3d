import type { AgentKind, AgentSession } from '../model.ts'
import { asRecord, asString, cleanPath } from '../util.ts'
import { buildSession, emptyActivity, noteTool, type Activity } from './common.ts'

// Any agent that can run a command on events (hooks) can report to the hub: POST /api/hook with a bearer token.
// Sessions reported this way are labelled "reported by hook". Nothing is stored beyond what the session view shows.

export const HOOK_EVENTS = ['start', 'prompt', 'tool', 'tool_result', 'waiting', 'stop'] as const
export type HookEventName = (typeof HOOK_EVENTS)[number]

export interface HookEvent {
  agent: string
  sessionId: string
  cwd: string
  event: HookEventName
  tool?: string
  command?: string
  title?: string
  model?: string
  time?: number
}

export type ParsedHook = { ok: true; event: HookEvent } | { ok: false; error: string }

const text = (v: unknown, max: number): string | undefined => {
  const s = asString(v)
  return s && s.length <= max ? s : undefined
}

export function parseHookEvent(input: unknown): ParsedHook {
  const r = asRecord(input)
  if (!r) return { ok: false, error: 'Body must be a JSON object.' }
  const agent = text(r.agent, 40)
  const sessionId = text(r.sessionId, 120)
  const cwd = text(r.cwd, 500)
  const event = HOOK_EVENTS.find((e) => e === r.event)
  if (!agent) return { ok: false, error: 'agent: a name of 1 to 40 characters is required.' }
  if (!sessionId) return { ok: false, error: 'sessionId: 1 to 120 characters are required.' }
  if (!cwd || !/^([a-zA-Z]:[\\/]|\/|file:\/\/|\\\\)/.test(cwd)) return { ok: false, error: 'cwd: an absolute folder path is required.' }
  if (!event) return { ok: false, error: `event must be one of ${HOOK_EVENTS.join(', ')}.` }
  const time = typeof r.time === 'number' && Number.isFinite(r.time) ? r.time : undefined
  return { ok: true, event: { agent, sessionId, cwd, event, tool: text(r.tool, 120), command: text(r.command, 500), title: text(r.title, 120), model: text(r.model, 60), time } }
}

function kindOf(name: string): { kind: AgentKind; label: string } {
  const n = name.toLowerCase()
  if (n.includes('claude')) return { kind: 'claude-code', label: 'Claude Code' }
  if (n.includes('codex')) return { kind: 'codex', label: 'Codex' }
  if (n.includes('copilot')) return { kind: 'copilot', label: 'GitHub Copilot' }
  return { kind: 'other', label: name }
}

interface Held {
  agent: AgentKind
  label: string
  id: string
  activity: Activity
}

export class HookStore {
  private held = new Map<string, Held>()
  private max: number
  constructor(max = 300) {
    this.max = max
  }

  ingest(e: HookEvent, now: number): void {
    const { kind, label } = kindOf(e.agent)
    const key = `${kind}:${label}:${e.sessionId}`
    let h = this.held.get(key)
    if (!h) {
      if (this.held.size >= this.max) {
        const oldest = [...this.held.entries()].sort((a, b) => a[1].activity.lastActivityAt - b[1].activity.lastActivityAt)[0]
        if (oldest) this.held.delete(oldest[0])
      }
      h = { agent: kind, label, id: e.sessionId, activity: emptyActivity() }
      this.held.set(key, h)
    }
    const a = h.activity
    a.cwd = cleanPath(e.cwd)
    a.lastActivityAt = e.time ?? now
    if (e.title) a.title = e.title
    if (e.model) a.model = e.model
    switch (e.event) {
      case 'start':
      case 'prompt':
        a.lastKind = 'user-prompt'
        break
      case 'tool':
        noteTool(a, e.tool ?? 'unknown', e.command ?? null)
        a.lastKind = 'tool-call'
        break
      case 'tool_result':
        a.lastKind = 'tool-result'
        break
      case 'waiting':
        a.lastKind = 'waiting-input'
        break
      case 'stop':
        a.lastKind = 'turn-ended'
        break
    }
  }

  sessions(now: number): AgentSession[] {
    const out: AgentSession[] = []
    for (const [key, h] of this.held) {
      if (now - h.activity.lastActivityAt > 24 * 3600 * 1000) {
        this.held.delete(key)
        continue
      }
      const s = buildSession(h.activity, { id: h.id, agent: h.agent, agentLabel: h.label, source: 'hook', fallbackCwd: null, fileMtime: h.activity.lastActivityAt, now })
      if (s) out.push(s)
    }
    return out
  }
}
