import { describe, expect, it } from 'vitest'
import {
  barHeights, cartHeading, cartPosition, CART_RADIUS, CART_SWAY, dronePosition,
  radialData, ringPulse, screenStripes, steamPoints, streakSpots,
} from '../src/lifeMath'
import { HUB, HUB_LAYOUT } from '../src/hubLayout'

describe('screenStripes', () => {
  it('is a deterministic RGBA image with bright and dim rows', () => {
    const a = screenStripes(64)
    expect(a).toHaveLength(64 * 64 * 4)
    expect(screenStripes(64)).toEqual(a)
    const values = new Set<number>()
    for (let i = 0; i < a.length; i += 4) {
      expect(a[i + 3]).toBe(255)
      values.add(a[i])
    }
    expect(Math.max(...values)).toBeGreaterThan(200)
    expect(Math.min(...values)).toBeLessThan(90)
  })
})

describe('barHeights', () => {
  it('returns one height per bar, always between 0.15 and 1, and changes over time', () => {
    for (let t = 0; t < 20; t += 0.7) {
      const h = barHeights(t, 5)
      expect(h).toHaveLength(5)
      h.forEach((v) => {
        expect(v).toBeGreaterThanOrEqual(0.15)
        expect(v).toBeLessThanOrEqual(1)
      })
    }
    expect(barHeights(1, 5)).not.toEqual(barHeights(2.3, 5))
  })
})

describe('ringPulse', () => {
  it('grows and fades, then repeats every period', () => {
    const start = ringPulse(0, 4)
    const late = ringPulse(3.9, 4)
    expect(late.scale).toBeGreaterThan(start.scale)
    expect(late.opacity).toBeLessThan(start.opacity)
    expect(ringPulse(4 + 1.3, 4).scale).toBeCloseTo(ringPulse(1.3, 4).scale, 6)
    for (let t = 0; t < 12; t += 0.3) {
      const p = ringPulse(t, 4)
      expect(p.scale).toBeGreaterThanOrEqual(0.2)
      expect(p.scale).toBeLessThanOrEqual(1)
      expect(p.opacity).toBeGreaterThanOrEqual(0)
      expect(p.opacity).toBeLessThanOrEqual(0.7)
    }
  })
})

describe('cart and drone', () => {
  it('keeps the cart on a ring that clears the bays and the deck, swaying only a little', () => {
    for (let t = 0; t < 120; t += 5) {
      const [x, y, z] = cartPosition(t)
      expect(Math.abs(Math.hypot(x, z) - CART_RADIUS)).toBeLessThanOrEqual(CART_SWAY + 1e-9)
      expect(y).toBe(0)
    }
    expect(CART_RADIUS).toBeGreaterThan(HUB.deckRadius + 1)
    expect(CART_RADIUS).toBeLessThan(HUB_LAYOUT.bays[0].radius - 1.2)
  })

  it('points the cart along its path', () => {
    const t = 7
    const [x1, , z1] = cartPosition(t)
    const [x2, , z2] = cartPosition(t + 0.01)
    expect(Math.sin(cartHeading(t))).toBeCloseTo((x2 - x1) / Math.hypot(x2 - x1, z2 - z1), 2)
    expect(Math.cos(cartHeading(t))).toBeCloseTo((z2 - z1) / Math.hypot(x2 - x1, z2 - z1), 2)
  })

  it('lets the cart speed up and slow down but never stop or go backwards', () => {
    const speeds: number[] = []
    for (let t = 0; t < 120; t += 0.5) {
      const [x1, , z1] = cartPosition(t)
      const [x2, , z2] = cartPosition(t + 0.1)
      const a1 = Math.atan2(x1, z1)
      const a2 = Math.atan2(x2, z2)
      speeds.push(Math.atan2(Math.sin(a2 - a1), Math.cos(a2 - a1)) / 0.1)
    }
    expect(Math.min(...speeds)).toBeGreaterThan(0.01)
    expect(Math.max(...speeds) / Math.min(...speeds)).toBeGreaterThan(2)
  })

  it('has the drone wander rather than circle: its distance from the core keeps changing, smoothly', () => {
    const radii: number[] = []
    let last = dronePosition(0)
    for (let t = 0; t < 200; t += 0.1) {
      const p = dronePosition(t)
      radii.push(Math.hypot(p[0], p[2]))
      expect(Math.hypot(p[0] - last[0], p[1] - last[1], p[2] - last[2]) / 0.1).toBeLessThan(3)
      last = p
    }
    expect(Math.max(...radii) - Math.min(...radii)).toBeGreaterThan(3)
  })

  it('keeps the drone inside the room, above the floor and away from the ceiling', () => {
    for (let t = 0; t < 90; t += 1.3) {
      const [x, y, z] = dronePosition(t)
      expect(Math.hypot(x, z)).toBeLessThan(HUB.roomRadius - 2)
      expect(y).toBeGreaterThan(2)
      expect(y).toBeLessThan(HUB.wallHeight - 2)
    }
  })
})

describe('steamPoints', () => {
  it('rises from the vent and stays near it', () => {
    const origin: [number, number, number] = [10, 0.1, 3]
    const p = steamPoints(3.3, 24, origin)
    expect(p).toHaveLength(24 * 3)
    for (let i = 0; i < 24; i++) {
      expect(Math.hypot(p[i * 3] - origin[0], p[i * 3 + 2] - origin[2])).toBeLessThan(1.2)
      expect(p[i * 3 + 1]).toBeGreaterThanOrEqual(origin[1])
      expect(p[i * 3 + 1]).toBeLessThanOrEqual(origin[1] + 3)
    }
  })

  it('returns nothing for a zero or negative count', () => {
    expect(steamPoints(1, 0, [0, 0, 0])).toHaveLength(0)
    expect(steamPoints(1, -3, [0, 0, 0])).toHaveLength(0)
  })
})

describe('radialData', () => {
  it('fades a light pool from bright in the middle to nothing at the edge', () => {
    const size = 32
    const d = radialData(size)
    const at = (x: number, y: number) => d[(y * size + x) * 4 + 3]
    expect(at(16, 16)).toBeGreaterThan(200)
    expect(at(0, 0)).toBe(0)
    expect(at(16, 16)).toBeGreaterThan(at(16, 4))
  })
})

describe('streakSpots', () => {
  it('scatters spots inside the room, outside the core deck', () => {
    const spots = streakSpots(14)
    expect(spots).toHaveLength(14)
    for (const s of spots) {
      const r = Math.hypot(s.x, s.z)
      expect(r).toBeGreaterThan(HUB.deckRadius + 1)
      expect(r).toBeLessThan(HUB.roomRadius - 1)
      expect(s.length).toBeGreaterThan(s.width)
    }
    expect(streakSpots(14)).toEqual(spots)
  })
})
