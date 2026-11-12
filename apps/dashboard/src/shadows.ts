import type { BufferGeometry, Material, Object3D } from 'three'

/** Parts smaller than this (radius, in metres) are not worth a shadow of their own. */
export const MIN_SHADOW_RADIUS = 0.1

interface MeshLike {
  isMesh?: boolean
  geometry?: BufferGeometry
  material?: Material | Material[]
  scale?: { x: number; y: number; z: number }
}

/**
 * Turns on shadow casting and receiving for the meshes under `root` that can use it. Glass and other see-through parts
 * are left out, and so are glowing strips and rings drawn without lighting (they ignore shadows anyway). Parts too small
 * to make a visible shadow still receive shadows but no longer cast them: every caster is drawn again for the shadow
 * map, so small ones cost more than they give.
 */
export function enableShadows(root: Object3D, minRadius = MIN_SHADOW_RADIUS) {
  root.traverse((o) => {
    const mesh = o as unknown as MeshLike
    if (!mesh.isMesh) return
    const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []
    const transparent = materials.some((m) => m.transparent === true)
    const unlit = materials.length > 0 && materials.every((m) => (m as { isMeshBasicMaterial?: boolean }).isMeshBasicMaterial === true)
    const geometry = mesh.geometry
    if (geometry && !geometry.boundingSphere) geometry.computeBoundingSphere()
    const size = (geometry?.boundingSphere?.radius ?? 1) * Math.max(Math.abs(mesh.scale?.x ?? 1), Math.abs(mesh.scale?.y ?? 1), Math.abs(mesh.scale?.z ?? 1))
    o.receiveShadow = !transparent && !unlit
    o.castShadow = !transparent && !unlit && size >= minRadius
  })
}
