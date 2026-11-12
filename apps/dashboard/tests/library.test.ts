import { describe, expect, it } from 'vitest'
import { HUB_LAYOUT, STUDIO } from '../src/hubLayout'
import { LAUNCH_PAD } from '../src/launchpad'
import { BELTS } from '../src/belts'
import { ARM_BASE_Y, LIBRARY, LIBRARY_ARM_SCALE, LIBRARY_SLOTS, SHELF_Y, daisCentre, deskSpot, filledSlots, libraryArm, slotWorld, tenderSpots, unitCentre } from '../src/library'
import { ARM } from '../src/cradle'

const gap = (a: number, b: number) => Math.abs((((a - b) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI)

describe('LIBRARY', () => {
  it('stands against the wall in the gap between two bays, clear of the studio, the belts and the launch pad', () => {
    for (const bay of HUB_LAYOUT.bays) expect(gap(LIBRARY.angle, bay.angle)).toBeGreaterThan(0.5)
    expect(gap(LIBRARY.angle, STUDIO.angle)).toBeGreaterThan(1.0)
    expect(gap(LIBRARY.angle, LAUNCH_PAD.angle)).toBeGreaterThan(1.5)
    for (const belt of BELTS) for (const a of [belt.start, belt.end]) expect(gap(LIBRARY.angle, a)).toBeGreaterThan(0.45)
  })

  it('is deep enough behind the bays and in front of the crates along the parapet', () => {
    expect(LIBRARY.radius - 0.5).toBeGreaterThan(11)
    expect(LIBRARY.radius + 0.6).toBeLessThan(13)
  })
})

describe('slots', () => {
  it('are the shelf spots for the glowing boxes, all different and all on the shelves', () => {
    const spots = Array.from({ length: LIBRARY_SLOTS }, (_, i) => slotWorld(i))
    expect(spots).toHaveLength(96)
    expect(LIBRARY_SLOTS).toBe(96)
    expect(new Set(spots.map((s) => s.map((v) => v.toFixed(3)).join())).size).toBe(LIBRARY_SLOTS)
    for (const [x, y, z] of spots) {
      expect(Math.hypot(x, z)).toBeGreaterThan(LIBRARY.radius - 0.7)
      expect(Math.hypot(x, z)).toBeLessThan(LIBRARY.radius + 0.2)
      expect(y).toBeGreaterThan(0.2)
      expect(y).toBeLessThan(2.8)
    }
  })

  it('fill the bottom shelf first, across all three units, then the next shelf up', () => {
    const perShelf = LIBRARY.units * LIBRARY.perShelf
    for (let i = 0; i < perShelf; i++) expect(slotWorld(i)[1]).toBeCloseTo(slotWorld(0)[1], 9)
    expect(slotWorld(perShelf)[1]).toBeGreaterThan(slotWorld(0)[1] + 0.4)
    expect(SHELF_Y).toHaveLength(LIBRARY.shelves)
  })

  it('stay within the arc the three shelf units cover', () => {
    for (let i = 0; i < LIBRARY_SLOTS; i++) {
      const [x, , z] = slotWorld(i)
      expect(gap(Math.atan2(x, z), LIBRARY.angle)).toBeLessThan(0.45)
    }
  })
})

describe('filledSlots', () => {
  it('fills as the demo build progresses, from none to all', () => {
    expect(filledSlots(0)).toBe(0)
    expect(filledSlots(1)).toBe(LIBRARY_SLOTS)
    let last = -1
    for (let p = 0; p <= 1; p += 0.05) {
      const n = filledSlots(p)
      expect(n).toBeGreaterThanOrEqual(last)
      last = n
    }
  })

  it('treats anything that is not a progress as empty or full, never outside the shelves', () => {
    expect(filledSlots(Number.NaN)).toBe(0)
    expect(filledSlots(-3)).toBe(0)
    expect(filledSlots(9)).toBe(LIBRARY_SLOTS)
  })
})

describe('libraryArm', () => {
  const reach = 2 * ARM.upper * LIBRARY_ARM_SCALE

  it('slides along its rail in front of the shelves and always reaches the spot it is working on', () => {
    for (let t = 0; t < 90; t += 0.31) {
      const { base, hand } = libraryArm(t)
      expect(base.every(Number.isFinite)).toBe(true)
      expect(hand.every(Number.isFinite)).toBe(true)
      expect(Math.hypot(hand[0] - base[0], hand[1] - base[1], hand[2] - base[2])).toBeLessThan(reach - 0.1)
      // the rail runs in front of the shelves, nearer the core
      expect(Math.hypot(base[0], base[2])).toBeLessThan(LIBRARY.radius - 0.4)
    }
  })

  it('visits many different spots, and leans in to file a box now and then', () => {
    const slots = new Set<number>()
    let leaning = 0
    for (let t = 0; t < 120; t += 0.1) {
      const a = libraryArm(t)
      slots.add(a.slot)
      expect(a.slot).toBeGreaterThanOrEqual(0)
      expect(a.slot).toBeLessThan(LIBRARY_SLOTS)
      expect(a.insert).toBeGreaterThanOrEqual(0)
      expect(a.insert).toBeLessThanOrEqual(1)
      if (a.insert > 0.5) leaning++
    }
    expect(slots.size).toBeGreaterThan(6)
    expect(leaning).toBeGreaterThan(0)
  })

  it('works the same way every time', () => {
    expect(libraryArm(17.3)).toEqual(libraryArm(17.3))
    expect(libraryArm(Number.NaN).hand.every(Number.isFinite)).toBe(true)
  })
})

describe('tenderSpots and unitCentre', () => {
  it('put two robots in front of the shelves, facing them', () => {
    const spots = tenderSpots()
    expect(spots).toHaveLength(2)
    for (const s of spots) {
      expect(Math.hypot(s.x, s.z)).toBeLessThan(LIBRARY.radius - 0.7)
      expect(gap(s.heading, Math.atan2(s.x, s.z))).toBeLessThan(0.5)
    }
  })

  it('has a catalogue desk in front of the first tender and a dais for the archive core, both clear of the rail the arm slides on', () => {
    const desk = deskSpot()
    const [first] = tenderSpots()
    expect(Math.hypot(desk.x, desk.z)).toBeGreaterThan(Math.hypot(first.x, first.z))
    expect(Math.hypot(desk.x, desk.z)).toBeLessThan(LIBRARY.radius - 1.4)
    expect(Math.hypot(daisCentre().x, daisCentre().z)).toBeLessThan(LIBRARY.radius - 2)
    expect(ARM_BASE_Y).toBeGreaterThan(0.5)
  })

  it('has three shelf units spread along the arc, centred on the library', () => {
    const centres = [0, 1, 2].map(unitCentre)
    expect(gap(Math.atan2(centres[1].x, centres[1].z), LIBRARY.angle)).toBeLessThan(0.01)
    expect(gap(Math.atan2(centres[0].x, centres[0].z), Math.atan2(centres[2].x, centres[2].z))).toBeGreaterThan(0.3)
  })
})
