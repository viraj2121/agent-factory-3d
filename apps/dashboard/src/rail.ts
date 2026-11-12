import { crewSummary } from './crew'
import type { Project } from './projects'

// The project rail on the left: projects grouped by what they need from you, with two small counts each.

export type RailGroupId = 'needs-you' | 'working' | 'resting'

export interface RailItem {
  project: Project
  /** Agents waiting for you. */
  waiting: number
  /** Agents working. */
  working: number
}

export interface RailGroup {
  id: RailGroupId
  label: string
  items: RailItem[]
}

const LABELS: Record<RailGroupId, string> = { 'needs-you': 'Needs you', working: 'Working', resting: 'Resting' }

function counts(project: Project): { waiting: number; working: number } {
  const crew = crewSummary(project)
  if (crew) return { waiting: crew.waiting, working: crew.working }
  // demo projects: robots at work from the counts, one waiting when the project needs you
  const working = Object.values(project.agents).reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0)
  return { waiting: project.status === 'needs-you' ? 1 : 0, working }
}

export function railGroups(projects: Project[]): RailGroup[] {
  const groups: RailGroup[] = (['needs-you', 'working', 'resting'] as const).map((id) => ({ id, label: LABELS[id], items: [] }))
  for (const project of projects) {
    const id: RailGroupId = project.status === 'needs-you' ? 'needs-you' : project.status === 'running' ? 'working' : 'resting'
    groups.find((g) => g.id === id)!.items.push({ project, ...counts(project) })
  }
  return groups.filter((g) => g.items.length > 0)
}
