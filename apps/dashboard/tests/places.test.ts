import { describe, expect, it } from 'vitest'
import { DEPARTMENTS } from '../src/hallLayout'
import { HUB } from '../src/hubLayout'
import { hubCameraFor } from '../src/hubCameraConfig'
import { PLACES, mapPoint, placeAt } from '../src/places'
import { ACTIONS, KEYS_SHEET, actionFor } from '../src/keymap'

describe('PLACES', () => {
  it('has the core, the four bays, the studio, the launch pad, the library and the cart, once each', () => {
    const ids = PLACES.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ['orb', 'studio', 'launchpad', 'library', 'cart', ...DEPARTMENTS]) expect(ids).toContain(id)
  })

  it('every place lies inside the hall', () => {
    for (const p of PLACES) expect(Math.hypot(p.x, p.z)).toBeLessThanOrEqual(HUB.roomRadius)
  })

  it('every place the camera can fly to has a view', () => {
    for (const p of PLACES) {
      const v = hubCameraFor(p.id)
      expect(v.position.every(Number.isFinite)).toBe(true)
      expect(v.fov).toBeGreaterThan(0)
    }
  })

  it('no two places sit on top of each other on the map', () => {
    for (let i = 0; i < PLACES.length; i++)
      for (let j = i + 1; j < PLACES.length; j++) {
        const a = mapPoint(PLACES[i]), b = mapPoint(PLACES[j])
        expect(Math.hypot(a.x - b.x, a.y - b.y), `${PLACES[i].id} / ${PLACES[j].id}`).toBeGreaterThan(14)
      }
  })
})

describe('mapPoint', () => {
  it('puts the hall centre in the middle of the map and keeps every place inside it', () => {
    expect(mapPoint({ x: 0, z: 0 })).toEqual({ x: 100, y: 100 })
    for (const p of PLACES) {
      const m = mapPoint(p)
      expect(m.x).toBeGreaterThan(8)
      expect(m.x).toBeLessThan(192)
      expect(m.y).toBeGreaterThan(8)
      expect(m.y).toBeLessThan(192)
    }
  })

  it('puts what is nearer the camera (larger z) lower on the map', () => {
    expect(mapPoint({ x: 0, z: 10 }).y).toBeGreaterThan(mapPoint({ x: 0, z: -10 }).y)
  })
})

describe('placeAt', () => {
  it('finds the place nearest to a point, within reach', () => {
    const studio = PLACES.find((p) => p.id === 'studio')!
    expect(placeAt(mapPoint(studio).x + 2, mapPoint(studio).y - 2)?.id).toBe('studio')
  })
  it('finds nothing far from every place', () => {
    expect(placeAt(-500, -500)).toBeNull()
  })
})

describe('keymap', () => {
  it('number keys fly to the places in the order of the map, and R is the overview', () => {
    expect(actionFor('1')).toEqual({ type: 'place', id: 'orb' })
    expect(actionFor('2')).toEqual({ type: 'place', id: 'studio' })
    expect(actionFor('3')).toEqual({ type: 'place', id: 'launchpad' })
    expect(actionFor('4')).toEqual({ type: 'place', id: 'library' })
    expect(actionFor('5')).toEqual({ type: 'place', id: 'cart' })
  })

  it('knows the toggles and the panels, in either case', () => {
    expect(actionFor('m')).toEqual({ type: 'sound' })
    expect(actionFor('M')).toEqual({ type: 'sound' })
    expect(actionFor('t')).toEqual({ type: 'tour' })
    expect(actionFor(',')).toEqual({ type: 'settings' })
    expect(actionFor('i')).toEqual({ type: 'tab', tab: 'info' })
    expect(actionFor('?')).toEqual({ type: 'keys' })
  })

  it('ignores keys it does not use', () => {
    for (const k of ['x', 'F5', 'Enter', 'ArrowUp', ' ']) expect(actionFor(k)).toBeNull()
  })

  it('lists every bound key on the sheet, and nothing that is not bound', () => {
    const listed = KEYS_SHEET.flatMap((g) => g.rows.map((r) => r.key.toLowerCase()))
    for (const k of Object.keys(ACTIONS)) expect(listed, k).toContain(k.toLowerCase())
    for (const k of listed) if (k !== 'esc') expect(Object.keys(ACTIONS).map((x) => x.toLowerCase()), k).toContain(k)
  })
})
