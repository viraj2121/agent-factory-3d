import { describe, expect, it } from 'vitest'
import { DEPARTMENTS } from '../src/hallLayout'
import { HUB_LAYOUT, STUDIO } from '../src/hubLayout'
import { DEMO_PROJECTS } from '../src/projects'
import { LAUNCH_PAD } from '../src/launchpad'
import { BELTS, BELT_SPEED, workerSpots, beltActive, beltLength, beltPoint, crateScale, crateU, levelStep, phaseStep } from '../src/belts'

const bay = (id: string) => HUB_LAYOUT.bays.find((b) => b.id === id)!
const gap = (a: number, b: number) => Math.abs((((a - b) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI)

describe('BELTS', () => {
  it('carry work between two neighbouring bays, in the free floor behind them', () => {
    expect(BELTS.length).toBeGreaterThanOrEqual(1)
    for (const b of BELTS) {
      expect(DEPARTMENTS).toContain(b.from)
      expect([...DEPARTMENTS, 'edge']).toContain(b.to)
      expect(b.from).not.toBe(b.to)
      // behind the bays (bays stand at 9 m) and in front of the crates along the parapet (from 13.2 m)
      expect(b.radius - b.width / 2).toBeGreaterThan(10.3)
      expect(b.radius + b.width / 2).toBeLessThan(12.6)
      // each end lies behind the bay it belongs to
      expect(gap(b.start, bay(b.from).angle)).toBeLessThan(0.2)
      if (b.to !== 'edge') expect(gap(b.end, bay(b.to).angle)).toBeLessThan(0.2)
      // and nothing about it comes near the launch pad
      for (const a of [b.start, (b.start + b.end) / 2, b.end]) expect(gap(a, LAUNCH_PAD.angle)).toBeGreaterThan(0.6)
    }
  })

  it('stay clear of the design studio', () => {
    for (const b of BELTS) {
      for (const a of [b.start, (b.start + b.end) / 2, b.end]) expect(gap(a, STUDIO.angle)).toBeGreaterThan(0.6)
    }
  })

  it('are long enough to carry a few crates at once', () => {
    for (const b of BELTS) expect(beltLength(b)).toBeGreaterThan(8)
  })
})

describe('beltPoint', () => {
  const b = BELTS[0]

  it('starts at the source end, finishes at the sink end, and stays on the belt between', () => {
    const a = beltPoint(b, 0)
    const z = beltPoint(b, 1)
    expect(Math.atan2(a.x, a.z)).toBeCloseTo(b.start, 5)
    expect(Math.atan2(z.x, z.z)).toBeCloseTo(b.end, 5)
    for (let u = 0; u <= 1; u += 0.1) expect(Math.hypot(beltPoint(b, u).x, beltPoint(b, u).z)).toBeCloseTo(b.radius, 5)
  })

  it('points along the way the belt runs', () => {
    for (const belt of BELTS) {
      const p = beltPoint(belt, 0.5)
      const q = beltPoint(belt, 0.51)
      const dx = q.x - p.x
      const dz = q.z - p.z
      expect(Math.atan2(dx, dz)).toBeCloseTo(p.heading, 1)
    }
  })

  it('clamps a position outside 0 to 1', () => {
    expect(beltPoint(b, -3)).toEqual(beltPoint(b, 0))
    expect(beltPoint(b, 9)).toEqual(beltPoint(b, 1))
    expect(Number.isFinite(beltPoint(b, Number.NaN).x)).toBe(true)
  })
})

describe('beltActive', () => {
  const atlas = DEMO_PROJECTS.find((p) => p.id === 'atlas')!
  const pocketkit = DEMO_PROJECTS.find((p) => p.id === 'pocketkit')!

  it('runs only while the source department has robots at work and the project is not idle', () => {
    for (const b of BELTS) expect(beltActive(atlas, b)).toBe(atlas.agents[b.from] > 0)
    expect(beltActive({ ...atlas, status: 'idle' }, BELTS[0])).toBe(false)
    expect(beltActive({ ...atlas, agents: { ...atlas.agents, [BELTS[0].from]: 0 } }, BELTS[0])).toBe(false)
    expect(BELTS.some((b) => beltActive(pocketkit, b))).toBe(false)
  })
})

describe('levelStep and phaseStep', () => {
  it('speed up and slow down gradually, never leaving 0 to 1', () => {
    let level = 0
    const seen: number[] = []
    for (let i = 0; i < 100; i++) {
      level = levelStep(level, true, 0.05)
      seen.push(level)
    }
    expect(seen[0]).toBeGreaterThan(0)
    expect(seen[0]).toBeLessThan(0.2)
    expect(seen[seen.length - 1]).toBe(1)
    for (let i = 0; i < 100; i++) level = levelStep(level, false, 0.05)
    expect(level).toBe(0)
  })

  it('moves the belt by its speed over its length, and wraps', () => {
    const len = 10
    expect(phaseStep(0, 1, 1, len)).toBeCloseTo(BELT_SPEED / len, 6)
    expect(phaseStep(0.99, 1, 1, len)).toBeLessThan(0.99)
    expect(phaseStep(0.3, 0, 5, len)).toBe(0.3)
    expect(phaseStep(0.3, 1, Number.NaN, len)).toBe(0.3)
  })
})

describe('crates', () => {
  it('are spread evenly along the belt, each between 0 and 1, and keep that spread as the belt moves', () => {
    const us = [0, 1, 2, 3, 4].map((k) => crateU(0.13, k, 5))
    for (const u of us) {
      expect(u).toBeGreaterThanOrEqual(0)
      expect(u).toBeLessThan(1)
    }
    const sorted = [...us].sort((a, b) => a - b)
    for (let i = 1; i < sorted.length; i++) expect(sorted[i] - sorted[i - 1]).toBeCloseTo(0.2, 6)
  })

  it('grow in at the source end and shrink away at the sink end', () => {
    expect(crateScale(0)).toBe(0)
    expect(crateScale(1)).toBe(0)
    expect(crateScale(0.5)).toBe(1)
    expect(crateScale(0.03)).toBeGreaterThan(0)
    expect(crateScale(0.03)).toBeLessThan(1)
  })
})

describe('workerSpots', () => {
  it('puts two workers on the inner side of each belt, facing it, clear of the bays and the launch pad', () => {
    for (const b of BELTS) {
      const spots = workerSpots(b)
      expect(spots).toHaveLength(2)
      for (const s of spots) {
        const r = Math.hypot(s.x, s.z)
        // between the bays' back walls (10.1 m) and the belt's inner rail, with room to stand
        expect(r).toBeGreaterThan(10.05)
        expect(r).toBeLessThan(b.radius - b.width / 2 - 0.4)
        // they face outward, toward the belt
        expect(gap(s.heading, Math.atan2(s.x, s.z))).toBeLessThan(0.01)
        for (const bay of HUB_LAYOUT.bays) expect(gap(Math.atan2(s.x, s.z), bay.angle)).toBeGreaterThan(0.3)
        expect(gap(Math.atan2(s.x, s.z), LAUNCH_PAD.angle)).toBeGreaterThan(0.4)
      }
      expect(Math.hypot(spots[0].x - spots[1].x, spots[0].z - spots[1].z)).toBeGreaterThan(2)
    }
  })

  it('give the two workers different jobs', () => {
    const [a, b] = workerSpots(BELTS[0])
    expect(a.job).not.toBe(b.job)
  })
})
