import { REST } from './restBunks'
import type { Vec3 } from './hallLayout'
import { HUB, HUB_LAYOUT, STUDIO } from './hubLayout'
import { skyCamera } from './skyLayout'
import { systemCamera } from './systemLayout'
import { LAUNCH_PAD, launchPadWorld } from './launchpad'
import { LIBRARY } from './library'

export interface CameraView {
  position: Vec3
  target: Vec3
  fov: number
}

/** Distance from the camera to its target, in metres. */
export const HUB_ZOOM_LIMITS = { min: 2.5, max: 100 }

const WIDE: CameraView = { position: [0, 13.5, 27.5], target: [0, 1.2, 1.5], fov: 37 }

/** The wide view of the whole hub, or a close view of one bay from the core side. */
export function hubCameraFor(focus: string | undefined): CameraView {
  if (focus === 'sky') return skyCamera()
  if (focus === 'system') return systemCamera(8)
  if (focus === 'studio') {
    // stand on the core side of the design studio and look at its board
    const dx = Math.sin(STUDIO.angle)
    const dz = Math.cos(STUDIO.angle)
    const [sx, , sz] = STUDIO.position
    return { position: [sx - dx * 5.5, 2.6, sz - dz * 5.5], target: [sx + dx * 0.4, STUDIO.boardCenterY - 0.1, sz + dz * 0.4], fov: 38 }
  }
  if (focus === 'launchpad') {
    // stand on the core side of the pad and look up at the rocket
    const [px, , pz] = launchPadWorld()
    const dx = Math.sin(LAUNCH_PAD.angle)
    const dz = Math.cos(LAUNCH_PAD.angle)
    return { position: [px - dx * 6.2, 2.4, pz - dz * 6.2], target: [px, 1.9, pz], fov: 42 }
  }
  if (focus === 'library') {
    // stand on the core side of the shelves
    const dx = Math.sin(LIBRARY.angle)
    const dz = Math.cos(LIBRARY.angle)
    return { position: [dx * (LIBRARY.radius - 6.2), 2.9, dz * (LIBRARY.radius - 6.2)], target: [dx * (LIBRARY.radius - 0.6), 1.2, dz * (LIBRARY.radius - 0.6)], fov: 40 }
  }
  if (focus === 'cart') return { position: [-0.8, 2.4, 2.6], target: [4.65, 0.8, 4.65], fov: 34 }
  if (focus === 'orb') return { position: [0, 4.6, 8.5], target: [0, HUB.coreCenter[1] - 0.3, 0], fov: 38 }
  // the rest bunks ring the core on the camera's side: look at them from outside, a little above
  if (focus === 'rest') return { position: [0, 4.4, 11.5], target: [0, 0.3, REST.position[2]], fov: 38 }
  const bay = HUB_LAYOUT.bays.find((b) => b.id === focus)
  if (!bay) return WIDE
  const [x, , z] = bay.position
  // Outward direction from the core through the bay; stand 7.5 m back toward the core.
  const dx = Math.sin(bay.angle)
  const dz = Math.cos(bay.angle)
  return { position: [x - dx * 7.5, 3.2, z - dz * 7.5], target: [x, 0.9, z], fov: 34 }
}

/** Zoom-blur (depth of field) switches on when the camera is closer than this, in metres. */
export const CLOSE_UP_DISTANCE = 9

export function isCloseUp(distance: number): boolean {
  return Number.isFinite(distance) && distance > 0 && distance < CLOSE_UP_DISTANCE
}

/** The point the camera orbits around may not leave this zone, so a full turn stays a full turn. */
export const TARGET_LIMITS = { radius: 30, minY: 0.3, maxY: 5 }

/** Allowed tilt of the camera, in degrees from straight overhead. */
export const POLAR_LIMITS = { min: 5, max: 88 }

export function clampTarget(target: Vec3): Vec3 {
  const [x, y, z] = target
  if (![x, y, z].every(Number.isFinite)) return [...WIDE.target] as Vec3
  const r = Math.hypot(x, z)
  const k = r > TARGET_LIMITS.radius ? TARGET_LIMITS.radius / r : 1
  return [x * k, Math.min(TARGET_LIMITS.maxY, Math.max(TARGET_LIMITS.minY, y)), z * k]
}
