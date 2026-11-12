import { useMemo, useRef, type MutableRefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import RoleRobot from './RoleRobot'
import { crawlerView, createCrawlers, stepCrawlers, type CrawlerSim } from './crawlers'
import type { AnyClip } from './robotVariants'

function Crawler({ sim, index, frozen }: { sim: CrawlerSim; index: number; frozen: MutableRefObject<boolean[]> }) {
  const group = useRef<Group>(null)
  const clip = useRef<AnyClip>('walk')
  useFrame(() => {
    const s = crawlerView(sim, index)
    if (group.current) {
      group.current.position.set(...s.position)
      group.current.rotation.y = s.yaw
    }
    clip.current = s.clip
  })
  return (
    <group ref={group}>
      <RoleRobot
        variant="crawler"
        clip="walk"
        clipRef={clip}
        position={[0, 0, 0]}
        seed={501 + index}
        scaleMul={1.1}
        onGesture={(active) => {
          frozen.current[index] = active
        }}
      />
    </group>
  )
}

/** Two crawlers inspect the floor along the foot of the parapet, stopping at different spots to do different things. Click one and it stops to perform. Demo movement, not agent data. */
export default function CrawlerBots() {
  const sim = useMemo(() => createCrawlers(3), [])
  const frozen = useRef<boolean[]>([false, false])
  useFrame((_, delta) => stepCrawlers(sim, Math.min(delta, 0.1), frozen.current))
  return (
    <group>
      <Crawler sim={sim} index={0} frozen={frozen} />
      <Crawler sim={sim} index={1} frozen={frozen} />
    </group>
  )
}
