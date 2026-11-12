import { describe, expect, it } from 'vitest'
import { loopPoints, loopSpecs, loopLife } from '../src/starLoops'

const len = (p: number[]) => Math.hypot(p[0], p[1], p[2])

describe('loopPoints', () => {
  it('starts and ends on the surface and rises to the given height in the middle', () => {
    const pts = loopPoints([1, 0, 0], [0, 1, 0], 3.6, 0.5, 21)
    expect(pts).toHaveLength(21)
    expect(len(pts[0])).toBeCloseTo(3.6, 5)
    expect(len(pts[20])).toBeCloseTo(3.6, 5)
    expect(len(pts[10])).toBeCloseTo(3.6 * 1.5, 5)
  })
})

describe('loopSpecs', () => {
  it('gives the same loops every time', () => {
    expect(loopSpecs(6)).toEqual(loopSpecs(6))
  })
  it('makes unit-length feet that are apart from each other', () => {
    for (const s of loopSpecs(8)) {
      expect(len(s.a)).toBeCloseTo(1, 5)
      expect(len(s.b)).toBeCloseTo(1, 5)
      expect(s.a[0] * s.b[0] + s.a[1] * s.b[1] + s.a[2] * s.b[2]).toBeLessThan(0.99)
    }
  })
})

describe('loopLife', () => {
  it('rises, holds and falls inside 0..1, and is dark between lives', () => {
    const vals = Array.from({ length: 100 }, (_, i) => loopLife(i * 0.5, 0.3, 20))
    expect(Math.max(...vals)).toBeLessThanOrEqual(1)
    expect(Math.min(...vals)).toBeGreaterThanOrEqual(0)
    expect(Math.max(...vals)).toBeGreaterThan(0.9)
    expect(vals.some((v) => v === 0)).toBe(true)
  })
})
