import { describe, expect, it } from 'vitest'
import { BufferGeometry, CylinderGeometry, Float32BufferAttribute, RingGeometry } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { PARAPET, parapetGeometry, postAngles } from '../src/parapet'
import { keepLow } from '../src/shellCut'
import { domeStrength, DOME } from '../src/dome'
import { HUB } from '../src/hubLayout'

function triangles(g: BufferGeometry) {
  const pos = g.getAttribute('position')
  const nrm = g.getAttribute('normal')
  const index = g.index
  const count = (index ? index.count : pos.count) / 3
  const at = (i: number) => (index ? index.getX(i) : i)
  return { pos, nrm, count, at }
}

describe('parapet', () => {
  it('is a low, thick ring just inside the old wall, lower than a person', () => {
    expect(PARAPET.height).toBeGreaterThan(0.8)
    expect(PARAPET.height).toBeLessThan(1.6)
    expect(PARAPET.outer - PARAPET.inner).toBeGreaterThanOrEqual(0.35)
    expect(PARAPET.outer).toBeLessThanOrEqual(HUB.roomRadius + 0.2)
    expect(PARAPET.inner).toBeGreaterThan(14.7)
  })

  it('has every face turned the right way: outer outward, top up, inner inward', () => {
    const g = parapetGeometry()
    const { pos, nrm, count, at } = triangles(g)
    for (let t = 0; t < count; t++) {
      const [a, b, c] = [at(t * 3), at(t * 3 + 1), at(t * 3 + 2)]
      const p = (i: number) => [pos.getX(i), pos.getY(i), pos.getZ(i)]
      const [pa, pb, pc] = [p(a), p(b), p(c)]
      const u = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]]
      const v = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]]
      const face = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
      const n = [nrm.getX(a), nrm.getY(a), nrm.getZ(a)]
      expect(face[0] * n[0] + face[1] * n[1] + face[2] * n[2]).toBeGreaterThan(0)
      const r = Math.hypot(pa[0], pa[2])
      const flat = Math.abs(pa[1] - PARAPET.height) < 1e-6 && Math.abs(pb[1] - PARAPET.height) < 1e-6 && Math.abs(pc[1] - PARAPET.height) < 1e-6
      if (flat) expect(n[1]).toBeGreaterThan(0.99)
      else if (Math.abs(r - PARAPET.outer) < 1e-4) expect(n[0] * pa[0] + n[2] * pa[2]).toBeGreaterThan(0)
      else if (Math.abs(r - PARAPET.inner) < 1e-4) expect(n[0] * pa[0] + n[2] * pa[2]).toBeLessThan(0)
    }
  })

  it('stays between the floor and its height, inside its two radii', () => {
    const pos = parapetGeometry().getAttribute('position')
    for (let i = 0; i < pos.count; i++) {
      const r = Math.hypot(pos.getX(i), pos.getZ(i))
      expect(r).toBeGreaterThanOrEqual(PARAPET.inner - 1e-4)
      expect(r).toBeLessThanOrEqual(PARAPET.outer + 1e-4)
      expect(pos.getY(i)).toBeGreaterThanOrEqual(0)
      expect(pos.getY(i)).toBeLessThanOrEqual(PARAPET.height + 1e-6)
    }
  })

  it('puts its light posts evenly round the ring', () => {
    const a = postAngles()
    expect(a).toHaveLength(PARAPET.posts)
    const step = (Math.PI * 2) / PARAPET.posts
    for (let i = 1; i < a.length; i++) expect(a[i] - a[i - 1]).toBeCloseTo(step, 6)
  })
})

describe('keepLow', () => {
  const hall = () => {
    const floor = new RingGeometry(3, 15, 32).rotateX(-Math.PI / 2)
    const wall = new CylinderGeometry(15, 15, 9, 32, 1, true).translate(0, 4.5, 0)
    return mergeGeometries([floor.toNonIndexed(), wall.toNonIndexed()])
  }

  it('drops the tall wall and keeps the floor', () => {
    const g = hall()
    const out = keepLow(g, 0, 0.6)
    expect(triangles(out).count).toBe(triangles(new RingGeometry(3, 15, 32)).count)
    const pos = out.getAttribute('position')
    const index = out.index!
    for (let i = 0; i < index.count; i++) expect(pos.getY(index.getX(i))).toBeLessThanOrEqual(0.6)
  })

  it('counts the mesh offset when judging height', () => {
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute([0, -8.5, 0, 1, -8.5, 0, 0, -8.5, 1], 3))
    expect(triangles(keepLow(g, 8.85, 0.6)).count).toBe(1)
    expect(triangles(keepLow(g, 9.5, 0.6)).count).toBe(0)
  })

  it('does not change the geometry it is given', () => {
    const g = hall()
    const before = triangles(g).count
    keepLow(g, 0, 0.6)
    expect(triangles(g).count).toBe(before)
  })
})

describe('domeStrength', () => {
  it('is gone when the camera is inside the hall and full from far away', () => {
    expect(domeStrength(10)).toBe(0)
    expect(domeStrength(DOME.near)).toBe(0)
    expect(domeStrength(DOME.far)).toBe(1)
    expect(domeStrength(500)).toBe(1)
  })

  it('grows smoothly with distance and scales with the dome size', () => {
    let last = -1
    for (let d = DOME.near; d <= DOME.far; d += 2) {
      const s = domeStrength(d)
      expect(s).toBeGreaterThanOrEqual(last)
      last = s
    }
    expect(domeStrength(DOME.near * 0.5 + (DOME.far * 0.5 - DOME.near * 0.5) / 2, 0.5)).toBeCloseTo(0.5, 5)
  })

  it('stays within 0 to 1 for any distance, including bad numbers', () => {
    for (const d of [-5, 0, NaN, Infinity, 1e9]) {
      const s = domeStrength(d)
      expect(s).toBeGreaterThanOrEqual(0)
      expect(s).toBeLessThanOrEqual(1)
    }
  })
})
