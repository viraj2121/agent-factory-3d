import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Billboard } from '@react-three/drei'
import { Euler, Quaternion, Vector3, type Mesh, type ShaderMaterial } from 'three'
import { GIANT, SUN, flareGhosts } from './spaceScene'
import { makeFlareGhost, makeGiant, makeRings, makeSunGlow } from './skyMaterials'
import type { SkyTheme } from './themes'
import { useQuality } from './qualityContext'

const SUN_VECTOR = new Vector3(...SUN.direction)

/** The sun, and for themes that have one the ringed gas giant lit by it. Far behind everything; decoration. */
export function SunAndGiant({ theme }: { theme: SkyTheme }) {
  const glow = useMemo(() => makeSunGlow(theme.sun), [theme])
  const giant = useMemo(() => makeGiant(theme, SUN_VECTOR), [theme])
  const centre = useMemo(() => new Vector3(...GIANT.position), [])
  const rings = useMemo(() => makeRings(theme, SUN_VECTOR, GIANT.ringInner * GIANT.radius, GIANT.ringOuter * GIANT.radius, centre, GIANT.radius), [theme, centre])
  const ringTurn = useMemo(() => new Euler(...GIANT.tilt), [])
  return (
    <group>
      <Billboard position={SUN_VECTOR.clone().multiplyScalar(SUN.distance)} renderOrder={-7}>
        <mesh material={glow} renderOrder={-7}>
          <planeGeometry args={[150, 150]} />
        </mesh>
      </Billboard>
      {theme.giant && (
        <group position={GIANT.position}>
          <mesh material={giant} renderOrder={-9}>
            <sphereGeometry args={[GIANT.radius, 96, 48]} />
          </mesh>
          <mesh material={rings} rotation={ringTurn} renderOrder={-8}>
            <ringGeometry args={[GIANT.ringInner * GIANT.radius, GIANT.ringOuter * GIANT.radius, 160, 1]} />
          </mesh>
        </group>
      )}
    </group>
  )
}

/**
 * Lens flare ghosts: soft discs on the line from the sun through the middle of the screen, drawn over the picture.
 * Only seen from the sky view (they fade out as the camera comes into the hall), and only on tiers with the film finish.
 */
export function LensFlare() {
  const q = useQuality()
  const meshes = useRef<(Mesh | null)[]>([])
  const camera = useThree((s) => s.camera)
  const ghostCount = flareGhosts({ x: 0, y: 0, z: 0 }).length
  const materials = useMemo<ShaderMaterial[]>(() => flareGhosts({ x: 0, y: 0, z: 0 }).map((g) => makeFlareGhost(g.color)), [])
  const sunWorld = useMemo(() => SUN_VECTOR.clone().multiplyScalar(SUN.distance), [])
  const tmp = useMemo(() => ({ v: new Vector3(), dir: new Vector3(), q: new Quaternion() }), [])
  useFrame(() => {
    const { v, dir } = tmp
    const away = Math.min(1, Math.max(0, (camera.position.length() - 40) / 25))
    const sun = v.copy(sunWorld).project(camera)
    const ghosts = flareGhosts({ x: sun.x, y: sun.y, z: sun.z })
    const fov = 'fov' in camera ? ((camera as { fov: number }).fov * Math.PI) / 180 : 0.7
    const D = 8
    ghosts.forEach((g, i) => {
      const m = meshes.current[i]
      if (!m) return
      const opacity = q.film ? g.opacity * away : 0
      m.visible = opacity > 0.001
      if (!m.visible) return
      materials[i].uniforms.uOpacity.value = opacity
      dir.set(g.x, g.y, 0.5).unproject(camera).sub(camera.position).normalize()
      m.position.copy(camera.position).addScaledVector(dir, D)
      m.quaternion.copy(camera.quaternion)
      m.scale.setScalar(g.size * 2 * D * Math.tan(fov / 2))
    })
  })
  return (
    <group>
      {Array.from({ length: ghostCount }, (_, i) => (
        <mesh key={i} ref={(m) => { meshes.current[i] = m }} material={materials[i]} renderOrder={100} frustumCulled={false} visible={false}>
          <planeGeometry args={[1, 1]} />
        </mesh>
      ))}
    </group>
  )
}

