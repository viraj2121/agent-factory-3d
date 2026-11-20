import { workLine } from './crew'
import { inboxWords, STALE_AFTER_MS, type ToolFilter } from './inbox'
import type { Project } from './projects'
import type { RosterEntry } from './live/wire'

// The desktop widget's list: every session on this computer, from every project, as one row each. Read-only: it only sorts and
// words what the agent service already reports. Agent files that never ran ("standing by") are not sessions and are left out.

export type WidgetState = 'wait' | 'run' | 'rest'

export interface WidgetRow {
  /** Stable between scans: project and roster id. */
  key: string
  entry: RosterEntry
  projectId: string
  projectName: string
  /** The project folder, for "Open in VS Code". Null when the service did not report one. */
  folder: string | null
  state: WidgetState
  /** What it does, or what kind of wait this is, in plain words. */
  line: string
  /** One more detail, for example the step a waiting agent is on. */
  detail: string | null
  /** Milliseconds since its last activity, never negative; null when no time is known. */
  sinceMs: number | null
  /** A wait longer than ten minutes. */
  stale: boolean
}

const STATE_OF: Partial<Record<RosterEntry['state'], WidgetState>> = { 'needs-you': 'wait', running: 'run', idle: 'rest' }
const ORDER: Record<WidgetState, number> = { wait: 0, run: 1, rest: 2 }

export function widgetRows(projects: Project[], now: number): WidgetRow[] {
  const rows: WidgetRow[] = []
  for (const p of projects) {
    for (const entry of p.live?.roster ?? []) {
      const state = STATE_OF[entry.state]
      if (!state) continue
      const sinceMs = entry.lastSeenAt === null || !Number.isFinite(entry.lastSeenAt) ? null : Math.max(0, now - entry.lastSeenAt)
      let line = 'resting'
      let detail: string | null = null
      if (state === 'wait') ({ headline: line, detail } = inboxWords(entry))
      if (state === 'run') line = workLine(entry)?.split(' · ')[0] ?? 'working'
      rows.push({
        key: `${p.id}:${entry.id}`,
        entry,
        projectId: p.id,
        projectName: p.name,
        folder: p.live?.path ?? null,
        state,
        line,
        detail,
        sinceMs,
        stale: state === 'wait' && sinceMs !== null && sinceMs > STALE_AFTER_MS,
      })
    }
  }
  // waiting: the longest wait first; working and resting: the most recent first; an unknown time goes last
  return rows.sort((a, b) => {
    if (a.state !== b.state) return ORDER[a.state] - ORDER[b.state]
    const sa = a.sinceMs ?? Infinity, sb = b.sinceMs ?? Infinity
    if (a.state === 'wait') return (b.sinceMs ?? -1) - (a.sinceMs ?? -1)
    return sa - sb
  })
}

export const widgetCounts = (rows: WidgetRow[]): Record<WidgetState, number> => ({
  wait: rows.filter((r) => r.state === 'wait').length,
  run: rows.filter((r) => r.state === 'run').length,
  rest: rows.filter((r) => r.state === 'rest').length,
})

export function filterRows(rows: WidgetRow[], f: { state: WidgetState | 'all'; tool: ToolFilter; query: string }): WidgetRow[] {
  const q = f.query.trim().toLowerCase()
  return rows.filter(
    (r) =>
      (f.state === 'all' || r.state === f.state) &&
      (f.tool === 'all' || r.entry.agent === f.tool) &&
      (!q || r.entry.name.toLowerCase().includes(q) || r.projectName.toLowerCase().includes(q) || r.entry.agentLabel.toLowerCase().includes(q)),
  )
}
