import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'
import type { AgentSession, SubagentRun } from '../model.ts'
import { asArray, asRecord, asString, parseJsonLines, readTail, toMillis } from '../util.ts'
import type { FileCache } from './claude.ts'
import { buildRun, buildSession, emptyActivity, noteTool, type Activity } from './common.ts'

// Codex keeps its threads in ~/.codex/state_5.sqlite (folder, title, model, rollout file) and writes each
// session as a rollout JSON-lines file (older ones compressed with zstd). Only tool names, counts and times are read.

function commandText(args: Record<string, unknown> | null): string | null {
  const c = args?.command ?? args?.cmd
  if (typeof c === 'string') return c
  if (Array.isArray(c)) return c.map(String).join(' ')
  return null
}

export function parseCodexRollout(text: string): Activity {
  const a = emptyActivity()
  for (const rec of parseJsonLines(text)) {
    const type = asString(rec.type)
    const payload = asRecord(rec.payload)
    if (!type || !payload) continue
    const time = toMillis(rec.timestamp)
    const stamp = () => {
      if (Number.isFinite(time) && !(a.lastActivityAt >= time)) a.lastActivityAt = time
    }
    if (type === 'session_meta' || type === 'turn_context') {
      const cwd = asString(payload.cwd)
      if (cwd) a.cwd = cwd
      const model = asString(payload.model)
      if (model) a.model = model
      continue
    }
    const kind = asString(payload.type)
    if (type === 'event_msg') {
      if (kind === 'task_started') {
        stamp()
        a.lastKind = 'user-prompt'
      } else if (kind === 'task_complete' || kind === 'turn_aborted') {
        stamp()
        a.lastKind = 'turn-ended'
      }
      continue
    }
    if (type !== 'response_item') continue
    if (kind === 'function_call' || kind === 'custom_tool_call') {
      stamp()
      const name = asString(payload.name) ?? 'unknown'
      let args: Record<string, unknown> | null = null
      if (kind === 'function_call') {
        try {
          args = asRecord(JSON.parse(asString(payload.arguments) ?? 'null'))
        } catch {
          args = null
        }
      }
      noteTool(a, name, commandText(args))
      if (name === 'update_plan') {
        const steps = asArray(args?.plan).map(asRecord).filter((s) => s !== null)
        if (steps.length > 0) a.plan = { done: steps.filter((s) => s.status === 'completed').length, total: steps.length }
      }
      a.lastKind = 'tool-call'
    } else if (kind === 'function_call_output' || kind === 'custom_tool_call_output') {
      stamp()
      a.lastKind = 'tool-result'
    } else if (kind === 'message') {
      stamp()
      a.lastKind = payload.role === 'user' ? 'user-prompt' : 'other'
    }
  }
  return a
}

const TAIL_BYTES = 256 * 1024
const MAX_ZST_BYTES = 20 * 1024 * 1024

function readRollout(path: string): string {
  if (path.endsWith('.zst')) {
    try {
      if (statSync(path).size > MAX_ZST_BYTES) return ''
      return zstdDecompressSync(readFileSync(path)).toString('utf8').slice(-TAIL_BYTES)
    } catch {
      return ''
    }
  }
  return readTail(path, TAIL_BYTES)
}

type ThreadRow = Record<string, unknown>

export interface ScanOptions {
  home: string
  now: number
  maxAgeMs: number
}

type Db = { prepare(sql: string): { all(...p: unknown[]): unknown[] }; close(): void }

async function openDb(file: string): Promise<Db | null> {
  try {
    const sqlite = await import('node:sqlite')
    return new sqlite.DatabaseSync(file, { readOnly: true }) as unknown as Db
  } catch {
    return null
  }
}

/** The subagent part of a thread's `source` column, e.g. {"subagent":{"other":"guardian"}} or {"subagent":{"thread_spawn":{...}}}. Null for a normal thread. */
function subagentSource(source: unknown): Record<string, unknown> | null {
  if (typeof source !== 'string' || !source.includes('subagent')) return null
  try {
    return asRecord(asRecord(JSON.parse(source))?.subagent) ?? {}
  } catch {
    return {}
  }
}

/** Recent Codex threads. Needs `node:sqlite`; when it cannot be opened, Codex is reported as found but unreadable. */
export async function scanCodex(opts: ScanOptions, cache: FileCache<Activity>): Promise<{ sessions: AgentSession[]; runs: SubagentRun[]; found: boolean; note?: string }> {
  const dir = join(opts.home, '.codex')
  const dbFile = join(dir, 'state_5.sqlite')
  if (!existsSync(dir)) return { sessions: [], runs: [], found: false }
  if (!existsSync(dbFile)) return { sessions: [], runs: [], found: true, note: 'Codex folder found, but no thread database (state_5.sqlite).' }
  const db = await openDb(dbFile)
  if (!db) return { sessions: [], runs: [], found: true, note: 'Codex found, but its thread database could not be opened.' }
  let rows: ThreadRow[] = []
  const parentOf = new Map<string, string>()
  try {
    const since = Math.floor((opts.now - opts.maxAgeMs) / 1000)
    // every column, so that a Codex version with more or fewer columns still reads; only the fields below are used
    rows = db.prepare('select * from threads where archived = 0 and updated_at >= ? order by updated_at desc limit 200').all(since) as unknown as ThreadRow[]
    try {
      for (const e of db.prepare('select parent_thread_id, child_thread_id from thread_spawn_edges').all() as ThreadRow[]) {
        const parent = asString(e.parent_thread_id)
        const child = asString(e.child_thread_id)
        if (parent && child) parentOf.set(child, parent)
      }
    } catch {
      // no spawn table in this version
    }
  } catch {
    return { sessions: [], runs: [], found: true, note: 'Codex found, but its thread table could not be read (a newer version may have changed it).' }
  } finally {
    db.close()
  }
  const sessions: AgentSession[] = []
  const runs: SubagentRun[] = []
  for (const row of rows) {
    const id = asString(row.id)
    if (!id) continue
    const updatedMs = typeof row.updated_at_ms === 'number' ? row.updated_at_ms : typeof row.updated_at === 'number' ? row.updated_at * 1000 : Number.NaN
    let activity: Activity = emptyActivity()
    const path = asString(row.rollout_path)
    if (path && existsSync(path)) {
      const st = statSync(path)
      let entry = cache.get(path)
      if (!entry || entry.mtimeMs !== st.mtimeMs || entry.size !== st.size) {
        entry = { mtimeMs: st.mtimeMs, size: st.size, value: parseCodexRollout(readRollout(path)) }
        cache.set(path, entry)
      }
      activity = { ...entry.value }
    }
    activity.model = activity.model ?? asString(row.model)

    const sub = subagentSource(row.source)
    if (sub) {
      const spawn = asRecord(sub.thread_spawn)
      const agentType = asString(row.agent_role) ?? asString(spawn?.agent_role) ?? asString(sub.other) ?? asString(row.agent_nickname) ?? asString(spawn?.agent_nickname) ?? 'subagent'
      const run = buildRun(activity, {
        id,
        parentId: asString(spawn?.parent_thread_id) ?? parentOf.get(id) ?? '',
        agent: 'codex',
        agentType,
        description: null, // a subagent thread is titled after its task text: not read out
        fallbackCwd: asString(row.cwd),
        fileMtime: updatedMs,
        now: opts.now,
      })
      if (run) runs.push(run)
      continue
    }
    activity.title = asString(row.name) ?? asString(row.title)
    const session = buildSession(activity, { id, agent: 'codex', agentLabel: 'Codex', source: 'files', fallbackCwd: asString(row.cwd), fileMtime: updatedMs, now: opts.now })
    if (session) sessions.push(session)
  }
  return { sessions, runs, found: true }
}
