import type { Department } from '../hallLayout'
import type { Project } from '../projects'
import type { HarnessItem, ProjectView, Snapshot } from './wire'

// Turns what the agent service reports into the `Project` objects the 3D scene reads. Nothing is invented here:
// a project without an agent-written plan has progress 0 and `planKnown: false`, and the panel says so.

export type LiveState = 'connecting' | 'live' | 'offline' | 'off'

export const LIVE_ACCENTS = ['#22d3ee', '#ffb347', '#a78bfa', '#34d399', '#f472b6', '#60a5fa', '#facc15', '#fb7185']

/** A stable colour for a project id. */
export function accentFor(id: string): string {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619)
  return LIVE_ACCENTS[(h >>> 0) % LIVE_ACCENTS.length]
}

const DEPARTMENT_KEYS: Department[] = ['planning', 'development', 'review']
const seat = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) ? Math.min(3, Math.max(0, Math.floor(n))) : 0)

export function toProject(v: ProjectView): Project {
  const progress = typeof v.progress === 'number' && Number.isFinite(v.progress) ? Math.min(1, Math.max(0, v.progress)) : null
  return {
    id: v.id,
    name: v.name,
    accent: accentFor(v.id),
    status: v.status,
    activity: Math.min(1, Math.max(0, Number.isFinite(v.activity) ? v.activity : 0)),
    progress: progress ?? 0,
    planKnown: progress !== null,
    attention: v.attention ?? undefined,
    agents: { planning: seat(v.agents.planning), development: seat(v.agents.development), review: seat(v.agents.review) },
    source: 'live',
    live: v,
  }
}

/** Shown when the service runs but no agent has been active lately: a truthful empty hub, not demo projects. */
export const WAITING_PROJECT: Project = {
  id: 'no-agents',
  name: 'No active agents',
  accent: '#8aa0aa',
  status: 'idle',
  activity: 0.1,
  progress: 0,
  planKnown: false,
  agents: { planning: 0, development: 0, review: 0 },
  source: 'live',
}

export function projectsFromSnapshot(s: Snapshot): Project[] {
  return s.projects.length > 0 ? s.projects.map(toProject) : [WAITING_PROJECT]
}

const STATUSES = new Set(['running', 'needs-you', 'idle'])
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** Checks the shape of a snapshot before anything is shown from it. Returns null for anything else. */
export function parseSnapshot(input: unknown): Snapshot | null {
  if (!isObj(input) || input.version !== 1 || !Array.isArray(input.projects)) return null
  for (const p of input.projects) {
    if (!isObj(p) || typeof p.id !== 'string' || typeof p.name !== 'string' || typeof p.path !== 'string') return null
    if (typeof p.status !== 'string' || !STATUSES.has(p.status)) return null
    if (!isObj(p.agents) || !DEPARTMENT_KEYS.every((k) => typeof (p.agents as Record<string, unknown>)[k] === 'number')) return null
    if (!Array.isArray(p.sessions) || !Array.isArray(p.mcp) || !Array.isArray(p.harness)) return null
    if (p.roster !== undefined && !Array.isArray(p.roster)) return null
  }
  return { ...(input as unknown as Snapshot), capabilities: Array.isArray(input.capabilities) ? (input.capabilities as Snapshot['capabilities']) : [] }
}

export function bannerFor(state: LiveState): string {
  switch (state) {
    case 'live':
      return 'LIVE - read-only view of agents on this computer'
    case 'connecting':
      return 'Looking for the agent service...'
    case 'offline':
      return 'LOOK TEST - not real agent data (agent service not running)'
    case 'off':
      return 'LOOK TEST - not real agent data'
  }
}

export function timeAgo(then: number, now: number): string {
  if (!Number.isFinite(then) || !Number.isFinite(now)) return 'unknown'
  const s = Math.max(0, Math.round((now - then) / 1000))
  if (s < 10) return 'just now'
  if (s < 60) return `${s} s ago`
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 48 * 3600) return `${Math.round(s / 3600)} h ago`
  return `${Math.round(s / 86400)} d ago`
}

const DEFAULT_SERVICE = 'http://127.0.0.1:4317'

/** Address of the agent service. The page address may point it at another local port, never at another computer. */
export function serviceUrl(param: string | null): string {
  if (!param) return DEFAULT_SERVICE
  try {
    const u = new URL(param)
    if (u.protocol !== 'http:' || (u.hostname !== '127.0.0.1' && u.hostname !== 'localhost')) return DEFAULT_SERVICE
    return `${u.protocol}//${u.host}`
  } catch {
    return DEFAULT_SERVICE
  }
}

const KIND_ORDER = ['instructions', 'skill', 'subagent', 'command', 'hook', 'plugin']

/** Harness items grouped by kind in a fixed order, names sorted, duplicates (same name at user and project level) kept once. */
export function groupHarness(items: HarnessItem[]): [string, string[]][] {
  const groups = new Map<string, Set<string>>()
  for (const item of items) {
    const set = groups.get(item.kind) ?? new Set<string>()
    set.add(item.name)
    groups.set(item.kind, set)
  }
  return KIND_ORDER.filter((k) => groups.has(k)).map((k) => [k, [...(groups.get(k) as Set<string>)].sort((a, b) => a.localeCompare(b))])
}
