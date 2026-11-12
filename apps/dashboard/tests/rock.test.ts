import { describe, expect, it } from 'vitest'
import { rockGeometry } from '../src/rock'

const positions = (g: ReturnType<typeof rockGeometry>) => Array.from(g.getAttribute('position').array as Float32Array)

describe('rockGeometry', () => {
  const g = rockGeometry(8, 11, 3)
  const p = positions(g)

  it('is finite everywhere', () => {
    expect(p.every(Number.isFinite)).toBe(true)
  })

  it('has a flat top at y = 0 and reaches close to the requested depth', () => {
    const ys = p.filter((_, i) => i % 3 === 1)
    expect(Math.max(...ys)).toBeLessThanOrEqual(1e-6)
    expect(Math.min(...ys)).toBeLessThan(-11 * 0.85)
    expect(Math.min(...ys)).toBeGreaterThan(-11 * 1.2)
  })

  it('stays inside a little more than the requested radius, and meets the deck edge', () => {
    let widest = 0
    for (let i = 0; i < p.length; i += 3) widest = Math.max(widest, Math.hypot(p[i], p[i + 2]))
    expect(widest).toBeLessThan(8 * 1.25)
    expect(widest).toBeGreaterThan(8 * 0.95)
  })

  it('is the same every time for the same seed, and different for another seed', () => {
    expect(positions(rockGeometry(8, 11, 3))).toEqual(p)
    expect(positions(rockGeometry(8, 11, 4))).not.toEqual(p)
  })
})
