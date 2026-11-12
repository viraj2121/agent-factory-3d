import { describe, expect, it } from 'vitest'
import { ARM, CRADLE, armTargets, builtPieces, cradleToWorld, pieceLayout, solveArm } from '../src/cradle'
import { COURIER } from '../src/couriers'
import { CART_RADIUS } from '../src/lifeMath'
import { HUB_LAYOUT, STUDIO } from '../src/hubLayout'
import { DEMO_PROJECTS } from '../src/projects'
import { CRAWLER } from '../src/crawlers'

const forward = (base: [number, number, number], s: ReturnType<typeof solveArm>): [number, number, number] => {
  const reach = ARM.upper * Math.cos(s.upper) + ARM.fore * Math.cos(s.fore)
  const rise = ARM.upper * Math.sin(s.upper) + ARM.fore * Math.sin(s.fore)
  return [base[0] + reach * Math.cos(s.yaw), base[1] + rise, base[2] - reach * Math.sin(s.yaw)]
}
const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

describe('solveArm', () => {
  const base: [number, number, number] = [-2.4, 0.3, 0]

  it('puts the hand on the target when it can be reached', () => {
    for (const target of [[-1, 1.2, 0.5], [0.5, 2.0, -0.6], [-2.4, 2.5, 1.5], [0.2, 0.4, 1.2]] as [number, number, number][]) {
      expect(dist(forward(base, solveArm(base, target)), target)).toBeLessThan(1e-6)
    }
  })

  it('stretches toward a target that is too far, without leaving the reach of the arm', () => {
    const far: [number, number, number] = [30, 8, 9]
    const hand = forward(base, solveArm(base, far))
    expect(dist(hand, base)).toBeLessThanOrEqual(ARM.upper + ARM.fore + 1e-6)
    expect(dist(hand, base)).toBeGreaterThan(ARM.upper + ARM.fore - 0.2)
  })

  it('keeps the elbow above the line from shoulder to hand', () => {
    const s = solveArm(base, [0, 1.0, 0.8])
    expect(s.upper).toBeGreaterThan(s.fore)
  })

  it('never returns a non-number, even for a target right above or on the base', () => {
    for (const target of [base, [base[0], base[1] + 2, base[2]], [base[0], base[1], base[2]], [NaN, 1, 1]] as [number, number, number][]) {
      const s = solveArm(base, target)
      expect(Number.isFinite(s.yaw) && Number.isFinite(s.upper) && Number.isFinite(s.fore)).toBe(true)
    }
  })
})

describe('pieceLayout', () => {
  const pieces = pieceLayout()

  it('stacks the pieces on the platform with no gaps and a sensible height', () => {
    expect(pieces).toHaveLength(CRADLE.pieces)
    expect(pieces[0].y - pieces[0].size[1] / 2).toBeCloseTo(CRADLE.holoBase, 5)
    for (let i = 1; i < pieces.length; i++) {
      expect(pieces[i].y - pieces[i].size[1] / 2).toBeCloseTo(pieces[i - 1].y + pieces[i - 1].size[1] / 2, 5)
    }
    const top = pieces[pieces.length - 1].y + pieces[pieces.length - 1].size[1] / 2
    expect(top).toBeLessThan(4.2)
  })
})

describe('builtPieces', () => {
  it('turns progress into a whole number of pieces and clamps odd values', () => {
    expect(builtPieces(0)).toBe(0)
    expect(builtPieces(1)).toBe(CRADLE.pieces)
    expect(builtPieces(0.5)).toBe(Math.round(CRADLE.pieces / 2))
    expect(builtPieces(-3)).toBe(0)
    expect(builtPieces(9)).toBe(CRADLE.pieces)
    expect(builtPieces(NaN)).toBe(0)
  })

  it('has demo progress for every project', () => {
    for (const p of DEMO_PROJECTS) {
      expect(p.progress).toBeGreaterThanOrEqual(0)
      expect(p.progress).toBeLessThanOrEqual(1)
    }
  })
})

describe('armTargets', () => {
  const times = Array.from({ length: 300 }, (_, i) => i * 0.2)

  it('keeps both hands within reach of their arms at all times, building or finished', () => {
    for (const built of [0, 2, CRADLE.pieces - 1, CRADLE.pieces]) {
      for (const t of times) {
        const s = armTargets(t, built)
        expect(dist(s.a.hand, ARM.baseA)).toBeLessThan(ARM.upper + ARM.fore - 0.05)
        expect(dist(s.b.hand, ARM.baseB)).toBeLessThan(ARM.upper + ARM.fore - 0.05)
        expect([...s.a.hand, ...s.b.hand].every(Number.isFinite)).toBe(true)
      }
    }
  })

  it('carries the next piece from the tray to its slot and then sets it down', () => {
    const slot = pieceLayout()[2]
    const states = times.map((t) => armTargets(t, 2))
    expect(states.some((s) => s.carrying)).toBe(true)
    expect(states.some((s) => !s.carrying)).toBe(true)
    // when set down in the middle of the platform the piece sits in its slot
    const atSlot = states.filter((s) => s.piece && Math.abs(s.piece.x) < 1e-6 && !s.carrying)
    expect(atSlot.length).toBeGreaterThan(0)
    for (const s of atSlot) expect(s.piece!.y).toBeCloseTo(slot.y, 4)
  })

  it('welds with the second arm only while a piece is being placed', () => {
    const states = times.map((t) => armTargets(t, 2))
    expect(states.some((s) => s.welding)).toBe(true)
    expect(states.some((s) => !s.welding)).toBe(true)
  })

  it('shows no piece in hand and no welding when everything is built', () => {
    for (const t of times) {
      const s = armTargets(t, CRADLE.pieces)
      expect(s.carrying).toBe(false)
      expect(s.welding).toBe(false)
      expect(s.piece).toBeNull()
    }
  })
})

describe('placement in the hub', () => {
  const [cx, , cz] = cradleToWorld([0, 0, 0])
  const around = (x: number, z: number) => Math.hypot(x - cx, z - cz)

  it('keeps clear of the cart, the couriers and the crawlers', () => {
    const reach = ARM.baseB[0] + 0.6
    for (let a = 0; a < Math.PI * 2; a += 0.05) {
      for (const r of [CART_RADIUS, COURIER.radius]) {
        expect(around(r * Math.sin(a), r * Math.cos(a))).toBeGreaterThan(CRADLE.platformRadius + 0.3)
        // the arms reach sideways, so also stay clear of the arm bases
        if (around(r * Math.sin(a), r * Math.cos(a)) < reach) expect(Math.abs(r - Math.hypot(cx, cz))).toBeGreaterThan(CRADLE.platformRadius - 0.2)
      }
    }
    for (const [from, to] of CRAWLER.sectors) {
      for (const deg of [from, to]) {
        const a = (deg * Math.PI) / 180
        expect(around(CRAWLER.radius * Math.sin(a), CRAWLER.radius * Math.cos(a))).toBeGreaterThan(5)
      }
    }
  })

  it('keeps clear of every bay and the design studio', () => {
    for (const bay of HUB_LAYOUT.bays) expect(around(bay.position[0], bay.position[2])).toBeGreaterThan(CRADLE.platformRadius + 2.4)
    expect(around(STUDIO.position[0], STUDIO.position[2])).toBeGreaterThan(8)
  })
})
