import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { CanvasTexture, DoubleSide, MeshBasicMaterial, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace, type Group } from 'three'
import StaticMerge from './StaticMerge'
import ShelfBooks from './ShelfBooks'
import RoleRobot from './RoleRobot'
import type { Project } from './projects'
import { SHELF_Y, daisCentre, deskSpot, tenderSpots, unitCentre } from './library'
import { seatShapes } from './bayShapes'

const IRON = new MeshStandardMaterial({ color: '#2a2f35', metalness: 0.75, roughness: 0.5 })
const DARK = new MeshStandardMaterial({ color: '#16181c', metalness: 0.6, roughness: 0.5 })
const AMBER_LED = new MeshBasicMaterial({ color: '#ffb347', toneMapped: false })
const VIOLET_LED = new MeshBasicMaterial({ color: '#a78bfa', toneMapped: false })
const PALETTE = ['#a78bfa', '#ffb347', '#22d3ee', '#ff6ec7', '#34d399', '#ffe14d', '#7fa8ff']

/** Tiny canvas drawings, made once: wood grain for the shelves, the sign, and the catalogue screen. All drawn here, no files. */
const textures: Record<string, CanvasTexture> = {}
function makeTexture(name: string, width: number, height: number, draw: (g: CanvasRenderingContext2D) => void, repeat = false): CanvasTexture {
  if (!textures[name]) {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    draw(canvas.getContext('2d')!)
    const t = new CanvasTexture(canvas)
    t.colorSpace = SRGBColorSpace
    t.anisotropy = 4
    if (repeat) t.wrapS = t.wrapT = RepeatWrapping
    textures[name] = t
  }
  return textures[name]
}
const woodTexture = () =>
  makeTexture(
    'wood',
    256,
    256,
    (g) => {
      g.fillStyle = '#3b2a1d'
      g.fillRect(0, 0, 256, 256)
      for (let x = 0; x < 256; x += 32) {
        g.fillStyle = 'rgba(0,0,0,0.35)'
        g.fillRect(x, 0, 2, 256)
      }
      let s = 99
      const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
      for (let i = 0; i < 260; i++) {
        g.fillStyle = `rgba(${rnd() < 0.5 ? '255,214,160' : '20,10,4'},${0.04 + rnd() * 0.07})`
        g.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 2, 14 + rnd() * 90)
      }
    },
    true,
  )
const signTexture = () =>
  makeTexture('sign', 1024, 192, (g) => {
    g.fillStyle = '#0f0b1a'
    g.fillRect(0, 0, 1024, 192)
    g.strokeStyle = '#a78bfa'
    g.lineWidth = 6
    g.strokeRect(10, 10, 1004, 172)
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.shadowColor = '#a78bfa'
    g.shadowBlur = 24
    g.fillStyle = '#e8e0ff'
    g.font = '700 104px system-ui, sans-serif'
    g.fillText('A R C H I V E', 512, 82)
    g.shadowBlur = 0
    g.fillStyle = '#ffb347'
    g.font = '500 34px system-ui, sans-serif'
    g.fillText('FINISHED WORK', 512, 152)
  })
const screenTexture = () =>
  makeTexture('screen', 256, 160, (g) => {
    g.fillStyle = '#0b1322'
    g.fillRect(0, 0, 256, 160)
    g.strokeStyle = 'rgba(167,139,250,0.9)'
    g.lineWidth = 3
    g.strokeRect(4, 4, 248, 152)
    const bars = [48, 80, 62, 104, 90, 118, 72]
    bars.forEach((h, i) => {
      g.fillStyle = PALETTE[i % PALETTE.length]
      g.fillRect(18 + i * 22, 140 - h, 15, h)
    })
    g.fillStyle = 'rgba(232,224,255,0.8)'
    for (let r = 0; r < 4; r++) g.fillRect(186, 24 + r * 16, 54 - r * 8, 5)
  })

/**
 * The library: three tall shelf units of wood and steel against the wall between Planning and Development, under a
 * lit ARCHIVE sign. One labelled crate is lit for every share of the project's demo build that is finished (the bottom
 * shelf first), while a scanning arm on a rail files crates. In front, on a dais, a glass column holds the archive core
 * with data cards floating up through it, and a catalogue desk with a screen is kept by one of two robots. Demo motion
 * from demo progress.
 */
export default function ArchiveHall({ project, labels, onOpen, tenders: showTenders = true }: { project: Project; labels: boolean; onOpen?: () => void; tenders?: boolean }) {
  const core = useRef<MeshStandardMaterial>(null)
  const ring = useRef<Group>(null)
  const middle = unitCentre(1)
  const tenders = useMemo(() => tenderSpots(), [])
  const desk = useMemo(() => deskSpot(), [])
  const dais = useMemo(() => daisCentre(), [])
  const shapes = useMemo(() => seatShapes(project.id, 9, 2), [project.id])
  const wood = useMemo(() => new MeshStandardMaterial({ map: woodTexture(), roughness: 0.7, metalness: 0.15 }), [])
  const sign = useMemo(() => new MeshBasicMaterial({ map: signTexture(), toneMapped: false }), [])
  const screen = useMemo(() => new MeshBasicMaterial({ map: screenTexture(), toneMapped: false }), [])
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    if (core.current) core.current.emissiveIntensity = 0.9 + 0.2 * Math.sin(t * 0.9)
    if (ring.current) ring.current.rotation.y = t * 0.3
  })

  return (
    <group
      onClick={(e) => {
        if (!onOpen || e.delta > 5) return
        e.stopPropagation()
        onOpen()
      }}
      onPointerOver={() => onOpen && (document.body.style.cursor = 'pointer')}
      onPointerOut={() => (document.body.style.cursor = '')}
    >
      <StaticMerge>
        {[0, 1, 2].map((k) => {
          const u = unitCentre(k)
          return (
            <group key={k} position={[u.x, 0, u.z]} rotation={[0, u.angle + Math.PI, 0]}>
              {/* the wooden back, steel uprights, a plinth below and a cornice with a light strip above */}
              <mesh position={[0, 1.5, -0.27]} material={wood}>
                <boxGeometry args={[2.4, 3, 0.1]} />
              </mesh>
              {[-1.2, 1.2].map((x) => (
                <mesh key={x} position={[x, 1.5, 0]} material={IRON}>
                  <boxGeometry args={[0.1, 3, 0.58]} />
                </mesh>
              ))}
              <mesh position={[0, 0.11, 0.02]} material={DARK}>
                <boxGeometry args={[2.5, 0.22, 0.66]} />
              </mesh>
              <mesh position={[0, 3.07, 0.02]} material={IRON}>
                <boxGeometry args={[2.58, 0.16, 0.66]} />
              </mesh>
              <mesh position={[0, 2.97, 0.33]} material={AMBER_LED}>
                <boxGeometry args={[2.3, 0.02, 0.02]} />
              </mesh>
              {SHELF_Y.map((y) => (
                <group key={y}>
                  <mesh position={[0, y - 0.025, 0.02]} material={wood}>
                    <boxGeometry args={[2.3, 0.05, 0.58]} />
                  </mesh>
                  <mesh position={[0, y + 0.01, 0.3]} material={IRON}>
                    <boxGeometry args={[2.3, 0.08, 0.03]} />
                  </mesh>
                  <mesh position={[0, y - 0.07, 0.3]} material={VIOLET_LED}>
                    <boxGeometry args={[2.2, 0.016, 0.016]} />
                  </mesh>
                </group>
              ))}
              {/* wall lamps on the uprights */}
              {[-1.2, 1.2].map((x) => (
                <mesh key={`l${x}`} position={[x, 2.75, 0.34]} material={AMBER_LED}>
                  <boxGeometry args={[0.07, 0.18, 0.07]} />
                </mesh>
              ))}
              {/* the rail the arm slides on, at the foot of the shelves */}
              <mesh position={[0, 0.1, 0.95]} material={IRON}>
                <boxGeometry args={[2.45, 0.07, 0.12]} />
              </mesh>
            </group>
          )
        })}

        {/* the dais: a low disc with glowing rings and compass lines, a pedestal for the archive column */}
        <group position={[dais.x, 0, dais.z]}>
          <mesh position={[0, 0.06, 0]} material={DARK}>
            <cylinderGeometry args={[1.5, 1.58, 0.12, 40]} />
          </mesh>
          <mesh position={[0, 0.125, 0]} rotation-x={-Math.PI / 2} material={VIOLET_LED}>
            <ringGeometry args={[1.28, 1.34, 48]} />
          </mesh>
          <mesh position={[0, 0.125, 0]} rotation-x={-Math.PI / 2} material={AMBER_LED}>
            <ringGeometry args={[0.7, 0.73, 40]} />
          </mesh>
          {[0, 1, 2, 3].map((k) => (
            <mesh key={k} position={[0, 0.126, 0]} rotation={[-Math.PI / 2, 0, (k * Math.PI) / 2]} material={VIOLET_LED}>
              <planeGeometry args={[0.02, 2.4]} />
            </mesh>
          ))}
          <mesh position={[0, 0.34, 0]} material={IRON}>
            <cylinderGeometry args={[0.52, 0.62, 0.44, 24]} />
          </mesh>
          <mesh position={[0, 0.56, 0]} rotation-x={Math.PI / 2} material={VIOLET_LED}>
            <torusGeometry args={[0.5, 0.022, 8, 40]} />
          </mesh>
        </group>

        {/* the catalogue desk, facing the core, with a screen on it */}
        <group position={[desk.x, 0, desk.z]} rotation={[0, desk.angle + Math.PI, 0]}>
          <mesh position={[0, 0.45, 0]} material={IRON}>
            <boxGeometry args={[1.6, 0.9, 0.52]} />
          </mesh>
          <mesh position={[0, 0.92, 0.02]} material={wood}>
            <boxGeometry args={[1.7, 0.06, 0.6]} />
          </mesh>
          <mesh position={[0, 0.89, 0.31]} material={AMBER_LED}>
            <boxGeometry args={[1.6, 0.015, 0.015]} />
          </mesh>
          <mesh position={[0, 1.33, -0.12]} material={DARK}>
            <boxGeometry args={[1.3, 0.78, 0.06]} />
          </mesh>
        </group>

        {/* the sign's frame and hangers */}
        <group position={[middle.x, 0, middle.z]} rotation={[0, middle.angle + Math.PI, 0]}>
          {[-1.7, 1.7].map((x) => (
            <mesh key={x} position={[x, 3.45, -0.05]} material={IRON}>
              <boxGeometry args={[0.06, 0.8, 0.06]} />
            </mesh>
          ))}
          <mesh position={[0, 3.62, -0.1]} material={DARK}>
            <boxGeometry args={[3.9, 0.78, 0.06]} />
          </mesh>
        </group>
      </StaticMerge>

      {/* the sign and the catalogue screen */}
      <group position={[middle.x, 0, middle.z]} rotation={[0, middle.angle + Math.PI, 0]}>
        <mesh position={[0, 3.62, -0.065]} material={sign}>
          <planeGeometry args={[3.8, 0.7]} />
        </mesh>
      </group>
      <group position={[desk.x, 0, desk.z]} rotation={[0, desk.angle + Math.PI, 0]}>
        <mesh position={[0, 1.33, -0.088]} material={screen}>
          <planeGeometry args={[1.22, 0.7]} />
        </mesh>
      </group>

      {/* the archive column: glass tube, core, orbiting rings and data cards floating up through it */}
      <group position={[dais.x, 0, dais.z]}>
        <mesh position={[0, 1.45, 0]}>
          <cylinderGeometry args={[0.38, 0.38, 1.8, 28, 1, true]} />
          <meshStandardMaterial color="#cdbdff" transparent opacity={0.14} roughness={0.05} metalness={0.2} side={DoubleSide} depthWrite={false} />
        </mesh>
        {[0.56, 2.35].map((y) => (
          <mesh key={y} position={[0, y, 0]} rotation-x={Math.PI / 2}>
            <torusGeometry args={[0.39, 0.035, 10, 32]} />
            <meshStandardMaterial color="#d6d9de" metalness={0.8} roughness={0.35} />
          </mesh>
        ))}
        <mesh position={[0, 1.45, 0]}>
          <sphereGeometry args={[0.15, 20, 14]} />
          <meshStandardMaterial ref={core} color="#1a1030" emissive="#a78bfa" emissiveIntensity={0.6} roughness={0.3} />
        </mesh>
        <group ref={ring} position={[0, 1.45, 0]}>
          {[0, 1].map((k) => (
            <mesh key={k} rotation={[Math.PI / 2 + k * 0.9, k * 0.6, 0]}>
              <torusGeometry args={[0.26 + k * 0.05, 0.008, 6, 36]} />
              <meshBasicMaterial color="#e8e0ff" toneMapped={false} />
            </mesh>
          ))}
        </group>
      </group>
      <ShelfBooks project={project} dais={dais} />

      {showTenders && tenders.map((s, i) => (
        <RoleRobot key={i} position={[s.x, 0, s.z]} rotationY={s.heading} variant={shapes[i]} clip={i === 0 ? 'inspect' : 'assemble'} seed={40 + i} />
      ))}

      {labels && (
        <Html center position={[middle.x * 0.92, 4.5, middle.z * 0.92]} zIndexRange={[4, 0]} style={{ pointerEvents: 'none' }}>
          <div className="bubble">{project.live ? `Archive · ${project.live.docs?.length ?? 0}${project.live.docsTruncated ? '+' : ''} markdown files` : 'Archive · demo project, no folder'}</div>
        </Html>
      )}
    </group>
  )
}
