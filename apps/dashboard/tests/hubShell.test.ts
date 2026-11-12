import { describe, expect, it } from 'vitest'
import { HUB, HUB_LAYOUT } from '../src/hubLayout'
import { bytes, readGlb } from './glbReader'

describe('hub-shell.glb', () => {
  const nodes = () => readGlb('hub-shell.glb').nodes ?? []

  it('has an anchor for every bay at the layout position', () => {
    for (const bay of HUB_LAYOUT.bays) {
      const anchor = nodes().find((n) => n.name === `Anchor_${bay.id}`)
      expect(anchor, `Anchor_${bay.id}`).toBeDefined()
      const t = anchor!.translation ?? [0, 0, 0]
      bay.position.forEach((v, i) => expect(Math.abs(t[i] - v)).toBeLessThan(0.01))
    }
  })

  it('has a core anchor at the core centre', () => {
    const anchor = nodes().find((n) => n.name === 'Anchor_core')
    expect(anchor).toBeDefined()
    const t = anchor!.translation ?? [0, 0, 0]
    HUB.coreCenter.forEach((v, i) => expect(Math.abs(t[i] - v)).toBeLessThan(0.01))
  })

  it('is single-sided so the camera can look in through the walls and ceiling', () => {
    const materials = readGlb('hub-shell.glb').materials ?? []
    expect(materials.length).toBeGreaterThan(0)
    for (const m of materials) expect(m.doubleSided, m.name).not.toBe(true)
  })

  it('stays under 8 MB', () => {
    expect(bytes('hub-shell.glb')).toBeLessThan(8_000_000)
  })
})
