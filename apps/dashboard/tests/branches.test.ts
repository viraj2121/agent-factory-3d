import { describe, expect, it } from 'vitest'
import { activeTwigs, branchPaths, pulseT } from '../src/branches'
import { HUB, HUB_LAYOUT } from '../src/hubLayout'

const paths = branchPaths()
const near = (a: number[], b: number[], tol = 0.01) => a.every((v, i) => Math.abs(v - b[i]) < tol)

describe('branchPaths', () => {
  it('has a main for every bay and a twig for every seat', () => {
    expect(paths.filter((p) => p.kind === 'main')).toHaveLength(HUB_LAYOUT.bays.length)
    expect(paths.filter((p) => p.kind === 'twig')).toHaveLength(HUB_LAYOUT.bays.length * 3)
  })

  it('starts each main at the edge of the core deck', () => {
    for (const p of paths.filter((x) => x.kind === 'main')) {
      const [x, , z] = p.points[0]
      expect(Math.abs(Math.hypot(x, z) - HUB.deckRadius)).toBeLessThan(0.05)
    }
  })

  it('ends each twig exactly at its seat in the world', () => {
    for (const bay of HUB_LAYOUT.bays) {
      bay.seats.forEach((seat, i) => {
        const twig = paths.find((p) => p.bay === bay.id && p.kind === 'twig' && p.seat === i)
        expect(twig, `${bay.id} twig ${i}`).toBeDefined()
        const c = Math.cos(bay.rotationY)
        const s = Math.sin(bay.rotationY)
        const world = [bay.position[0] + seat[0] * c + seat[2] * s, seat[1], bay.position[2] - seat[0] * s + seat[2] * c]
        expect(near(twig!.points[twig!.points.length - 1], world)).toBe(true)
      })
    }
  })

  it('forks each bay main into its three twigs at the same point', () => {
    for (const bay of HUB_LAYOUT.bays) {
      const main = paths.find((p) => p.bay === bay.id && p.kind === 'main')!
      const fork = main.points[main.points.length - 1]
      for (const twig of paths.filter((p) => p.bay === bay.id && p.kind === 'twig')) expect(near(twig.points[0], fork)).toBe(true)
    }
  })

  it('keeps every point finite and on or above the floor', () => {
    for (const p of paths) for (const pt of p.points) pt.forEach((v) => expect(Number.isFinite(v)).toBe(true))
    for (const p of paths) for (const pt of p.points) expect(pt[1]).toBeGreaterThanOrEqual(0)
  })
})

describe('pulseT', () => {
  it('stays in [0, 1)', () => {
    for (let t = 0; t < 30; t += 0.37) for (let i = 0; i < 6; i++) {
      const v = pulseT(t, i, 0.4)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('repeats every 1 / speed seconds', () => {
    expect(pulseT(5 + 1 / 0.4, 2, 0.4)).toBeCloseTo(pulseT(5, 2, 0.4), 6)
  })

  it('gives different pulses different phases', () => {
    expect(pulseT(3, 0, 0.4)).not.toBeCloseTo(pulseT(3, 1, 0.4), 3)
  })
})

describe('activeTwigs', () => {
  it('is true only where a robot sits', () => {
    expect(activeTwigs(['robot', 'robot', 'empty'])).toEqual([true, true, false])
    expect(activeTwigs(['empty', 'empty', 'empty'])).toEqual([false, false, false])
  })
})
