import type { Project } from './projects'
import type { RosterEntry } from './live/wire'
import { workLine } from './crew'
import { isActive } from './crewDetails'

// The "Active now" strip: the real agents that work or wait for you, so you never have to look for them in the scenery.
// A demo project has no real agents, so it lists none.

export interface ActiveAgent {
  entry: RosterEntry
  waiting: boolean
  /** In plain words, what it does now (null when nothing is known). */
  line: string | null
}

export function activeNow(project: Project): ActiveAgent[] {
  const roster = project.live?.roster ?? []
  return roster
    .filter((r) => r.seated && isActive(r))
    .map((entry) => ({ entry, waiting: entry.state === 'needs-you', line: workLine(entry) }))
    .sort((a, b) => Number(b.waiting) - Number(a.waiting) || a.entry.name.localeCompare(b.entry.name))
}
