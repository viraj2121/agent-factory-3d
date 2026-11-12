import { describe, expect, it } from 'vitest'
import { Euler, Quaternion, Vector3 } from 'three'
import { SPINNERS, bobAt, localAxis, spinAngle } from '../src/spinners'
import { EXTRA_VARIANTS } from '../src/robotVariants'

describe('SPINNERS', () => {
  it('belong only to shapes that exist, and name their part', () => {
    for (const [variant, list] of Object.entries(SPINNERS)) {
      expect(EXTRA_VARIANTS as readonly string[]).toContain(variant)
      for (const s of list) {
        expect(s.node.length).toBeGreaterThan(0)
        expect(Math.hypot(...s.axis)).toBeCloseTo(1, 5)
        expect(s.speed).not.toBe(0)
      }
    }
  })

  it('gives the cassette two reels turning the same way, and the fishbowl one swimming fish', () => {
    const reels = SPINNERS.cassette ?? []
    expect(reels).toHaveLength(2)
    expect(Math.sign(reels[0].speed)).toBe(Math.sign(reels[1].speed))
    expect(SPINNERS.fishbowl).toHaveLength(1)
  })
})

describe('localAxis', () => {
  it('turns a direction in the robot into the same direction inside a part that sits rotated', () => {
    const rest = new Quaternion().setFromEuler(new Euler(0.7, -0.4, 1.1))
    const axis = new Vector3(0, 0, 1)
    const local = localAxis(axis, rest)
    // spinning the part about that local axis must turn it about the robot's own axis
    const spin = new Quaternion().setFromAxisAngle(local, 0.9)
    const world = rest.clone().multiply(spin).multiply(rest.clone().invert())
    const expected = new Quaternion().setFromAxisAngle(axis, 0.9)
    expect(world.angleTo(expected)).toBeLessThan(1e-6)
  })

  it('leaves the axis alone when the part is not rotated', () => {
    const local = localAxis(new Vector3(0, 1, 0), new Quaternion())
    expect(local.distanceTo(new Vector3(0, 1, 0))).toBeLessThan(1e-9)
  })
})

describe('spinAngle', () => {
  it('turns steadily with time, and each robot starts at its own angle', () => {
    expect(spinAngle(2, 3, 0)).toBeCloseTo(6, 6)
    expect(spinAngle(2, 3, 1)).toBeCloseTo(7, 6)
    expect(spinAngle(2, 4, 0) - spinAngle(2, 3, 0)).toBeCloseTo(2, 6)
  })

  it('stays finite for a time that is not a number', () => {
    expect(spinAngle(2, Number.NaN, 0.5)).toBe(0.5)
  })
})

describe('bobAt', () => {
  it('rises and falls a little, never more than the height', () => {
    for (let t = 0; t < 20; t += 0.37) expect(Math.abs(bobAt(0.02, t, 0.3))).toBeLessThanOrEqual(0.02 + 1e-9)
  })

  it('is flat for a time that is not a number', () => {
    expect(bobAt(0.02, Number.NaN, 0)).toBe(0)
  })
})
