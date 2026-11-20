import { describe, expect, it } from 'vitest'
import { dockPlace, FADE_AFTER_MS, FADED, opacityFor, orbitPick, orbitSpot, ALERT_HOLD_MS, TAB } from '../src/widget/orbit'
import type { WidgetRow, WidgetState } from '../src/widgetRows'

const row = (key: string, state: WidgetState, sinceMin: number | null = 0): WidgetRow =>
  ({ key, state, sinceMs: sinceMin === null ? null : sinceMin * 60_000, entry: { agent: 'claude-code', name: key } } as never)

describe('orbitSpot', () => {
  it('puts agents that need you on the inner ring, working ones in the middle, resting ones outside', () => {
    const w = orbitSpot(row('a', 'wait', 1)), r = orbitSpot(row('b', 'run')), s = orbitSpot(row('c', 'rest', 30))
    expect(w.radius).toBeLessThan(r.radius)
    expect(r.radius).toBeLessThan(s.radius)
    expect(s.radius).toBeLessThanOrEqual(1)
  })
  it('pulls a waiting agent closer the longer it waits, up to 15 minutes', () => {
    const r1 = orbitSpot(row('a', 'wait', 1)).radius, r10 = orbitSpot(row('a', 'wait', 10)).radius
    expect(r10).toBeLessThan(r1)
    expect(orbitSpot(row('a', 'wait', 60)).radius).toBe(orbitSpot(row('a', 'wait', 15)).radius)
    expect(orbitSpot(row('a', 'wait', 60)).radius).toBeGreaterThan(0.15) // never on top of you
    expect(orbitSpot(row('a', 'wait', null)).radius).toBe(orbitSpot(row('a', 'wait', 0)).radius)
  })
  it('circles working agents fast, resting ones slowly, and holds waiting ones still', () => {
    expect(orbitSpot(row('a', 'wait')).speed).toBe(0)
    expect(orbitSpot(row('b', 'run')).speed).toBeGreaterThan(orbitSpot(row('c', 'rest')).speed * 4)
  })
  it('gives each agent its own starting place, the same every time', () => {
    expect(orbitSpot(row('p:1', 'run')).phase).toBe(orbitSpot(row('p:1', 'run')).phase)
    expect(orbitSpot(row('p:1', 'run')).phase).not.toBe(orbitSpot(row('p:2', 'run')).phase)
    const ph = orbitSpot(row('p:3', 'run')).phase
    expect(ph).toBeGreaterThanOrEqual(0)
    expect(ph).toBeLessThan(Math.PI * 2)
  })
})

describe('orbitPick', () => {
  it('keeps every agent that waits or works and fills the rest of the sky with the newest resting ones', () => {
    const rows = [row('w', 'wait'), row('r1', 'run'), row('r2', 'run'), ...Array.from({ length: 20 }, (_, i) => row('s' + i, 'rest', i))]
    const picked = orbitPick(rows, 8)
    expect(picked.map((r) => r.key)).toEqual(['w', 'r1', 'r2', 's0', 's1', 's2', 's3', 's4'])
  })
  it('never drops a waiting agent, even past the limit', () => {
    const rows = Array.from({ length: 12 }, (_, i) => row('w' + i, 'wait'))
    expect(orbitPick(rows, 8)).toHaveLength(12)
  })
})

describe('opacityFor', () => {
  it('stays solid while the mouse is on it or was there a moment ago', () => {
    expect(opacityFor({ hovered: true, sinceTouchMs: 60_000, sinceAlertMs: Infinity, enabled: true })).toBe(100)
    expect(opacityFor({ hovered: false, sinceTouchMs: FADE_AFTER_MS - 1, sinceAlertMs: Infinity, enabled: true })).toBe(100)
  })
  it('fades when left alone', () => {
    expect(opacityFor({ hovered: false, sinceTouchMs: FADE_AFTER_MS, sinceAlertMs: Infinity, enabled: true })).toBe(FADED)
    expect(FADED).toBeGreaterThanOrEqual(15) // the service refuses anything fainter
  })
  it('comes back for a while when an agent starts waiting for you', () => {
    expect(opacityFor({ hovered: false, sinceTouchMs: 60_000, sinceAlertMs: 1000, enabled: true })).toBe(100)
    expect(opacityFor({ hovered: false, sinceTouchMs: 60_000, sinceAlertMs: ALERT_HOLD_MS, enabled: true })).toBe(FADED)
  })
  it('never fades when fading is switched off', () => {
    expect(opacityFor({ hovered: false, sinceTouchMs: 60_000, sinceAlertMs: Infinity, enabled: false })).toBe(100)
  })
})

describe('dockPlace', () => {
  const screen = { left: 0, top: 0, width: 1920, height: 1040 }
  it('leaves only the tab in view at the right edge, in the middle of the height', () => {
    const p = dockPlace(screen, 520)
    expect(p.x).toBe(1920 - TAB.width)
    expect(p.height).toBe(TAB.height)
    expect(p.y).toBe(Math.round((1040 - TAB.height) / 2))
    expect(p.width).toBe(520) // Edge keeps app windows wide, so the rest of the window waits off screen
  })
  it('works on a second screen and on a screen with the taskbar on top', () => {
    const p = dockPlace({ left: 1920, top: 48, width: 1280, height: 976 }, 400)
    expect(p.x).toBe(1920 + 1280 - TAB.width)
    expect(p.y).toBe(48 + Math.round((976 - TAB.height) / 2))
  })
  it('never makes the window narrower than the tab', () => {
    expect(dockPlace(screen, 0).width).toBeGreaterThanOrEqual(TAB.width)
  })
})
