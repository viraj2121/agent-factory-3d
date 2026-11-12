import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, Color, Object3D, type InstancedMesh, type Mesh, type MeshBasicMaterial, type MeshStandardMaterial, type PointLight } from 'three'
import { HUB } from './hubLayout'
import type { Project } from './projects'
import { CORE_MAX, coreGlow, coreRoster, coreSummary, type CoreState } from './coreRoster'
import StaticMerge from './StaticMerge'

/** Height of the deck's top surface, in the core's own space (the core sits 1.8 m above the floor and the deck is 0.4 m high). */
const DECK_Y = -(HUB.coreCenter[1] - HUB.deckHeight)
const RADIUS = 0.8
const RING = 1.6

const TINT = { working: new Color('#8fd4c0'), waiting: new Color('#ffb347'), idle: new Color('#7f93b3') }
const LIGHT: Record<CoreState, Color> = {
  running: new Color('#5df0a8').multiplyScalar(2),
  'needs-you': new Color('#ffb347').multiplyScalar(2.4),
  idle: new Color('#7f93b3').multiplyScalar(0.7),
  standby: new Color('#4b5568').multiplyScalar(0.6),
}

/**
 * The core: a quiet dark glass sphere with one soft inner light that breathes, and a thin ring round it with one small
 * light for every agent in the project. Green is an agent working, amber one waiting for you (it pulses), grey one resting.
 * Nothing else moves. The ring turns very slowly; an agent keeps its place on it.
 */
export default function RosterCore({ project }: { project: Project }) {
  const lights = useMemo(() => coreRoster(project), [project])
  const summary = useMemo(() => coreSummary(lights), [lights])
  const orb = useRef<Mesh>(null)
  const inner = useRef<MeshBasicMaterial>(null)
  const lamp = useRef<PointLight>(null)
  const dots = useRef<InstancedMesh>(null)
  const halos = useRef<InstancedMesh>(null)
  const dummy = useMemo(() => new Object3D(), [])
  const tint = useMemo(() => new Color(), [])

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    const g = coreGlow(t, summary)
    const target = summary.waiting > 0 ? TINT.waiting : summary.working > 0 ? TINT.working : TINT.idle
    tint.lerp(target, 0.04)
    const material = orb.current?.material as MeshStandardMaterial | undefined
    if (material) {
      material.emissive.copy(tint)
      material.emissiveIntensity = g * 0.1
    }
    if (inner.current) {
      inner.current.color.copy(tint)
      inner.current.opacity = 0.02 + 0.1 * g
    }
    if (lamp.current) {
      lamp.current.color.copy(tint)
      lamp.current.intensity = 0.6 + 2.4 * g
    }

    const n = Math.min(lights.length, CORE_MAX)
    const spin = t * 0.04
    for (const mesh of [dots.current, halos.current]) {
      if (!mesh) continue
      mesh.count = n
      mesh.visible = n > 0
    }
    for (let i = 0; i < n; i++) {
      const state = lights[i].state
      const a = spin + (i / n) * Math.PI * 2
      const pulse = state === 'needs-you' ? 0.65 + 0.35 * Math.sin(t * 4) : 1
      const size = state === 'running' ? 0.09 : state === 'needs-you' ? 0.105 * (0.9 + 0.2 * pulse) : 0.055
      dummy.position.set(Math.cos(a) * RING, 0, Math.sin(a) * RING)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.setScalar(size)
      dummy.updateMatrix()
      dots.current?.setMatrixAt(i, dummy.matrix)
      dots.current?.setColorAt(i, tint.copy(LIGHT[state]).multiplyScalar(state === 'needs-you' ? 0.6 + 0.4 * pulse : 1))
      const active = state === 'running' || state === 'needs-you'
      dummy.scale.setScalar(active ? size * (state === 'needs-you' ? 3.2 + 0.8 * pulse : 2.6) : 0.0001)
      dummy.updateMatrix()
      halos.current?.setMatrixAt(i, dummy.matrix)
      halos.current?.setColorAt(i, tint.copy(LIGHT[state]).multiplyScalar(0.35 * pulse))
    }
    for (const mesh of [dots.current, halos.current]) {
      if (!mesh) continue
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }
  })

  return (
    <group position={HUB.coreCenter}>
      {/* the sphere: dark smoked glass that catches the room's light, with a soft glow inside */}
      <mesh ref={orb}>
        <sphereGeometry args={[RADIUS, 64, 48]} />
        <meshStandardMaterial color="#0a0d12" metalness={0.35} roughness={0.14} emissive="#7f93b3" emissiveIntensity={0.07} />
      </mesh>
      <mesh>
        <sphereGeometry args={[RADIUS * 0.9, 32, 24]} />
        <meshBasicMaterial ref={inner} color="#7f93b3" transparent opacity={0.1} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>

      {/* the ring, and one light for every agent */}
      <mesh rotation-x={Math.PI / 2}>
        <torusGeometry args={[RING, 0.012, 6, 128]} />
        <meshBasicMaterial color="#8fa0b8" transparent opacity={0.55} toneMapped={false} />
      </mesh>
      <instancedMesh ref={dots} args={[undefined, undefined, CORE_MAX]} frustumCulled={false} visible={false}>
        <sphereGeometry args={[1, 12, 10]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={halos} args={[undefined, undefined, CORE_MAX]} frustumCulled={false} visible={false}>
        <sphereGeometry args={[1, 10, 8]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.5} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
      </instancedMesh>

      {/* a plain pedestal: two dark tiers and a short stem, with one thin cool line on the floor round it */}
      <StaticMerge>
        <mesh position={[0, DECK_Y + 0.09, 0]}>
          <cylinderGeometry args={[1.0, 1.15, 0.18, 48]} />
          <meshStandardMaterial color="#1b1f24" metalness={0.7} roughness={0.45} />
        </mesh>
        <mesh position={[0, DECK_Y + 0.26, 0]}>
          <cylinderGeometry args={[0.55, 0.8, 0.16, 40]} />
          <meshStandardMaterial color="#20252c" metalness={0.7} roughness={0.4} />
        </mesh>
        <mesh position={[0, (DECK_Y + 0.34 - RADIUS) / 2 - 0.02, 0]}>
          <cylinderGeometry args={[0.1, 0.14, DECK_Y + 0.34 > -RADIUS ? 0.1 : -RADIUS - (DECK_Y + 0.34), 16]} />
          <meshStandardMaterial color="#15181d" metalness={0.8} roughness={0.35} />
        </mesh>
      </StaticMerge>
      <mesh position={[0, DECK_Y + 0.185, 0]} rotation-x={Math.PI / 2}>
        <torusGeometry args={[0.97, 0.008, 6, 64]} />
        <meshBasicMaterial color="#6f8199" toneMapped={false} />
      </mesh>

      <pointLight ref={lamp} color="#7f93b3" distance={14} intensity={0.8} />
    </group>
  )
}
