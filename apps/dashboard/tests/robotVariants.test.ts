import { describe, expect, it } from 'vitest'
import { DEPARTMENTS } from '../src/hallLayout'
import { ROBOT_CLIPS, ROBOT_VARIANTS, primaryClip, robotLook, variantFor } from '../src/robotVariants'

describe('variantFor / primaryClip', () => {
  it('gives each department its own robot shape', () => {
    const variants = DEPARTMENTS.map(variantFor)
    expect(new Set(variants).size).toBe(DEPARTMENTS.length)
    for (const v of variants) expect(ROBOT_VARIANTS).toContain(v)
  })

  it('gives each shape its own signature action, all of them real clips', () => {
    const clips = ROBOT_VARIANTS.map(primaryClip)
    expect(new Set(clips).size).toBe(ROBOT_VARIANTS.length)
    for (const c of clips) expect(ROBOT_CLIPS).toContain(c)
  })
})

describe('robotLook', () => {
  it('is the same for the same seed', () => {
    expect(robotLook(7)).toEqual(robotLook(7))
  })

  it('keeps size, speed and start time in range', () => {
    for (let seed = 0; seed < 50; seed++) {
      const look = robotLook(seed)
      expect(look.scale).toBeGreaterThanOrEqual(0.92)
      expect(look.scale).toBeLessThanOrEqual(1.08)
      expect(look.speed).toBeGreaterThanOrEqual(0.85)
      expect(look.speed).toBeLessThanOrEqual(1.15)
      expect(look.offset).toBeGreaterThanOrEqual(0)
      expect(look.offset).toBeLessThan(1)
    }
  })

  it('makes neighbouring robots look different', () => {
    const looks = Array.from({ length: 8 }, (_, i) => robotLook(i))
    expect(new Set(looks.map((l) => l.tint)).size).toBeGreaterThanOrEqual(4)
    expect(new Set(looks.map((l) => l.eye)).size).toBeGreaterThanOrEqual(3)
    expect(new Set(looks.map((l) => l.speed.toFixed(3))).size).toBeGreaterThanOrEqual(6)
  })
})
