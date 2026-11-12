import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import RoleRobot from './RoleRobot'
import { keeperState } from './keepers'
import type { AnyClip } from './robotVariants'

function Keeper({ index }: { index: number }) {
  const group = useRef<Group>(null)
  const clip = useRef<AnyClip>('walk')

  useFrame(({ clock }) => {
    const s = keeperState(clock.getElapsedTime(), index)
    if (group.current) {
      group.current.position.set(...s.position)
      group.current.rotation.y = s.yaw
    }
    clip.current = s.clip
  })

  return (
    <group ref={group}>
      <RoleRobot variant="keeper" clip="walk" clipRef={clip} position={[0, 0, 0]} seed={201 + index} />
    </group>
  )
}

/** Two keepers loop around the core deck, stopping to read a gauge, polish a ring and tighten a panel. */
export default function OrbKeepers() {
  return (
    <group>
      <Keeper index={0} />
      <Keeper index={1} />
    </group>
  )
}
