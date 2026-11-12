import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { shadowsDue } from './quality'

/** Redraws the shadow map only every `every` frames (the moving robots' shadows lag by a frame or two, which no one can see) and saves a whole extra draw of the scene the rest of the time. Draws nothing. */
export default function ShadowThrottle({ every }: { every: number }) {
  const frame = useRef(0)
  useFrame(({ gl }) => {
    gl.shadowMap.autoUpdate = !(every > 1)
    if (every > 1 && shadowsDue(frame.current, every)) gl.shadowMap.needsUpdate = true
    frame.current++
  })
  return null
}
