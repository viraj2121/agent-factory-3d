import { describe, expect, it } from 'vitest'
import { CRAWLER, crawlerView, createCrawlers, stepCrawlers, type CrawlerSim } from '../src/crawlers'
import { HUB, HUB_LAYOUT } from '../src/hubLayout'

const DT = 1 / 30

function run(sim: CrawlerSim, seconds: number, each: (sim: CrawlerSim) => void, frozen: boolean[] = []) {
  for (let i = 0; i < seconds / DT; i++) {
    stepCrawlers(sim, DT, frozen)
    each(sim)
  }
}

const degOf = (p: number[]) => (Math.atan2(p[0], p[2]) * 180) / Math.PI

describe('crawlers', () => {
  it('stay finite and on the floor, between the bays and the wall', () => {
    const sim = createCrawlers(3)
    run(sim, 300, (s) => {
      for (const i of [0, 1]) {
        const v = crawlerView(s, i)
        expect(v.position.every(Number.isFinite)).toBe(true)
        expect(Number.isFinite(v.yaw)).toBe(true)
        expect(v.position[1]).toBe(0)
        const r = Math.hypot(v.position[0], v.position[2])
        expect(Math.abs(r - CRAWLER.radius)).toBeLessThan(CRAWLER.wobble + 1e-6)
        expect(r).toBeGreaterThan(HUB_LAYOUT.bays[0].radius + 1)
        expect(r).toBeLessThan(HUB.roomRadius - 1.5)
      }
    })
  })

  it('keep to their own stretch of floor and cover most of it', () => {
    const sim = createCrawlers(3)
    const seen = [new Set<number>(), new Set<number>()]
    run(sim, 600, (s) => {
      for (const i of [0, 1]) {
        const [from, to] = CRAWLER.sectors[i]
        const d = degOf(crawlerView(s, i).position)
        expect(d).toBeGreaterThanOrEqual(from - 0.05)
        expect(d).toBeLessThanOrEqual(to + 0.05)
        seen[i].add(Math.floor((d - from) / 4))
      }
    })
    for (const [i, set] of seen.entries()) {
      const [from, to] = CRAWLER.sectors[i]
      expect(set.size).toBeGreaterThanOrEqual(Math.floor((to - from) / 4) - 2)
    }
  })

  it('walk, stop and do different things at each stop', () => {
    const sim = createCrawlers(3)
    const clips = new Set<string>()
    const stops = new Set<number>()
    let moving = false
    run(sim, 600, (s) => {
      const v = crawlerView(s, 0)
      clips.add(v.clip)
      const walking = v.clip === 'walk'
      if (moving && !walking) stops.add(Math.round(degOf(v.position)))
      moving = walking
    })
    expect(clips).toContain('walk')
    expect(clips).toContain('test')
    expect(clips.size).toBeGreaterThanOrEqual(3)
    expect(stops.size).toBeGreaterThan(5)
  })

  it('move at a gentle pace and change speed smoothly', () => {
    const sim = createCrawlers(3)
    let before = crawlerView(sim, 0).position
    let last = 0
    run(sim, 200, (s) => {
      const p = crawlerView(s, 0).position
      const v = Math.hypot(p[0] - before[0], p[2] - before[2]) / DT
      expect(v).toBeLessThan(CRAWLER.speed[1] * 1.25)
      expect(Math.abs(v - last)).toBeLessThan(0.1)
      last = v
      before = p
    })
  })

  it('keep the two crawlers well apart', () => {
    const sim = createCrawlers(3)
    run(sim, 300, (s) => {
      const a = crawlerView(s, 0).position
      const b = crawlerView(s, 1).position
      expect(Math.hypot(a[0] - b[0], a[2] - b[2])).toBeGreaterThan(1)
    })
  })

  it('are the same every time for the same seed', () => {
    const final = (seed: number) => {
      const sim = createCrawlers(seed)
      run(sim, 90, () => {})
      return crawlerView(sim, 1).position
    }
    expect(final(3)).toEqual(final(3))
    expect(final(3)).not.toEqual(final(4))
  })

  it('stand still while frozen and carry on afterwards', () => {
    const sim = createCrawlers(3)
    run(sim, 15, () => {})
    const held = crawlerView(sim, 0).position
    run(sim, 10, () => {}, [true, false])
    expect(crawlerView(sim, 0).position).toEqual(held)
    run(sim, 20, () => {})
    expect(crawlerView(sim, 0).position).not.toEqual(held)
  })

  it('cope with a long pause between frames and with bad step sizes', () => {
    const sim = createCrawlers(3)
    stepCrawlers(sim, 5, [])
    stepCrawlers(sim, -1, [])
    stepCrawlers(sim, NaN, [])
    for (const i of [0, 1]) expect(crawlerView(sim, i).position.every(Number.isFinite)).toBe(true)
  })
})
