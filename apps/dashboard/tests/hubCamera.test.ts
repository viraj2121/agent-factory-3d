import { describe, expect, it } from 'vitest'
import { HUB_ZOOM_LIMITS, POLAR_LIMITS, TARGET_LIMITS, clampTarget, hubCameraFor, isCloseUp } from '../src/hubCameraConfig'
import { HUB_LAYOUT, STUDIO } from '../src/hubLayout'
import { CART_RADIUS } from '../src/lifeMath'

const dist = (a: number[], b: number[]) => Math.hypot(...a.map((v, i) => v - b[i]))

describe('hubCameraFor', () => {
  it('starts wide, inside the zoom limits', () => {
    const wide = hubCameraFor(undefined)
    const d = dist(wide.position, wide.target)
    expect(d).toBeGreaterThanOrEqual(HUB_ZOOM_LIMITS.min)
    expect(d).toBeLessThanOrEqual(HUB_ZOOM_LIMITS.max)
    expect(wide.position).toEqual([0, 13.5, 27.5])
    expect(wide.target).toEqual([0, 1.2, 1.5])
  })

  it('looks at each bay from the core side, so robot faces show', () => {
    for (const bay of HUB_LAYOUT.bays) {
      const view = hubCameraFor(bay.id)
      expect(Math.abs(view.target[0] - bay.position[0])).toBeLessThan(0.01)
      expect(Math.abs(view.target[2] - bay.position[2])).toBeLessThan(0.01)
      expect(Math.hypot(view.position[0], view.position[2])).toBeLessThan(bay.radius)
      expect(dist(view.position, view.target)).toBeLessThan(9)
      expect(view.position[1]).toBeGreaterThan(0)
    }
  })

  it('falls back to the wide view for an unknown name', () => {
    expect(hubCameraFor('nonsense')).toEqual(hubCameraFor(undefined))
  })
})

describe('isCloseUp', () => {
  it('is true when zoomed in near the target and false at the wide view', () => {
    expect(isCloseUp(4)).toBe(true)
    expect(isCloseUp(8.9)).toBe(true)
    expect(isCloseUp(9)).toBe(false)
    expect(isCloseUp(26)).toBe(false)
  })

  it('is false for broken input', () => {
    expect(isCloseUp(Number.NaN)).toBe(false)
    expect(isCloseUp(-1)).toBe(false)
  })
})

describe('clampTarget', () => {
  it('leaves a point inside the room alone', () => {
    expect(clampTarget([2, 1.5, -3])).toEqual([2, 1.5, -3])
  })

  it('pulls a point that is too far out back to the edge, keeping its direction', () => {
    const [x, , z] = clampTarget([40, 1.5, 0])
    expect(x).toBeCloseTo(TARGET_LIMITS.radius, 6)
    expect(z).toBeCloseTo(0, 6)
    const [dx, , dz] = clampTarget([30, 1.5, 30])
    expect(Math.hypot(dx, dz)).toBeCloseTo(TARGET_LIMITS.radius, 6)
    expect(dx).toBeCloseTo(dz, 6)
  })

  it('keeps the height between the floor and the ceiling zone', () => {
    expect(clampTarget([0, -5, 0])[1]).toBe(TARGET_LIMITS.minY)
    expect(clampTarget([0, 50, 0])[1]).toBe(TARGET_LIMITS.maxY)
  })

  it('falls back to the hub centre for broken input', () => {
    expect(clampTarget([Number.NaN, 1, 2])).toEqual(hubCameraFor(undefined).target)
  })
})

describe('polar limits', () => {
  it('lets the camera go almost straight down and almost to floor level', () => {
    expect(POLAR_LIMITS.min).toBeLessThanOrEqual(8)
    expect(POLAR_LIMITS.max).toBeGreaterThanOrEqual(85)
    expect(POLAR_LIMITS.max).toBeLessThan(90)
  })
})

describe('studio and orb views', () => {
  it('looks at the design board from the core side', () => {
    const v = hubCameraFor('studio')
    expect(Math.hypot(v.position[0], v.position[2])).toBeLessThan(STUDIO.radius)
    expect(Math.hypot(v.target[0] - STUDIO.position[0], v.target[2] - STUDIO.position[2])).toBeLessThan(2)
    expect(dist(v.position, v.target)).toBeLessThan(10)
  })

  it('looks at the orb from in front and above', () => {
    const v = hubCameraFor('orb')
    expect(Math.hypot(v.target[0], v.target[2])).toBeLessThan(0.5)
    expect(v.position[1]).toBeGreaterThan(v.target[1])
    expect(dist(v.position, v.target)).toBeLessThan(14)
  })
})

describe('cart view', () => {
  it('watches the cart ring from the core side, at a close distance', () => {
    const v = hubCameraFor('cart')
    expect(Math.hypot(v.target[0], v.target[2])).toBeCloseTo(CART_RADIUS, 0)
    expect(Math.hypot(v.position[0], v.position[2])).toBeLessThan(CART_RADIUS)
    expect(dist(v.position, v.target)).toBeLessThan(10)
  })
})
