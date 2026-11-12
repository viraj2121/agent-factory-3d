import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  AdditiveBlending, BufferAttribute, DataTexture, DoubleSide, RepeatWrapping, RGBAFormat,
  Matrix4, Quaternion, Vector3, type Group, type InstancedMesh, type Mesh, type MeshStandardMaterial, Object3D, type Points,
} from 'three'
import type { Vec3 } from './hallLayout'
import { HUB_LAYOUT } from './hubLayout'
import RoleRobot from './RoleRobot'
import StaticMerge from './StaticMerge'
import type { SceneryParts } from './scenery'
import { HOLO } from './holoMaterial'
import {
  barHeights, cartHeading, cartPosition, dronePosition,
  radialData, ringPulse, screenStripes, steamPoints, streakSpots,
} from './lifeMath'

function makeTexture(data: Uint8Array, w: number, h: number, repeat = false): DataTexture {
  const tex = new DataTexture(data, w, h, RGBAFormat)
  if (repeat) tex.wrapS = tex.wrapT = RepeatWrapping
  tex.needsUpdate = true
  return tex
}

let screenTex: DataTexture | null = null
function getScreenTexture(): DataTexture {
  if (!screenTex) screenTex = makeTexture(screenStripes(64), 64, 64, true)
  return screenTex
}

/** Gives every desk and wall screen a scrolling picture. Call once per cloned bay. */
export function applyScreenFx(root: Object3D) {
  const tex = getScreenTexture()
  root.traverse((o) => {
    const material = (o as Mesh).material as MeshStandardMaterial | undefined
    if (material && (material.name === 'BayScreen' || material.name === 'BayCode')) material.emissiveMap = tex
  })
}

function ScreenScroll() {
  useFrame(({ clock }) => {
    HOLO.uniforms.uTime.value = clock.getElapsedTime()
    getScreenTexture().offset.y = (clock.getElapsedTime() * 0.12) % 1
  })
  return null
}

function Holograms() {
  const bars = useRef<InstancedMesh>(null)
  const spin = useRef<Group>(null)
  const panels = HUB_LAYOUT.bays.map((b) => b.angle + Math.PI / 5)
  const BARS = 5
  const panelMatrices = useMemo(
    () => panels.map((a) => new Matrix4().compose(new Vector3(3.5 * Math.sin(a), 2.5, 3.5 * Math.cos(a)), new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), a), new Vector3(1, 1, 1))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  const bar = useMemo(() => new Object3D(), [])
  const world = useMemo(() => new Matrix4(), [])

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    if (bars.current) {
      panels.forEach((_, p) => {
        barHeights(t + p * 1.7, BARS).forEach((h, i) => {
          bar.position.set(-0.4 + i * 0.2, -0.27 + h * 0.25, 0.01)
          bar.scale.set(1, h * 0.5, 1)
          bar.updateMatrix()
          bars.current!.setMatrixAt(p * BARS + i, world.multiplyMatrices(panelMatrices[p], bar.matrix))
        })
      })
      bars.current.instanceMatrix.needsUpdate = true
    }
    if (spin.current) {
      spin.current.rotation.y = t * 0.4
      spin.current.rotation.x = t * 0.23
    }
  })

  return (
    <group>
      <StaticMerge>
      {panels.map((a, p) => (
        <group key={p} position={[3.5 * Math.sin(a), 2.5, 3.5 * Math.cos(a)]} rotation={[0, a, 0]}>
          <mesh>
            <planeGeometry args={[1.2, 0.75]} />
            <primitive object={HOLO} attach="material" />
          </mesh>
          {[[0, 0.38, 1.2, 0.02], [0, -0.38, 1.2, 0.02], [-0.6, 0, 0.02, 0.76], [0.6, 0, 0.02, 0.76]].map(([x, y, w, h], k) => (
            <mesh key={k} position={[x, y, 0.005]}>
              <planeGeometry args={[w, h]} />
              <meshBasicMaterial color="#7fe9ff" toneMapped={false} side={DoubleSide} />
            </mesh>
          ))}
        </group>
      ))}
      </StaticMerge>
      <instancedMesh ref={bars} args={[undefined, undefined, panels.length * BARS]} frustumCulled={false}>
        <planeGeometry args={[0.12, 1]} />
        <meshBasicMaterial color="#7fe9ff" toneMapped={false} side={DoubleSide} />
      </instancedMesh>
      <group ref={spin} position={[0, 4.6, 0]}>
        <mesh>
          <octahedronGeometry args={[0.55, 0]} />
          <meshBasicMaterial color="#7fe9ff" wireframe toneMapped={false} />
        </mesh>
      </group>
    </group>
  )
}

function FloorPulses() {
  const rings = useRef<(Mesh | null)[]>([])
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    rings.current.forEach((ring, i) => {
      if (!ring) return
      const p = ringPulse(t + i * 2.5, 5)
      ring.scale.setScalar(p.scale * 12)
      ;(ring.material as { opacity: number }).opacity = p.opacity
    })
  })
  return (
    <group position={[0, 0.06, 0]} rotation-x={-Math.PI / 2}>
      {[0, 1].map((i) => (
        <mesh key={i} ref={(m) => { rings.current[i] = m }}>
          <ringGeometry args={[0.97, 1, 96]} />
          <meshBasicMaterial color="#7fe9ff" transparent opacity={0} depthWrite={false} toneMapped={false} side={DoubleSide} />
        </mesh>
      ))}
    </group>
  )
}

function HelperMachines() {
  const cart = useRef<Group>(null)
  const drone = useRef<Group>(null)
  const rotor = useRef<Mesh>(null)
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    if (cart.current) {
      const [x, y, z] = cartPosition(t)
      cart.current.position.set(x, y, z)
      cart.current.rotation.y = cartHeading(t)
    }
    if (drone.current) {
      const [x, y, z] = dronePosition(t)
      drone.current.position.set(x, y, z)
      // lean into the direction of travel
      const [x2, , z2] = dronePosition(t + 0.1)
      drone.current.rotation.z = Math.max(-0.25, Math.min(0.25, -(x2 - x) * 0.9))
      drone.current.rotation.x = Math.max(-0.25, Math.min(0.25, (z2 - z) * 0.9))
    }
    if (rotor.current) rotor.current.rotation.z = t * 6
  })
  return (
    <group>
      <group ref={cart}>
        <StaticMerge>
        <mesh position={[0, 0.3, 0]}>
          <boxGeometry args={[0.7, 0.25, 1.1]} />
          <meshStandardMaterial color="#c0721a" metalness={0.6} roughness={0.45} />
        </mesh>
        <mesh position={[0, 0.55, -0.35]}>
          <boxGeometry args={[0.55, 0.3, 0.3]} />
          <meshStandardMaterial color="#1b1f24" metalness={0.7} roughness={0.4} />
        </mesh>
        <mesh position={[0, 0.55, 0.2]}>
          <boxGeometry args={[0.5, 0.3, 0.5]} />
          <meshStandardMaterial color="#44505a" metalness={0.5} roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.98, 0.0]} rotation-x={Math.PI / 2.6}>
          <torusGeometry args={[0.13, 0.015, 8, 20]} />
          <meshStandardMaterial color="#1b1f24" metalness={0.6} roughness={0.4} />
        </mesh>
        <mesh position={[0, 0.84, 0.06]} rotation-x={0.4}>
          <cylinderGeometry args={[0.02, 0.02, 0.28, 8]} />
          <meshStandardMaterial color="#1b1f24" metalness={0.6} roughness={0.4} />
        </mesh>
        <mesh position={[0, 0.71, 0.2]}>
          <boxGeometry args={[0.4, 0.02, 0.4]} />
          <meshStandardMaterial color="#22d3ee" emissive="#22d3ee" emissiveIntensity={2} />
        </mesh>
        {[-0.38, 0.38].flatMap((x) => [-0.4, 0.4].map((z) => (
          <mesh key={`${x}${z}`} position={[x, 0.14, z]} rotation-z={Math.PI / 2}>
            <cylinderGeometry args={[0.14, 0.14, 0.1, 16]} />
            <meshStandardMaterial color="#14171b" roughness={0.7} />
          </mesh>
        )))}
        </StaticMerge>
        <RoleRobot variant="driver" clip="drive" seed={301} position={[0, 0.7, -0.33]} scaleMul={0.78} />
      </group>
      <group ref={drone}>
        <mesh>
          <sphereGeometry args={[0.22, 16, 12]} />
          <meshStandardMaterial color="#d6d9de" metalness={0.5} roughness={0.35} />
        </mesh>
        <mesh ref={rotor} rotation-x={Math.PI / 2}>
          <torusGeometry args={[0.38, 0.03, 8, 24]} />
          <meshStandardMaterial color="#ffb347" emissive="#ffb347" emissiveIntensity={1.5} />
        </mesh>
        <mesh position={[0, -0.02, 0.19]}>
          <sphereGeometry args={[0.07, 10, 8]} />
          <meshBasicMaterial color="#7fe9ff" toneMapped={false} />
        </mesh>
      </group>
    </group>
  )
}

const VENT_ANGLES = [0.17, 1.74, 3.31, 4.88]
const VENTS: Vec3[] = VENT_ANGLES.map((a) => [12.9 * Math.sin(a), 0.08, 12.9 * Math.cos(a)])
const PUFFS = 24
const SPARKS = 6

function Vents() {
  const sprite = useMemo(() => makeTexture(radialData(32), 32, 32), [])
  const steam = useRef<(Points | null)[]>([])
  const sparks = useRef<(Points | null)[]>([])
  const steamAttrs = useMemo(() => VENTS.map(() => new BufferAttribute(new Float32Array(PUFFS * 3), 3)), [])
  const sparkAttrs = useMemo(() => VENTS.map(() => new BufferAttribute(new Float32Array(SPARKS * 3), 3)), [])

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    VENTS.forEach((origin, i) => {
      const s = steam.current[i]
      if (s) {
        steamAttrs[i].array.set(steamPoints(t + i * 3.1, PUFFS, origin))
        steamAttrs[i].needsUpdate = true
      }
      const k = sparks.current[i]
      if (k) {
        const p = steamPoints(t * 2.6 + i, SPARKS, [origin[0], origin[1] + 0.2, origin[2]])
        for (let j = 0; j < SPARKS; j++) p[j * 3 + 1] = origin[1] + 0.2 + (p[j * 3 + 1] - origin[1] - 0.2) * 0.35
        sparkAttrs[i].array.set(p)
        sparkAttrs[i].needsUpdate = true
        ;(k.material as { opacity: number }).opacity = Math.sin(t * 1.9 + i * 2) > 0.7 ? 1 : 0
      }
    })
  })

  return (
    <StaticMerge>
      {VENTS.map((origin, i) => (
        <group key={i}>
          <mesh position={origin} rotation-x={-Math.PI / 2}>
            <planeGeometry args={[0.9, 0.6]} />
            <meshStandardMaterial color="#14171b" metalness={0.8} roughness={0.5} />
          </mesh>
          <mesh position={[origin[0], origin[1] + 0.005, origin[2]]} rotation-x={-Math.PI / 2}>
            <ringGeometry args={[0.52, 0.56, 4, 1, Math.PI / 4]} />
            <meshBasicMaterial color="#ffb347" />
          </mesh>
          <points ref={(p) => { steam.current[i] = p as Points | null }}>
            <bufferGeometry attributes-position={steamAttrs[i]} />
            <pointsMaterial map={sprite} color="#e8eef2" size={0.9} transparent opacity={0.2} depthWrite={false} sizeAttenuation />
          </points>
          <points ref={(p) => { sparks.current[i] = p as Points | null }}>
            <bufferGeometry attributes-position={sparkAttrs[i]} />
            <pointsMaterial map={sprite} color="#ffd27a" size={0.14} transparent opacity={0} depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
          </points>
        </group>
      ))}
    </StaticMerge>
  )
}

function FloorDecals() {
  const glow = useMemo(() => makeTexture(radialData(64), 64, 64), [])
  const spots = useMemo(() => streakSpots(14), [])
  return (
    <StaticMerge>
      {spots.map((s, i) => (
        <mesh key={`streak-${i}`} position={[s.x, 0.035, s.z]} rotation={[-Math.PI / 2, 0, s.rot]}>
          <planeGeometry args={[s.length, s.width]} />
          <meshBasicMaterial map={glow} color="#3a1c0c" transparent opacity={0.55} depthWrite={false} />
        </mesh>
      ))}
    </StaticMerge>
  )
}

const OFF = new Set((new URLSearchParams(window.location.search).get('off') ?? '').split(',').filter(Boolean))

/**
 * Everything in the hub that moves or changes: screens, holograms, pulses, machines, steam.
 * `?off=vents,decals,holograms,pulses,machines,screens` turns parts off (for speed checks).
 */
export default function HubLife({ parts }: { parts: SceneryParts }) {
  return (
    <group>
      {parts.holograms && !OFF.has('screens') && <ScreenScroll />}
      {parts.holograms && !OFF.has('holograms') && <Holograms />}
      {parts.pulses && !OFF.has('pulses') && <FloorPulses />}
      {parts.machines && !OFF.has('machines') && <HelperMachines />}
      {parts.steam && !OFF.has('vents') && <Vents />}
      {parts.decals && !OFF.has('decals') && <FloorDecals />}
    </group>
  )
}
