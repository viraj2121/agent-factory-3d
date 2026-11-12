import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { AgentSession, SubagentRun } from '../model.ts'
import { asArray, asRecord, asString, parseJsonLines, readHead, readTail, toMillis } from '../util.ts'
import { buildRun, buildSession, emptyActivity, noteTool, tidyTitle, type Activity } from './common.ts'

// Claude Code writes one JSON-lines transcript per session to ~/.claude/projects/<folder>/<session>.jsonl.
// Records used: user (prompt or tool_result), assistant (text or tool_use), ai-title. Nothing else is read out.

export function parseClaudeTranscript(text: string): Activity {
  const a = emptyActivity()
  for (const rec of parseJsonLines(text)) {
    const type = asString(rec.type)
    const cwd = asString(rec.cwd)
    if (cwd && !a.cwd) a.cwd = cwd // the folder the session started in; a later `cd` in a command changes the record folder
    if (type === 'ai-title') {
      a.title = asString(rec.aiTitle) ?? a.title
      continue
    }
    if (type !== 'assistant' && type !== 'user') continue
    if (rec.isMeta === true) continue
    const time = toMillis(rec.timestamp)
    if (Number.isFinite(time) && !(a.lastActivityAt >= time)) a.lastActivityAt = time
    const message = asRecord(rec.message)
    const content = message?.content
    if (type === 'assistant') {
      const model = asString(message?.model)
      if (model && model !== '<synthetic>') a.model = model
      let sawTool = false
      for (const part of asArray(content)) {
        const p = asRecord(part)
        if (p?.type !== 'tool_use') continue
        sawTool = true
        const name = asString(p.name) ?? 'unknown'
        const input = asRecord(p.input)
        noteTool(a, name, asString(input?.command))
        if (name === 'TodoWrite') {
          const todos = asArray(input?.todos).map(asRecord).filter((t) => t !== null)
          if (todos.length > 0) a.plan = { done: todos.filter((t) => t.status === 'completed').length, total: todos.length }
        }
      }
      if (sawTool) a.lastKind = 'tool-call'
      else if (asString(message?.stop_reason) === 'end_turn' || asArray(content).some((c) => asRecord(c)?.type === 'text')) a.lastKind = 'turn-ended'
      else a.lastKind = 'other'
    } else {
      const parts = asArray(content).map(asRecord)
      if (parts.some((p) => p?.type === 'tool_result')) a.lastKind = 'tool-result'
      else a.lastKind = 'user-prompt'
    }
  }
  return a
}

export interface FileCacheEntry<T> {
  mtimeMs: number
  size: number
  value: T
}
export type FileCache<T> = Map<string, FileCacheEntry<T>>

const TAIL_BYTES = 256 * 1024
const HEAD_BYTES = 64 * 1024

/** What is read once per subagent file: its activity and the two fields of its `.meta.json`. */
export interface RunInfo {
  activity: Activity
  agentType: string
  description: string | null
}

const SUBAGENT_FALLBACK = 'subagent'

function readRunInfo(file: string): RunInfo {
  const activity = parseClaudeTranscript(readTail(file, TAIL_BYTES))
  const head = parseClaudeTranscript(readHead(file, HEAD_BYTES))
  activity.cwd = head.cwd ?? activity.cwd
  let meta: Record<string, unknown> | null = null
  try {
    meta = asRecord(JSON.parse(readFileSync(file.replace(/\.jsonl$/, '.meta.json'), 'utf8')))
  } catch {
    meta = null
  }
  return { activity, agentType: asString(meta?.agentType) ?? SUBAGENT_FALLBACK, description: tidyTitle(asString(meta?.description)) }
}

export interface ScanOptions {
  home: string
  now: number
  maxAgeMs: number
}

/** Subagent runs of one session: ~/.claude/projects/<folder>/<session>/subagents/agent-<id>.jsonl (+ .meta.json). */
function scanRuns(dir: string, sessionId: string, parentCwd: string | null, opts: ScanOptions, cache: FileCache<RunInfo>, alive: Set<string>): SubagentRun[] {
  const folder = join(dir, sessionId, 'subagents')
  let files: string[]
  try {
    files = readdirSync(folder).filter((f) => f.startsWith('agent-') && f.endsWith('.jsonl'))
  } catch {
    return []
  }
  const runs: SubagentRun[] = []
  for (const file of files) {
    const path = join(folder, file)
    let st
    try {
      st = statSync(path)
    } catch {
      continue
    }
    if (!st.isFile() || opts.now - st.mtimeMs > opts.maxAgeMs) continue
    alive.add(path)
    let entry = cache.get(path)
    if (!entry || entry.mtimeMs !== st.mtimeMs || entry.size !== st.size) {
      entry = { mtimeMs: st.mtimeMs, size: st.size, value: readRunInfo(path) }
      cache.set(path, entry)
    }
    const { activity: a, agentType, description } = entry.value
    const run = buildRun(a, { id: file.slice('agent-'.length).replace(/\.jsonl$/, ''), parentId: sessionId, agent: 'claude-code', agentType, description, fallbackCwd: parentCwd, fileMtime: st.mtimeMs, now: opts.now })
    if (run) runs.push(run)
  }
  return runs
}

/** Sessions and subagent runs Claude Code wrote recently. Files are re-read only when their size or time changed. */
export function scanClaude(opts: ScanOptions, cache: FileCache<Activity>, runCache: FileCache<RunInfo> = new Map()): { sessions: AgentSession[]; runs: SubagentRun[]; found: boolean } {
  const root = join(opts.home, '.claude', 'projects')
  let dirs: string[]
  try {
    dirs = readdirSync(root)
  } catch {
    return { sessions: [], runs: [], found: false }
  }
  const sessions: AgentSession[] = []
  const runs: SubagentRun[] = []
  const alive = new Set<string>()
  const aliveRuns = new Set<string>()
  for (const dir of dirs) {
    let files: string[]
    try {
      files = readdirSync(join(root, dir)).filter((f) => f.endsWith('.jsonl'))
    } catch {
      continue
    }
    for (const file of files) {
      const path = join(root, dir, file)
      let st
      try {
        st = statSync(path)
      } catch {
        continue
      }
      if (!st.isFile() || opts.now - st.mtimeMs > opts.maxAgeMs) continue
      alive.add(path)
      let entry = cache.get(path)
      if (!entry || entry.mtimeMs !== st.mtimeMs || entry.size !== st.size) {
        const activity = parseClaudeTranscript(readTail(path, TAIL_BYTES))
        const head = parseClaudeTranscript(readHead(path, HEAD_BYTES))
        activity.cwd = head.cwd ?? activity.cwd
        activity.title = activity.title ?? head.title
        entry = { mtimeMs: st.mtimeMs, size: st.size, value: activity }
        cache.set(path, entry)
      }
      const id = file.replace(/\.jsonl$/, '')
      const mine = scanRuns(join(root, dir), id, entry.value.cwd, opts, runCache, aliveRuns)
      runs.push(...mine)
      const session = buildSession(entry.value, {
        id,
        agent: 'claude-code',
        agentLabel: 'Claude Code',
        source: 'files',
        fallbackCwd: null,
        fileMtime: st.mtimeMs,
        now: opts.now,
      })
      if (session) {
        // a session that waits for its subagent has a tool call with no result, which alone would read as "waiting for you"
        if (session.state === 'needs-you' && entry.value.lastKind === 'tool-call' && mine.some((r) => r.state === 'running')) {
          session.state = 'running'
          session.stateNote = 'Inferred: waiting for a subagent that is still working.'
        }
        sessions.push(session)
      }
    }
  }
  for (const key of cache.keys()) if (!alive.has(key)) cache.delete(key)
  for (const key of runCache.keys()) if (!aliveRuns.has(key)) runCache.delete(key)
  return { sessions, runs, found: true }
}
