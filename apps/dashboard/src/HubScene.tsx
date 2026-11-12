import { Activity, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Environment, Html, Lightformer, Stats, useGLTF } from '@react-three/drei'
import { Bloom, DepthOfField, EffectComposer, N8AO, Noise, Vignette } from '@react-three/postprocessing'
import { AdditiveBlending, Color, DoubleSide, type AmbientLight, type Material, type Mesh, MeshBasicMaterial } from 'three'
import { SkeletonUtils } from 'three-stdlib'
import HubCamera, { HUB_CAMERA, INITIAL_VIEW, type ViewState } from './HubCamera'
import HubExtras from './HubExtras'
import HubLife, { applyScreenFx } from './HubLife'
import DesignStudio from './DesignStudio'
import OrbKeepers from './OrbKeepers'
import CourierBots from './CourierBots'
import CrawlerBots from './CrawlerBots'
import SoundDirector from './SoundDirector'
import SpaceWeatherLayer from './SpaceWeatherLayer'
import ConveyorBelts from './ConveyorBelts'
import ShadowThrottle from './ShadowThrottle'
import RocketPad from './RocketPad'
import BunkRing from './BunkRing'
import ArchiveHall from './ArchiveHall'
import RosterCore from './RosterCore'
import { enableShadows } from './shadows'
import BranchLines from './BranchLines'
import RoleRobot from './RoleRobot'
import SkyWorld from './SkyWorld'
import { sceneryFor } from './scenery'
import SystemWorld from './SystemWorld'
import { MODES, detectStartTier, nextTier, parseMode, settingsFor, tierFor, type Mode, type Tier } from './quality'
import { QualityContext } from './qualityContext'
import { keepLow } from './shellCut'
import ParapetRing from './ParapetRing'
import EnergyDome from './EnergyDome'
import { applyShellDetail } from './shellDetail'
import { WEAR_MATERIALS, applyPropWear } from './propWear'
import Wayfinding from './Wayfinding'
import { moodFor } from './mood'
import { DEPARTMENTS, type Department } from './hallLayout'
import { HUB_LAYOUT, type BaySpec } from './hubLayout'
import type { Project } from './projects'
import { seatClip, seatJob, type AnyVariant } from './robotVariants'
import { seatShapes } from './bayShapes'
import type { SeatState } from './seats'
import { labelsFor, uiStore, useUi } from './uiSettings'
import { usePictureMode } from './pictureMode'
import { bayLabel, clipForCrew, crewFor, crewSeed, crewShape, eyeMood, workLine, type BayCrew } from './crew'
import { isActive } from './crewDetails'
import type { RosterEntry } from './live/wire'

/** Desks that are worked at (a robot working or waiting for you), per department: what the glowing branches follow. */
function workSeats(crew: Record<Department, BayCrew>): Record<Department, SeatState[]> {
  return Object.fromEntries(
    DEPARTMENTS.map((d) => [d, crew[d].seats.map((s): SeatState => (s.state === 'running' || s.state === 'needs-you' ? 'robot' : 'empty'))]),
  ) as Record<Department, SeatState[]>
}

/** A small turning gem and a ripple over the head of an agent that is working (green) or waiting for you (amber): this one is a live session. */
function ActiveMarker({ position, waiting }: { position: [number, number, number]; waiting: boolean }) {
  const gem = useRef<Mesh>(null)
  const ripple = useRef<Mesh>(null)
  const color = useMemo(() => new Color(waiting ? '#ffb347' : '#5df0a8').multiplyScalar(2.2), [waiting])
  const beam = useMemo(() => new MeshBasicMaterial({ color: waiting ? '#ffb347' : '#5df0a8', transparent: true, opacity: 0.085, depthWrite: false, blending: AdditiveBlending, side: DoubleSide, toneMapped: false }), [waiting])
  useEffect(() => () => beam.dispose(), [beam])
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    if (gem.current) {
      gem.current.rotation.y = t * (waiting ? 3 : 1.6)
      gem.current.position.y = Math.sin(t * 2.2) * 0.04
      gem.current.scale.setScalar(waiting ? 1 + 0.18 * Math.sin(t * 7) : 1)
    }
    if (ripple.current) {
      const f = (t * (waiting ? 1.2 : 0.7)) % 1
      ripple.current.scale.setScalar(0.7 + f * 1.1)
      ;(ripple.current.material as MeshBasicMaterial).opacity = 0.7 * (1 - f)
    }
  })
  return (
    <group position={[position[0], position[1] + 1.38, position[2]]}>
      {/* a soft spotlight from above, so the agent that works (or waits) is the first thing you see */}
      <mesh position={[0, 0.2, 0]} material={beam}>
        <cylinderGeometry args={[0.05, 0.7, 3.2, 20, 1, true]} />
      </mesh>
      <mesh ref={gem} scale={[1, 1.5, 1]}>
        <octahedronGeometry args={[0.07, 0]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      <mesh ref={ripple} position={[0, -0.12, 0]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.12, 0.135, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.7} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  )
}

/** Highest point of the baked hall that stays: the floor and its edge. Everything above (wall, roof, beams) is replaced by the parapet. */
const FLOOR_TOP = 0.6

function Shell() {
  const { scene } = useGLTF('/models/hub-shell.glb')
  useEffect(() => {
    // take the tall wall, roof and beams off the baked hall once, keeping the floor (the loaded model is shared and cached)
    scene.traverse((o) => {
      const mesh = o as Mesh
      if (mesh.isMesh && mesh.name === 'Shell_Baked' && !mesh.userData.opened) {
        mesh.geometry = keepLow(mesh.geometry, mesh.position.y, FLOOR_TOP)
        mesh.userData.opened = true
        applyShellDetail(mesh.material as Material)
      }
      if (mesh.name === 'Shell_Windows') mesh.visible = false
    })
    enableShadows(scene)
  }, [scene])
  return <primitive object={scene} />
}

function Bay({ spec, index, crew, shapes, lights, alert, labels, tags, onSelect, onCrew }: { spec: BaySpec; index: number; crew: BayCrew; shapes: AnyVariant[]; lights: boolean; alert: boolean; labels: boolean; /** names of the agents, shown when the camera is close */ tags: boolean; onSelect: (d: Department) => void; /** a robot with a real agent behind it was clicked */ onCrew?: (entry: RosterEntry) => void }) {
  const { scene } = useGLTF('/models/bay.glb')
  const clone = useMemo(() => SkeletonUtils.clone(scene), [scene])

  useEffect(() => {
    clone.traverse((o) => {
      // two merged stations show both signs (stacked, two lines) and the props of both jobs: Review & QA, and Development & Integration
      const shown = spec.id === 'review' ? ['review', 'qa'] : spec.id === 'development' ? ['development', 'integration'] : [spec.id as string]
      const sign = /^(Sign|SignBack)_(.+)$/.exec(o.name)
      if (sign) {
        o.visible = shown.includes(sign[2])
        if (spec.id === 'review' || spec.id === 'development') o.position.y = 2.3 + (sign[2] === 'review' || sign[2] === 'development' ? 0.11 : -0.11)
      }
      if (o.name.startsWith('Props_')) o.visible = shown.includes(o.name.slice(6))
    })
    enableShadows(clone)
    applyScreenFx(clone)
    clone.traverse((o) => {
      const material = (o as Mesh).material as Material | undefined
      if (material && WEAR_MATERIALS.has(material.name)) applyPropWear(material)
    })
  }, [clone, spec.id])

  // the shape of each robot is random per seat; what it does follows the department
  return (
    <group
      position={spec.position}
      rotation={[0, spec.rotationY, 0]}
      onClick={(e) => {
        e.stopPropagation()
        onSelect(spec.id)
      }}
    >
      <primitive object={clone} />
      {labels && (
        <Html center position={[0, 3.7, 0]} zIndexRange={[4, 0]} style={{ pointerEvents: 'none' }}>
          <div className={alert ? 'bubble alert' : 'bubble'}>
            {alert ? '! needs you' : bayLabel(crew)}
          </div>
        </Html>
      )}
      {(labels || tags) && crew.more > 0 && (
        <Html center position={[0, labels ? 3.2 : 3.0, 0]} zIndexRange={[4, 0]} style={{ pointerEvents: 'none' }}>
          <div className="more-badge">+{crew.more} more</div>
        </Html>
      )}
      {lights && <pointLight position={[0, 1.8, 0.2]} intensity={2} distance={4.5} color="#ffc890" />}
      {crew.seats.map((slot, i) => {
        if (slot.state === 'empty') return null
        const entry = slot.entry
        const seed = entry ? crewSeed(entry) : index * 3 + i + 1
        const job = seatJob(spec.id, i)
        // a real agent follows its own state; a demo robot keeps the old look (the first one waves when the bay needs you)
        const clip = entry ? clipForCrew(slot.state, job, seed) : alert && i === 0 ? 'wave' : seatClip(job, seed)
        const lively = slot.state === 'running' || slot.state === 'needs-you'
        return (
          <group key={`${spec.id}-${i}`}>
            <RoleRobot
              position={spec.seats[i]}
              variant={entry ? crewShape(entry) : shapes[i]}
              clip={clip}
              seed={seed}
              breakSeed={lively && !(alert && i === 0 && !entry) ? seed : undefined}
              mood={eyeMood(slot.state)}
              onPick={entry && onCrew ? () => onCrew(entry) : undefined}
            />
            {entry && isActive(entry) && <ActiveMarker position={spec.seats[i]} waiting={slot.state === 'needs-you'} />}
            {tags && entry && (
              <Html center position={[spec.seats[i][0], spec.seats[i][1] + 1.55, spec.seats[i][2]]} zIndexRange={[3, 0]} style={{ pointerEvents: 'none' }}>
                <div className={`crew-tag ${slot.state}`} title={entry.stateNote}>
                  {entry.name}
                  {workLine(entry) && <small>{workLine(entry)}</small>}
                </div>
              </Html>
            )}
          </group>
        )
      })}
    </group>
  )
}

/** `?fx=noao,nobloom,noshadow,lowdpr,noweather` switches effects off one by one, to see what each one costs. */
const FX = new Set((new URLSearchParams(window.location.search).get('fx') ?? '').split(',').filter(Boolean))

/** `?quality=lite` (or high, balanced, fast, auto) wins over the saved choice (Settings, or the Quality button). */
const ASKED = new URLSearchParams(window.location.search).get('quality')
const URL_MODE: Mode | null = ASKED ? parseMode(ASKED) : null
const readMode = (): Mode => URL_MODE ?? uiStore.get().quality

/** Where automatic mode starts: lower on a weak or software-only graphics chip. */
const START_TIER = detectStartTier()

/** The hall's general light: it breathes while the project runs, goes warm and slow when it needs you, and sinks when idle. */
function MoodLight({ project }: { project: Project }) {
  const light = useRef<AmbientLight>(null)
  useFrame(({ clock }) => {
    const l = light.current
    if (!l) return
    const m = moodFor(project.status, project.activity, clock.getElapsedTime())
    l.intensity += (m.intensity - l.intensity) * 0.1
    l.color.r += (m.color[0] - l.color.r) * 0.1
    l.color.g += (m.color[1] - l.color.g) * 0.1
    l.color.b += (m.color[2] - l.color.b) * 0.1
  })
  return <ambientLight ref={light} intensity={1} color="#ffeedd" />
}

/** The project's name in big glowing letters above the core. */
function ProjectSign({ project }: { project: Project }) {
  return (
    <Html center position={[0, 6.7, 0]} zIndexRange={[3, 0]} style={{ pointerEvents: 'none' }}>
      <div className="projectsign" style={{ color: project.accent, textShadow: `0 0 18px ${project.accent}` }}>
        {project.name}
        <span>{project.status === 'needs-you' ? 'needs you' : project.status} · {project.source === 'demo' ? 'demo' : 'live'}</span>
      </div>
    </Html>
  )
}

/** Reports the average frame rate every two seconds, after a short warm-up. Skips stalls such as a hidden tab. */
function FpsWatcher({ onWindow }: { onWindow: (fps: number) => void }) {
  const acc = useRef({ frames: 0, start: 0 })
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    const a = acc.current
    if (t < 4) return
    if (a.start === 0 || t - a.start > 5) {
      a.start = t
      a.frames = 0
      return
    }
    a.frames++
    if (t - a.start >= 2) {
      onWindow(a.frames / (t - a.start))
      a.start = t
      a.frames = 0
    }
  })
  return null
}

export default function HubScene({ project, projects, onSelect, onCrew, onLibrary, level = 'hall', onEnter, followId = null }: { project: Project; projects: Project[]; onSelect: (d: Department) => void; onCrew?: (entry: RosterEntry) => void; onLibrary?: () => void; level?: 'hall' | 'system'; onEnter: (id: string) => void; followId?: string | null }) {
  const [view, setView] = useState<ViewState>(INITIAL_VIEW)
  const ui = useUi()
  const parts = sceneryFor(ui.scenery)
  const mode: Mode = URL_MODE ?? ui.quality
  const picture = usePictureMode()
  const show = labelsFor(picture ? 'none' : ui.labels, view.close)
  const hall = level === 'hall' ? show : { bubbles: false, names: false, islands: false }
  const [reached, setReached] = useState<Tier>(START_TIER)
  // edge smoothing can only be chosen when the canvas is created, so a computer that starts in lite never turns it on
  const [antialias] = useState(() => tierFor(readMode(), START_TIER) !== 'lite')
  const slowWindows = useRef(0)
  const tier = tierFor(mode, reached)
  const q = settingsFor(tier)
  useEffect(() => {
    document.body.dataset.quality = tier
  }, [tier])
  // two slow readings in a row before stepping down, so one hiccup does not lower the picture
  const onWindow = useCallback(
    (fps: number) => {
      if (mode !== 'auto') return
      const next = nextTier(reached, fps)
      if (next === reached) slowWindows.current = 0
      else if (++slowWindows.current >= 2) {
        slowWindows.current = 0
        setReached(next)
      }
    },
    [mode, reached],
  )
  const cycleMode = () => {
    const next = MODES[(MODES.indexOf(mode) + 1) % MODES.length]
    uiStore.set({ quality: next })
    slowWindows.current = 0
  }
  const crew = useMemo(() => crewFor(project, HUB_LAYOUT.bays[0].seats.length), [project])
  const seatStates = useMemo(() => workSeats(crew), [crew])
  return (
    <>
    <Canvas
      shadows={!FX.has('noshadow') && q.shadows}
      dpr={FX.has('lowdpr') ? 1 : q.dpr}
      onCreated={({ gl, scene, camera }) => { Object.assign(window, { __gl: gl, __scene: scene, __camera: camera }) }}
      camera={{ position: HUB_CAMERA.position, fov: HUB_CAMERA.fov, near: 0.1, far: 700 }}
      gl={{ antialias, powerPreference: 'high-performance' }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <FpsWatcher onWindow={onWindow} />
      {q.shadows && !FX.has('noshadow') && <ShadowThrottle every={FX.has('shadowseveryframe') ? 1 : q.shadowEvery} />}
      <color attach="background" args={['#090c13']} />
      {level === 'hall' && <fog attach="fog" args={['#090c13', 110, 260]} />}
      <MoodLight project={project} />
      {level === 'hall' && <directionalLight
        key={q.shadowMap}
        position={[6, 24, 10]}
        intensity={1.6}
        color="#ffe2bd"
        castShadow
        shadow-mapSize={[q.shadowMap, q.shadowMap]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.05}
        shadow-camera-left={-18}
        shadow-camera-right={18}
        shadow-camera-top={18}
        shadow-camera-bottom={-18}
        shadow-camera-near={1}
        shadow-camera-far={70}
      />}
      <Environment resolution={128} background={false}>
        <Lightformer form="rect" intensity={2} color="#ffe6c8" position={[0, 9, 0]} rotation-x={Math.PI / 2} scale={[10, 10, 1]} />
        <Lightformer form="rect" intensity={1.2} color="#7fe9ff" position={[-8, 3, 4]} rotation-y={Math.PI / 2} scale={[6, 4, 1]} />
      </Environment>
      <QualityContext.Provider value={q}>
      <Suspense fallback={null}>
        <SkyWorld project={project} system={level === 'system'} />
        {level === 'system' && <SystemWorld projects={projects} currentId={project.id} labels={show.islands} onEnter={onEnter} followId={followId} />}
        {/* the hall is paused (not just hidden) in the solar system: its animations stop and its state is kept */}
        <Activity mode={level === 'hall' ? 'visible' : 'hidden'}>
        <group visible={level === 'hall'}>
        <Shell />
        <RosterCore project={project} />
        {hall.islands && <ProjectSign project={project} />}
        <Wayfinding />
        <ParapetRing accent={project.accent} status={project.status} />
        {!q.simple && <EnergyDome accent={project.accent} status={project.status} />}
        {level === 'hall' && parts.weather && q.weather !== 'off' && ui.spaceWeather && !FX.has('noweather') && <SpaceWeatherLayer project={project} mode={q.weather} />}
        <HubExtras dust={parts.dust} />
        <HubLife parts={parts} />
        <DesignStudio />
        {parts.wanderers && <OrbKeepers />}
        {parts.couriers && <CourierBots />}
        {parts.wanderers && <CrawlerBots />}
        <SoundDirector project={project} />
        {parts.belt && <ConveyorBelts project={project} />}
        <RocketPad project={project} labels={hall.bubbles} weldShow={parts.weldShow} drone={parts.drone} />
        <ArchiveHall project={project} labels={hall.bubbles} onOpen={onLibrary} tenders={parts.tenders} />
        <BunkRing project={project} labels={hall.bubbles} tags={hall.names} chip={!picture && ui.labels !== 'none'} onCrew={onCrew} />
        <BranchLines seatStates={seatStates} />
        {HUB_LAYOUT.bays.map((spec, index) => (
          <Bay key={`${project.id}-${spec.id}`} spec={spec} index={index} crew={crew[spec.id]} lights={!q.simple} shapes={seatShapes(project.id, index, spec.seats.length)} alert={project.attention === spec.id} labels={hall.bubbles} tags={hall.names} onSelect={onSelect} onCrew={onCrew} />
        ))}
        </group>
        </Activity>
      </Suspense>
      </QualityContext.Provider>
      <HubCamera onView={setView} level={level} systemCount={projects.length} />
      {(q.bloom || q.ao || q.dof || q.film) && (
        <EffectComposer multisampling={0}>
          {level === 'hall' && view.close && q.dof && <DepthOfField target={view.target} worldFocusRange={6} bokehScale={2.2} height={480} />}
          {level === 'hall' && !FX.has('noao') && q.ao && <N8AO aoRadius={1.2} intensity={2.5} distanceFalloff={1} quality="performance" />}
          {!FX.has('nobloom') && q.bloom && <Bloom mipmapBlur luminanceThreshold={1.2} intensity={0.55} />}
          {q.film && !FX.has('nofilm') && <Vignette offset={0.3} darkness={0.55} />}
          {q.film && !FX.has('nofilm') && <Noise premultiply opacity={0.05} />}
        </EffectComposer>
      )}
      {ui.showFps && !picture && <Stats />}
    </Canvas>
    {mode !== 'auto' && <button className="quality" onClick={cycleMode} title="Click to change how much detail is drawn. Auto lowers it by itself when the frame rate is low.">
      Quality: {mode}
    </button>}
    </>
  )
}
