import { SkinnedMesh, type Material, type Object3D, type Skeleton } from 'three'
import { joinGeometries } from './mergeStatic'

const sameMatrix = (a: { elements: number[] }, b: { elements: number[] }) => a.elements.every((v, i) => Math.abs(v - b.elements[i]) < 1e-6)

/**
 * Joins the skinned meshes of one model that share a material and a skeleton into a single mesh, so a
 * robot costs a handful of draw calls instead of one per part. Meshes that sit differently in the model
 * (or whose data does not line up) are left as they are. Changes `root` in place.
 */
export function mergeSkinned(root: Object3D): void {
  root.updateMatrixWorld(true)
  const meshes: SkinnedMesh[] = []
  root.traverse((o) => {
    if ((o as SkinnedMesh).isSkinnedMesh) meshes.push(o as SkinnedMesh)
  })

  const groups = new Map<Material, SkinnedMesh[]>()
  for (const m of meshes) {
    if (Array.isArray(m.material)) continue
    const list = groups.get(m.material) ?? []
    list.push(m)
    groups.set(m.material, list)
  }

  for (const [material, list] of groups) {
    const first = list[0]
    const joinable = list.filter((m) => m.skeleton === first.skeleton && sameMatrix(m.matrixWorld, first.matrixWorld) && sameMatrix(m.bindMatrix, first.bindMatrix))
    if (joinable.length < 2) continue
    const merged = joinGeometries(joinable.map((m) => m.geometry.clone()))
    if (!merged) continue
    const mesh = new SkinnedMesh(merged, material)
    mesh.name = first.name
    mesh.position.copy(first.position)
    mesh.quaternion.copy(first.quaternion)
    mesh.scale.copy(first.scale)
    first.parent?.add(mesh)
    mesh.updateMatrixWorld(true)
    mesh.bind(first.skeleton, first.bindMatrix)
    mesh.frustumCulled = false
    for (const m of joinable) m.removeFromParent()
  }
}

const sameSkeleton = (a: Skeleton, b: Skeleton) =>
  a === b || (a.bones.length === b.bones.length && a.bones.every((bone, i) => bone === b.bones[i]) && a.boneInverses.every((m, i) => sameMatrix(m, b.boneInverses[i])))

/**
 * Makes every skinned mesh of one model that moves on the same bones use one shared skeleton. Cloning a model gives each
 * of its parts a skeleton of its own, and each skeleton recalculates its bones and sends them to the graphics chip every
 * frame, so a robot of five parts did five times the work. Returns how many skeletons it removed.
 */
export function shareSkeleton(root: Object3D): number {
  const owners: SkinnedMesh[] = []
  let removed = 0
  root.traverse((o) => {
    const mesh = o as SkinnedMesh
    if (!mesh.isSkinnedMesh) return
    const owner = owners.find((m) => sameSkeleton(m.skeleton, mesh.skeleton))
    if (!owner) {
      owners.push(mesh)
      return
    }
    if (mesh.skeleton !== owner.skeleton) {
      mesh.skeleton.dispose()
      mesh.bind(owner.skeleton, mesh.bindMatrix)
      removed++
    }
  })
  return removed
}
