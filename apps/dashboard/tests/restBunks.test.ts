import { describe, expect, it } from 'vitest'
import { BUNKS, FROST_LEVELS, REST, bunkSpecs, frostLevel, restFill, restSlots } from '../src/restBunks'
import { HUB, HUB_LAYOUT } from '../src/hubLayout'
import { COURIER } from '../src/couriers'
import type { Project } from '../src/projects'

const H = 3_600_000
const NOW = 1_700_000_000_000
const base = (over: Partial<Project> = {}): Project => ({ id: 'p', name: 'P', accent: '#fff', status: 'idle', activity: 0, progress: 0, agents: { planning: 0, development: 0, review: 0 }, source: 'live', planKnown: false, ...over })
const live = (roster: Record<string, unknown>[]): Project => base({ live: { path: 'E:/a', sessions: [], roster, mcp: [], docs: [], docsTruncated: false } as unknown as Project['live'] })
const e = (id: string, state: string, over: Record<string, unknown> = {}) => ({ id, name: id, agent: 'claude-code', seated: true, state, lastSeenAt: NOW - H, ...over })

describe('bunkSpecs', () => {
  it('has the bunk count, side by side on the rest arc, lying along the ring (all heads the same way round)', () => {
    const specs = bunkSpecs()
    expect(specs).toHaveLength(BUNKS.count)
    for (const s of specs) {
      expect(Math.hypot(s.position[0], s.position[2])).toBeCloseTo(BUNKS.radius, 5)
      expect(s.rotationY).toBeCloseTo(s.angle + Math.PI / 2, 5)
    }
    const gap = Math.hypot(specs[0].position[0] - specs[1].position[0], specs[0].position[2] - specs[1].position[2])
    expect(gap).toBeGreaterThan(BUNKS.length + 0.3)
  })
  it('is centred on the rest place, whatever the number of bunks', () => {
    for (const n of [1, 2, 3, 6]) {
      const specs = bunkSpecs(n)
      expect(specs).toHaveLength(n)
      expect(specs.reduce((a, s) => a + s.angle, 0) / n).toBeCloseTo(REST.angle, 5)
    }
  })
  it('makes as many bunks as asked, at most the full ring, and none for zero or nonsense', () => {
    expect(bunkSpecs(99)).toHaveLength(BUNKS.count)
    expect(bunkSpecs(0)).toEqual([])
    expect(bunkSpecs(Number.NaN)).toEqual([])
    expect(bunkSpecs(-2)).toEqual([])
  })
  it('rings the core: outside its deck, inside the courier lane', () => {
    expect(BUNKS.radius - BUNKS.width / 2).toBeGreaterThan(HUB.deckRadius + 0.1)
    expect(BUNKS.radius + BUNKS.width / 2).toBeLessThan(COURIER.lanes[0] - COURIER.wobble - 0.1)
  })
  it('stays clear of every bay and of the glowing strip that runs from the core to it', () => {
    const gap = (a: number, b: number) => Math.abs((((a - b) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI)
    for (const d of bunkSpecs()) for (const b of HUB_LAYOUT.bays) {
      expect(Math.hypot(d.position[0] - b.position[0], d.position[2] - b.position[2])).toBeGreaterThan(5)
      expect(gap(d.angle, b.angle)).toBeGreaterThan(0.6)
    }
  })
  it('stays in the free front arc, so the camera that looks in from the front sees every bunk', () => {
    for (const d of bunkSpecs()) expect(Math.abs(Math.atan2(Math.sin(d.angle), Math.cos(d.angle)))).toBeLessThan(1.4)
  })
})

describe('restFill', () => {
  it('grows with the time asleep and is full after eight hours', () => {
    expect(restFill(e('a', 'idle', { lastSeenAt: NOW - 2 * H }) as never, NOW)).toBeCloseTo(0.25, 5)
    expect(restFill(e('a', 'idle', { lastSeenAt: NOW - 20 * H }) as never, NOW)).toBe(1)
  })
  it('is empty for an agent never seen running, or with a time in the future', () => {
    expect(restFill(e('a', 'standby', { lastSeenAt: null }) as never, NOW)).toBe(0)
    expect(restFill(e('a', 'idle', { lastSeenAt: NOW + H }) as never, NOW)).toBe(0)
  })
})

describe('restSlots', () => {
  it('holds the asleep and standing-by agents, not the working ones; asleep first, the newest sleeper first', () => {
    const p = live([e('run', 'running'), e('wait', 'needs-you'), e('stand', 'standby', { lastSeenAt: null }), e('old', 'idle', { lastSeenAt: NOW - 5 * H }), e('new', 'idle', { lastSeenAt: NOW - H })])
    const r = restSlots(p)
    expect(r.slots.map((s) => s.entry.id)).toEqual(['new', 'old', 'stand'])
    expect(r.total).toBe(3)
    expect(r.more).toBe(0)
  })
  it('counts the ones that do not fit', () => {
    const p = live(Array.from({ length: 9 }, (_, i) => e(`a${i}`, 'idle')))
    const r = restSlots(p)
    expect(r.slots).toHaveLength(BUNKS.count)
    expect(r.more).toBe(3)
    expect(r.total).toBe(9)
  })
  it('ignores agents without a desk (not seated), and a demo project has no sleepers', () => {
    expect(restSlots(live([e('x', 'idle', { seated: false })])).total).toBe(0)
    const demo = restSlots(base({ source: 'demo' }))
    expect(demo.total).toBe(0)
    expect(demo.slots).toEqual([])
  })
})

describe('frostLevel', () => {
  it('goes from clear glass (0) to the thickest frost (FROST_LEVELS), one step per equal share of the battery', () => {
    expect(frostLevel(0)).toBe(0)
    expect(frostLevel(1)).toBe(FROST_LEVELS)
    expect(frostLevel(0.5)).toBe(Math.round(FROST_LEVELS / 2))
  })
  it('copes with nonsense', () => {
    expect(frostLevel(Number.NaN)).toBe(0)
    expect(frostLevel(-3)).toBe(0)
    expect(frostLevel(9)).toBe(FROST_LEVELS)
  })
})
