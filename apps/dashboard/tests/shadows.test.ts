import { describe, expect, it } from 'vitest'
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, SphereGeometry } from 'three'
import { MIN_SHADOW_RADIUS, enableShadows } from '../src/shadows'

const solid = (radius: number) => new Mesh(new SphereGeometry(radius), new MeshStandardMaterial())

describe('enableShadows', () => {
  it('lets ordinary solid parts cast and receive shadows', () => {
    const root = new Group()
    const part = solid(0.5)
    root.add(part)
    enableShadows(root)
    expect(part.castShadow).toBe(true)
    expect(part.receiveShadow).toBe(true)
  })

  it('leaves out see-through parts altogether', () => {
    const root = new Group()
    const glass = new Mesh(new SphereGeometry(0.5), new MeshStandardMaterial({ transparent: true, opacity: 0.3 }))
    root.add(glass)
    enableShadows(root)
    expect(glass.castShadow).toBe(false)
    expect(glass.receiveShadow).toBe(false)
  })

  it('leaves out glowing parts drawn without lighting, which ignore shadows anyway', () => {
    const root = new Group()
    const strip = new Mesh(new BoxGeometry(2, 0.02, 0.1), new MeshBasicMaterial())
    root.add(strip)
    enableShadows(root)
    expect(strip.castShadow).toBe(false)
    expect(strip.receiveShadow).toBe(false)
  })

  it('stops tiny parts casting shadows but lets them receive them', () => {
    const root = new Group()
    const bolt = solid(MIN_SHADOW_RADIUS / 4)
    const knob = solid(MIN_SHADOW_RADIUS * 1.5)
    root.add(bolt, knob)
    enableShadows(root)
    expect(bolt.castShadow).toBe(false)
    expect(bolt.receiveShadow).toBe(true)
    expect(knob.castShadow).toBe(true)
  })

  it('counts the size a part is drawn at, so a small part scaled up still casts', () => {
    const root = new Group()
    const scaled = solid(MIN_SHADOW_RADIUS / 2)
    scaled.scale.setScalar(4)
    root.add(scaled)
    enableShadows(root)
    expect(scaled.castShadow).toBe(true)
  })

  it('does nothing to things that are not meshes', () => {
    const root = new Group()
    expect(() => enableShadows(root)).not.toThrow()
    expect(root.castShadow).toBe(false)
  })
})
