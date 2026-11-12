import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CatmullRomCurve3, Object3D, TubeGeometry, Vector3, type BufferGeometry, type InstancedMesh } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Department } from './hallLayout'
import { activeTwigs, branchPaths, pulseT } from './branches'
import type { SeatState } from './seats'

const PULSES_PER_BRANCH = 2
const SPEED = 0.18

interface Live {
  curve: CatmullRomCurve3
  radius: number
  active: boolean
  kind: 'main' | 'twig'
}

/**
 * Glowing conduits from the core to every desk. A branch is lit and carries moving pulses only
 * when a robot sits at its end (a main when any of its twigs is live). Demo state, not agent data.
 * All lit conduits are one mesh, all dark ones another, and the pulses are one instanced mesh.
 */
export default function BranchLines({ seatStates }: { seatStates: Record<Department, SeatState[]> }) {
  const live = useMemo<Live[]>(() => {
    return branchPaths().map((p) => {
      const states = activeTwigs(seatStates[p.bay])
      const active = p.kind === 'main' ? states.some(Boolean) : states[p.seat ?? 0]
      return {
        curve: new CatmullRomCurve3(p.points.map((v) => new Vector3(...v))),
        radius: p.kind === 'main' ? 0.045 : 0.025,
        active,
        kind: p.kind,
      }
    })
  }, [seatStates])

  const tubes = useMemo(() => {
    const join = (on: boolean): BufferGeometry | null => {
      const parts = live.filter((b) => b.active === on).map((b) => new TubeGeometry(b.curve, 24, b.radius, 10, false))
      return parts.length ? mergeGeometries(parts) : null
    }
    return { lit: join(true), dark: join(false) }
  }, [live])

  const pulses = useRef<InstancedMesh>(null)
  const dummy = useMemo(() => new Object3D(), [])
  const owners = useMemo(() => live.flatMap((b, bi) => (b.active ? Array.from({ length: PULSES_PER_BRANCH }, (_, k) => ({ bi, k })) : [])), [live])

  useFrame(({ clock }) => {
    const mesh = pulses.current
    if (!mesh) return
    const t = clock.getElapsedTime()
    owners.forEach(({ bi, k }, i) => {
      dummy.position.copy(live[bi].curve.getPointAt(pulseT(t, bi * PULSES_PER_BRANCH + k, SPEED)))
      dummy.scale.setScalar(live[bi].kind === 'main' ? 0.09 : 0.055)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    })
    mesh.count = owners.length
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <group>
      {tubes.lit && (
        <mesh geometry={tubes.lit}>
          <meshStandardMaterial color="#0b3a44" emissive="#22d3ee" emissiveIntensity={1.4} roughness={0.4} />
        </mesh>
      )}
      {tubes.dark && (
        <mesh geometry={tubes.dark}>
          <meshStandardMaterial color="#15252a" emissive="#0e3038" emissiveIntensity={0.35} roughness={0.4} />
        </mesh>
      )}
      <instancedMesh key={owners.length} ref={pulses} args={[undefined, undefined, Math.max(1, owners.length)]} frustumCulled={false}>
        <sphereGeometry args={[1, 12, 8]} />
        <meshBasicMaterial color="#d8fbff" toneMapped={false} />
      </instancedMesh>
    </group>
  )
}
