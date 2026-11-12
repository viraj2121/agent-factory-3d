import { describe, expect, it } from 'vitest'
import { BOUNDS, ROCKET_BASE, SEAM_Y, SECTIONS, radiusAt, sectionProfile, weldPlacement, type WeldRobot } from '../src/rocket'

const robot: WeldRobot = { shoulderX: -0.225, shoulderY: 0.52, shoulderZ: 0, scale: 1.05, reach: 0.64 }
const tower: [number, number] = [0.85, -1.45]

describe('the rocket shape', () => {
  it('has six sections whose edges rise from the nozzle to the nose tip', () => {
    expect(SECTIONS).toBe(6)
    expect(BOUNDS).toHaveLength(SECTIONS + 1)
    for (let i = 1; i < BOUNDS.length; i++) expect(BOUNDS[i]).toBeGreaterThan(BOUNDS[i - 1])
  })

  it('is round and smooth: no jumps in width from one section to the next, a point at the very top, a flare at the bottom', () => {
    for (let y = BOUNDS[0]; y < BOUNDS[SECTIONS]; y += 0.01) {
      expect(Math.abs(radiusAt(y + 0.01) - radiusAt(y))).toBeLessThan(0.06)
    }
    expect(radiusAt(BOUNDS[SECTIONS])).toBeLessThan(0.02)
    expect(radiusAt(BOUNDS[0])).toBeGreaterThan(radiusAt(1.0))
    expect(radiusAt(1.0)).toBeCloseTo(0.47, 5)
  })

  it('never gets wider as it goes up past the body', () => {
    let last = radiusAt(1.0)
    for (let y = 1.0; y <= BOUNDS[SECTIONS]; y += 0.02) {
      expect(radiusAt(y)).toBeLessThanOrEqual(last + 1e-9)
      last = radiusAt(y)
    }
  })

  it('gives each section a profile that starts and ends at the edges of that section, from the same curve', () => {
    for (let k = 0; k < SECTIONS; k++) {
      const p = sectionProfile(k, 8)
      expect(p[0][1]).toBeCloseTo(BOUNDS[k], 9)
      expect(p[p.length - 1][1]).toBeCloseTo(BOUNDS[k + 1], 9)
      for (const [r, y] of p) expect(r).toBeCloseTo(radiusAt(y), 9)
      if (k > 0) expect(p[0][0]).toBeCloseTo(sectionProfile(k - 1, 8).slice(-1)[0][0], 9)
    }
  })
})

describe('seams', () => {
  it('lie inside their own section, at its foot (the skirt is welded a little above its foot)', () => {
    for (let k = 0; k < SECTIONS; k++) {
      expect(SEAM_Y[k]).toBeGreaterThanOrEqual(BOUNDS[k])
      expect(SEAM_Y[k]).toBeLessThan(BOUNDS[k + 1])
      if (k > 0) expect(SEAM_Y[k]).toBe(BOUNDS[k])
    }
  })

  it('keep the robot on a platform above the floor of the pad, for robots of different sizes', () => {
    for (const robotShape of [robot, { ...robot, shoulderY: 0.46, scale: 0.9 }, { ...robot, shoulderY: 0.58, scale: 1.1 }]) {
      for (let k = 0; k < SECTIONS; k++) {
        const w = weldPlacement(ROCKET_BASE + SEAM_Y[k], radiusAt(SEAM_Y[k]), robotShape, tower)
        expect(w.root[1]).toBeGreaterThanOrEqual(ROCKET_BASE + 0.03)
      }
    }
  })
})

describe('weldPlacement', () => {
  for (let k = 0; k < SECTIONS; k++) {
    const seamY = ROCKET_BASE + SEAM_Y[k]
    const seamR = radiusAt(SEAM_Y[k])

    it(`puts the torch tip exactly on the seam at the foot of section ${k}`, () => {
      const w = weldPlacement(seamY, seamR, robot, tower)
      const d = Math.hypot(w.seam[0] - w.shoulder[0], w.seam[1] - w.shoulder[1], w.seam[2] - w.shoulder[2])
      expect(d).toBeCloseTo(robot.reach * robot.scale, 9)
      // the seam is a point on the rocket's skin, at the height of the seam
      expect(Math.hypot(w.seam[0], w.seam[2])).toBeCloseTo(seamR, 9)
      expect(w.seam[1]).toBeCloseTo(seamY, 9)
      // the direction points from the shoulder to the seam
      const len = Math.hypot(...w.dir)
      expect(len).toBeCloseTo(1, 9)
      for (let i = 0; i < 3; i++) expect(w.shoulder[i] + w.dir[i] * d).toBeCloseTo(w.seam[i], 9)
    })

    it(`stands the robot facing the rocket, on the tower's side, with its feet below the shoulder (section ${k})`, () => {
      const w = weldPlacement(seamY, seamR, robot, tower)
      const len = Math.hypot(...tower)
      const toTower = [tower[0] / len, tower[1] / len]
      // the robot's centre lies on the line from the rocket's axis to the tower, nearer than the tower
      expect(w.root[0] * toTower[1] - w.root[2] * toTower[0]).toBeCloseTo(0, 9)
      expect(w.root[0] * toTower[0] + w.root[2] * toTower[1]).toBeGreaterThan(seamR)
      expect(w.root[0] * toTower[0] + w.root[2] * toTower[1]).toBeLessThan(len - 0.3)
      // it faces the axis: its forward direction is the opposite of the way to the tower
      expect(Math.sin(w.yaw)).toBeCloseTo(-toTower[0], 9)
      expect(Math.cos(w.yaw)).toBeCloseTo(-toTower[1], 9)
      expect(w.root[1]).toBeCloseTo(w.shoulder[1] - robot.shoulderY * robot.scale, 9)
    })
  }

  it('moves the robot closer to the axis for the narrower nose sections than for the body', () => {
    const body = weldPlacement(ROCKET_BASE + SEAM_Y[2], radiusAt(SEAM_Y[2]), robot, tower)
    const nose = weldPlacement(ROCKET_BASE + SEAM_Y[5], radiusAt(SEAM_Y[5]), robot, tower)
    expect(Math.hypot(nose.root[0], nose.root[2])).toBeLessThan(Math.hypot(body.root[0], body.root[2]))
  })

  it('keeps the torch pointing slightly down at the seam, never up', () => {
    for (let k = 0; k < SECTIONS; k++) expect(weldPlacement(ROCKET_BASE + SEAM_Y[k], radiusAt(SEAM_Y[k]), robot, tower).dir[1]).toBeLessThan(0)
  })

  it('works for a robot with the shoulder in a different place, and still lands exactly', () => {
    const other: WeldRobot = { shoulderX: -0.2, shoulderY: 0.6, shoulderZ: 0.02, scale: 0.9, reach: 0.64 }
    const w = weldPlacement(ROCKET_BASE + 1.55, radiusAt(1.55), other, tower)
    const d = Math.hypot(w.seam[0] - w.shoulder[0], w.seam[1] - w.shoulder[1], w.seam[2] - w.shoulder[2])
    expect(d).toBeCloseTo(0.64 * 0.9, 9)
  })
})
