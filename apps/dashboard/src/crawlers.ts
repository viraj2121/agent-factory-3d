import type { Vec3 } from './hallLayout'
import type { AnyClip } from './robotVariants'

/**
 * Crawlers scuttle along a stretch of floor between the bays and the wall. Each trip they pick a stopping point,
 * speed up and slow down, and do something different at each stop (test, look up, wave their sensor). Each crawler
 * has its own stretch, clear of the bays and the studio. Demo movement, not agent data.
 */
export const CRAWLER = {
  radius: 11.4,
  /** Slow sway in the path, in metres. */
  wobble: 0.1,
  /** Slowest and fastest walking speed, in metres per second. */
  speed: [0.45, 0.8] as const,
  accel: 0.7,
  /** How long it stands at a stop, in seconds. */
  stop: [2.5, 6] as const,
  /** Start and end angle of each crawler's stretch, in degrees from +z toward +x. */
  sectors: [[50, 82], [126, 158]] as const,
}

const DEG = Math.PI / 180
const MAX_STEP = 0.05
/** Slowest speed while arriving, so it always gets there without a last-moment jump. */
const CREEP = 0.06
const STOP_CLIPS: AnyClip[] = ['test', 'test', 'test', 'idle2', 'wave']

export interface Crawler {
  /** Position along the stretch, in degrees from +z toward +x. */
  deg: number
  speed: number
  dir: 1 | -1
  mode: 'walk' | 'stop'
  timer: number
  /** Where it is heading, in degrees. */
  target: number
  cruise: number
  clip: AnyClip
  yaw: number
}

export interface CrawlerSim {
  time: number
  rand: () => number
  crawlers: Crawler[]
}

export interface CrawlerView {
  position: Vec3
  yaw: number
  clip: AnyClip
}

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const between = (rand: () => number, [lo, hi]: readonly [number, number]) => lo + (hi - lo) * rand()

export function createCrawlers(seed = 3): CrawlerSim {
  const rand = mulberry32(seed)
  const crawlers: Crawler[] = CRAWLER.sectors.map(([from], i) => ({
    deg: from, speed: 0, dir: 1, mode: 'stop', timer: 1 + i * 2.2, target: from, cruise: CRAWLER.speed[0], clip: 'test', yaw: from * DEG,
  }))
  return { time: 0, rand, crawlers }
}

/** Picks the next stopping point: the end of the stretch, or somewhere short of it. */
function leaveStop(sim: CrawlerSim, c: Crawler, index: number) {
  const [from, to] = CRAWLER.sectors[index]
  if (c.deg <= from + 0.5) c.dir = 1
  else if (c.deg >= to - 0.5) c.dir = -1
  else if (sim.rand() < 0.3) c.dir = c.dir === 1 ? -1 : 1
  const end = c.dir === 1 ? to : from
  const room = Math.abs(end - c.deg)
  c.target = sim.rand() < 0.45 || room < 8 ? end : c.deg + c.dir * (4 + (room - 4) * sim.rand())
  c.cruise = between(sim.rand, CRAWLER.speed)
  c.mode = 'walk'
  c.clip = 'walk'
}

function stepOne(sim: CrawlerSim, c: Crawler, index: number, dt: number) {
  if (c.mode === 'walk') {
    const leftDeg = Math.max(0, c.dir * (c.target - c.deg))
    const left = leftDeg * DEG * CRAWLER.radius
    // the braking curve, softened to a straight taper for the last few steps so it eases onto the stop
    const wanted = Math.min(c.cruise, Math.sqrt(2 * CRAWLER.accel * left), 1.4 * left + CREEP)
    c.speed += Math.max(-CRAWLER.accel * dt, Math.min(CRAWLER.accel * dt, wanted - c.speed))
    c.deg += (c.dir * c.speed * dt) / (DEG * CRAWLER.radius)
    if (left < 0.002 || c.dir * (c.target - c.deg) <= 0) {
      c.deg = c.target
      c.speed = 0
      c.mode = 'stop'
      c.timer = between(sim.rand, CRAWLER.stop)
      c.clip = STOP_CLIPS[Math.floor(sim.rand() * STOP_CLIPS.length)]
    }
  } else {
    c.timer -= dt
    if (c.timer <= 0) leaveStop(sim, c, index)
  }
  const [from, to] = CRAWLER.sectors[index]
  c.deg = Math.min(to, Math.max(from, c.deg))
  // face along the walk, or out toward the bays while stopped
  const want = c.mode === 'walk' ? Math.atan2(c.dir * Math.cos(c.deg * DEG), -c.dir * Math.sin(c.deg * DEG)) : c.deg * DEG
  const diff = Math.atan2(Math.sin(want - c.yaw), Math.cos(want - c.yaw))
  const step = 3 * dt
  c.yaw += Math.max(-step, Math.min(step, diff))
}

/** Moves the crawlers on by `dt` seconds. `frozen[i]` holds crawler i still, for example while someone clicks it. */
export function stepCrawlers(sim: CrawlerSim, dt: number, frozen: boolean[] = []): void {
  if (!Number.isFinite(dt) || dt <= 0) return
  let left = Math.min(dt, 0.5)
  while (left > 1e-9) {
    const h = Math.min(MAX_STEP, left)
    left -= h
    sim.time += h
    sim.crawlers.forEach((c, i) => {
      if (!frozen[i]) stepOne(sim, c, i, h)
    })
  }
}

/** Where crawler `index` is, which way it faces and what it is doing. */
export function crawlerView(sim: CrawlerSim, index: number): CrawlerView {
  const c = sim.crawlers[((index % sim.crawlers.length) + sim.crawlers.length) % sim.crawlers.length]
  const a = c.deg * DEG
  const r = CRAWLER.radius + CRAWLER.wobble * Math.sin(a * 6)
  return { position: [r * Math.sin(a), 0, r * Math.cos(a)], yaw: c.yaw, clip: c.clip }
}
