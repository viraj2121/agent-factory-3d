import { describe, expect, it } from 'vitest'
import { Bone, BoxGeometry, Float32BufferAttribute, Group, MeshStandardMaterial, Skeleton, SkinnedMesh, Uint16BufferAttribute } from 'three'
import { mergeSkinned, shareSkeleton } from '../src/mergeSkinned'

function part(material: MeshStandardMaterial, skeleton: Skeleton, root: Group, x = 0) {
  const g = new BoxGeometry(1, 1, 1)
  g.translate(x, 0, 0)
  const n = g.getAttribute('position').count
  g.setAttribute('skinIndex', new Uint16BufferAttribute(new Uint16Array(n * 4), 4))
  g.setAttribute('skinWeight', new Float32BufferAttribute(Array.from({ length: n * 4 }, (_, i) => (i % 4 === 0 ? 1 : 0)), 4))
  const mesh = new SkinnedMesh(g, material)
  mesh.bind(skeleton)
  root.add(mesh)
  return mesh
}

function robot() {
  const root = new Group()
  const bone = new Bone()
  root.add(bone)
  const skeleton = new Skeleton([bone])
  return { root, skeleton }
}

const count = (root: Group) => {
  let n = 0
  root.traverse((o) => ((o as SkinnedMesh).isSkinnedMesh ? n++ : 0))
  return n
}

describe('mergeSkinned', () => {
  it('joins skinned meshes that share a material into one', () => {
    const { root, skeleton } = robot()
    const a = new MeshStandardMaterial()
    const b = new MeshStandardMaterial()
    part(a, skeleton, root, 0)
    part(a, skeleton, root, 2)
    part(a, skeleton, root, 4)
    part(b, skeleton, root, 6)
    expect(count(root)).toBe(4)
    mergeSkinned(root)
    expect(count(root)).toBe(2)
  })

  it('keeps every vertex and the skeleton', () => {
    const { root, skeleton } = robot()
    const a = new MeshStandardMaterial()
    part(a, skeleton, root, 0)
    part(a, skeleton, root, 2)
    mergeSkinned(root)
    let merged: SkinnedMesh | undefined
    root.traverse((o) => ((o as SkinnedMesh).isSkinnedMesh ? (merged = o as SkinnedMesh) : 0))
    expect(merged!.geometry.getAttribute('position').count).toBe(48)
    expect(merged!.geometry.getAttribute('skinIndex').count).toBe(48)
    expect(merged!.skeleton).toBe(skeleton)
    expect(merged!.material).toBe(a)
  })

  it('leaves meshes alone when their positions in the model differ', () => {
    const { root, skeleton } = robot()
    const a = new MeshStandardMaterial()
    part(a, skeleton, root, 0)
    const moved = part(a, skeleton, root, 2)
    moved.position.set(0, 5, 0)
    moved.updateMatrixWorld(true)
    moved.bind(skeleton)
    mergeSkinned(root)
    expect(count(root)).toBe(2)
  })

  it('does nothing to a model with no skinned meshes', () => {
    const root = new Group()
    expect(() => mergeSkinned(root)).not.toThrow()
    expect(count(root)).toBe(0)
  })
})

describe('shareSkeleton', () => {
  /** Parts that each carry their own copy of a skeleton over the same bones, as a cloned model does. */
  function cloned(parts: number) {
    const root = new Group()
    const bone = new Bone()
    root.add(bone)
    const meshes = Array.from({ length: parts }, (_, i) => part(new MeshStandardMaterial(), new Skeleton([bone]), root, i * 2))
    return { root, bone, meshes }
  }

  it('makes the parts of one model use one skeleton and says how many it removed', () => {
    const { root, meshes } = cloned(5)
    expect(new Set(meshes.map((m) => m.skeleton)).size).toBe(5)
    expect(shareSkeleton(root)).toBe(4)
    expect(new Set(meshes.map((m) => m.skeleton)).size).toBe(1)
  })

  it('keeps every part where it was in the bind pose', () => {
    const { root, meshes } = cloned(3)
    const before = meshes.map((m) => m.bindMatrix.clone())
    shareSkeleton(root)
    meshes.forEach((m, i) => expect(m.bindMatrix.equals(before[i])).toBe(true))
  })

  it('leaves parts that move on different bones with their own skeletons', () => {
    const { root, meshes } = cloned(2)
    const other = new Bone()
    root.add(other)
    const stranger = part(new MeshStandardMaterial(), new Skeleton([other]), root, 9)
    expect(shareSkeleton(root)).toBe(1)
    expect(stranger.skeleton).not.toBe(meshes[0].skeleton)
    expect(meshes[1].skeleton).toBe(meshes[0].skeleton)
  })

  it('does nothing to a model that already shares one skeleton, or has none', () => {
    const { root, skeleton } = robot()
    part(new MeshStandardMaterial(), skeleton, root, 0)
    part(new MeshStandardMaterial(), skeleton, root, 2)
    expect(shareSkeleton(root)).toBe(0)
    expect(shareSkeleton(new Group())).toBe(0)
  })
})
