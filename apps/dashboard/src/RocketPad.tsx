import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { Color, DoubleSide, LatheGeometry, Object3D, Vector2, type Group, type InstancedMesh, type Mesh, type MeshBasicMaterial, type MeshStandardMaterial } from 'three'
import StaticMerge from './StaticMerge'
import WeldBot, { type WeldCtrl } from './WeldBot'
import InspectionDrone, { type DroneCtrl } from './InspectionDrone'
import type { Project } from './projects'
import { dataTag } from './live/tags'
import { LAUNCH_PAD, TOWER, launchPadWorld, rocketAt, type RocketPhase } from './launchpad'
import { BOUNDS, ROCKET_BASE, SEAM_Y, SECTIONS, radiusAt, sectionProfile } from './rocket'
import { seatShapes } from './bayShapes'
import { useQuality } from './qualityContext'
import { sound } from './soundEngine'

declare global {
  interface Window {
    /** The welding robot's live state, for checking in the browser: `__weld.tipError` is the torch tip's distance from the seam. */
    __weld?: WeldCtrl
  }
}

const PUFFS = 8
const BEADS = 56
const TOWER_XZ: [number, number] = [TOWER.x, TOWER.z]
/** Height of the crane's jib at the top of the tower, and how far a section hangs above its place before it is lowered. */
const JIB_Y = TOWER.height - 0.2
const DROP = 1.8
const PARKED = 0.12
/** The two swing arms: how high they are on the tower, and how long. */
const ARMS = [1.2, 2.4]
const ARM_LENGTH = Math.hypot(TOWER.x, TOWER.z) - 0.47
/** Turn of an arm, about the tower, that points it at the rocket. */
const ARM_AIM = Math.atan2(-TOWER.x, -TOWER.z)
const JIB_LENGTH = Math.hypot(TOWER.x, TOWER.z) + 0.3

const ease = (k: number) => {
  const c = Math.min(1, Math.max(0, k))
  return c * c * (3 - 2 * c)
}
const mix = (a: number, b: number, k: number) => a + (b - a) * k

const SECTION_GEOMETRY = Array.from({ length: SECTIONS }, (_, k) => new LatheGeometry(sectionProfile(k, 12).map(([r, y]) => new Vector2(r, y)), 48))
const BELL = new LatheGeometry([[0.34, 0.12], [0.3, 0.2], [0.22, 0.32], [0.16, 0.52]].map(([r, y]) => new Vector2(r, y)), 28)
const SECTION_COLOR = ['#8c2a1c', '#e3e6ea', '#e3e6ea', '#e3e6ea', '#d8402a', '#d8402a']
const STEEL = '#8d949c'
const HOT = new Color('#ff9a2a')
const COOL = new Color('#6b7078')

const caption = (phase: RocketPhase, solid: number, welding: boolean, lights: number, tag: string): string => {
  switch (phase) {
    case 'build':
    case 'rebuild':
      return welding ? `Welding section ${solid + 1}/${SECTIONS} · ${tag}` : `Rocket ${solid}/${SECTIONS} sections · ${tag}`
    case 'hold':
      return `Ready to launch · ${tag}`
    case 'countdown':
      return lights >= 3 ? `Ignition · ${tag}` : `T-minus ${3 - lights} · ${tag}`
    case 'lift':
      return `Lift-off! · ${tag}`
    default:
      return `Next rocket · ${tag}`
  }
}

/**
 * The launch pad, in the slot beside the cradle. The rocket is built section by section: a crane on the tower lowers
 * each section into place, and a robot on a lift welds its seam, with the rocket turning on a turntable so the seam
 * passes under the torch. How many sections are finished follows the project's demo progress; once the demo build
 * is complete the rocket counts down, lifts off with flame and smoke, and a new one is built. Demo motion: it never
 * claims anything was really shipped.
 */
export default function RocketPad({ project, labels, weldShow = true, drone: showDrone = true }: { project: Project; labels: boolean; weldShow?: boolean; drone?: boolean }) {
  const world = useMemo(() => launchPadWorld(), [])
  const simple = useQuality().simple
  const tag = dataTag(project)
  const pad = useRef<Group>(null)
  const rocket = useRef<Group>(null)
  const flame = useRef<Group>(null)
  const band = useRef<MeshStandardMaterial>(null)
  const glowDisc = useRef<MeshBasicMaterial>(null)
  const beacon = useRef<MeshStandardMaterial>(null)
  const lamps = useRef<(MeshStandardMaterial | null)[]>([])
  const arms = useRef<Group>(null)
  const armGroups = useRef<(Group | null)[]>([])
  const retract = useRef(0)
  const puffs = useRef<InstancedMesh>(null)
  const label = useRef<HTMLDivElement>(null)
  const last = useRef<RocketPhase>('build')
  const lastWork = useRef<string | null>(null)
  const lastArc = useRef(false)
  const lastLights = useRef(0)
  const dummy = useMemo(() => new Object3D(), [])
  const core = useRef<Mesh>(null)
  const sections = useRef<(Group | null)[]>([])
  const ghosts = useRef<(Mesh | null)[]>([])
  const trolley = useRef<Group>(null)
  const cable = useRef<Mesh>(null)
  const hook = useRef<Mesh>(null)
  const beads = useRef<InstancedMesh>(null)
  const ctrl = useRef<WeldCtrl>({ seamY: ROCKET_BASE + SEAM_Y[1], seamR: radiusAt(SEAM_Y[1]), reach: 0, rig: null, tipError: Number.NaN })
  const color = useMemo(() => new Color(), [])
  const drone = useRef<DroneCtrl>({ seamY: SEAM_Y[1], scanning: false, away: 0 })
  const crewHead = useRef<Group>(null)
  const crewHand = useRef<Group>(null)
  const shape = useMemo(() => seatShapes(project.id, 13, 1)[0], [project.id])
  useEffect(() => {
    window.__weld = ctrl.current
  }, [])

  useFrame(({ clock }, dt) => {
    const t = clock.getElapsedTime()
    const m = rocketAt(project.progress, t)
    const w = m.work
    const c = ctrl.current

    // the rocket: lifted, and turning on its turntable while a seam is welded
    if (rocket.current) {
      rocket.current.position.y = ROCKET_BASE + m.lift
      rocket.current.rotation.y = m.yaw
    }
    if (band.current) band.current.emissiveIntensity = 0.3 + 2.4 * m.glow

    // the crane and the section it is carrying
    let trolleyF = PARKED
    let hookY = JIB_Y - 0.5
    for (let k = 0; k < SECTIONS; k++) {
      const g = sections.current[k]
      const ghost = ghosts.current[k]
      const active = w !== null && w.index === k
      const solid = k < m.solid
      let offsetY = 0
      let towards = 0 // how far from the tower toward the rocket's axis the section hangs (0 at the tower, 1 on the axis)
      let size = 1
      let shown = solid
      if (active && w) {
        shown = true
        const top = ROCKET_BASE + BOUNDS[k + 1]
        if (w.phase === 'lower') {
          trolleyF = mix(PARKED, 1, ease(w.u / 0.35))
          towards = trolleyF
          offsetY = DROP * (1 - ease((w.u - 0.3) / 0.7))
          size = ease(w.u / 0.12)
          hookY = top + offsetY + 0.12
        } else if (w.phase === 'weld') {
          trolleyF = mix(1, PARKED, ease(w.u / 0.15))
          towards = 1
          hookY = mix(top + 0.12, JIB_Y - 0.5, ease(w.u / 0.12))
        } else if (w.phase === 'settle') {
          towards = 1
          trolleyF = PARKED
        } else {
          // raise: the crane comes back for the section, lifts it clear and carries it off
          trolleyF = w.u < 0.25 ? mix(PARKED, 1, ease(w.u / 0.25)) : w.u < 0.6 ? 1 : mix(1, 0, ease((w.u - 0.6) / 0.4))
          towards = w.u < 0.6 ? 1 : trolleyF
          offsetY = DROP * ease((w.u - 0.15) / 0.55)
          size = 1 - ease((w.u - 0.88) / 0.12)
          hookY = w.u < 0.15 ? mix(JIB_Y - 0.5, top + 0.12, ease(w.u / 0.15)) : top + offsetY + 0.12
        }
      }
      if (g) {
        g.visible = shown && size > 0.01
        g.position.set(TOWER.x * (1 - towards) * (active ? 1 : 0), offsetY, TOWER.z * (1 - towards) * (active ? 1 : 0))
        g.scale.setScalar(Math.max(0.001, size))
      }
      // an outline marks where a section that is not built yet will go
      if (ghost) ghost.visible = !solid && !(active && w && (w.phase === 'weld' || w.phase === 'settle'))
    }
    if (trolley.current) trolley.current.position.set(TOWER.x * (1 - trolleyF), JIB_Y - 0.12, TOWER.z * (1 - trolleyF))
    if (cable.current && hook.current) {
      const top = JIB_Y - 0.2
      const len = Math.max(0.05, top - hookY)
      cable.current.position.set(TOWER.x * (1 - trolleyF), top - len / 2, TOWER.z * (1 - trolleyF))
      cable.current.scale.y = len
      hook.current.position.set(TOWER.x * (1 - trolleyF), hookY, TOWER.z * (1 - trolleyF))
    }

    // the welding robot: where it must be, and how firmly its arm is reaching
    if (w) {
      const index = w.index
      const previous = m.phase === 'rebuild' ? Math.max(0, index - 1) : index
      // the seam's height on the rocket, then in the pad's space (the rocket stands on the pad, so add its base)
      const onRocket = mix(SEAM_Y[previous], SEAM_Y[index], w.phase === 'lower' ? ease(w.u / 0.8) : 1)
      c.seamY = ROCKET_BASE + onRocket
      c.seamR = radiusAt(onRocket)
      c.reach = w.phase === 'weld' ? ease(Math.min(w.u / 0.12, (1 - w.u) / 0.12)) : 0
    } else c.reach = 0

    // the inspection drone hovers over the seam being worked on, scans it while it is welded and cooling, and flies clear for lift-off
    const d = drone.current
    d.seamY = w ? SEAM_Y[w.index] : 1.8 + 0.9 * Math.sin(t * 0.4)
    d.scanning = w !== null && (w.phase === 'weld' || w.phase === 'settle')
    const clear = m.phase === 'lift' || m.phase === 'gone' || (m.phase === 'countdown' && m.lights >= 2) ? 1 : 0
    d.away += (clear - d.away) * Math.min(1, dt * 1.2)

    // the crew robot in the cabin window looks around, and waves during the countdown and when the cabin is finished
    const waving = m.phase === 'countdown' || (w !== null && w.index === 3 && w.phase === 'settle') || (m.solid >= 4 && m.phase === 'build' && t % 14 < 3)
    if (crewHead.current) crewHead.current.rotation.y = Math.sin(t * 0.8) * 0.45
    if (crewHand.current) {
      crewHand.current.visible = waving
      crewHand.current.rotation.z = Math.sin(t * 10) * 0.55
    }

    // the weld bead: it appears under the torch as the seam turns past it, glowing hot and cooling to steel
    const bead = beads.current
    if (bead) {
      const welding = w !== null && (w.phase === 'weld' || w.phase === 'settle')
      bead.visible = welding && c.rig !== null
      if (welding && w && c.rig) {
        const turn = w.phase === 'weld' ? m.yaw / (Math.PI * 2) : 1
        const psi = Math.atan2(c.rig.seam[0], c.rig.seam[2])
        const radius = radiusAt(SEAM_Y[w.index]) + 0.004
        const cooling = w.phase === 'settle' ? 1 - ease(w.u) : 1
        for (let i = 0; i < BEADS; i++) {
          const along = i / BEADS
          const alpha = psi - Math.PI * 2 * along
          const there = along <= turn
          dummy.position.set(radius * Math.sin(alpha), SEAM_Y[w.index], radius * Math.cos(alpha))
          dummy.rotation.set(0, alpha, 0)
          dummy.scale.set(there ? 0.03 : 0.0001, 0.018, 0.03)
          dummy.updateMatrix()
          bead.setMatrixAt(i, dummy.matrix)
          const heat = there ? Math.exp(-(turn - along) * 16) * cooling : 0
          bead.setColorAt(i, color.copy(COOL).lerp(HOT, Math.min(1, heat)).multiplyScalar(1 + heat * 1.4))
        }
        bead.instanceMatrix.needsUpdate = true
        if (bead.instanceColor) bead.instanceColor.needsUpdate = true
      }
    }

    // the flame, smoke, and the tower's swing arms and lights
    if (flame.current) {
      flame.current.visible = m.flame > 0.02
      const wobble = 0.85 + 0.3 * Math.abs(Math.sin(t * 38))
      flame.current.scale.set(1, m.flame * wobble * (1 + Math.min(1.2, m.lift * 0.05)), 1)
    }
    if (core.current) core.current.visible = m.flame > 0.02
    if (glowDisc.current) glowDisc.current.opacity = m.phase === 'lift' ? Math.max(0, 0.7 - m.lift * 0.05) : m.phase === 'countdown' ? 0.15 : 0
    if (beacon.current) beacon.current.emissiveIntensity = 0.6 + 1.6 * (0.5 + 0.5 * Math.sin(t * 5))
    lamps.current.forEach((lamp, i) => lamp && (lamp.emissiveIntensity = i < m.lights ? 3 : 0.1))
    const wantRetract = m.phase === 'lift' || (m.phase === 'countdown' && m.lights >= 3) ? 1 : 0
    retract.current += (wantRetract - retract.current) * Math.min(1, dt * 3)
    armGroups.current.forEach((a, i) => a && (a.rotation.y = ARM_AIM + retract.current * (1.05 + i * 0.1)))
    if (arms.current) arms.current.visible = m.phase === 'hold' || m.phase === 'countdown' || m.phase === 'lift'
    if (puffs.current) {
      const burning = m.phase === 'lift' && m.lift < 12
      for (let i = 0; i < PUFFS; i++) {
        const a = (i / PUFFS) * Math.PI * 2
        const grow = burning ? Math.min(1, m.lift / 6 + 0.15) : 0
        const spread = 0.6 + 2.2 * grow + (i % 2) * 0.4
        dummy.position.set(Math.sin(a) * spread, 0.4 + 0.3 * grow * (1 + (i % 3)), Math.cos(a) * spread)
        dummy.rotation.set(0, 0, 0)
        dummy.scale.setScalar(burning ? 0.25 + 0.9 * grow : 0.0001)
        dummy.updateMatrix()
        puffs.current.setMatrixAt(i, dummy.matrix)
      }
      puffs.current.instanceMatrix.needsUpdate = true
      puffs.current.visible = burning
    }
    if (label.current) label.current.textContent = caption(m.phase, m.solid, w?.phase === 'weld', m.lights, tag)
    // sound, heard only near the pad: the weld arc, the crane and turntable motors, the drone, and the moments
    const at: [number, number, number] = [world[0], 1.4, world[2]]
    const crane = w !== null && (w.phase === 'lower' || w.phase === 'raise')
    sound.workshop(
      {
        arc: c.reach > 0.97 ? 1 : 0,
        motor: crane ? 1 : w?.phase === 'weld' ? 0.55 : 0,
        motorHz: crane && w ? 170 + 90 * (w.phase === 'lower' ? w.u : 1 - w.u) : 95,
        drone: d.away < 0.5 ? 1 : 0,
      },
      at,
    )
    const workNow = w?.phase ?? null
    if (lastWork.current === 'lower' && workNow === 'weld') sound.clunk(at)
    if (lastWork.current !== 'settle' && workNow === 'settle') sound.tube('arrive', at)
    lastWork.current = workNow
    const arcOn = c.reach > 0.97
    if (arcOn && !lastArc.current) sound.arcStrike(at)
    lastArc.current = arcOn
    const lightsNow = m.phase === 'countdown' ? m.lights : 0
    if (lightsNow > lastLights.current) sound.beep(at, lightsNow >= 3)
    lastLights.current = lightsNow
    if (m.phase === 'lift' && last.current !== 'lift') sound.launch(at)
    last.current = m.phase
  })

  return (
    <group ref={pad} position={[world[0], 0, world[2]]} rotation={[0, LAUNCH_PAD.angle, 0]}>
      <StaticMerge>
        {/* the pad: a low disc with a raised rim, hazard stripes round it and a dark flame trench in the middle */}
        <mesh position={[0, 0.1, 0]}>
          <cylinderGeometry args={[LAUNCH_PAD.padRadius, LAUNCH_PAD.padRadius + 0.12, 0.2, 48]} />
          <meshStandardMaterial color="#1b1f24" metalness={0.7} roughness={0.45} />
        </mesh>
        <mesh position={[0, 0.215, 0]} rotation-x={-Math.PI / 2}>
          <ringGeometry args={[LAUNCH_PAD.padRadius - 0.2, LAUNCH_PAD.padRadius - 0.1, 64]} />
          <meshBasicMaterial color="#ff8a1f" toneMapped={false} />
        </mesh>
        {Array.from({ length: 16 }, (_, k) => (
          <mesh key={k} position={[Math.sin((k / 16) * Math.PI * 2) * 1.4, 0.216, Math.cos((k / 16) * Math.PI * 2) * 1.4]} rotation={[-Math.PI / 2, 0, -(k / 16) * Math.PI * 2]}>
            <planeGeometry args={[0.14, 0.34]} />
            <meshBasicMaterial color={k % 2 ? '#ffb347' : '#101215'} toneMapped={false} />
          </mesh>
        ))}
        <mesh position={[0, 0.22, 0]} rotation-x={-Math.PI / 2}>
          <circleGeometry args={[0.7, 32]} />
          <meshStandardMaterial color="#07090b" metalness={0.8} roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.225, 0]} rotation-x={-Math.PI / 2}>
          <ringGeometry args={[0.7, 0.76, 32]} />
          <meshStandardMaterial color="#3a4048" metalness={0.8} roughness={0.4} />
        </mesh>

        {/* the gantry tower: two posts, rungs and braces, a foot plate, and the crane's jib across the top */}
        <mesh position={[TOWER.x, 0.1, TOWER.z]}>
          <boxGeometry args={[0.8, 0.1, 0.8]} />
          <meshStandardMaterial color="#2a2f35" metalness={0.75} roughness={0.5} />
        </mesh>
        {[-0.2, 0.2].map((dx) => (
          <mesh key={dx} position={[TOWER.x + dx, TOWER.height / 2, TOWER.z]}>
            <boxGeometry args={[0.09, TOWER.height, 0.09]} />
            <meshStandardMaterial color="#3a4048" metalness={0.8} roughness={0.45} />
          </mesh>
        ))}
        {Array.from({ length: 11 }, (_, i) => {
          const y0 = 0.3 + i * 0.45
          return (
            <group key={i}>
              <mesh position={[TOWER.x, y0, TOWER.z]}>
                <boxGeometry args={[0.4, 0.05, 0.05]} />
                <meshStandardMaterial color="#2a2f35" metalness={0.8} roughness={0.45} />
              </mesh>
              <mesh position={[TOWER.x, y0 + 0.225, TOWER.z]} rotation={[0, 0, (i % 2 ? 1 : -1) * Math.atan2(0.4, 0.45)]}>
                <boxGeometry args={[0.03, Math.hypot(0.4, 0.45), 0.03]} />
                <meshStandardMaterial color="#2a2f35" metalness={0.8} roughness={0.45} />
              </mesh>
            </group>
          )
        })}
        <group position={[TOWER.x, JIB_Y, TOWER.z]} rotation={[0, ARM_AIM, 0]}>
          <mesh position={[0, 0, JIB_LENGTH / 2 - 0.3]}>
            <boxGeometry args={[0.14, 0.16, JIB_LENGTH]} />
            <meshStandardMaterial color="#4a5058" metalness={0.8} roughness={0.4} />
          </mesh>
          <mesh position={[0, 0, -0.55]}>
            <boxGeometry args={[0.36, 0.3, 0.4]} />
            <meshStandardMaterial color="#2a2f35" metalness={0.7} roughness={0.5} />
          </mesh>
        </group>
        <mesh position={[TOWER.x, TOWER.height + 0.03, TOWER.z]}>
          <boxGeometry args={[0.5, 0.06, 0.5]} />
          <meshStandardMaterial color="#2a2f35" metalness={0.75} roughness={0.5} />
        </mesh>
        {/* two floodlight posts on the pad rim */}
        {[-0.9, 0.9].map((x) => (
          <mesh key={x} position={[x * 1.75, 0.55, 0.7]}>
            <cylinderGeometry args={[0.035, 0.05, 1.1, 8]} />
            <meshStandardMaterial color="#3a4048" metalness={0.8} roughness={0.45} />
          </mesh>
        ))}
      </StaticMerge>
      {[-0.9, 0.9].map((x) => (
        <mesh key={x} position={[x * 1.75, 1.15, 0.7]}>
          <sphereGeometry args={[0.09, 12, 8]} />
          <meshBasicMaterial color="#ffe9b8" toneMapped={false} />
        </mesh>
      ))}

      {/* the crane: a trolley on the jib, a cable and a hook */}
      <group ref={trolley}>
        <mesh>
          <boxGeometry args={[0.24, 0.16, 0.24]} />
          <meshStandardMaterial color="#d6a21a" metalness={0.6} roughness={0.45} />
        </mesh>
      </group>
      <mesh ref={cable}>
        <cylinderGeometry args={[0.012, 0.012, 1, 6]} />
        <meshStandardMaterial color="#1b1f24" metalness={0.6} roughness={0.5} />
      </mesh>
      <mesh ref={hook}>
        <boxGeometry args={[0.12, 0.1, 0.12]} />
        <meshStandardMaterial color="#d6a21a" metalness={0.6} roughness={0.45} />
      </mesh>

      {/* swing arms that hold the finished rocket until ignition */}
      <group ref={arms}>
        {ARMS.map((y, i) => (
          <group key={y} position={[TOWER.x, y, TOWER.z]} rotation={[0, ARM_AIM, 0]} ref={(g) => { armGroups.current[i] = g }}>
            <mesh position={[0, 0, ARM_LENGTH / 2]}>
              <boxGeometry args={[0.1, 0.12, ARM_LENGTH]} />
              <meshStandardMaterial color="#4a5058" metalness={0.8} roughness={0.4} />
            </mesh>
            <mesh position={[0, 0, ARM_LENGTH + 0.02]} rotation-x={Math.PI / 2}>
              <cylinderGeometry args={[0.1, 0.1, 0.1, 14]} />
              <meshStandardMaterial color="#d6d9de" metalness={0.8} roughness={0.35} />
            </mesh>
          </group>
        ))}
      </group>

      {/* countdown lights up the tower face, and a beacon on top */}
      {[0, 1, 2].map((k) => (
        <mesh key={k} position={[TOWER.x, 3.1 + k * 0.5, TOWER.z + 0.1]}>
          <sphereGeometry args={[0.08, 12, 8]} />
          <meshStandardMaterial ref={(m) => { lamps.current[k] = m }} color="#201408" emissive="#ffb347" emissiveIntensity={0.1} />
        </mesh>
      ))}
      <mesh position={[TOWER.x, TOWER.height + 0.15, TOWER.z]}>
        <sphereGeometry args={[0.1, 12, 8]} />
        <meshStandardMaterial ref={beacon} color="#200808" emissive="#ff3030" emissiveIntensity={1} />
      </mesh>

      {/* the rocket: six sections on a turntable that stands exactly on the middle of the pad */}
      <group ref={rocket} position={[0, ROCKET_BASE, 0]}>
        {SECTION_GEOMETRY.map((geometry, k) => (
          <group key={k}>
            <mesh geometry={geometry} ref={(g) => { ghosts.current[k] = g }} visible={false}>
              <meshBasicMaterial color={project.accent} wireframe transparent opacity={0.3} toneMapped={false} />
            </mesh>
            <group ref={(g) => { sections.current[k] = g }} visible={false}>
              <mesh geometry={geometry} castShadow>
                <meshStandardMaterial color={SECTION_COLOR[k]} metalness={0.3} roughness={0.36} side={DoubleSide} />
              </mesh>
              <mesh position={[0, SEAM_Y[k], 0]} rotation-x={Math.PI / 2}>
                <torusGeometry args={[radiusAt(SEAM_Y[k]) + 0.004, 0.014, 8, 56]} />
                <meshStandardMaterial color={STEEL} metalness={0.8} roughness={0.35} />
              </mesh>
              {k === 0 && (
                <mesh geometry={BELL} castShadow>
                  <meshStandardMaterial color="#1b1f24" metalness={0.85} roughness={0.35} side={DoubleSide} />
                </mesh>
              )}
              {k === 2 && (
                <mesh position={[0, 1.3, 0]}>
                  <cylinderGeometry args={[0.478, 0.478, 0.1, 40]} />
                  <meshStandardMaterial ref={band} color="#10181c" emissive={project.accent} emissiveIntensity={1} />
                </mesh>
              )}
              {k === 3 && (
                <group position={[0, 1.8, 0.465]}>
                  <mesh>
                    <torusGeometry args={[0.14, 0.032, 10, 28]} />
                    <meshStandardMaterial color="#d6d9de" metalness={0.8} roughness={0.35} />
                  </mesh>
                  <mesh position={[0, 0, 0.003]}>
                    <circleGeometry args={[0.125, 24]} />
                    <meshStandardMaterial color="#0b2a33" emissive="#3aa6c0" emissiveIntensity={0.7} />
                  </mesh>
                  {/* the crew: a little robot behind a glass bubble, looking around, waving its hand now and then */}
                  <group ref={crewHead} position={[0, -0.008, 0.05]}>
                    <mesh>
                      <sphereGeometry args={[0.06, 16, 12]} />
                      <meshStandardMaterial color="#f0e6d2" metalness={0.2} roughness={0.4} />
                    </mesh>
                    <mesh position={[0, 0.004, 0.048]}>
                      <boxGeometry args={[0.082, 0.032, 0.02]} />
                      <meshStandardMaterial color="#0b0f14" roughness={0.2} metalness={0.4} />
                    </mesh>
                    {[-0.022, 0.022].map((x) => (
                      <mesh key={x} position={[x, 0.004, 0.06]}>
                        <sphereGeometry args={[0.008, 8, 6]} />
                        <meshBasicMaterial color="#7fe9ff" toneMapped={false} />
                      </mesh>
                    ))}
                    <mesh position={[0, 0.075, 0]}>
                      <cylinderGeometry args={[0.003, 0.003, 0.05, 6]} />
                      <meshStandardMaterial color="#d6d9de" metalness={0.8} roughness={0.3} />
                    </mesh>
                    <mesh position={[0, 0.103, 0]}>
                      <sphereGeometry args={[0.011, 8, 6]} />
                      <meshBasicMaterial color="#ffb347" toneMapped={false} />
                    </mesh>
                  </group>
                  <group ref={crewHand} position={[-0.075, -0.07, 0.06]} visible={false}>
                    <mesh position={[0, 0.032, 0]}>
                      <cylinderGeometry args={[0.009, 0.009, 0.064, 8]} />
                      <meshStandardMaterial color="#f0e6d2" roughness={0.4} />
                    </mesh>
                    <mesh position={[0, 0.07, 0]}>
                      <sphereGeometry args={[0.022, 10, 8]} />
                      <meshStandardMaterial color="#f0e6d2" roughness={0.4} />
                    </mesh>
                  </group>
                  <mesh>
                    <sphereGeometry args={[0.14, 20, 14]} />
                    <meshStandardMaterial color="#cfeeff" transparent opacity={0.2} roughness={0.05} metalness={0.2} depthWrite={false} />
                  </mesh>
                </group>
              )}
            </group>
          </group>
        ))}
        <instancedMesh ref={beads} args={[undefined, undefined, BEADS]} frustumCulled={false} visible={false}>
          <sphereGeometry args={[1, 8, 6]} />
          <meshBasicMaterial color="#ffffff" toneMapped={false} />
        </instancedMesh>
        <group ref={flame} position={[0, 0.12, 0]} visible={false}>
          <mesh position={[0, -0.8, 0]} rotation-x={Math.PI}>
            <coneGeometry args={[0.3, 1.6, 14]} />
            <meshBasicMaterial color="#ffb347" transparent opacity={0.85} toneMapped={false} />
          </mesh>
          <mesh ref={core} position={[0, -0.5, 0]} rotation-x={Math.PI}>
            <coneGeometry args={[0.16, 1.0, 12]} />
            <meshBasicMaterial color="#fff2c0" toneMapped={false} />
          </mesh>
        </group>
      </group>

      {weldShow && <WeldBot ctrl={ctrl} pad={pad} tower={TOWER_XZ} variant={shape} seed={77} simple={simple} />}
      {showDrone && <InspectionDrone ctrl={drone} />}

      <mesh position={[0, 0.23, 0]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[LAUNCH_PAD.padRadius - 0.3, 32]} />
        <meshBasicMaterial ref={glowDisc} color="#ffb347" transparent opacity={0} depthWrite={false} toneMapped={false} />
      </mesh>
      {!simple && (
        <instancedMesh ref={puffs} args={[undefined, undefined, PUFFS]} frustumCulled={false} visible={false}>
          <sphereGeometry args={[1, 10, 8]} />
          <meshBasicMaterial color="#cfd3da" transparent opacity={0.28} depthWrite={false} />
        </instancedMesh>
      )}

      {labels && (
        <Html center position={[0, 6.3, 0]} zIndexRange={[4, 0]} style={{ pointerEvents: 'none' }}>
          <div className="bubble" ref={label} />
        </Html>
      )}
    </group>
  )
}
