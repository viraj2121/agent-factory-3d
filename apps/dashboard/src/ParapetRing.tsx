import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color, DoubleSide, MeshStandardMaterial, type MeshBasicMaterial } from 'three'
import StaticMerge from './StaticMerge'
import { PARAPET, parapetGeometry, postAngles } from './parapet'
import { stripGlow } from './mood'
import { applyShellDetail } from './shellDetail'
import type { ProjectStatus } from './projects'

const AMBER = '#ffb347'

let sharedGeometry: ReturnType<typeof parapetGeometry> | null = null
let sharedMaterial: MeshStandardMaterial | null = null

/** One parapet shape and one plated material, shared by the hall and every miniature. */
function shared() {
  if (!sharedGeometry || !sharedMaterial) {
    sharedGeometry = parapetGeometry()
    sharedMaterial = new MeshStandardMaterial({ color: '#4b4339', roughness: 0.7, metalness: 0.45 })
    applyShellDetail(sharedMaterial, true)
  }
  return { geometry: sharedGeometry, material: sharedMaterial }
}

/**
 * The low thick wall round the hall's edge: plated sides, a glowing strip along the top that shows the
 * project's status (steady running, slow amber pulse when it needs you, dim when idle), and short light posts.
 * Shapes in hall units: scale the parent to make a miniature.
 */
export default function ParapetRing({ accent, status }: { accent: string; status: ProjectStatus }) {
  const { geometry, material } = useMemo(shared, [])
  const strip = useRef<MeshBasicMaterial>(null)
  const colour = useMemo(() => new Color(), [])
  const radius = (PARAPET.inner + PARAPET.outer) / 2

  useFrame(({ clock }) => {
    const m = strip.current
    if (!m) return
    m.color.copy(colour.set(status === 'needs-you' ? AMBER : accent).multiplyScalar(stripGlow(status, clock.getElapsedTime())))
  })

  return (
    <group>
      <mesh geometry={geometry} material={material} castShadow receiveShadow />
      <mesh position={[0, PARAPET.height + 0.012, 0]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[PARAPET.inner + 0.07, PARAPET.outer - 0.07, 96]} />
        <meshBasicMaterial ref={strip} color={accent} toneMapped={false} side={DoubleSide} />
      </mesh>
      <StaticMerge>
        {postAngles().map((a) => (
          <group key={a} position={[Math.sin(a) * radius, PARAPET.height, Math.cos(a) * radius]}>
            <mesh position={[0, PARAPET.postHeight / 2, 0]}>
              <cylinderGeometry args={[0.07, 0.1, PARAPET.postHeight, 8]} />
              <meshStandardMaterial color="#1b1f24" metalness={0.8} roughness={0.4} />
            </mesh>
            <mesh position={[0, PARAPET.postHeight + 0.08, 0]}>
              <sphereGeometry args={[0.11, 10, 8]} />
              <meshBasicMaterial color="#fff0c8" toneMapped={false} />
            </mesh>
          </group>
        ))}
      </StaticMerge>
    </group>
  )
}
