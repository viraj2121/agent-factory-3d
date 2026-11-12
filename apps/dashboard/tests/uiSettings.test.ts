import { describe, expect, it } from 'vitest'
import { DEFAULT_UI, createUiStore, labelsFor, parseUi, reducedMotion, toDisplay } from '../src/uiSettings'

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    data,
  }
}

describe('parseUi', () => {
  it('gives the defaults for nothing or garbage', () => {
    for (const bad of [undefined, null, 'x', 5, [], {}]) expect(parseUi(bad)).toEqual(DEFAULT_UI)
  })

  it('keeps valid values and replaces wrong ones by the default, one by one', () => {
    expect(parseUi({ quality: 'lite', showFps: false, labels: 'names', glassBlur: false, motion: 'reduced', tourSeconds: 60, theme: 'nebula', spaceWeather: false, railOpen: false })).toEqual({
      quality: 'lite',
      showFps: false,
      labels: 'names',
      glassBlur: false,
      motion: 'reduced',
      tourSeconds: 60,
      theme: 'nebula',
      spaceWeather: false,
      railOpen: false,
      scenery: 'calm',
    })
    expect(parseUi({ quality: 'ultra', showFps: 'yes', labels: 'some', tourSeconds: 45, theme: 'rainy', spaceWeather: 1, railOpen: 'x' })).toEqual(DEFAULT_UI)
  })

  it('starts in deep space, with space weather on and the project rail open', () => {
    expect(DEFAULT_UI).toMatchObject({ theme: 'deep', spaceWeather: true, railOpen: true })
  })

  it('accepts 0 for the tour (off)', () => {
    expect(parseUi({ tourSeconds: 0 }).tourSeconds).toBe(0)
  })
})

describe('toDisplay', () => {
  it('is what the service keeps in the settings file, and reads back the same', () => {
    const ui = { ...DEFAULT_UI, quality: 'high' as const, tourSeconds: 15 }
    expect(parseUi(toDisplay(ui))).toEqual(ui)
    expect(Object.values(toDisplay(ui)).every((v) => ['string', 'number', 'boolean'].includes(typeof v))).toBe(true)
  })
})

describe('createUiStore', () => {
  it('starts from what this browser saved', () => {
    const storage = memoryStorage({ 'hub-settings': JSON.stringify({ quality: 'fast', labels: 'none' }) })
    const store = createUiStore(storage)
    expect(store.get()).toMatchObject({ quality: 'fast', labels: 'none' })
  })

  it('takes over the choices saved by older versions (quality and tour) when there are no settings yet', () => {
    const store = createUiStore(memoryStorage({ 'hub-quality': 'balanced', 'hub-tour': 'off' }))
    expect(store.get()).toMatchObject({ quality: 'balanced', tourSeconds: 0 })
  })

  it('saves every change, tells listeners, and ignores a change that changes nothing', () => {
    const storage = memoryStorage()
    const store = createUiStore(storage)
    let calls = 0
    const stop = store.subscribe(() => calls++)
    store.set({ showFps: false })
    store.set({ showFps: false })
    expect(calls).toBe(1)
    expect(JSON.parse(storage.data.get('hub-settings') ?? '{}').showFps).toBe(false)
    stop()
    store.set({ showFps: true })
    expect(calls).toBe(1)
  })

  it('a wrong value in a change is ignored, the rest applies', () => {
    const store = createUiStore(memoryStorage())
    store.set({ quality: 'ultra' as never, labels: 'names' })
    expect(store.get()).toMatchObject({ quality: DEFAULT_UI.quality, labels: 'names' })
  })

  it('replace() takes all settings at once (from the settings file) without saving garbage', () => {
    const store = createUiStore(memoryStorage())
    store.replace({ quality: 'lite', nonsense: 1 })
    expect(store.get()).toEqual({ ...DEFAULT_UI, quality: 'lite' })
  })

  it('works when the browser does not allow saving', () => {
    const broken = { getItem: () => { throw new Error('no') }, setItem: () => { throw new Error('no') } }
    const store = createUiStore(broken)
    store.set({ labels: 'none' })
    expect(store.get().labels).toBe('none')
  })
})

describe('labelsFor and reducedMotion', () => {
  it('all: bubbles far away, names up close; names: only names up close; none: nothing', () => {
    expect(labelsFor('all', false)).toEqual({ bubbles: true, names: false, islands: true })
    expect(labelsFor('all', true)).toEqual({ bubbles: false, names: true, islands: false })
    expect(labelsFor('names', false)).toEqual({ bubbles: false, names: false, islands: true })
    expect(labelsFor('names', true)).toEqual({ bubbles: false, names: true, islands: false })
    expect(labelsFor('none', false)).toEqual({ bubbles: false, names: false, islands: false })
  })

  it('follows the system unless set by hand', () => {
    expect(reducedMotion('system', true)).toBe(true)
    expect(reducedMotion('system', false)).toBe(false)
    expect(reducedMotion('reduced', false)).toBe(true)
    expect(reducedMotion('full', true)).toBe(false)
  })
})
