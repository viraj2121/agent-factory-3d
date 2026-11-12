import type { Project } from './projects'
import { agentCounts } from './systemLayout'

// What the solar system level knows about one project, in plain numbers: for the card you get when you look closer at a
// planet, and for how far from the star its orbit sits. Times and counts come from the real project; a demo project has
// none of them, so they are null (never made up).

export interface PlanetFacts {
  status: 'working' | 'needs' | 'resting'
  working: number
  waiting: number
  /** Markdown files in the project, or null when no project folder is connected. */
  files: number | null
  /** MCP servers configured or seen in use, or null when unknown. */
  mcp: number | null
  /** Plan progress 0 to 1 from the agents' own task lists, or null when no agent wrote one. */
  plan: number | null
  /** Milliseconds since epoch of the newest activity, or null when none is known. */
  lastActivityAt: number | null
}

const newestActivity = (project: Project): number | null => {
  const live = project.live
  if (!live) return null
  const times = [...live.sessions.map((s) => s.lastActivityAt), ...live.roster.map((r) => r.lastSeenAt)].filter((t): t is number => typeof t === 'number' && Number.isFinite(t))
  return times.length ? Math.max(...times) : null
}

/** Hours since the project was last active; about zero while it works or waits; null when nothing is known. */
export function recencyHours(project: Project, now: number): number | null {
  if (project.source !== 'live' || !project.live) return null
  if (project.status === 'running' || project.status === 'needs-you') return 0.05
  const at = newestActivity(project)
  return at === null ? null : Math.max(0, (now - at) / 3_600_000)
}

export function planetFacts(project: Project, _now: number): PlanetFacts {
  const counts = agentCounts(project)
  const live = project.live
  return {
    status: project.status === 'needs-you' ? 'needs' : project.status === 'running' || counts.working > 0 ? 'working' : 'resting',
    working: counts.working,
    waiting: counts.waiting,
    files: live ? (live.docs?.length ?? 0) : null,
    mcp: live ? live.mcp.length : null,
    plan: project.planKnown && project.source === 'live' ? project.progress : null,
    lastActivityAt: newestActivity(project),
  }
}
