import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { AgentSession } from '../model.ts'
import { asArray, asRecord, asString, cleanPath } from '../util.ts'
import type { FileCache } from './claude.ts'
import { buildSession, emptyActivity, noteTool, type Activity } from './common.ts'

// GitHub Copilot Chat in VS Code keeps each chat in <VS Code user dir>/workspaceStorage/<id>/chatSessions/<chat>.jsonl as a
// patch log: line 1 is the whole state (kind 0), later lines set (kind 1) or push to (kind 2) a place in it.
// workspace.json next to chatSessions says which folder the chat belongs to. Only tool ids, counts, the title and times are read.

type Json = Record<string, unknown>

function walk(root: unknown, path: unknown[]): unknown {
  let at = root
  for (const key of path) {
    if (at === null || typeof at !== 'object') return undefined
    at = (at as Json)[String(key)]
  }
  return at
}

export function reduceChatLog(text: string): Json | null {
  let state: Json | null = null
  for (const raw of text.split('\n')) {
    if (!raw.trim()) continue
    let rec: Json | null
    try {
      rec = asRecord(JSON.parse(raw))
    } catch {
      continue
    }
    if (!rec) continue
    if (rec.kind === 0) {
      state = asRecord(rec.v)
      continue
    }
    if (!state || !Array.isArray(rec.k) || rec.k.length === 0) continue
    const parent = walk(state, rec.k.slice(0, -1))
    const last = String(rec.k[rec.k.length - 1])
    if (parent === null || typeof parent !== 'object') continue
    if (rec.kind === 1) {
      ;(parent as Json)[last] = rec.v
    } else if (rec.kind === 2) {
      const target = (parent as Json)[last]
      if (!Array.isArray(target)) continue
      if (typeof rec.i === 'number') target.length = Math.min(target.length, rec.i)
      target.push(...asArray(rec.v))
    }
  }
  return state
}

/** MCP tools in VS Code are called `mcp_<server>_<tool>`; the server is the first word after mcp_ (servers with an underscore in the name are cut short). */
function copilotMcpName(toolId: string): string {
  const m = toolId.match(/^mcp_([^_]+)_(.+)$/)
  return m ? `mcp__${m[1]}__${m[2]}` : toolId
}

function modelName(v: unknown): string | null {
  if (typeof v === 'string') return v
  const r = asRecord(v)
  if (!r) return null
  return asString(asRecord(r.metadata)?.name) ?? asString(r.identifier)
}

export function parseCopilotSession(text: string, fileMtime: number): Activity {
  const a = emptyActivity()
  a.lastActivityAt = fileMtime
  const state = reduceChatLog(text)
  if (!state) return a
  a.title = asString(state.customTitle)
  a.model = modelName(asRecord(state.inputState)?.selectedModel)
  const created = typeof state.creationDate === 'number' ? state.creationDate : Number.NaN
  if (Number.isFinite(created) && created > a.lastActivityAt) a.lastActivityAt = created
  const requests = asArray(state.requests).map(asRecord).filter((r) => r !== null)
  let lastItemDone = true
  for (const req of requests) {
    for (const item of asArray(req.response).map(asRecord)) {
      if (item?.kind !== 'toolInvocationSerialized') continue
      const id = asString(item.toolId) ?? 'unknown'
      const specific = asRecord(item.toolSpecificData)
      const command = asString(asRecord(specific?.commandLine)?.original)
      noteTool(a, copilotMcpName(id), command)
      lastItemDone = item.isComplete !== false
    }
    const ts = typeof req.timestamp === 'number' ? req.timestamp : Number.NaN
    if (Number.isFinite(ts) && ts > a.lastActivityAt) a.lastActivityAt = ts
    const done = asRecord(req.modelState)?.completedAt
    if (typeof done === 'number' && done > a.lastActivityAt) a.lastActivityAt = done
  }
  const last = requests[requests.length - 1]
  if (last) {
    const value = asRecord(last.modelState)?.value
    if (value === 4) a.lastKind = 'waiting-input'
    else if (value === 1 || value === 2 || value === 3) a.lastKind = 'turn-ended'
    else if (a.toolCount > 0 && asArray(last.response).length > 0) a.lastKind = lastItemDone ? 'tool-result' : 'tool-call'
    else a.lastKind = 'user-prompt'
  }
  return a
}

export interface ScanOptions {
  /** The VS Code user directory, e.g. %APPDATA%/Code/User. */
  vscodeUser: string
  home: string
  now: number
  maxAgeMs: number
}

/** Copilot chats from every VS Code workspace edited recently. Copilot CLI sessions are not read (found is reported for the capability note). */
export function scanCopilot(opts: ScanOptions, cache: FileCache<Activity>): { sessions: AgentSession[]; found: boolean; cliFound: boolean } {
  const cliFound = existsSync(join(opts.home, '.copilot'))
  const root = join(opts.vscodeUser, 'workspaceStorage')
  let dirs: string[]
  try {
    dirs = readdirSync(root)
  } catch {
    return { sessions: [], found: false, cliFound }
  }
  const sessions: AgentSession[] = []
  const alive = new Set<string>()
  let found = false
  for (const dir of dirs) {
    const chats = join(root, dir, 'chatSessions')
    let files: string[]
    try {
      files = readdirSync(chats).filter((f) => f.endsWith('.jsonl'))
    } catch {
      continue
    }
    found = true
    let folder: string | null = null
    try {
      const ws = asRecord(JSON.parse(readFileSync(join(root, dir, 'workspace.json'), 'utf8')))
      const raw = asString(ws?.folder) ?? asString(ws?.workspace)
      folder = raw ? cleanPath(raw) : null
      if (folder && /\.code-workspace$/i.test(folder)) folder = folder.slice(0, folder.lastIndexOf('/'))
    } catch {
      folder = null
    }
    if (!folder) continue
    for (const file of files) {
      const path = join(chats, file)
      let st
      try {
        st = statSync(path)
      } catch {
        continue
      }
      if (opts.now - st.mtimeMs > opts.maxAgeMs) continue
      alive.add(path)
      let entry = cache.get(path)
      if (!entry || entry.mtimeMs !== st.mtimeMs || entry.size !== st.size) {
        let text = ''
        try {
          text = st.size > 20 * 1024 * 1024 ? '' : readFileSync(path, 'utf8')
        } catch {
          text = ''
        }
        entry = { mtimeMs: st.mtimeMs, size: st.size, value: parseCopilotSession(text, st.mtimeMs) }
        cache.set(path, entry)
      }
      const session = buildSession(entry.value, {
        id: file.replace(/\.jsonl$/, ''),
        agent: 'copilot',
        agentLabel: 'GitHub Copilot',
        source: 'files',
        fallbackCwd: folder,
        fileMtime: st.mtimeMs,
        now: opts.now,
      })
      if (session) sessions.push(session)
    }
  }
  for (const key of cache.keys()) if (!alive.has(key)) cache.delete(key)
  return { sessions, found, cliFound }
}
