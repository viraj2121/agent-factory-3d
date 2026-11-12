import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BufferGeometry, CanvasTexture, Color, DoubleSide, Float32BufferAttribute, Object3D, RepeatWrapping, SRGBColorSpace, type InstancedMesh, type MeshStandardMaterial } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Project } from './projects'
import { BELTS, beltActive, beltLength, beltPoint, crateScale, crateU, levelStep, phaseStep, workerSpots, type Belt } from './belts'
import RoleRobot from './RoleRobot'
import { seatShapes } from './bayShapes'
import { TASK_COLORS } from './taskColors'
import StaticMerge from './StaticMerge'
import { sound } from './soundEngine'

const CRATES_PER_BELT = 6
const CRATE = 0.42
const TOP = 0.5
const SEGMENTS = 48
/** A cross-section of the channel the belt runs in: radial offset (outward is positive) and height. Closed polygon. */
const channel = (hw: number): [number, number][] => [
  [-hw - 0.14, 0],
  [-hw - 0.14, 0.72],
  [-hw, 0.72],
  [-hw, TOP - 0.02],
  [hw, TOP - 0.02],
  [hw, 0.72],
  [hw + 0.14, 0.72],
  [hw + 0.14, 0],
]

/** Sweeps a cross-section along the belt's arc, with flat faces. */
function sweep(b: Belt, profile: [number, number][]): BufferGeometry {
  const pos: number[] = []
  const index: number[] = []
  for (let i = 0; i <= SEGMENTS; i++) {
    const a = b.start + ((b.end - b.start) * i) / SEGMENTS
    for (const [r, y] of profile) pos.push((b.radius + r) * Math.sin(a), y, (b.radius + r) * Math.cos(a))
  }
  const n = profile.length
  for (let i = 0; i < SEGMENTS; i++) {
    for (let j = 0; j < n; j++) {
      const a = i * n + j
      const c = i * n + ((j + 1) % n)
      index.push(a, c, a + n, c, c + n, a + n)
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setIndex(index)
  const flat = g.toNonIndexed()
  flat.computeVertexNormals()
  return flat
}

/** The moving surface of the belt: a strip with its length along u. */
function surface(b: Belt, repeats: number): BufferGeometry {
  const pos: number[] = []
  const uv: number[] = []
  const index: number[] = []
  const hw = b.width / 2
  for (let i = 0; i <= SEGMENTS; i++) {
    const a = b.start + ((b.end - b.start) * i) / SEGMENTS
    for (const [k, r] of [[0, -hw], [1, hw]] as const) {
      pos.push((b.radius + r) * Math.sin(a), TOP, (b.radius + r) * Math.cos(a))
      uv.push((i / SEGMENTS) * repeats, k)
    }
  }
  for (let i = 0; i < SEGMENTS; i++) index.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2)
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2))
  g.setIndex(index)
  g.computeVertexNormals()
  return g
}

let beltTexture: CanvasTexture | null = null
/** Dark rubber with rows of amber chevrons. One drawing, shared. */
function getBeltTexture(): CanvasTexture {
  if (!beltTexture) {
    const c = document.createElement('canvas')
    c.width = 64
    c.height = 64
    const g = c.getContext('2d')!
    g.fillStyle = '#17191c'
    g.fillRect(0, 0, 64, 64)
    g.strokeStyle = '#5b4524'
    g.lineWidth = 6
    g.lineCap = 'round'
    g.beginPath()
    g.moveTo(14, 8)
    g.lineTo(40, 32)
    g.lineTo(14, 56)
    g.stroke()
    g.strokeStyle = '#26282c'
    g.lineWidth = 2
    g.strokeRect(0, 0, 64, 64)
    beltTexture = new CanvasTexture(c)
    beltTexture.colorSpace = SRGBColorSpace
    beltTexture.wrapS = beltTexture.wrapT = RepeatWrapping
  }
  return beltTexture
}

/**
 * Two conveyor belts on the floor behind the bays: builds from Development out along the hall's edge.
 * A belt runs, with crates sliding along it, only while the department it leaves has robots at work
 * and the project is not idle; otherwise it slows to a stop. Demo motion: the crates carry no real work.
 */
export default function ConveyorBelts({ project }: { project: Project }) {
  const parts = useMemo(() => {
    const frames = mergeGeometries(BELTS.map((b) => sweep(b, channel(b.width / 2))))!
    const ends: ReturnType<typeof beltPoint>[] = []
    BELTS.forEach((b) => ends.push(beltPoint(b, 0), beltPoint(b, 1)))
    return { frames, ends }
  }, [])
  const repeats = useMemo(() => BELTS.map((b) => Math.max(2, Math.round(beltLength(b) / 0.6))), [])
  const tops = useMemo(
    () =>
      BELTS.map((b, i) => {
        const texture = getBeltTexture().clone()
        texture.needsUpdate = true
        texture.wrapS = texture.wrapT = RepeatWrapping
        return { geometry: surface(b, repeats[i]), texture }
      }),
    [repeats],
  )

  const active = useMemo(() => BELTS.map((b) => beltActive(project, b)), [project])
  const state = useRef(BELTS.map((_, i) => ({ level: active[i] ? 1 : 0, phase: i * 0.37 })))
  const crates = useRef<InstancedMesh>(null)
  const lights = useRef<(MeshStandardMaterial | null)[]>([])
  const dummy = useMemo(() => new Object3D(), [])
  const colors = useMemo(() => BELTS.map((b) => new Color(TASK_COLORS[b.from]).multiplyScalar(0.8)), [])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    let n = 0
    BELTS.forEach((b, i) => {
      const s = state.current[i]
      s.level = levelStep(s.level, active[i], dt)
      s.phase = phaseStep(s.phase, s.level, dt, beltLength(b))
      tops[i].texture.offset.x = -s.phase * repeats[i]
      const light = lights.current[i]
      if (light) light.emissiveIntensity = active[i] ? 1.5 + 0.8 * s.level : 0.2
      for (let k = 0; k < CRATES_PER_BELT; k++) {
        const u = crateU(s.phase, k, CRATES_PER_BELT)
        const p = beltPoint(b, u)
        dummy.position.set(p.x, TOP + (CRATE * 0.5 * crateScale(u)), p.z)
        dummy.rotation.set(0, p.heading + (k % 3) * 0.12 - 0.12, 0)
        dummy.scale.setScalar(Math.max(0.001, crateScale(u)))
        dummy.updateMatrix()
        crates.current?.setMatrixAt(n, dummy.matrix)
        crates.current?.setColorAt(n, colors[i])
        n++
      }
    })
    // the belt's motor, heard only when the belt has the camera's attention
    const at = beltPoint(BELTS[0], 0.5)
    const speed = state.current[0].level
    sound.workshop({ arc: 0, motor: 0.8 * speed, motorHz: 80 + 40 * speed, drone: 0 }, [at.x, 1, at.z], 'belt')
    const mesh = crates.current
    if (mesh) {
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }
  })

  return (
    <group>
      <StaticMerge>
        <mesh geometry={parts.frames} castShadow receiveShadow>
          <meshStandardMaterial color="#2a2f35" metalness={0.75} roughness={0.45} side={DoubleSide} />
        </mesh>
        {BELTS.map((b, i) => {
          // a hopper over the source end and a chute at the sink end
          const source = parts.ends[i * 2]
          const sink = parts.ends[i * 2 + 1]
          return (
            <group key={b.id}>
              <mesh position={[source.x, 0.95, source.z]} rotation={[0, source.heading, 0]} castShadow>
                <boxGeometry args={[b.width + 0.3, 0.9, 0.7]} />
                <meshStandardMaterial color="#20252b" metalness={0.8} roughness={0.4} />
              </mesh>
              <mesh position={[sink.x, 0.35, sink.z]} rotation={[0, sink.heading, 0]} castShadow>
                <boxGeometry args={[b.width + 0.3, 0.7, 0.6]} />
                <meshStandardMaterial color="#20252b" metalness={0.8} roughness={0.4} />
              </mesh>
            </group>
          )
        })}
      </StaticMerge>
      {BELTS.map((b, i) => (
        <mesh key={b.id} geometry={tops[i].geometry} receiveShadow>
          <meshStandardMaterial map={tops[i].texture} roughness={0.85} metalness={0.1} emissive="#241a0a" emissiveIntensity={0.35} side={DoubleSide} />
        </mesh>
      ))}
      {BELTS.map((b, i) => {
        const source = parts.ends[i * 2]
        return (
          <mesh key={`light-${b.id}`} position={[source.x, 1.5, source.z]}>
            <sphereGeometry args={[0.1, 12, 8]} />
            <meshStandardMaterial
              ref={(m) => {
                lights.current[i] = m
              }}
              color="#111"
              emissive={TASK_COLORS[b.from]}
              emissiveIntensity={0.2}
            />
          </mesh>
        )
      })}
      {/* two robots at each belt: one inspects the crates, one stamps them, while the belt runs; they stand idle when it stops */}
      {BELTS.map((b, i) => {
        const shapes = seatShapes(project.id, 11 + i, 2)
        return workerSpots(b).map((w, k) => (
          <RoleRobot key={`${b.id}-${k}`} position={[w.x, 0, w.z]} rotationY={w.heading} variant={shapes[k]} clip={active[i] ? w.job : 'idle'} seed={60 + i * 2 + k} />
        ))
      })}
      <instancedMesh ref={crates} args={[undefined, undefined, BELTS.length * CRATES_PER_BELT]} castShadow frustumCulled={false}>
        <boxGeometry args={[CRATE, CRATE, CRATE]} />
        <meshStandardMaterial color="#ffffff" roughness={0.55} metalness={0.2} />
      </instancedMesh>
    </group>
  )
}
