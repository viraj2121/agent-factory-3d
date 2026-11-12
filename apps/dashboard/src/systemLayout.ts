import type { Vec3 } from './hallLayout'
import type { CameraView } from './hubCameraConfig'
import type { Project } from './projects'
import { crewSummary } from './crew'

// The solar system level: every project is a planet of one red-dwarf system. The star stands for this computer and is
// decoration; the planets, their moons (working agents) and the flare rate follow the real projects.
// Units are scene metres, the same as the hall, so the system sits at the origin when the hall is hidden.

export const PLANET_KINDS = ['lava', 'desert', 'ocean', 'rocky', 'gasring', 'gas', 'ice', 'barren'] as const
export type PlanetKind = (typeof PLANET_KINDS)[number]

export const SYSTEM = {
  /** The red dwarf's radius. */
  starRadius: 3.6,
  /** The least gap between two neighbouring orbits: wide enough for the biggest planet and its rings. */
  minGap: 6,
  /** At most this many moons are drawn round a planet, even if more agents work. */
  maxMoons: 5,
}

const hash = (s: string): number => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

/**
 * A kind of world for every project. Each project prefers the kind its id hashes to, and takes the next free kind when
 * that one is taken, in list order, so up to eight projects all look different and the same list always gives the same look.
 */
export function planetKinds(ids: string[]): Map<string, PlanetKind> {
  const out = new Map<string, PlanetKind>()
  let used = new Set<PlanetKind>()
  for (const id of ids) {
    if (used.size === PLANET_KINDS.length) used = new Set()
    const start = hash(id) % PLANET_KINDS.length
    for (let k = 0; k < PLANET_KINDS.length; k++) {
      const kind = PLANET_KINDS[(start + k) % PLANET_KINDS.length]
      if (!used.has(kind)) {
        used.add(kind)
        out.set(id, kind)
        break
      }
    }
  }
  return out
}

/** A small number that is the same for a project every time, so its world has its own surface and keeps it. */
export const planetSeed = (id: string): number => 11 + (hash(id) % 997)

/** Seconds on the system's own clock. The scene and the camera flights both read it, so a flight can end where a planet really is. */
export const systemTime = (): number => performance.now() / 1000

export function planetKind(ids: string[], id: string): PlanetKind {
  return planetKinds(ids).get(id) ?? PLANET_KINDS[hash(id) % PLANET_KINDS.length]
}

/** Distance of the planet at place `index` in the project list from the star. */
export function orbitRadius(index: number): number {
  return 12 + 7 * index + 0.12 * index * index
}

/** Radians per second: the inner planets go round faster (roughly as real orbits do), but slowly enough to stay calm. */
const angularSpeed = (index: number): number => 0.12 * Math.pow(orbitRadius(0) / orbitRadius(index), 1.5)

/** Where the planet is on its orbit, in radians. Not wrapped. Different planets start at different angles. */
export function planetAngle(index: number, t: number): number {
  return index * 0.95 + t * angularSpeed(index)
}

export function planetPosition(index: number, t: number): Vec3 {
  const a = planetAngle(index, t)
  const r = orbitRadius(index)
  return [Math.cos(a) * r, 0, Math.sin(a) * r]
}

/**
 * The turn about the vertical axis that keeps one face of a globe looking at the star (the planets are tidally locked).
 * A globe's middle meridian is on its +x axis (three.js sphere uvs), so turn that axis toward the star.
 */
export function lockedYaw(angle: number): number {
  return Math.PI - angle
}

const SIZES: Record<PlanetKind, number> = { lava: 1.2, desert: 1.35, ocean: 1.6, rocky: 1.3, gasring: 2.7, gas: 2.3, ice: 1.9, barren: 1.1 }

export function planetSize(kind: PlanetKind, current: boolean): number {
  return SIZES[kind] * (current ? 1.18 : 1)
}

/** Working agents become moons (at most five); a waiting agent becomes the amber moon. Real counts where the crew is known. */
export function agentCounts(project: Project): { working: number; waiting: number } {
  const crew = crewSummary(project)
  if (crew) return { working: Math.min(SYSTEM.maxMoons, crew.working), waiting: crew.waiting }
  const robots = Object.values(project.agents).reduce((a, b) => a + b, 0)
  return { working: project.status === 'idle' ? 0 : Math.min(SYSTEM.maxMoons, robots), waiting: project.status === 'needs-you' ? 1 : 0 }
}

export type MoonKind = 'claude-code' | 'codex' | 'copilot' | 'other' | 'demo'

/** How the moon of each tool looks: a diamond, a cube, a ring, a ball. Demo moons are plain green balls (no tool is claimed). */
export const MOON_LOOK: Record<MoonKind, { colour: string; shape: 'diamond' | 'cube' | 'ring' | 'ball' }> = {
  'claude-code': { colour: '#ff8a5a', shape: 'diamond' },
  codex: { colour: '#6fa8ff', shape: 'cube' },
  copilot: { colour: '#d28bff', shape: 'ring' },
  other: { colour: '#9adfc4', shape: 'ball' },
  demo: { colour: '#5df0a8', shape: 'ball' },
}

/** The tool behind each working moon (same length as agentCounts().working): from the real roster, or 'demo' without one. */
export function moonTools(project: Project): MoonKind[] {
  const roster = project.live?.roster
  if (!roster) return Array<MoonKind>(agentCounts(project).working).fill('demo')
  return roster
    .filter((r) => r.seated && r.state === 'running')
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .slice(0, SYSTEM.maxMoons)
    .map((r) => r.agent)
}

/** Seconds between flares on the star: more agents working over the whole system, more often. Decoration. */
export function flarePeriod(workingAgents: number): number {
  return Math.min(24, Math.max(4, 24 / (1 + Math.max(0, workingAgents) * 0.35)))
}

/** The overview: the whole system, outer orbit included, seen from above and in front so the orbits are ellipses. */
export function systemCamera(count: number): CameraView {
  const outer = orbitRadius(Math.max(1, count) - 1)
  const d = Math.max(90, outer * 2.2 + 25)
  const e = 0.42
  return { position: [0, d * Math.sin(e), d * Math.cos(e)], target: [0, 0, 0], fov: 38 }
}

/** Close to a planet, on the side facing the star so the lit face shows. Used when you fly down into a project. */
export function planetApproach(planet: Vec3, size: number): CameraView {
  const len = Math.hypot(planet[0], planet[2])
  const dx = len > 1e-6 ? -planet[0] / len : 0
  const dz = len > 1e-6 ? -planet[2] / len : 1
  const back = size * 5
  return { position: [planet[0] + dx * back, planet[1] + size * 1.6, planet[2] + dz * back], target: [...planet], fov: 40 }
}
