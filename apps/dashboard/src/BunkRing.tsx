import { useMemo } from 'react'
import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, Color, DoubleSide, MeshBasicMaterial, MeshStandardMaterial, SphereGeometry, type BufferGeometry } from 'three'
import RoleRobot from './RoleRobot'
import StaticMerge from './StaticMerge'
import { crewSeed, crewShape, eyeMood } from './crew'
import { BUNKS, FROST_LEVELS, REST, bunkSpecs, frostLevel, restFill, restSlots } from './restBunks'
import { MOON_LOOK } from './systemLayout'
import type { Project } from './projects'
import type { RosterEntry } from './live/wire'

// The rest pods: up to six low pods round the core deck, lying along the ring. Each agent that is asleep or standing by lies on
// its back in one under a curved glass canopy, so the bays show only the agents that work or wait for you. The frost on the
// canopy is the time the agent has been asleep (real time since its last activity): clear glass at first, thickest after eight
// hours. A glowing ring on the floor marks every pod. There are never empty pods; a demo project has none.

const FRAME = new MeshStandardMaterial({ color: '#27324f', roughness: 0.55, metalness: 0.4 })
const MATTRESS = new MeshStandardMaterial({ color: '#4a5d96', roughness: 0.95 })
// glowing edges (HDR, so the bloom lights them)
const EDGE = new MeshBasicMaterial({ color: new Color('#8fb4ff').multiplyScalar(2.2), toneMapped: false })
const FLOOR_GLOW = new MeshBasicMaterial({ color: '#8fb4ff', transparent: true, opacity: 0.16, depthWrite: false, blending: AdditiveBlending, side: DoubleSide, toneMapped: false })
const FLOOR_LINE = new MeshBasicMaterial({ color: new Color('#8fb4ff').multiplyScalar(1.6), toneMapped: false, side: DoubleSide })
// the glass of the canopy, and one frosted layer for every step of frost (shared by all the pods)
const GLASS = new MeshStandardMaterial({ color: '#a9c4ff', emissive: '#4f74d9', emissiveIntensity: 0.55, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.34, side: DoubleSide, depthWrite: false })
const FROSTS = Array.from({ length: FROST_LEVELS + 1 }, (_, i) => new MeshStandardMaterial({ color: '#eef3ff', roughness: 0.9, transparent: true, opacity: (i / FROST_LEVELS) * 0.55, side: DoubleSide, depthWrite: false }))
const PILLOWS = new Map<string, MeshStandardMaterial>()
const toolColour = (agent: string): string => (MOON_LOOK[agent as keyof typeof MOON_LOOK] ?? MOON_LOOK.other).colour
const pillowFor = (agent: string): MeshStandardMaterial => {
  const key = toolColour(agent)
  if (!PILLOWS.has(key)) PILLOWS.set(key, new MeshStandardMaterial({ color: key, roughness: 0.9, emissive: key, emissiveIntensity: 0.35 }))
  return PILLOWS.get(key)!
}

const HALF = BUNKS.length / 2
const RAIL_X = BUNKS.width / 2 - 0.03
/** The canopy: a stretched dome over the pod, a little taller than it is wide. */
const CANOPY_RADIUS = BUNKS.width / 2 - 0.02
const CANOPY_HEIGHT = 0.72
const CANOPY_BASE = 0.3

function canopyGeometry(grow: number): BufferGeometry {
  // an upper half of a sphere, stretched along the pod: a domed shell that looks like a pod from every side
  const dome = new SphereGeometry(1, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2)
  dome.scale(CANOPY_RADIUS * grow, CANOPY_HEIGHT * grow, HALF * 1.04 * grow)
  return dome
}
let canopyGlass: BufferGeometry | null = null
let canopyFrost: BufferGeometry | null = null
const glassGeometry = (): BufferGeometry => (canopyGlass ??= canopyGeometry(1))
const frostGeometry = (): BufferGeometry => (canopyFrost ??= canopyGeometry(1.012))

/** The pod's body: a low base, a mattress and two side rails with glowing edges. Still, so it is merged once. */
function BunkBody() {
  return (
    <>
      {[-RAIL_X, RAIL_X].map((x) => (
        <mesh key={'g' + x} position={[x, 0.307, 0]} material={EDGE}>
          <boxGeometry args={[0.03, 0.012, BUNKS.length]} />
        </mesh>
      ))}
      <mesh position={[0, 0.307, -HALF + 0.015]} material={EDGE}>
        <boxGeometry args={[BUNKS.width - 0.06, 0.012, 0.03]} />
      </mesh>
      <mesh position={[0, 0.09, 0]} material={FRAME}>
        <boxGeometry args={[BUNKS.width, 0.18, BUNKS.length]} />
      </mesh>
      <mesh position={[0, 0.21, 0]} material={MATTRESS}>
        <boxGeometry args={[BUNKS.width - 0.16, 0.07, BUNKS.length - 0.1]} />
      </mesh>
      {[-RAIL_X, RAIL_X].map((x) => (
        <mesh key={x} position={[x, 0.24, 0]} material={FRAME}>
          <boxGeometry args={[0.06, 0.12, BUNKS.length]} />
        </mesh>
      ))}
    </>
  )
}

/** The glow on the floor under the occupied pods: a soft band and a bright line at its outer edge. */
function FloorGlow({ specs }: { specs: { angle: number }[] }) {
  // the arc covers exactly the occupied pods (a little wider on both sides)
  const margin = (BUNKS.length / 2 + 0.3) / BUNKS.radius
  const first = specs[0].angle - margin
  const length = specs[specs.length - 1].angle - specs[0].angle + 2 * margin
  const start = first - Math.PI / 2
  return (
    <group position={[0, 0.035, 0]} rotation-x={-Math.PI / 2}>
      <mesh material={FLOOR_GLOW}>
        <ringGeometry args={[BUNKS.radius - BUNKS.width / 2 - 0.15, BUNKS.radius + BUNKS.width / 2 + 0.15, 64, 1, start, length]} />
      </mesh>
      <mesh position={[0, 0, 0.002]} material={FLOOR_LINE}>
        <ringGeometry args={[BUNKS.radius + BUNKS.width / 2 + 0.13, BUNKS.radius + BUNKS.width / 2 + 0.19, 64, 1, start, length]} />
      </mesh>
    </group>
  )
}

export default function BunkRing({ project, labels, tags, chip, onCrew }: { project: Project; labels: boolean; tags: boolean; /** the small "resting" chip: shown from far away too */ chip: boolean; onCrew?: (entry: RosterEntry) => void }) {
  // the glow on the floor breathes slowly
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    FLOOR_GLOW.opacity = 0.14 + 0.05 * Math.sin(t * 1.1)
  })
  const rest = useMemo(() => restSlots(project), [project])
  const specs = useMemo(() => bunkSpecs(rest.slots.length), [rest.slots.length])
  const now = Date.now()
  // nobody is resting: no pods at all (there are never empty ones)
  if (specs.length === 0) return null
  return (
    <group>
      <FloorGlow specs={specs} />
      <StaticMerge>
        {specs.map((s) => (
          <group key={s.index} position={s.position} rotation={[0, s.rotationY, 0]}>
            <BunkBody />
          </group>
        ))}
      </StaticMerge>
      {specs.map((s) => {
        const entry = rest.slots[s.index].entry
        const fill = entry.state === 'idle' ? restFill(entry, now) : 0
        const frost = frostLevel(fill)
        return (
          <group key={s.index} position={s.position} rotation={[0, s.rotationY, 0]}>
            <mesh position={[0, 0.3, HALF - 0.28]} material={pillowFor(entry.agent)}>
              <boxGeometry args={[BUNKS.width - 0.3, 0.1, 0.34]} />
            </mesh>
            {/* lying on its back: turned a quarter about the side, face up, head at the pod's +z end */}
            <group position={[0, 0.27, -HALF + 0.12]} rotation={[Math.PI / 2, 0, 0]}>
              <RoleRobot position={[0, 0, 0]} rotationY={Math.PI} variant={crewShape(entry)} clip="idle" seed={crewSeed(entry)} mood={eyeMood(entry.state)} onPick={onCrew ? () => onCrew(entry) : undefined} />
            </group>
            {/* the glass canopy, and its frost: more frost the longer the agent has been asleep */}
            <mesh position={[0, CANOPY_BASE, 0]} geometry={glassGeometry()} material={GLASS} renderOrder={3} />
            {frost > 0 && <mesh position={[0, CANOPY_BASE, 0]} geometry={frostGeometry()} material={FROSTS[frost]} renderOrder={4} />}
            {tags && (
              <Html center position={[0, 1.2, 0]} zIndexRange={[3, 0]} style={{ pointerEvents: 'none' }}>
                <div className={`crew-tag ${entry.state}`} title={entry.stateNote}>{entry.name}</div>
              </Html>
            )}
          </group>
        )
      })}
      {(labels || tags || chip) && (
        <Html center position={[REST.position[0], 1.9, REST.position[2] + 1.2]} zIndexRange={[4, 0]} style={{ pointerEvents: 'none' }}>
          <div className="bubble rest-chip">
            ☾ RESTING · {rest.total}{rest.more > 0 ? ` (+${rest.more} more)` : ''}
          </div>
        </Html>
      )}
    </group>
  )
}
