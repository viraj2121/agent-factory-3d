import { describe, expect, it } from 'vitest'
import { SCENERY_LEVELS, sceneryFor, type SceneryParts } from '../src/scenery'
import { DEFAULT_UI, parseUi } from '../src/uiSettings'

const keys = (p: SceneryParts) => Object.keys(p) as (keyof SceneryParts)[]
const on = (p: SceneryParts) => keys(p).filter((k) => p[k])

describe('sceneryFor', () => {
  it('full shows everything', () => {
    expect(on(sceneryFor('full')).length).toBe(keys(sceneryFor('full')).length)
  })

  it('calm drops the crowd of walkers and the busy show, and keeps a few friendly things and the quiet props', () => {
    const c = sceneryFor('calm')
    for (const k of ['wanderers', 'steam', 'dust', 'drone', 'tenders'] as const) expect(c[k], k).toBe(false)
    for (const k of ['couriers', 'machines', 'holograms', 'belt', 'weldShow', 'weather'] as const) expect(c[k], k).toBe(true)
  })

  it('real only has none of the scenery', () => {
    expect(on(sceneryFor('real'))).toEqual([])
  })

  it('every step is quieter than the one before: what calm shows, full shows, and what real shows, calm shows', () => {
    for (const k of keys(sceneryFor('full'))) {
      if (sceneryFor('calm')[k]) expect(sceneryFor('full')[k]).toBe(true)
      if (sceneryFor('real')[k]) expect(sceneryFor('calm')[k]).toBe(true)
    }
  })

  it('an unknown level counts as calm', () => {
    expect(sceneryFor('loud' as never)).toEqual(sceneryFor('calm'))
  })

  it('lists the levels in order from loudest to quietest', () => {
    expect(SCENERY_LEVELS).toEqual(['full', 'calm', 'real'])
  })
})

describe('the scenery choice is a display setting', () => {
  it('defaults to calm', () => {
    expect(DEFAULT_UI.scenery).toBe('calm')
  })
  it('keeps a good value and falls back to the default for a wrong one', () => {
    expect(parseUi({ scenery: 'real' }).scenery).toBe('real')
    expect(parseUi({ scenery: 'wild' }).scenery).toBe('calm')
    expect(parseUi({}).scenery).toBe('calm')
  })
})
