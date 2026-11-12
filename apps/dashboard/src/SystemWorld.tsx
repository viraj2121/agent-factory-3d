import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { loopLife, loopPoints, loopSpecs } from './starLoops'
import { Billboard, Html } from '@react-three/drei'
import { BufferGeometry, CatmullRomCurve3, Color, TubeGeometry, Float32BufferAttribute, LineBasicMaterial, LineLoop, Vector3, type Group, type Mesh, type MeshBasicMaterial } from 'three'
import type { Project } from './projects'
import { planetMaps } from './planetTextures'
import { themeFor } from './themes'
import { useUi } from './uiSettings'
import { makeCoronaMaterial, makeLoopMaterial, makePlanetMaterial, makeRingMaterial, makeStarMaterial, type PlanetUniforms } from './systemMaterials'
import {
  SYSTEM,
  agentCounts,
  moonTools,
  MOON_LOOK,
  flarePeriod,
  lockedYaw,
  orbitRadius,
  planetAngle,
  planetKinds,
  planetPosition,
  planetSeed,
  planetSize,
  systemTime,
  type PlanetKind,
} from './systemLayout'

// The solar system level: a red dwarf (this computer, decoration) with one planet for every project. Moons are the working
// agents; an amber moon and an expanding ring mean a project needs you; a resting project is dark. Click a planet to go in.

const RIM = { working: '#5df0a8', needs: '#ffb347', idle: '#8fa7d0' }
const WHITE = new Color('#ffffff')

/** The red dwarf: a baked cellular surface, a corona with streamers, and flares that come more often when more agents work. */
function Star({ workingTotal, glow }: { workingTotal: number; glow: [number, number, number] }) {
  const star = useMemo(() => makeStarMaterial(), [])
  const corona = useMemo(() => makeCoronaMaterial(glow), [glow])
  const loops = useMemo(() => loopSpecs(7).map((spec) => ({ spec, mat: makeLoopMaterial(), geo: new TubeGeometry(new CatmullRomCurve3(loopPoints(spec.a, spec.b, SYSTEM.starRadius * 0.99, spec.height, 24).map((p) => new Vector3(...p))), 40, 0.1, 6, false) })), [])
  useEffect(() => () => { star.material.dispose(); corona.material.dispose(); loops.forEach((l) => { l.mat.material.dispose(); l.geo.dispose() }) }, [star, corona, loops])
  useFrame(() => {
    const t = systemTime()
    star.time.value = t
    corona.uniforms.time.value = t
    loops.forEach((l) => { l.mat.life.value = loopLife(t, l.spec.phase, l.spec.period); l.mat.time.value = t })
    const period = flarePeriod(workingTotal)
    const n = Math.floor(t / period)
    const ph = (t - n * period) / 3.2
    corona.uniforms.flare.value = ph < 1 ? Math.sin(ph * Math.PI) : 0
    corona.uniforms.flareAngle.value = (Math.abs(Math.sin(n * 12.9898) * 43758.5453) % 1) * Math.PI * 2
  })
  return (
    <group>
      <mesh material={star.material}>
        <sphereGeometry args={[SYSTEM.starRadius, 64, 48]} />
      </mesh>
      {loops.map((l, i) => <mesh key={i} geometry={l.geo} material={l.mat.material} renderOrder={1} />)}
      <Billboard>
        <mesh material={corona.material} renderOrder={2}>
          <planeGeometry args={[SYSTEM.starRadius * 10, SYSTEM.starRadius * 10]} />
        </mesh>
      </Billboard>
    </group>
  )
}

function Orbit({ index, current }: { index: number; current: boolean }) {
  const line = useMemo(() => {
    const r = orbitRadius(index)
    const pts: number[] = []
    for (let i = 0; i < 160; i++) {
      const a = (i / 160) * Math.PI * 2
      pts.push(Math.cos(a) * r, 0, Math.sin(a) * r)
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(pts, 3))
    return new LineLoop(g, new LineBasicMaterial({ color: current ? '#ffffff' : '#8caee6', transparent: true, opacity: current ? 0.4 : 0.16, depthWrite: false, fog: false }))
  }, [index, current])
  useEffect(() => () => { line.geometry.dispose(); (line.material as LineBasicMaterial).dispose() }, [line])
  return <primitive object={line} />
}

/** The body of a moon: a diamond (Claude Code), a cube (Codex), a ring (Copilot) or a ball. */
function MoonGeometry({ shape }: { shape: 'diamond' | 'cube' | 'ring' | 'ball' }) {
  if (shape === 'diamond') return <octahedronGeometry args={[0.2]} />
  if (shape === 'cube') return <boxGeometry args={[0.22, 0.22, 0.22]} />
  if (shape === 'ring') return <torusGeometry args={[0.15, 0.05, 8, 20]} />
  return <sphereGeometry args={[0.14, 10, 8]} />
}

const STATUS_LINE = (p: Project, working: number): string => (p.status === 'needs-you' ? 'WAITING FOR YOU' : working > 0 ? `${working} AGENT${working === 1 ? '' : 'S'} WORKING` : 'RESTING')

function Planet({ project, index, kind, current, labels, onEnter, light, follow }: { project: Project; index: number; kind: PlanetKind; current: boolean; labels: boolean; onEnter: (id: string) => void; light: [number, number, number]; follow: boolean }) {
  const size = planetSize(kind, current)
  const counts = useMemo(() => agentCounts(project), [project])
  const tools = useMemo(() => moonTools(project), [project])
  const { material, uniforms } = useMemo(() => makePlanetMaterial(kind, planetMaps(kind, planetSeed(project.id)), light, project.accent), [kind, project.id, light, project.accent])
  const rings = useMemo(() => (kind === 'gasring' ? makeRingMaterial([0.88, 0.78, 0.6], 1.55, 2.3) : null), [kind])
  const [hover, setHover] = useState(false)
  const root = useRef<Group>(null)
  const controls = useThree((s) => s.controls) as { object: { position: { add: (v: Vector3) => void } }; target: { set: (x: number, y: number, z: number) => void } } | null
  const last = useRef<Vector3 | null>(null)
  const globe = useRef<Group>(null)
  const moons = useRef<(Mesh | null)[]>([])
  const alert = useRef<Mesh>(null)
  const alertRing = useRef<Mesh>(null)
  const status = project.status === 'needs-you' ? 'needs' : counts.working > 0 || project.status === 'running' ? 'working' : 'idle'
  useEffect(() => {
    const u: PlanetUniforms = uniforms
    u.rim.value.set(RIM[status])
    u.rimK.value = status === 'idle' ? 0.18 : 0.55
  }, [uniforms, status])
  useEffect(() => () => { material.dispose(); rings?.material.dispose() }, [material, rings])
  const ringExtra = kind === 'gasring' ? 0.9 : 0

  useFrame(() => {
    const t = systemTime()
    const [x, y, z] = planetPosition(index, t)
    root.current?.position.set(x, y, z)
    // looking closely: the camera keeps pace with the planet as it goes round, so it stays in view
    if (follow && controls) {
      if (last.current) controls.object.position.add(new Vector3(x - last.current.x, y - last.current.y, z - last.current.z))
      controls.target.set(x, y, z)
      ;(last.current ??= new Vector3()).set(x, y, z)
    } else last.current = null
    globe.current?.rotation.set(0, lockedYaw(planetAngle(index, t)), 0)
    uniforms.time.value = t
    uniforms.city.value = status === 'working' ? 0.6 + 0.4 * Math.sin(t * 2 + index) : status === 'needs' ? (Math.sin(t * 7) > 0 ? 1 : 0.15) : 0
    if (rings) {
      rings.centre.set(x, y, z)
      rings.radius.value = size
    }
    moons.current.forEach((m, n) => {
      if (!m) return
      const a = t * (0.9 + n * 0.35) + n * 2.4
      const d = size * (1.9 + n * 0.3) + size * ringExtra
      m.position.set(Math.cos(a) * d, Math.sin(a) * d * 0.3, Math.sin(a) * d * 0.95)
      m.rotation.set(t * 0.8, t * 1.3, 0)
    })
    if (alert.current) {
      const a = 0.9 + t * 0.4
      const d = size * 2 + size * ringExtra
      alert.current.position.set(Math.cos(a) * d, Math.sin(a) * d * 0.3, Math.sin(a) * d * 0.95)
      alert.current.visible = Math.sin(t * 6) > -0.2
    }
    if (alertRing.current) {
      const f = (t * 0.55) % 1
      alertRing.current.scale.setScalar(size * (1.4 + f * 2.4))
      ;(alertRing.current.material as MeshBasicMaterial).opacity = 0.8 * (1 - f)
    }
  })

  const full = current || project.status === 'needs-you' || hover
  // every planet carries its name; the full line (status, working agents) shows for yours, one that needs you, or the one you point at
  const showLabel = labels
  return (
    <group ref={root}>
      <group scale={size}>
        <group ref={globe}>
          <mesh material={material}>
            <sphereGeometry args={[1, 56, 40]} />
          </mesh>
        </group>
        {rings && (
          <mesh material={rings.material} rotation={[Math.PI / 2 + 0.4, 0, 0.3]}>
            <ringGeometry args={[1.55, 2.3, 96, 1]} />
          </mesh>
        )}
      </group>
      {tools.map((tool, n) => (
        <mesh key={n} ref={(m) => { moons.current[n] = m }}>
          <MoonGeometry shape={MOON_LOOK[tool].shape} />
          <meshBasicMaterial color={new Color(MOON_LOOK[tool].colour).multiplyScalar(2.2)} toneMapped={false} />
        </mesh>
      ))}
      {counts.waiting > 0 && (
        <>
          <mesh ref={alert}>
            <sphereGeometry args={[0.2, 10, 8]} />
            <meshBasicMaterial color={new Color('#ffb347').multiplyScalar(2.4)} toneMapped={false} />
          </mesh>
          <mesh ref={alertRing} rotation-x={Math.PI / 2}>
            <ringGeometry args={[0.97, 1, 64]} />
            <meshBasicMaterial color="#ffb347" transparent opacity={0.8} depthWrite={false} toneMapped={false} />
          </mesh>
        </>
      )}
      {current && (
        <Billboard>
          <mesh>
            <ringGeometry args={[size * 2.25, size * 2.32, 64]} />
            <meshBasicMaterial color={WHITE} transparent opacity={0.75} depthWrite={false} toneMapped={false} />
          </mesh>
        </Billboard>
      )}
      <mesh
        onClick={(e) => {
          e.stopPropagation()
          onEnter(project.id)
        }}
        onPointerOver={() => {
          setHover(true)
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => {
          setHover(false)
          document.body.style.cursor = ''
        }}
      >
        <sphereGeometry args={[size * 1.8, 12, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {showLabel && (
        <Html center position={[0, size * 2.6 + 0.4, 0]} zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
          <div className={`planet-label ${status}${full ? '' : ' small'}`}>
            <b>{project.name}</b>
            {full && <span>{current ? 'YOU ARE HERE · ' : ''}{STATUS_LINE(project, counts.working)}</span>}
          </div>
        </Html>
      )}
    </group>
  )
}

/** Bakes the surfaces a little at a time, so the first trip up to the system does not stall while they are drawn. */
export function prewarmSystem(projects: Project[]): () => void {
  const kinds = planetKinds(projects.map((p) => p.id))
  const jobs: (() => void)[] = [...projects.map((p) => () => planetMaps(kinds.get(p.id)!, planetSeed(p.id)))]
  const timers: number[] = []
  jobs.forEach((job, i) => timers.push(window.setTimeout(job, 2500 + i * 500)))
  return () => timers.forEach(window.clearTimeout)
}

export default function SystemWorld({ projects, currentId, labels, onEnter, followId = null }: { projects: Project[]; currentId: string; labels: boolean; onEnter: (id: string) => void; followId?: string | null }) {
  const kinds = useMemo(() => planetKinds(projects.map((p) => p.id)), [projects])
  const theme = themeFor(useUi().theme)
  const workingTotal = useMemo(() => projects.reduce((n, p) => n + agentCounts(p).working, 0), [projects])
  return (
    <group>
      <Star workingTotal={workingTotal} glow={theme.starGlow} />
      {projects.map((p, i) => (
        <group key={p.id}>
          <Orbit index={i} current={p.id === currentId} />
          <Planet project={p} index={i} kind={kinds.get(p.id)!} current={p.id === currentId} labels={labels} onEnter={onEnter} light={theme.starLight} follow={followId === p.id} />
        </group>
      ))}
    </group>
  )
}
