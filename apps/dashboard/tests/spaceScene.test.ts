import { describe, expect, it } from 'vitest'
import { PerspectiveCamera, Vector3 } from 'three'
import { GIANT, SKY_PHOTO, SUN, flareGhosts, skyMapToWorld, skyPhotoFor } from '../src/spaceScene'
import { skyCamera } from '../src/skyLayout'
import { settingsFor } from '../src/quality'
import { THEMES, THEME_IDS } from '../src/themes'

/** The sky view camera, as the page sets it up (16:9 window). */
function skyViewCamera(): PerspectiveCamera {
  const v = skyCamera()
  const cam = new PerspectiveCamera(v.fov, 16 / 9, 0.1, 700)
  cam.position.set(...v.position)
  cam.lookAt(new Vector3(...v.target))
  cam.updateMatrixWorld()
  return cam
}

/** Where a far-away direction lands on screen in the sky view (-1..1 inside the frame). */
function onScreen(dir: Vector3) {
  const cam = skyViewCamera()
  return dir.clone().normalize().multiplyScalar(300).add(cam.position).project(cam)
}

describe('skyMapToWorld', () => {
  it('turns the photo so the bright galactic centre sits inside the sky view, left of the middle and low', () => {
    const core = new Vector3(0, 0, -1).applyMatrix3(skyMapToWorld())
    const p = onScreen(core)
    expect(Math.abs(p.x)).toBeLessThan(0.9)
    expect(Math.abs(p.y)).toBeLessThan(0.9)
    expect(p.z).toBeLessThan(1)
    expect(p.x).toBeLessThan(0)
  })

  it('is a pure rotation (no stretching), so the photo is not distorted', () => {
    const m = skyMapToWorld()
    for (const axis of [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)]) {
      expect(axis.clone().applyMatrix3(m).length()).toBeCloseTo(1, 6)
    }
    expect(m.determinant()).toBeCloseTo(1, 6)
  })

  it('lays the Milky Way band across the view at a slant, rising to the right', () => {
    const m = skyMapToWorld()
    // two points along the band, either side of the centre
    const left = onScreen(new Vector3(-Math.sin(0.25), 0, -Math.cos(0.25)).applyMatrix3(m))
    const right = onScreen(new Vector3(Math.sin(0.25), 0, -Math.cos(0.25)).applyMatrix3(m))
    const [a, b] = left.x < right.x ? [left, right] : [right, left]
    const slope = (b.y - a.y) / (b.x - a.x)
    expect(slope).toBeGreaterThan(0.2)
    expect(slope).toBeLessThan(2.5)
  })
})

describe('SUN and GIANT', () => {
  it('puts the sun in the upper right of the sky view, in front of the camera', () => {
    const p = onScreen(new Vector3(...SUN.direction))
    expect(p.z).toBeLessThan(1)
    expect(p.x).toBeGreaterThan(0.3)
    expect(p.x).toBeLessThan(0.95)
    expect(p.y).toBeGreaterThan(0.2)
    expect(p.y).toBeLessThan(0.95)
    expect(new Vector3(...SUN.direction).length()).toBeCloseTo(1, 6)
  })

  it('puts the gas giant in the lower left of the sky view, far behind the islands', () => {
    const cam = skyViewCamera()
    const p = new Vector3(...GIANT.position).project(cam)
    expect(p.z).toBeLessThan(1)
    expect(p.x).toBeLessThan(-0.2)
    expect(p.x).toBeGreaterThan(-1.2)
    expect(p.y).toBeLessThan(0)
    // never close enough to touch the hub or an island (they reach about 70 from the middle)
    expect(new Vector3(...GIANT.position).length() - GIANT.radius * GIANT.ringOuter).toBeGreaterThan(70)
    // and inside the camera's far limit from the sky view
    expect(cam.position.distanceTo(new Vector3(...GIANT.position)) + GIANT.radius).toBeLessThan(700)
  })
})

describe('flareGhosts', () => {
  it('places the ghosts on the line from the sun through the middle of the screen', () => {
    const sun = { x: 0.6, y: 0.5, z: 0.9 }
    const ghosts = flareGhosts(sun)
    expect(ghosts.length).toBeGreaterThanOrEqual(3)
    for (const g of ghosts) {
      // cross product of (sun) and (ghost) is zero when they are on one line through the middle
      expect(Math.abs(sun.x * g.y - sun.y * g.x)).toBeLessThan(1e-9)
      expect(g.opacity).toBeGreaterThan(0)
      expect(g.size).toBeGreaterThan(0)
    }
    expect(ghosts.some((g) => g.x * sun.x < 0)).toBe(true)
  })

  it('shows nothing when the sun is behind the camera or well off the screen', () => {
    expect(flareGhosts({ x: 0.2, y: 0.1, z: 1.2 }).every((g) => g.opacity === 0)).toBe(true)
    expect(flareGhosts({ x: 1.6, y: 0.1, z: 0.9 }).every((g) => g.opacity === 0)).toBe(true)
    expect(flareGhosts({ x: 0.1, y: -1.5, z: 0.9 }).every((g) => g.opacity === 0)).toBe(true)
  })

  it('fades out smoothly as the sun nears the edge', () => {
    const middle = flareGhosts({ x: 0.3, y: 0.2, z: 0.9 })[0].opacity
    const edge = flareGhosts({ x: 0.97, y: 0.2, z: 0.9 })[0].opacity
    expect(edge).toBeGreaterThan(0)
    expect(edge).toBeLessThan(middle)
  })
})

describe('sky photo and film look by quality', () => {
  it('uses the sharp photo on strong tiers and the small one on fast and lite', () => {
    expect(skyPhotoFor(settingsFor('high'))).toBe(SKY_PHOTO.large)
    expect(skyPhotoFor(settingsFor('balanced'))).toBe(SKY_PHOTO.large)
    expect(skyPhotoFor(settingsFor('fast'))).toBe(SKY_PHOTO.small)
    expect(skyPhotoFor(settingsFor('lite'))).toBe(SKY_PHOTO.small)
  })

  it('lite keeps the photo but drops the film finish (flare, grain, vignette)', () => {
    expect(settingsFor('high').film).toBe(true)
    expect(settingsFor('fast').film).toBe(true)
    expect(settingsFor('lite').film).toBe(false)
  })
})

describe('themes on the photo sky', () => {
  it('deep space and nebula have the ringed gas giant; aurora has its own planet below instead', () => {
    expect(THEMES.deep.giant).toBe(true)
    expect(THEMES.nebula.giant).toBe(true)
    expect(THEMES.aurora.giant).toBe(false)
    expect(THEMES.aurora.planet).toBe(true)
  })

  it('every theme grades the photo with a positive exposure and a tint', () => {
    for (const id of THEME_IDS) {
      expect(THEMES[id].photoExposure).toBeGreaterThan(0)
      expect(THEMES[id].photoTint).toHaveLength(3)
      expect(THEMES[id].giantA).toHaveLength(3)
      expect(THEMES[id].starGlow).toHaveLength(3)
      expect(THEMES[id].starLight).toHaveLength(3)
    }
  })
})
