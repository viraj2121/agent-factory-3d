import type { CameraView } from './hubCameraConfig'

/**
 * The lift-off view: the hall seen from above and in front against the sky. The flights to and from the solar system
 * start and end here, and the sun, the Milky Way and the gas giant are placed for it (see spaceScene.ts).
 */
export function skyCamera(): CameraView {
  return { position: [0, 34, 62], target: [0, 3, -22], fov: 40 }
}
