import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BufferAttribute, type Points } from 'three'
import { dustPoints } from './hubDetails'

const DUST_COUNT = 260

/** Floating dust. */
export default function HubExtras({ dust: showDust = true }: { dust?: boolean }) {
  const dust = useRef<Points>(null)
  const positions = useMemo(() => new BufferAttribute(dustPoints(DUST_COUNT), 3), [])

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    if (dust.current) {
      dust.current.rotation.y = t * 0.012
      dust.current.position.y = Math.sin(t * 0.2) * 0.15
    }
  })

  return (
    <group>
      <points ref={dust} visible={showDust}>
        <bufferGeometry attributes-position={positions} />
        <pointsMaterial color="#ffe2bd" size={0.06} transparent opacity={0.55} depthWrite={false} sizeAttenuation />
      </points>
    </group>
  )
}
