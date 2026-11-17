import { toolPhrase } from './crew'
import type { Project } from './projects'
import type { RosterEntry } from './live/wire'

// The "Waiting for you" inbox: every agent, in every project, that is waiting for you. Read-only: it only collects and words
// what the service already knows. "Waiting" is inferred from the transcript (the service says so), so the words never claim more
// than the service's own note: they do not say which command or file, and a step that may need your permission says "maybe".

/** A wait longer than this is shown as old (red). */
export const STALE_AFTER_MS = 10 * 60_000

export interface InboxItem {
  /** Stable: the same waiting agent keeps the same key between scans. */
  key: string
  projectId: string
  projectName: string
  /** The project folder, for "Open in VS Code". Null when the service did not report one. */
  folder: string | null
  entry: RosterEntry
  /** Milliseconds since its last activity, never negative; null when no time is known. */
  waitingMs: number | null
  stale: boolean
}

export function inboxItems(projects: Project[], now: number): InboxItem[] {
  const items: InboxItem[] = []
  for (const p of projects) {
    for (const entry of p.live?.roster ?? []) {
      if (entry.state !== 'needs-you') continue
      const waitingMs = entry.lastSeenAt === null || !Number.isFinite(entry.lastSeenAt) ? null : Math.max(0, now - entry.lastSeenAt)
      items.push({ key: `${p.id}:${entry.id}`, projectId: p.id, projectName: p.name, folder: p.live?.path ?? null, entry, waitingMs, stale: waitingMs !== null && waitingMs > STALE_AFTER_MS })
    }
  }
  // the longest wait first; an agent with no known time goes last
  return items.sort((a, b) => (b.waitingMs ?? -1) - (a.waitingMs ?? -1))
}

export type ToolFilter = 'all' | RosterEntry['agent']

export const toolFilter = (items: InboxItem[], tool: ToolFilter): InboxItem[] => (tool === 'all' ? items : items.filter((i) => i.entry.agent === tool))

/** What it waits for, in plain words taken from the service's own note. Never says which command or file: that is never read. */
export function inboxWords(entry: RosterEntry): { headline: string; detail: string | null } {
  const note = entry.stateNote.toLowerCase()
  if (note.includes('tool call')) return { headline: 'A step is waiting (maybe for your permission)', detail: entry.currentTool ? toolPhrase(entry.currentTool) : null }
  if (note.includes('your reply')) return { headline: 'Waiting for your reply', detail: null }
  if (note.includes('your input')) return { headline: 'Needs your input', detail: null }
  return { headline: 'Waiting for you', detail: null }
}

/** "waiting 4 min", "waiting 2 h"; "waiting" when no time is known. */
export function waitingText(ms: number | null): string {
  if (ms === null) return 'waiting'
  const s = ms / 1000
  if (s < 45) return 'waiting just now'
  if (s < 3600) return `waiting ${Math.max(1, Math.round(s / 60))} min`
  return `waiting ${Math.round(s / 3600)} h`
}
