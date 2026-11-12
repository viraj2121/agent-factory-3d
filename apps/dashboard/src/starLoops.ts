// Magnetic loops on the star: glowing arches that rise from the surface, hold, and fade. Decoration; pure maths here.

type V3 = [number, number, number]

const unit = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / l, v[1] / l, v[2] / l]
}
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const rnd = (n: number, k: number) => {
  const x = Math.sin(n * 127.1 + k * 311.7) * 43758.5453
  return x - Math.floor(x)
}

/** Points along an arch between two unit directions on a sphere of `radius`, rising to radius * (1 + height) in the middle. */
export function loopPoints(a: V3, b: V3, radius: number, height: number, count: number): V3[] {
  const w = Math.acos(Math.max(-1, Math.min(1, dot(a, b))))
  const sinW = Math.sin(w) || 1
  return Array.from({ length: count }, (_, i) => {
    const s = count === 1 ? 0 : i / (count - 1)
    const k1 = Math.sin((1 - s) * w) / sinW
    const k2 = Math.sin(s * w) / sinW
    const d = unit([a[0] * k1 + b[0] * k2, a[1] * k1 + b[1] * k2, a[2] * k1 + b[2] * k2])
    const r = radius * (1 + height * Math.sin(Math.PI * s))
    return [d[0] * r, d[1] * r, d[2] * r]
  })
}

export interface LoopSpec {
  a: V3
  b: V3
  height: number
  phase: number
  period: number
}

/** The same `n` loops every time: two feet on the surface (a little apart), a height, and when in its cycle each one lives. */
export function loopSpecs(n: number): LoopSpec[] {
  return Array.from({ length: n }, (_, i) => {
    const a = unit([rnd(i, 1) - 0.5, rnd(i, 2) - 0.5, rnd(i, 3) - 0.5])
    let axis = unit([rnd(i, 4) - 0.5, rnd(i, 5) - 0.5, rnd(i, 6) - 0.5])
    // make the axis perpendicular to a, then turn a about it by 0.3..0.7 rad to get the second foot
    const d = dot(axis, a)
    axis = unit([axis[0] - a[0] * d, axis[1] - a[1] * d, axis[2] - a[2] * d])
    const ang = 0.18 + rnd(i, 7) * 0.26
    const b = unit([a[0] * Math.cos(ang) + axis[0] * Math.sin(ang), a[1] * Math.cos(ang) + axis[1] * Math.sin(ang), a[2] * Math.cos(ang) + axis[2] * Math.sin(ang)])
    return { a, b, height: 0.12 + rnd(i, 8) * 0.14, phase: rnd(i, 9), period: 16 + rnd(i, 10) * 14 }
  })
}

/** 0..1: how strongly a loop glows at time `t`. It rises, holds, falls, and then stays dark for the rest of its cycle. */
export function loopLife(t: number, phase: number, period: number): number {
  const u = (((t / period + phase) % 1) + 1) % 1
  if (u < 0.12) return u / 0.12
  if (u < 0.5) return 1
  if (u < 0.68) return 1 - (u - 0.5) / 0.18
  return 0
}
