import { REST } from './restBunks'
import type { Vec3 } from './hallLayout'
import { HUB_LAYOUT } from './hubLayout'
import type { AnyClip } from './robotVariants'

/**
 * Two couriers carry work packages from bay to bay on two lanes of the floor, going opposite ways. They speed up and
 * slow down, stop at each bay to hand over, sometimes pause to look around or turn back, and high-five when they meet.
 * Demo movement, not agent data. `radius` is the middle of the two lanes.
 */
export const COURIER = {
  radius: 5.4,
  lanes: [5.1, 5.75] as const,
  wobble: 0.12,
  walkSpeed: 0.95,
  accel: 0.9,
  brake: 0.9,
  handover: [2.2, 3.8] as const,
  greetSeconds: 2.6,
  greetDistance: 1.05,
  greetCooldown: 22,
  turnRate: 3,
}

const TAU = Math.PI * 2
const wrap = (a: number) => ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI
// the couriers stop at every bay and at the rest docks; with three bays the gap between Development and Review is more than half the ring, so the docks keep every leg under 180 degrees
const BAY_ANGLES = [...HUB_LAYOUT.bays.map((b) => b.angle), REST.angle]
const MAX_STEP = 0.05
const WOBBLE_PHASE = 0.8
/** Slowest speed while arriving, so it always gets there without a last-moment jump. */
const CREEP = 0.05

export type CourierMode = 'walk' | 'handover' | 'look' | 'greet'

export interface Courier {
  /** Where it is round the hall, in radians from +z toward +x. */
  angle: number
  /** Speed along the floor, metres per second. */
  speed: number
  /** 1 goes toward larger angles, -1 the other way. */
  dir: 1 | -1
  lane: number
  mode: CourierMode
  /** Seconds left in a handover, a look or a greeting. */
  timer: number
  /** The bay angle it is walking to. */
  target: number
  /** Where on this leg it will stop to look around, if anywhere. */
  lookAt: number | null
  /** Its own top walking speed for this leg. */
  cruise: number
  carrying: boolean
  yaw: number
  lastGreet: number
}

export interface CourierSim {
  time: number
  rand: () => number
  couriers: Courier[]
}

export interface CourierView {
  position: Vec3
  /** Rotation about y that points the robot's front (+z) the way it should face. */
  yaw: number
  clip: AnyClip
  carrying: boolean
}

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const between = (rand: () => number, [lo, hi]: readonly [number, number]) => lo + (hi - lo) * rand()

/** The next bay ahead of `angle` when going `dir`. */
function nextBay(angle: number, dir: 1 | -1): number {
  let best = BAY_ANGLES[0]
  let bestGap = Infinity
  for (const bay of BAY_ANGLES) {
    const gap = dir * wrap(bay - angle)
    const ahead = gap > 0.05 ? gap : gap + TAU
    if (ahead < bestGap) {
      bestGap = ahead
      best = bay
    }
  }
  return best
}

const radiusOf = (c: Courier) => c.lane + COURIER.wobble * Math.sin(3 * c.angle + WOBBLE_PHASE)
const positionOf = (c: Courier): Vec3 => {
  const r = radiusOf(c)
  return [r * Math.sin(c.angle), 0, r * Math.cos(c.angle)]
}
/** Yaw that points along the walking direction. */
const tangentYaw = (c: Courier) => Math.atan2(c.dir * Math.cos(c.angle), -c.dir * Math.sin(c.angle))

export function createCouriers(seed = 7): CourierSim {
  const rand = mulberry32(seed)
  const make = (bay: number, dir: 1 | -1, lane: number, wait: number): Courier => {
    const c: Courier = {
      angle: BAY_ANGLES[bay], speed: 0, dir, lane, mode: 'handover', timer: wait, target: BAY_ANGLES[bay],
      lookAt: null, cruise: COURIER.walkSpeed, carrying: false, yaw: 0, lastGreet: -1e9,
    }
    c.yaw = c.angle
    return c
  }
  return { time: 0, rand, couriers: [make(0, 1, COURIER.lanes[0], 1), make(2, -1, COURIER.lanes[1], 2.5)] }
}

function leaveBay(sim: CourierSim, c: Courier) {
  if (sim.rand() < 0.12) c.dir = c.dir === 1 ? -1 : 1
  c.target = nextBay(c.angle, c.dir)
  c.cruise = COURIER.walkSpeed * (0.85 + 0.3 * sim.rand())
  const leg = Math.abs(wrap(c.target - c.angle))
  c.lookAt = sim.rand() < 0.22 ? c.angle + c.dir * leg * (0.35 + 0.3 * sim.rand()) : null
  c.mode = 'walk'
  c.carrying = true
}

function stepOne(sim: CourierSim, c: Courier, dt: number) {
  const radius = radiusOf(c)
  if (c.mode === 'walk') {
    const left = Math.max(0, c.dir * wrap(c.target - c.angle)) * radius
    if (c.lookAt !== null && c.dir * wrap(c.lookAt - c.angle) <= 0.02) {
      c.mode = 'look'
      c.timer = 1.6 + 2 * sim.rand()
      c.lookAt = null
    } else {
      const brakeCap = Math.sqrt(2 * COURIER.brake * left)
      // the braking curve, and a gentler glide for the last metre (slope kept under the braking limit so it can always be followed)
      const wanted = Math.min(c.cruise, brakeCap, 0.8 * left + CREEP)
      c.speed += Math.max(-COURIER.brake * dt, Math.min(COURIER.accel * dt, wanted - c.speed))
      c.angle += (c.dir * c.speed * dt) / radius
      if (left < 0.002 || c.dir * wrap(c.target - c.angle) <= 0) {
        c.angle = c.target
        c.speed = 0
        c.mode = 'handover'
        c.carrying = false
        c.timer = between(sim.rand, COURIER.handover)
      }
    }
  }
  if (c.mode === 'look' || c.mode === 'greet') {
    // slow to a stop, then stand and perform
    const slow = c.mode === 'greet' ? 2.4 : COURIER.brake
    c.speed = Math.max(0, c.speed - slow * dt)
    c.angle += (c.dir * c.speed * dt) / radius
    c.timer -= dt
    if (c.timer <= 0) {
      c.mode = 'walk'
      c.carrying = true
    }
  } else if (c.mode === 'handover') {
    c.timer -= dt
    if (c.timer <= 0) leaveBay(sim, c)
  }
}

function turnToward(c: Courier, want: number, dt: number) {
  const diff = wrap(want - c.yaw)
  const step = COURIER.turnRate * dt
  c.yaw = wrap(c.yaw + Math.max(-step, Math.min(step, diff)))
}

/** Moves the couriers on by `dt` seconds. `frozen[i]` holds courier i still, for example while someone clicks it. */
export function stepCouriers(sim: CourierSim, dt: number, frozen: boolean[] = []): void {
  if (!Number.isFinite(dt) || dt <= 0) return
  let left = Math.min(dt, 0.5)
  while (left > 1e-9) {
    const h = Math.min(MAX_STEP, left)
    left -= h
    sim.time += h
    sim.couriers.forEach((c, i) => {
      if (frozen[i]) return
      stepOne(sim, c, h)
    })
    const [a, b] = sim.couriers
    if (a.mode === 'walk' && b.mode === 'walk' && !frozen[0] && !frozen[1] && sim.time - Math.max(a.lastGreet, b.lastGreet) > COURIER.greetCooldown) {
      const pa = positionOf(a)
      const pb = positionOf(b)
      if (Math.hypot(pa[0] - pb[0], pa[2] - pb[2]) < COURIER.greetDistance) {
        for (const c of sim.couriers) {
          c.mode = 'greet'
          c.timer = COURIER.greetSeconds
          c.lastGreet = sim.time
        }
      }
    }
    sim.couriers.forEach((c, i) => {
      if (frozen[i]) return
      let want: number
      if (c.mode === 'greet') {
        const me = positionOf(c)
        const other = positionOf(sim.couriers[1 - i])
        want = Math.atan2(other[0] - me[0], other[2] - me[2])
      } else if (c.mode === 'handover') want = c.angle
      else want = tangentYaw(c)
      turnToward(c, want, h)
    })
  }
}

/** Where courier `index` is, which way it faces, what it is doing and whether it carries a package. */
export function courierView(sim: CourierSim, index: number): CourierView {
  const c = sim.couriers[((index % sim.couriers.length) + sim.couriers.length) % sim.couriers.length]
  const clip: AnyClip = c.mode === 'walk' ? 'walk' : c.mode === 'handover' ? 'assemble' : c.mode === 'look' ? 'idle2' : 'highfive'
  return { position: positionOf(c), yaw: c.yaw, clip, carrying: c.carrying }
}
