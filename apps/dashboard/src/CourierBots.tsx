import { useMemo, useRef, type MutableRefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import RoleRobot from './RoleRobot'
import { courierView, createCouriers, stepCouriers, type CourierSim } from './couriers'
import type { AnyClip } from './robotVariants'

/** Courier 0 is a keeper, courier 1 a pocket bot (smaller, so it is scaled up a touch less). */
const LOOKS = [{ variant: 'keeper', scale: 1 }, { variant: 'pocket', scale: 0.8 }] as const

function Courier({ sim, index, frozen }: { sim: CourierSim; index: number; frozen: MutableRefObject<boolean[]> }) {
  const group = useRef<Group>(null)
  const box = useRef<Group>(null)
  const clip = useRef<AnyClip>('walk')

  useFrame(() => {
    const s = courierView(sim, index)
    if (group.current) {
      group.current.position.set(...s.position)
      group.current.rotation.y = s.yaw
    }
    if (box.current) box.current.visible = s.carrying
    clip.current = s.clip
  })

  return (
    <group ref={group}>
      <RoleRobot
        variant={LOOKS[index].variant}
        clip="walk"
        clipRef={clip}
        position={[0, 0, 0]}
        seed={401 + index}
        scaleMul={LOOKS[index].scale}
        onGesture={(active) => {
          frozen.current[index] = active
        }}
      />
      <group ref={box} position={[0, 0.62, 0.3]}>
        <mesh>
          <boxGeometry args={[0.3, 0.26, 0.3]} />
          <meshStandardMaterial color="#c0721a" metalness={0.4} roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.14, 0]}>
          <boxGeometry args={[0.31, 0.02, 0.08]} />
          <meshStandardMaterial color="#22d3ee" emissive="#22d3ee" emissiveIntensity={2} />
        </mesh>
      </group>
    </group>
  )
}

/**
 * Two couriers carry work packages from bay to bay along the floor, going opposite ways. They stop to hand over,
 * look around now and then, and high-five when they meet. Click one and it stops to perform. Demo movement, not agent data.
 */
export default function CourierBots() {
  const sim = useMemo(() => createCouriers(7), [])
  const frozen = useRef<boolean[]>([false, false])
  useFrame((_, delta) => stepCouriers(sim, Math.min(delta, 0.1), frozen.current))
  return (
    <group>
      <Courier sim={sim} index={0} frozen={frozen} />
      <Courier sim={sim} index={1} frozen={frozen} />
    </group>
  )
}
