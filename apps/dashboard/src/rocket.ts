import type { Vec3 } from './hallLayout'

// The rocket on the launch pad is built from six sections, bottom to top. This file holds the shape (one curve that
// every section is cut from, so the seams line up exactly) and the exact geometry of the welding robot: where it
// must stand, and which way its arm must point, for its torch tip to land on a seam. All lengths are metres in the
// pad's own space, with the rocket's axis straight up through the origin.

export const SECTIONS = 6

/** Heights where sections begin and end: nozzle skirt, lower body, tank, cabin, nose (lower), nose tip. */
export const BOUNDS = [0.12, 0.55, 1.05, 1.55, 2.05, 2.55, 3.0]

/** Height of the rocket's base above the floor of the pad: the pad's top surface. */
export const ROCKET_BASE = 0.22

/** Where the robot welds each section: along its lower seam (the skirt is welded a little above its foot so the robot's platform stays above the pad). */
export const SEAM_Y = [0.5, ...BOUNDS.slice(1, SECTIONS)]

const BODY = 0.47
const FLARE = 0.19
const NOSE_FROM = 2.05

/** Outer radius of the rocket at height `y`: a flared skirt at the bottom, a straight body, then a rounded nose. */
export function radiusAt(y: number): number {
  if (y <= BOUNDS[1]) {
    const s = Math.min(1, Math.max(0, (y - BOUNDS[0]) / (BOUNDS[1] - BOUNDS[0])))
    return BODY + FLARE * (1 - s) * (1 - s)
  }
  if (y <= NOSE_FROM) return BODY
  const t = Math.min(1, (y - NOSE_FROM) / (BOUNDS[SECTIONS] - NOSE_FROM))
  return BODY * Math.pow(1 - t, 0.62)
}

/** The outline of section `k` as (radius, height) pairs for turning on a lathe, cut from the same curve as its neighbours. */
export function sectionProfile(k: number, steps: number): [number, number][] {
  const from = BOUNDS[k]
  const to = BOUNDS[k + 1]
  return Array.from({ length: steps + 1 }, (_, i) => {
    const y = from + ((to - from) * i) / steps
    return [radiusAt(y), y] as [number, number]
  })
}

/** What the welding robot looks like, measured from its model: where its welding shoulder is, and how far its torch tip reaches from it. */
export interface WeldRobot {
  /** The shoulder in the robot's own space (x to its left, y up, z forward), in the model's units. */
  shoulderX: number
  shoulderY: number
  shoulderZ: number
  /** How much the robot is scaled up from the model's units. */
  scale: number
  /** Distance from the shoulder to the torch tip, in the model's units. */
  reach: number
}

export interface WeldRig {
  /** Where the robot's feet go (the origin of its model). */
  root: Vec3
  /** The turn about the vertical axis that makes it face the rocket. */
  yaw: number
  shoulder: Vec3
  /** The point on the rocket's skin that the torch touches. */
  seam: Vec3
  /** Unit direction from the shoulder to the seam. */
  dir: Vec3
}

/** How far down the torch points at the seam, in radians. */
const TILT = 0.35

/**
 * Where the robot has to stand and which way its arm has to point so that the torch tip lands exactly on the seam
 * ring at height `seamY` (radius `seamR`). The robot stands on the line from the rocket's axis to the tower, facing
 * the axis; its shoulder is a fixed distance from the seam, slightly above it.
 */
export function weldPlacement(seamY: number, seamR: number, robot: WeldRobot, tower: [number, number]): WeldRig {
  const len = Math.hypot(tower[0], tower[1])
  const ux = tower[0] / len
  const uz = tower[1] / len
  const yaw = Math.atan2(-ux, -uz)
  const c = Math.cos(yaw)
  const s = Math.sin(yaw)
  const reach = robot.reach * robot.scale
  const horizontal = reach * Math.cos(TILT)
  const down = reach * Math.sin(TILT)

  // the shoulder sits to one side of the robot's middle: find where the middle must be for the shoulder to be the right distance out
  const ox = robot.shoulderX * robot.scale
  const oz = robot.shoulderZ * robot.scale
  const offX = ox * c + oz * s
  const offZ = -ox * s + oz * c
  const along = offX * ux + offZ * uz
  const across = offX * -uz + offZ * ux
  const out = seamR + horizontal
  const dist = -along + Math.sqrt(out * out - across * across)

  const rootX = ux * dist
  const rootZ = uz * dist
  const shoulderXZ: [number, number] = [rootX + offX, rootZ + offZ]
  const shoulderY = seamY + down
  const k = seamR / Math.hypot(shoulderXZ[0], shoulderXZ[1])
  const seam: Vec3 = [shoulderXZ[0] * k, seamY, shoulderXZ[1] * k]
  const shoulder: Vec3 = [shoulderXZ[0], shoulderY, shoulderXZ[1]]
  const d: Vec3 = [(seam[0] - shoulder[0]) / reach, (seam[1] - shoulder[1]) / reach, (seam[2] - shoulder[2]) / reach]
  return { root: [rootX, shoulderY - robot.shoulderY * robot.scale, rootZ], yaw, shoulder, seam, dir: d }
}
