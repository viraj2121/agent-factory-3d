import type { Vec3 } from './hallLayout'
import { HUB } from './hubLayout'
import type { AnyClip } from './robotVariants'

export const KEEPER_RADIUS = 2.65
/** Where keepers stop to work, as angles around the core (0 = toward the camera). */
export const STOP_ANGLES = [0.35, 2.45, 4.35]
const STOP_CLIPS: AnyClip[] = ['gauge', 'polish', 'assemble']
const WORK_SECONDS = 4
const WALK_SPEED = 0.7

const TAU = Math.PI * 2
const ARCS = STOP_ANGLES.map((a, i) => {
  const next = i === STOP_ANGLES.length - 1 ? STOP_ANGLES[0] + TAU : STOP_ANGLES[i + 1]
  return next - a
})
const WALK_TIMES = ARCS.map((arc) => (arc * KEEPER_RADIUS) / WALK_SPEED)

/** Seconds for one keeper to visit every stop and come round again. */
export const CYCLE_SECONDS = STOP_ANGLES.length * WORK_SECONDS + WALK_TIMES.reduce((a, b) => a + b, 0)

export interface KeeperState {
  position: Vec3
  /** Rotation about y that points the robot's front (+z) the way it should face. */
  yaw: number
  clip: AnyClip
}

/** Where the keeper is, which way it faces and what it is doing, `t` seconds in. */
export function keeperState(t: number, index: number): KeeperState {
  let u = (((t + (index * CYCLE_SECONDS) / 2) % CYCLE_SECONDS) + CYCLE_SECONDS) % CYCLE_SECONDS
  for (let i = 0; i < STOP_ANGLES.length; i++) {
    if (u < WORK_SECONDS) return at(STOP_ANGLES[i], false, STOP_CLIPS[i])
    u -= WORK_SECONDS
    if (u < WALK_TIMES[i]) return at(STOP_ANGLES[i] + ARCS[i] * (u / WALK_TIMES[i]), true, 'walk')
    u -= WALK_TIMES[i]
  }
  return at(STOP_ANGLES[0], false, STOP_CLIPS[0])
}

function at(angle: number, walking: boolean, clip: AnyClip): KeeperState {
  const x = KEEPER_RADIUS * Math.sin(angle)
  const z = KEEPER_RADIUS * Math.cos(angle)
  // walking: along the loop; working: face the core
  const yaw = walking ? Math.atan2(Math.cos(angle), -Math.sin(angle)) : angle + Math.PI
  return { position: [x, HUB.deckHeight, z], yaw, clip }
}
