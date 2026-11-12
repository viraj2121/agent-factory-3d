import { useMemo, useRef, type MutableRefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { Quaternion, Vector3, type Group, type Mesh, type MeshBasicMaterial } from 'three'
import { droneAt } from './inspection'

/** What the pad tells the drone every frame. */
export interface DroneCtrl {
  /** Height on the rocket of the seam to hover over (smoothed here so it glides between seams). */
  seamY: number
  /** The laser is on: a seam is being welded or is cooling. */
  scanning: boolean
  /** 0 (working) to 1 (flown up and out of the way, for lift-off). */
  away: number
}

const UP = new Vector3(0, 1, 0)

/**
 * A small inspection drone: it circles the rocket on the side away from the tower, hovering just above the seam being
 * worked on, and sweeps a thin laser along the weld. Four spinning rotors, a camera eye underneath, and it banks a
 * little as it moves. It flies up and away for lift-off. Demo motion.
 */
export default function InspectionDrone({ ctrl }: { ctrl: MutableRefObject<DroneCtrl> }) {
  const body = useRef<Group>(null)
  const rotors = useRef<(Mesh | null)[]>([])
  const laser = useRef<Mesh>(null)
  const dot = useRef<Mesh>(null)
  const laserMaterial = useRef<MeshBasicMaterial>(null)
  const smooth = useRef<{ y: number; at: Vector3 | null }>({ y: ctrl.current.seamY, at: null })
  const tools = useMemo(() => ({ pos: new Vector3(), to: new Vector3(), dir: new Vector3(), q: new Quaternion() }), [])

  useFrame(({ clock }, dt) => {
    const t = clock.getElapsedTime()
    const c = ctrl.current
    const s = smooth.current
    s.y += (c.seamY - s.y) * (1 - Math.exp(-Math.min(dt, 0.1) * 5))
    const m = droneAt(t, s.y, c.scanning)

    // flies up and out of the way for lift-off
    const [x, y, z] = m.position
    const out = Math.hypot(x, z) || 1
    tools.pos.set(x + (x / out) * 1.6 * c.away, y + 5 * c.away, z + (z / out) * 1.6 * c.away)
    if (body.current) {
      // faces the rocket and leans a little into its sweep round it
      body.current.position.copy(tools.pos)
      body.current.rotation.set(0, Math.atan2(-x, -z), 0.14 * Math.cos(t * 0.55))
    }
    rotors.current.forEach((r, i) => r && (r.rotation.y = t * 60 * (i % 2 ? 1 : -1)))

    const showLaser = m.laserTo !== null && c.away < 0.05
    if (laser.current && dot.current) {
      laser.current.visible = showLaser
      dot.current.visible = showLaser
      if (showLaser && m.laserTo) {
        tools.to.set(m.laserTo[0], m.laserTo[1], m.laserTo[2])
        tools.dir.copy(tools.to).sub(tools.pos)
        const length = tools.dir.length()
        tools.dir.divideScalar(length)
        laser.current.position.copy(tools.pos).addScaledVector(tools.dir, length / 2)
        laser.current.quaternion.copy(tools.q.setFromUnitVectors(UP, tools.dir))
        laser.current.scale.set(1, length, 1)
        dot.current.position.copy(tools.to)
        dot.current.scale.setScalar(0.7 + 0.5 * Math.abs(Math.sin(t * 25)))
        if (laserMaterial.current) laserMaterial.current.opacity = 0.55 + 0.35 * Math.abs(Math.sin(t * 31))
      }
    }
  })

  return (
    <>
      <group ref={body}>
        <mesh scale={[1, 0.42, 1]}>
          <sphereGeometry args={[0.13, 18, 12]} />
          <meshStandardMaterial color="#2a2f35" metalness={0.75} roughness={0.35} />
        </mesh>
        <mesh position={[0, 0.045, 0]}>
          <sphereGeometry args={[0.065, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color="#d6d9de" metalness={0.8} roughness={0.3} />
        </mesh>
        {/* the camera eye underneath, looking down at the weld */}
        <mesh position={[0, -0.05, 0.03]}>
          <sphereGeometry args={[0.038, 12, 8]} />
          <meshBasicMaterial color="#7fe9ff" toneMapped={false} />
        </mesh>
        {[0, 1, 2, 3].map((k) => {
          const a = Math.PI / 4 + (k * Math.PI) / 2
          const px = Math.sin(a) * 0.19
          const pz = Math.cos(a) * 0.19
          return (
            <group key={k}>
              <mesh position={[px / 2, 0.01, pz / 2]} rotation={[0, a, 0]}>
                <boxGeometry args={[0.025, 0.02, 0.2]} />
                <meshStandardMaterial color="#3a4048" metalness={0.8} roughness={0.4} />
              </mesh>
              <mesh position={[px, 0.035, pz]}>
                <cylinderGeometry args={[0.012, 0.012, 0.04, 8]} />
                <meshStandardMaterial color="#d6d9de" metalness={0.8} roughness={0.35} />
              </mesh>
              <mesh ref={(r) => { rotors.current[k] = r }} position={[px, 0.058, pz]}>
                <cylinderGeometry args={[0.085, 0.085, 0.004, 14]} />
                <meshBasicMaterial color="#cfe9ff" transparent opacity={0.28} toneMapped={false} depthWrite={false} />
              </mesh>
            </group>
          )
        })}
      </group>
      <mesh ref={laser} visible={false}>
        <cylinderGeometry args={[0.005, 0.005, 1, 6]} />
        <meshBasicMaterial ref={laserMaterial} color="#7fe9ff" transparent opacity={0.7} toneMapped={false} depthWrite={false} />
      </mesh>
      <mesh ref={dot} visible={false}>
        <sphereGeometry args={[0.022, 10, 8]} />
        <meshBasicMaterial color="#d6f6ff" toneMapped={false} />
      </mesh>
    </>
  )
}
