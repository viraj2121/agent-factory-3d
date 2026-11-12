import { describe, expect, it } from 'vitest'
import { BoxGeometry, Group, InstancedMesh, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, SphereGeometry } from 'three'
import { mergeStaticByLook } from '../src/mergeStatic'

const meshes = (root: Group) => {
  const out: Mesh[] = []
  root.traverse((o) => ((o as Mesh).isMesh ? out.push(o as Mesh) : 0))
  return out
}

describe('mergeStaticByLook', () => {
  it('joins meshes with the same look, even when their material objects differ', () => {
    const root = new Group()
    for (let i = 0; i < 4; i++) {
      const m = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ color: '#336699', metalness: 0.5 }))
      m.position.x = i * 3
      root.add(m)
    }
    mergeStaticByLook(root)
    expect(meshes(root)).toHaveLength(1)
    expect(meshes(root)[0].geometry.getAttribute('position').count).toBe(4 * 24)
  })

  it('keeps meshes with different looks apart', () => {
    const root = new Group()
    root.add(new Mesh(new BoxGeometry(), new MeshStandardMaterial({ color: '#ff0000' })))
    root.add(new Mesh(new BoxGeometry(), new MeshStandardMaterial({ color: '#00ff00' })))
    root.add(new Mesh(new BoxGeometry(), new MeshBasicMaterial({ color: '#ff0000' })))
    mergeStaticByLook(root)
    expect(meshes(root)).toHaveLength(3)
  })

  it('keeps every piece where it was, including pieces inside moved child groups', () => {
    const root = new Group()
    const holder = new Group()
    holder.position.set(10, 0, 0)
    holder.rotation.y = Math.PI / 2
    const a = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ color: '#abcdef' }))
    a.position.set(0, 0, 2)
    holder.add(a)
    const b = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ color: '#abcdef' }))
    b.position.set(-5, 0, 0)
    root.add(holder, b)
    mergeStaticByLook(root)
    const [merged] = meshes(root)
    const p = merged.geometry.getAttribute('position')
    const xs = Array.from({ length: p.count }, (_, i) => p.getX(i))
    // a ends at x = 10 + 2 (rotated a quarter turn), b stays at x = -5
    expect(Math.max(...xs)).toBeCloseTo(12.5, 3)
    expect(Math.min(...xs)).toBeCloseTo(-5.5, 3)
  })

  it('mixes indexed and non-indexed geometry without failing', () => {
    const root = new Group()
    const mat = () => new MeshStandardMaterial({ color: '#123456' })
    root.add(new Mesh(new BoxGeometry(), mat()), new Mesh(new SphereGeometry(1, 8, 6).toNonIndexed(), mat()))
    expect(() => mergeStaticByLook(root)).not.toThrow()
    expect(meshes(root)).toHaveLength(1)
  })

  it('leaves instanced meshes, hidden meshes and meshes marked as moving alone', () => {
    const root = new Group()
    root.add(new InstancedMesh(new BoxGeometry(), new MeshStandardMaterial({ color: '#111111' }), 3))
    const hidden = new Mesh(new PlaneGeometry(), new MeshStandardMaterial({ color: '#111111' }))
    hidden.visible = false
    root.add(hidden)
    const moving = new Mesh(new PlaneGeometry(), new MeshStandardMaterial({ color: '#111111' }))
    moving.userData.moving = true
    root.add(moving)
    root.add(new Mesh(new PlaneGeometry(), new MeshStandardMaterial({ color: '#111111' })))
    mergeStaticByLook(root)
    expect(meshes(root)).toHaveLength(4)
  })

  it('does nothing to an empty group', () => {
    expect(() => mergeStaticByLook(new Group())).not.toThrow()
  })
})
