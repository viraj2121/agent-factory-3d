import { describe, expect, it } from 'vitest'
import { MODES, classifyRenderer, nextTier, parseMode, settingsFor, shadowsDue, tierFor } from '../src/quality'

describe('settingsFor', () => {
  it('gets cheaper at every step down', () => {
    const high = settingsFor('high')
    const balanced = settingsFor('balanced')
    const fast = settingsFor('fast')
    expect(high.ao).toBe(true)
    expect(balanced.ao).toBe(false)
    expect(fast.ao).toBe(false)
    expect(high.dpr[1]).toBeGreaterThanOrEqual(balanced.dpr[1])
    expect(balanced.dpr[1]).toBeGreaterThanOrEqual(fast.dpr[1])
    expect(fast.dof).toBe(false)
    expect(high.shadowMap).toBeGreaterThanOrEqual(fast.shadowMap)
    expect(fast.shadows).toBe(true)
  })

  it('lite switches off everything heavy, for computers with no graphics card', () => {
    const lite = settingsFor('lite')
    const fast = settingsFor('fast')
    expect(lite.shadows).toBe(false)
    expect(lite.ao).toBe(false)
    expect(lite.dof).toBe(false)
    expect(lite.bloom).toBe(false)
    expect(lite.simple).toBe(true)
    expect(lite.weather).toBe('off')
    expect(lite.dpr[1]).toBeLessThan(fast.dpr[0])
    expect(lite.shadowMap).toBeLessThanOrEqual(fast.shadowMap)
    for (const t of ['high', 'balanced', 'fast'] as const) expect(settingsFor(t).simple).toBe(false)
  })

  it('draws the weather lighter before it drops it', () => {
    expect(settingsFor('high').weather).toBe('full')
    expect(settingsFor('fast').weather).toBe('light')
  })
})

describe('nextTier (automatic stepping down)', () => {
  it('steps down one tier at a time when the frame rate is low', () => {
    expect(nextTier('high', 40)).toBe('balanced')
    expect(nextTier('balanced', 30)).toBe('fast')
    expect(nextTier('fast', 20)).toBe('lite')
  })

  it('stays put when the frame rate is fine, and never goes lower than lite', () => {
    expect(nextTier('high', 58)).toBe('high')
    expect(nextTier('balanced', 50)).toBe('balanced')
    expect(nextTier('fast', 40)).toBe('fast')
    expect(nextTier('lite', 5)).toBe('lite')
  })

  it('never steps back up on its own, so the picture does not flicker', () => {
    expect(nextTier('balanced', 200)).toBe('balanced')
    expect(nextTier('fast', 200)).toBe('fast')
    expect(nextTier('lite', 200)).toBe('lite')
  })

  it('ignores a reading that is not a real number', () => {
    for (const bad of [NaN, Infinity, -1, 0]) expect(nextTier('high', bad)).toBe('high')
  })
})

describe('mode and tier', () => {
  it('reads a saved mode and falls back to auto for anything else', () => {
    for (const m of MODES) expect(parseMode(m)).toBe(m)
    for (const bad of [null, undefined, '', 'ultra', '{}']) expect(parseMode(bad)).toBe('auto')
  })

  it('auto uses the tier it has reached, a fixed mode uses its own', () => {
    expect(tierFor('auto', 'balanced')).toBe('balanced')
    expect(tierFor('fast', 'high')).toBe('fast')
    expect(tierFor('high', 'fast')).toBe('high')
  })
})

describe('classifyRenderer (where to start on a weak graphics chip)', () => {
  it('starts lite when the graphics are drawn by the processor', () => {
    for (const name of [
      'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)',
      'llvmpipe (LLVM 15.0.7, 256 bits)',
      'Microsoft Basic Render Driver',
      'Mesa Software Rasterizer',
    ]) expect(classifyRenderer(name), name).toBe('lite')
  })

  it('starts fast on small built-in Intel chips and phone chips', () => {
    for (const name of [
      'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'ANGLE (Intel, Intel(R) HD Graphics 4000 Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'Intel(R) Iris(R) Xe Graphics',
      'Mali-G78',
      'Adreno (TM) 640',
    ]) expect(classifyRenderer(name), name).toBe('fast')
  })

  it('starts balanced on built-in AMD chips and Intel Arc', () => {
    expect(classifyRenderer('ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe('balanced')
    expect(classifyRenderer('Intel(R) Arc(TM) A370M Graphics')).toBe('balanced')
  })

  it('leaves real graphics cards and unknown names at the top', () => {
    for (const name of [
      'ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'ANGLE (AMD, AMD Radeon RX 6700 XT Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'Apple M2',
      '',
    ]) expect(classifyRenderer(name), name).toBeNull()
    expect(classifyRenderer(null)).toBeNull()
    expect(classifyRenderer(undefined)).toBeNull()
  })
})

describe('shadow refresh rate', () => {
  it('redraws shadows less often as the picture gets cheaper, and every frame where it costs nothing', () => {
    expect(settingsFor('high').shadowEvery).toBeGreaterThanOrEqual(1)
    expect(settingsFor('fast').shadowEvery).toBeGreaterThanOrEqual(settingsFor('balanced').shadowEvery)
    expect(settingsFor('balanced').shadowEvery).toBeGreaterThanOrEqual(settingsFor('high').shadowEvery)
    expect(settingsFor('lite').shadowEvery).toBe(1)
  })

  it('says when a frame must redraw the shadows', () => {
    expect([0, 1, 2, 3, 4, 5].map((f) => shadowsDue(f, 1))).toEqual([true, true, true, true, true, true])
    expect([0, 1, 2, 3, 4, 5].map((f) => shadowsDue(f, 2))).toEqual([true, false, true, false, true, false])
    expect([0, 1, 2, 3, 4, 5].map((f) => shadowsDue(f, 3))).toEqual([true, false, false, true, false, false])
  })

  it('treats a rate that is not sensible as every frame', () => {
    for (const bad of [0, -2, Number.NaN]) expect(shadowsDue(7, bad)).toBe(true)
  })
})
