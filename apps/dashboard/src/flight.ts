import type { Vec3 } from './hallLayout'
import type { CameraView } from './hubCameraConfig'

/** Smooth start and stop for a camera move. `t` is 0 to 1; anything else is clamped. */
export function ease(t: number): number {
  const c = Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 0
  return c * c * (3 - 2 * c)
}

const mix = (a: Vec3, b: Vec3, k: number): Vec3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]

/** The camera part-way through a flight from one view to another. */
export function flightAt(from: CameraView, to: CameraView, t: number): CameraView {
  const raw = Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 0
  if (raw === 0) return { position: [...from.position], target: [...from.target], fov: from.fov }
  if (raw === 1) return { position: [...to.position], target: [...to.target], fov: to.fov }
  const k = ease(raw)
  return { position: mix(from.position, to.position, k), target: mix(from.target, to.target, k), fov: from.fov + (to.fov - from.fov) * k }
}
