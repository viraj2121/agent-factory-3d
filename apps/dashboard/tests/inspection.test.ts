import { describe, expect, it } from 'vitest'
import { ROCKET_BASE, SEAM_Y, SECTIONS, radiusAt } from '../src/rocket'
import { TOWER } from '../src/launchpad'
import { droneAt } from '../src/inspection'

const towerAngle = Math.atan2(TOWER.x, TOWER.z)
const gap = (a: number, b: number) => Math.abs((((a - b) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI)
const azimuth = (p: [number, number, number]) => Math.atan2(p[0], p[2])

describe('droneAt while a seam is being checked', () => {
  for (let k = 0; k < SECTIONS; k++) {
    it(`stays clear of the rocket, the tower and the platform, and low enough to watch the seam of section ${k}`, () => {
      for (let t = 0; t < 120; t += 0.37) {
        const d = droneAt(t, SEAM_Y[k], true)
        const r = Math.hypot(d.position[0], d.position[2])
        // outside the rocket's skin with room to spare, but inside the floodlight posts on the pad rim
        expect(r).toBeGreaterThan(radiusAt(SEAM_Y[k]) + 0.5)
        expect(r).toBeLessThan(1.6)
        // on the far side of the rocket from the tower, where the robot's platform is
        expect(gap(azimuth(d.position), towerAngle)).toBeGreaterThan(1.2)
        // just above the seam
        expect(d.position[1]).toBeGreaterThan(ROCKET_BASE + SEAM_Y[k] + 0.15)
        expect(d.position[1]).toBeLessThan(ROCKET_BASE + SEAM_Y[k] + 0.45)
      }
    })
  }

  it('points its laser at the seam ring, on the rocket\'s skin, straight below it, not far off', () => {
    for (let k = 0; k < SECTIONS; k++) {
      for (let t = 0; t < 40; t += 0.9) {
        const d = droneAt(t, SEAM_Y[k], true)
        expect(d.laserTo).not.toBeNull()
        const [x, y, z] = d.laserTo!
        expect(Math.hypot(x, z)).toBeCloseTo(radiusAt(SEAM_Y[k]) + 0.004, 9)
        expect(y).toBeCloseTo(ROCKET_BASE + SEAM_Y[k], 9)
        // on the same side of the rocket as the drone itself
        expect(gap(Math.atan2(x, z), azimuth(d.position))).toBeLessThan(1e-9)
        expect(Math.hypot(x - d.position[0], y - d.position[1], z - d.position[2])).toBeLessThan(1.0)
      }
    }
  })

  it('sweeps slowly round its side of the rocket, so the laser scans the whole weld', () => {
    const angles: number[] = []
    for (let t = 0; t < 30; t += 0.2) angles.push(azimuth(droneAt(t, SEAM_Y[3], true).position))
    expect(Math.max(...angles) - Math.min(...angles)).toBeGreaterThan(1.5)
    for (let i = 1; i < angles.length; i++) expect(Math.abs(angles[i] - angles[i - 1])).toBeLessThan(0.25)
  })
})

describe('droneAt with nothing to check', () => {
  it('hovers beside the rocket with no laser, drifting up and down', () => {
    const heights: number[] = []
    for (let t = 0; t < 40; t += 0.5) {
      const d = droneAt(t, null, true)
      expect(d.laserTo).toBeNull()
      heights.push(d.position[1])
      expect(gap(azimuth(d.position), towerAngle)).toBeGreaterThan(1.2)
      expect(Math.hypot(d.position[0], d.position[2])).toBeGreaterThan(0.7)
      expect(Math.hypot(d.position[0], d.position[2])).toBeLessThan(1.6)
    }
    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(0.8)
    expect(Math.min(...heights)).toBeGreaterThan(ROCKET_BASE + 0.8)
  })

  it('has no laser while it is not checking, even over a seam', () => {
    expect(droneAt(5, SEAM_Y[2], false).laserTo).toBeNull()
  })
})

describe('droneAt with bad input', () => {
  it('is deterministic and survives a time that is not a number', () => {
    expect(droneAt(7.3, SEAM_Y[1], true)).toEqual(droneAt(7.3, SEAM_Y[1], true))
    const d = droneAt(Number.NaN, SEAM_Y[1], true)
    expect(d.position.every(Number.isFinite)).toBe(true)
  })
})
