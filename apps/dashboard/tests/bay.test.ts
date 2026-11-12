import { describe, expect, it } from 'vitest'
import { DEPARTMENTS } from '../src/hallLayout'
import { HUB_LAYOUT } from '../src/hubLayout'
import { bytes, readGlb } from './glbReader'

const nodes = () => readGlb('bay.glb').nodes ?? []
const names = () => nodes().map((n) => n.name)

describe('bay.glb', () => {
  it('has three seats at the layout seat positions', () => {
    HUB_LAYOUT.bays[0].seats.forEach((seat, i) => {
      const node = nodes().find((n) => n.name === `Seat_${i}`)
      expect(node, `Seat_${i}`).toBeDefined()
      const t = node!.translation ?? [0, 0, 0]
      seat.forEach((v, k) => expect(Math.abs(t[k] - v)).toBeLessThan(0.01))
    })
  })

  it('has a sign and a props group for every department', () => {
    for (const d of DEPARTMENTS) {
      expect(names()).toContain(`Sign_${d}`)
      expect(names()).toContain(`Props_${d}`)
    }
  })

  it('has at least three merged props in every group', () => {
    for (const d of DEPARTMENTS) {
      const group = nodes().find((n) => n.name === `Props_${d}`)
      expect(group?.children?.length ?? 0, `Props_${d}`).toBeGreaterThanOrEqual(3)
    }
  })

  it('has a desk and a back partition but no glass', () => {
    expect(names()).toContain('Desk')
    expect(names()).toContain('Bay_Partition')
    expect(names().filter((n) => n?.includes('Glass'))).toEqual([])
  })

  it('stays under 3 MB', () => {
    expect(bytes('bay.glb')).toBeLessThan(3_000_000)
  })
})
