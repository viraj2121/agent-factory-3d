import type { Department } from './hallLayout'
import type { ProjectView } from './live/wire'

export type ProjectStatus = 'running' | 'needs-you' | 'idle'

export interface Project {
  id: string
  name: string
  /** Core glow, island rim and tab colour. */
  accent: string
  status: ProjectStatus
  /** 0 to 1, how busy the core looks. */
  activity: number
  /** 0 to 1, how much of the project is built (demo). Shown by the library and the launch pad. */
  progress: number
  /** The department asking for a human, when the project needs you. */
  attention?: Department
  /** Robots at work per department, 0 to 3 (a bay has three seats). */
  agents: Record<Department, number>
  /** 'demo' = made-up look-test data; 'live' = read from agents on this computer by the agent service. */
  source: 'demo' | 'live'
  /** Live projects only: false when no agent wrote a plan, so `progress` is 0 because it is unknown, not because nothing is done. */
  planKnown?: boolean
  /** Live projects only: everything the service knows (sessions, MCP servers, harness). */
  live?: ProjectView
}

// development takes the old integration count too (the Integration bay was folded into Development); three desks at most
const agents = (planning: number, development: number, review: number, integration = 0): Record<Department, number> => ({
  planning,
  development: Math.min(3, development + integration),
  review,
})
const demo = (p: Omit<Project, 'source'>): Project => ({ ...p, source: 'demo' })

// Demo projects for the look test. Not real agent data.
export const DEMO_PROJECTS: Project[] = [
  demo({ id: 'atlas', name: 'Atlas App', accent: '#22d3ee', status: 'running', progress: 0.5, activity: 0.6, agents: agents(1, 3, 3, 2) }),
  demo({ id: 'beacon', name: 'Beacon Metrics', accent: '#ffb347', status: 'needs-you', attention: 'review', progress: 0.34, activity: 0.45, agents: agents(1, 2, 3, 1) }),
  demo({ id: 'relay', name: 'Relay Pipeline', accent: '#a78bfa', status: 'running', progress: 0.83, activity: 0.8, agents: agents(2, 3, 2, 1) }),
  demo({ id: 'pocketkit', name: 'Pocket Kit', accent: '#34d399', status: 'idle', progress: 1, activity: 0.15, agents: agents(0, 1, 0, 1) }),
]

export const DEFAULT_PROJECT_ID = DEMO_PROJECTS[0].id

/** The project with this id, or the default one when the id is missing or unknown. */
export function projectFor(id: string | null | undefined): Project {
  return DEMO_PROJECTS.find((p) => p.id === id) ?? DEMO_PROJECTS[0]
}
