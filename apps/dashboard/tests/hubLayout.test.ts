import { describe, expect, it } from 'vitest'
import { DEPARTMENTS } from '../src/hallLayout'
import { HUB, HUB_LAYOUT, bayPosition } from '../src/hubLayout'

const { bays } = HUB_LAYOUT
const TAU = Math.PI * 2
const norm = (a: number) => ((a % TAU) + TAU) % TAU

describe('HUB_LAYOUT', () => {
  it('has the five departments in order', () => {
    expect(bays.map((b) => b.id)).toEqual([...DEPARTMENTS])
  })

  it('puts the bays at the planned angles on a 9 m ring', () => {
    const expected = [Math.PI, 0.6 * Math.PI, -0.6 * Math.PI, 0.2 * Math.PI]
    bays.forEach((b, i) => {
      expect(norm(b.angle)).toBeCloseTo(norm(expected[i]), 5)
      expect(b.radius).toBe(9)
    })
  })

  it('keeps the three bays side by side on the old 72 degree grid, with one big gap (216 degrees) for the rest docks, the launch pad and the studio', () => {
    const angles = bays.map((b) => norm(b.angle)).sort((a, b) => a - b)
    const gaps: number[] = []
    for (let i = 0; i < angles.length; i++) {
      const next = angles[(i + 1) % angles.length] + (i === angles.length - 1 ? TAU : 0)
      gaps.push(next - angles[i])
    }
    gaps.sort((a, b) => a - b)
    gaps.forEach((g, i) => expect(g).toBeCloseTo(i === gaps.length - 1 ? (3 * TAU) / 5 : TAU / 5, 5))
  })

  it('derives position from angle and radius', () => {
    for (const b of bays) {
      const p = bayPosition(b.angle, b.radius)
      b.position.forEach((v, i) => expect(Math.abs(v - p[i])).toBeLessThan(0.001))
    }
    expect(bayPosition(0, 9)).toEqual([0, 0, 9])
  })

  it('turns every bay to face the centre', () => {
    for (const b of bays) expect(norm(b.rotationY)).toBeCloseTo(norm(b.angle + Math.PI), 5)
  })

  it('gives each bay three seats in a gentle arc', () => {
    for (const b of bays) expect(b.seats).toEqual([[-1.1, 0, -0.12], [0, 0, 0], [1.1, 0, -0.12]])
  })

  it('keeps bays at least 3.6 m apart', () => {
    for (let i = 0; i < bays.length; i++)
      for (let j = i + 1; j < bays.length; j++)
        expect(Math.hypot(bays[i].position[0] - bays[j].position[0], bays[i].position[2] - bays[j].position[2])).toBeGreaterThanOrEqual(3.6)
  })

  it('fixes the room constants', () => {
    expect(HUB.roomRadius).toBe(15)
    expect(HUB.deckRadius).toBe(3.2)
    expect(HUB.coreCenter).toEqual([0, 1.8, 0])
  })
})
