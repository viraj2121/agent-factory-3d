import type { Vec3 } from './hallLayout'
import { TOWER } from './launchpad'
import { ROCKET_BASE, radiusAt } from './rocket'

// A small inspection drone circles the rocket on the side away from the tower (where the welding robot's platform
// is) and scans each seam with a laser while it is being welded and while it cools. Demo motion. Everything is in
// the pad's own space: the rocket's axis is straight up through the origin and y 0 is the floor of the pad.

/** The azimuth (sin x, cos z convention) of the tower seen from the rocket's axis. */
const TOWER_AZIMUTH = Math.atan2(TOWER.x, TOWER.z)
/** The drone's side of the rocket: directly opposite the tower. */
const HOME = TOWER_AZIMUTH + Math.PI
/** How far it swings either side of home, in radians: stays well away from the tower and its platform. */
const SWEEP = 1.25
/** How far outside the rocket's skin it flies, and how far above the seam it hovers. */
const STANDOFF = 0.62
const ABOVE_SEAM = 0.28

export interface DroneMoment {
  position: Vec3
  /** Where its laser lands (on the seam ring), or null when it is not scanning. */
  laserTo: Vec3 | null
}

/**
 * The drone at time `t`. `seamY` is the height, on the rocket, of the seam being worked on (null when there is none),
 * and `scanning` says whether the laser is on.
 */
export function droneAt(t: number, seamY: number | null, scanning: boolean): DroneMoment {
  const time = Number.isFinite(t) ? t : 0
  const azimuth = HOME + SWEEP * Math.sin(time * 0.55)
  const onRocket = seamY ?? 1.8 + 0.9 * Math.sin(time * 0.4)
  const radius = radiusAt(onRocket) + STANDOFF
  const y = ROCKET_BASE + onRocket + (seamY === null ? 0 : ABOVE_SEAM)
  const position: Vec3 = [radius * Math.sin(azimuth), y, radius * Math.cos(azimuth)]
  if (!scanning || seamY === null) return { position, laserTo: null }
  const skin = radiusAt(seamY) + 0.004
  return { position, laserTo: [skin * Math.sin(azimuth), ROCKET_BASE + seamY, skin * Math.cos(azimuth)] }
}
