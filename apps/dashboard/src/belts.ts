import type { Department } from './hallLayout'
import type { Project } from './projects'

// A conveyor belt on the floor behind the bays carries finished builds from Development out along the hall's edge. It runs and
// carries crates only while the department it leaves has robots at work and the project is not idle. The crates are
// demo motion: they carry no real work.

export interface Belt {
  id: string
  from: Department
  /** The bay it ends behind, or 'edge' when it just runs out along the hall's edge (the crates are decoration). */
  to: Department | 'edge'
  /** Distance of the belt's centre line from the middle of the hall, in metres. */
  radius: number
  width: number
  /** Where it begins and ends, as angles in the hall's convention (0 at +z, growing toward +x). */
  start: number
  end: number
}

const deg = (d: number) => (d * Math.PI) / 180

export const BELTS: Belt[] = [
  { id: 'builds', from: 'development', to: 'edge', radius: 11.4, width: 1.1, start: deg(104), end: deg(40) },
]

/** Speed of the belt surface, in metres per second. */
export const BELT_SPEED = 0.9

/** The belt's length along its centre line. */
export const beltLength = (b: Belt): number => b.radius * Math.abs(b.end - b.start)

/** The point `u` of the way along a belt (0 at the source end, 1 at the sink end), and the way it is heading (a yaw angle). */
export function beltPoint(b: Belt, u: number): { x: number; z: number; heading: number } {
  const k = Number.isFinite(u) ? Math.min(1, Math.max(0, u)) : 0
  const a = b.start + (b.end - b.start) * k
  const direction = Math.sign(b.end - b.start)
  // the tangent of the circle in the direction of travel
  const tx = Math.cos(a) * direction
  const tz = -Math.sin(a) * direction
  return { x: b.radius * Math.sin(a), z: b.radius * Math.cos(a), heading: Math.atan2(tx, tz) }
}

/** The belt runs while its source department has robots at work and the project is not idle. */
export function beltActive(project: Pick<Project, 'status' | 'agents'>, b: Belt): boolean {
  return project.status !== 'idle' && project.agents[b.from] > 0
}

/** How fast the belt is going, 0 (stopped) to 1 (full speed): it takes under a second to start or stop. */
export function levelStep(level: number, active: boolean, dt: number): number {
  const step = Number.isFinite(dt) ? Math.max(0, dt) * 1.2 : 0
  return Math.min(1, Math.max(0, level + (active ? step : -step)))
}

/** Where the pattern of crates has got to, 0 up to (not including) 1, after `dt` seconds at `level` speed. */
export function phaseStep(phase: number, level: number, dt: number, length: number): number {
  if (!Number.isFinite(dt) || !(length > 0)) return phase
  const next = phase + (BELT_SPEED * Math.min(1, Math.max(0, level)) * Math.max(0, dt)) / length
  return next - Math.floor(next)
}

/** Position along the belt of crate `k` of `count`, spread evenly. */
export function crateU(phase: number, k: number, count: number): number {
  const v = phase + k / count
  return v - Math.floor(v)
}

/** A crate grows in at the source end and shrinks away at the sink end. */
export function crateScale(u: number): number {
  const edge = 0.06
  return Math.min(1, Math.max(0, Math.min(u, 1 - u) / edge))
}

export interface WorkerSpot {
  x: number
  z: number
  /** A yaw angle that makes the robot face outward, toward the belt. */
  heading: number
  /** What it does while the belt runs: the clip to play. */
  job: 'inspect' | 'assemble'
}

/** Two workers stand just inside each belt, a third and two thirds of the way along it, one inspecting and one stamping. */
export function workerSpots(b: Belt): WorkerSpot[] {
  const standAt = 10.2
  return ([[0.3, 'inspect'], [0.7, 'assemble']] as const).map(([u, job]) => {
    const p = beltPoint(b, u)
    const k = standAt / b.radius
    return { x: p.x * k, z: p.z * k, heading: Math.atan2(p.x, p.z), job }
  })
}
