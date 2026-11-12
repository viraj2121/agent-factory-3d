import { BufferGeometry, Matrix4, Mesh, type Material, type Object3D } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

type Look = Material & Partial<Record<'color' | 'emissive', { getHex(): number }>> & Partial<Record<'map' | 'emissiveMap', { uuid: string } | null>> & Record<string, unknown>

/** Two materials with the same signature draw the same, so their meshes can be joined. */
function lookOf(material: Material): string {
  const m = material as Look
  return [
    m.type, m.color?.getHex(), m.emissive?.getHex(), m.emissiveIntensity, m.metalness, m.roughness, m.opacity, m.transparent,
    m.side, m.blending, m.depthWrite, m.depthTest, m.wireframe, m.toneMapped, m.map?.uuid, m.emissiveMap?.uuid,
  ].join('|')
}

/**
 * Joins geometries into one. Only attributes every piece has are kept, and all pieces must be indexed or
 * none (indexed ones are expanded). Pieces are consumed: pass clones.
 */
export function joinGeometries(geos: BufferGeometry[]): BufferGeometry | null {
  if (!geos.length) return null
  const common = Object.keys(geos[0].attributes).filter((name) => geos.every((g) => g.getAttribute(name)))
  const allIndexed = geos.every((g) => g.index)
  const ready = geos.map((g) => {
    for (const name of Object.keys(g.attributes)) if (!common.includes(name)) g.deleteAttribute(name)
    g.morphAttributes = {}
    return allIndexed || !g.index ? g : g.toNonIndexed()
  })
  return mergeGeometries(ready)
}

const joinable = (o: Object3D): o is Mesh => {
  const m = o as Mesh & { isInstancedMesh?: boolean; isSkinnedMesh?: boolean }
  return m.isMesh === true && !m.isInstancedMesh && !m.isSkinnedMesh && !Array.isArray(m.material) && m.visible && !m.userData.moving
}

/**
 * Joins the still meshes under `root` that look the same into one mesh each, keeping every piece where it
 * is. Meshes that are hidden, instanced, skinned or marked `userData.moving` are left alone. Use it on
 * groups of props that never change, to cut draw calls. Changes `root` in place.
 */
export function mergeStaticByLook(root: Object3D): void {
  root.updateMatrixWorld(true)
  const inverse = new Matrix4().copy(root.matrixWorld).invert()
  const groups = new Map<string, Mesh[]>()
  root.traverse((o) => {
    if (!joinable(o)) return
    const key = lookOf(o.material as Material)
    const list = groups.get(key) ?? []
    list.push(o)
    groups.set(key, list)
  })

  for (const list of groups.values()) {
    if (list.length < 2) continue
    const geos = list.map((mesh) => {
      const g = mesh.geometry.clone()
      g.applyMatrix4(new Matrix4().multiplyMatrices(inverse, mesh.matrixWorld))
      return g
    })
    const merged = joinGeometries(geos)
    if (!merged) continue
    const first = list[0]
    const joined = new Mesh(merged, first.material)
    joined.castShadow = first.castShadow
    joined.receiveShadow = first.receiveShadow
    root.add(joined)
    for (const mesh of list) mesh.removeFromParent()
  }
}
