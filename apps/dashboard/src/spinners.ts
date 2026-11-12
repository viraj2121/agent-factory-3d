import type { Quaternion, Vector3 } from 'three'
import type { AnyVariant } from './robotVariants'

/**
 * Parts of a robot that move on their own, whatever clip is playing: the cassette's two reels, the fish in the
 * bowl. In the model file each is a separate piece fixed to the head, and the page turns it every frame about
 * `axis`, given in the robot's own directions (x right, y up, z toward the front it faces).
 */
export interface Spinner {
  /** Name of the piece in the model. */
  node: string
  axis: [number, number, number]
  /** Radians per second. */
  speed: number
  /** How far the piece rises and falls, in metres at the robot's own size. */
  bob?: number
}

export const SPINNERS: Partial<Record<AnyVariant, Spinner[]>> = {
  cassette: [
    { node: 'Bay_ReelL', axis: [0, 0, 1], speed: 2.4 },
    { node: 'Bay_ReelR', axis: [0, 0, 1], speed: 2.4 },
  ],
  fishbowl: [{ node: 'Bay_FishSwim', axis: [0, 1, 0], speed: 0.9, bob: 0.012 }],
}

/** The axis, as seen from inside a piece that rests at `restRotation` (its rotation in the robot's directions), that turns it about `axis` of the robot. */
export function localAxis(axis: Vector3, restRotation: Quaternion): Vector3 {
  return axis.clone().applyQuaternion(restRotation.clone().invert()).normalize()
}

/** The angle a piece has turned to at time `t` seconds; `phase` gives each robot its own start. */
export function spinAngle(speed: number, t: number, phase: number): number {
  return Number.isFinite(t) ? speed * t + phase : phase
}

/** How far a piece is above or below its rest height at time `t`. Never more than `height`. */
export function bobAt(height: number, t: number, phase: number): number {
  return Number.isFinite(t) ? height * Math.sin(t * 1.7 + phase * 6.28) : 0
}
