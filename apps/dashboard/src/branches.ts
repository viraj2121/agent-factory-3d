import type { Department, Vec3 } from './hallLayout'
import { HUB, HUB_LAYOUT } from './hubLayout'
import type { SeatState } from './seats'

export interface BranchPath {
  bay: Department
  kind: 'main' | 'twig'
  /** Seat index, for twigs. */
  seat?: number
  points: Vec3[]
}

const FLOOR = 0.07
/** How far short of the bay the main ends and splits into twigs, in metres. */
const FORK_BACK = 2.2

const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]

/** One main conduit per bay from the deck edge, forking into one twig per seat. */
export function branchPaths(): BranchPath[] {
  const out: BranchPath[] = []
  for (const bay of HUB_LAYOUT.bays) {
    const dx = Math.sin(bay.angle)
    const dz = Math.cos(bay.angle)
    const start: Vec3 = [dx * HUB.deckRadius, FLOOR, dz * HUB.deckRadius]
    const fork: Vec3 = [dx * (bay.radius - FORK_BACK), FLOOR, dz * (bay.radius - FORK_BACK)]
    out.push({ bay: bay.id, kind: 'main', points: [start, lerp3(start, fork, 0.5), fork] })

    const c = Math.cos(bay.rotationY)
    const s = Math.sin(bay.rotationY)
    bay.seats.forEach((seat, i) => {
      const end: Vec3 = [bay.position[0] + seat[0] * c + seat[2] * s, seat[1], bay.position[2] - seat[0] * s + seat[2] * c]
      out.push({ bay: bay.id, kind: 'twig', seat: i, points: [fork, lerp3(fork, [end[0], FLOOR, end[2]], 0.5), end] })
    })
  }
  return out
}

/** Position along a branch, 0 up to but not including 1, repeating every 1 / speed seconds. */
export function pulseT(time: number, index: number, speed: number): number {
  const v = (time * speed + index * 0.37) % 1
  return v < 0 ? v + 1 : v
}

/** A twig is live only when a robot sits at its seat. */
export function activeTwigs(states: SeatState[]): boolean[] {
  return states.map((s) => s === 'robot')
}
