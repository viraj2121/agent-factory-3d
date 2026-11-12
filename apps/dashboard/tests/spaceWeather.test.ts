import { describe, expect, it } from 'vitest'
import { DOME } from '../src/dome'
import { METEOR_LIFE, arcAt, arcPath, dustMotes, meteorPath, meteorsAt, spaceWeatherFor } from '../src/spaceWeather'
import { THEMES, THEME_IDS, themeFor } from '../src/themes'

describe('spaceWeatherFor', () => {
  it('is calm drift when idle: dust, a rare shooting star, no storm', () => {
    const w = spaceWeatherFor('idle', 0.15)
    expect(w.storm).toBe(0)
    expect(w.dust).toBeGreaterThan(0.4)
    expect(w.meteors).toBeGreaterThan(0)
    expect(w.meteors).toBeLessThan(0.15)
  })

  it('is a meteor shower while agents work, heavier the busier the project', () => {
    const calm = spaceWeatherFor('running', 0.3)
    const busy = spaceWeatherFor('running', 1)
    expect(calm.storm).toBe(0)
    expect(busy.meteors).toBeGreaterThan(calm.meteors)
    expect(calm.meteors).toBeGreaterThan(spaceWeatherFor('idle', 0.15).meteors)
  })

  it('is an ion storm when the project needs you', () => {
    const w = spaceWeatherFor('needs-you', 0.5)
    expect(w.storm).toBeGreaterThan(0.5)
  })

  it('survives a broken activity number', () => {
    const w = spaceWeatherFor('running', Number.NaN)
    expect(Number.isFinite(w.meteors)).toBe(true)
  })
})

describe('meteorsAt', () => {
  it('has none at rate zero or a broken time', () => {
    expect(meteorsAt(10, 0)).toEqual([])
    expect(meteorsAt(Number.NaN, 1)).toEqual([])
    expect(meteorsAt(-5, 1)).toEqual([])
  })

  it('is the same for the same time, and every meteor is part-way through its flight', () => {
    expect(meteorsAt(42.3, 1)).toEqual(meteorsAt(42.3, 1))
    for (let t = 0; t < 60; t += 0.37) for (const m of meteorsAt(t, 1.5)) {
      expect(m.progress).toBeGreaterThanOrEqual(0)
      expect(m.progress).toBeLessThan(1)
    }
  })

  it('shows more meteors for a higher rate, about the asked number per second', () => {
    const count = (rate: number) => {
      const seen = new Set<number>()
      for (let t = 0; t < 120; t += 0.1) for (const m of meteorsAt(t, rate)) seen.add(m.id)
      return seen.size
    }
    const few = count(0.1)
    const many = count(1.2)
    expect(many).toBeGreaterThan(few * 4)
    expect(many / 120).toBeGreaterThan(0.6)
    expect(many / 120).toBeLessThan(1.8)
  })

  it('lives for METEOR_LIFE seconds', () => {
    expect(METEOR_LIFE).toBeGreaterThan(0.4)
    expect(METEOR_LIFE).toBeLessThan(2.5)
  })
})

describe('meteorPath', () => {
  it('runs high in the sky, far outside the dome, and is the same for the same id', () => {
    for (let id = 0; id < 50; id++) {
      const p = meteorPath(id)
      expect(p).toEqual(meteorPath(id))
      for (const q of [p.from, p.to]) {
        expect(Math.hypot(q[0], q[1], q[2])).toBeGreaterThan(80)
        expect(q[1]).toBeGreaterThan(10)
      }
      expect(p.to[1]).toBeLessThan(p.from[1])
    }
  })
})

describe('arcAt and arcPath', () => {
  it('has no arcs without a storm', () => {
    for (let t = 0; t < 60; t += 0.2) expect(arcAt(t, 0).level).toBe(0)
  })

  it('crackles now and then in a storm, the same for the same time', () => {
    let lit = 0
    for (let t = 0; t < 120; t += 0.05) if (arcAt(t, 0.8).level > 0) lit++
    expect(lit).toBeGreaterThan(20)
    expect(arcAt(33.1, 0.8)).toEqual(arcAt(33.1, 0.8))
  })

  it('crawls over the shield dome itself, never inside the hall', () => {
    for (let id = 0; id < 20; id++) {
      for (const [x, y, z] of arcPath(id)) {
        const r = Math.hypot(x, y / DOME.squash, z)
        expect(r).toBeGreaterThan(DOME.radius * 0.99)
        expect(r).toBeLessThan(DOME.radius * 1.08)
        expect(y).toBeGreaterThanOrEqual(0)
      }
    }
  })
})

describe('dustMotes', () => {
  it('floats outside the dome, the same for the same seed', () => {
    const motes = dustMotes(200, 3)
    expect(motes).toEqual(dustMotes(200, 3))
    for (const m of motes) expect(Math.hypot(m[0], m[2])).toBeGreaterThan(DOME.radius + 4)
  })
})

describe('themes', () => {
  it('has three: deep space (the default), nebula and aurora planet', () => {
    expect(THEME_IDS).toEqual(['deep', 'nebula', 'aurora'])
    expect(themeFor('nonsense')).toBe(THEMES.deep)
    expect(themeFor(undefined)).toBe(THEMES.deep)
  })

  it('gives each its own sky', () => {
    expect(THEMES.nebula.nebulaOpacity).toBeGreaterThan(THEMES.deep.nebulaOpacity)
    expect(THEMES.aurora.aurora).toBeGreaterThan(THEMES.deep.aurora)
    expect(THEMES.aurora.planet).toBe(true)
    for (const id of THEME_IDS) {
      expect(THEMES[id].label.length).toBeGreaterThan(3)
      expect(THEMES[id].top).toHaveLength(3)
    }
  })
})
