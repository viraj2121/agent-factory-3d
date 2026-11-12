import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { DoubleSide, Object3D, type InstancedMesh } from 'three'
import RoleRobot from './RoleRobot'
import StaticMerge from './StaticMerge'
import { STUDIO } from './hubLayout'
import { STROKES, resample, strokeProgress } from './studioMath'

const INK = ['#c0721a', '#1f8fa8', '#8a3a1a']

/** Pen strokes that draw themselves across the board, wipe away, and start again. */
function Drawing() {
  const strokes = useMemo(() => STROKES.map((s) => resample(s, 0.045)), [])
  const meshes = useRef<(InstancedMesh | null)[]>([])
  const dummy = useMemo(() => new Object3D(), [])

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    strokes.forEach((s, i) => {
      const m = meshes.current[i]
      if (m) m.count = Math.floor(strokeProgress(t, i) * s.length)
    })
  })

  return (
    <group>
      {strokes.map((s, i) => (
        <instancedMesh
          key={i}
          args={[undefined, undefined, s.length]}
          ref={(m) => {
            meshes.current[i] = m
            if (!m || m.userData.ready) return
            s.forEach(([sx, sy], k) => {
              // the designers look along +z, so their right-hand side is local -x
              dummy.position.set(-sx, STUDIO.boardCenterY + sy, STUDIO.boardZ - 0.07)
              dummy.updateMatrix()
              m.setMatrixAt(k, dummy.matrix)
            })
            m.count = 0
            m.instanceMatrix.needsUpdate = true
            m.userData.ready = true
          }}
        >
          <circleGeometry args={[0.028, 8]} />
          <meshBasicMaterial color={INK[i % INK.length]} side={DoubleSide} toneMapped={false} />
        </instancedMesh>
      ))}
    </group>
  )
}

function Props() {
  const { boardWidth: bw, boardHeight: bh, boardCenterY: by, boardZ: bz } = STUDIO
  return (
    <StaticMerge>
      <mesh position={[0, 0.02, 0.3]}>
        <boxGeometry args={[6.6, 0.04, 3.6]} />
        <meshStandardMaterial color="#1b1f24" metalness={0.6} roughness={0.5} />
      </mesh>
      {[-1.8, 1.8].map((z) => (
        <mesh key={z} position={[0, 0.047, 0.3 + z]}>
          <boxGeometry args={[6.6, 0.012, 0.04]} />
          <meshStandardMaterial color="#ffb347" emissive="#ff9a2e" emissiveIntensity={0.9} />
        </mesh>
      ))}

      {/* the big board */}
      <mesh position={[0, by, bz + 0.03]}>
        <boxGeometry args={[bw + 0.24, bh + 0.24, 0.09]} />
        <meshStandardMaterial color="#b8742a" metalness={0.6} roughness={0.45} />
      </mesh>
      <mesh position={[0, by, bz - 0.02]} rotation-y={Math.PI}>
        <planeGeometry args={[bw, bh]} />
        <meshStandardMaterial color="#efe7d6" emissive="#efe7d6" emissiveIntensity={0.25} roughness={0.8} />
      </mesh>
      <mesh position={[0, by - bh / 2 - 0.16, bz - 0.12]}>
        <boxGeometry args={[bw, 0.06, 0.2]} />
        <meshStandardMaterial color="#1b1f24" metalness={0.7} roughness={0.4} />
      </mesh>
      {[-1.4, -0.9, 0.6, 1.1].map((x, i) => (
        <mesh key={x} position={[x, by - bh / 2 - 0.1, bz - 0.12]} rotation-z={Math.PI / 2}>
          <cylinderGeometry args={[0.014, 0.014, 0.16, 8]} />
          <meshStandardMaterial color={['#c0721a', '#1f8fa8', '#8a3a1a', '#222'][i]} />
        </mesh>
      ))}

      {/* easel */}
      <group position={[3.5, 0, 0.5]} rotation-y={-0.4}>
        <mesh position={[0, 0.9, 0]} rotation-x={-0.12}>
          <boxGeometry args={[1.0, 0.7, 0.04]} />
          <meshStandardMaterial color="#efe7d6" emissive="#efe7d6" emissiveIntensity={0.2} />
        </mesh>
        {[-0.4, 0.4].map((x) => (
          <mesh key={x} position={[x, 0.45, -0.1]} rotation-x={0.25}>
            <boxGeometry args={[0.04, 1.0, 0.04]} />
            <meshStandardMaterial color="#7a6650" />
          </mesh>
        ))}
      </group>

      {/* drawing table */}
      <group position={[-3.6, 0, 0.3]} rotation-y={0.35}>
        <mesh position={[0, 0.8, 0]} rotation-x={0.4}>
          <boxGeometry args={[1.3, 0.05, 0.9]} />
          <meshStandardMaterial color="#44505a" metalness={0.4} roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.82, 0.02]} rotation-x={0.4}>
          <boxGeometry args={[0.9, 0.012, 0.6]} />
          <meshStandardMaterial color="#efe7d6" emissive="#efe7d6" emissiveIntensity={0.2} />
        </mesh>
        {[-0.55, 0.55].map((x) => (
          <mesh key={x} position={[x, 0.4, 0]}>
            <boxGeometry args={[0.05, 0.8, 0.05]} />
            <meshStandardMaterial color="#1b1f24" metalness={0.7} roughness={0.4} />
          </mesh>
        ))}
      </group>

      {/* sketch shelf against the wall */}
      <mesh position={[3.6, 0.5, bz + 0.45]}>
        <boxGeometry args={[1.4, 1.0, 0.4]} />
        <meshStandardMaterial color="#1b1f24" metalness={0.6} roughness={0.5} />
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[3.3 + i * 0.3, 1.04, bz + 0.45]} rotation-x={-0.1}>
          <boxGeometry args={[0.22, 0.02, 0.3]} />
          <meshStandardMaterial color="#efe7d6" />
        </mesh>
      ))}

      <pointLight position={[0, 3.2, 0.5]} intensity={3} distance={7} color="#ffe2bd" />
    </StaticMerge>
  )
}

/** An open drawing area at the back left: designers at a big board, one stepping back to judge. */
export default function DesignStudio() {
  return (
    <group position={[STUDIO.position[0], 0, STUDIO.position[2]]} rotation={[0, STUDIO.rotationY, 0]}>
      <Props />
      <Drawing />
      {STUDIO.designers.map((d, i) => (
        <RoleRobot key={i} position={d.position} variant="designer" clip={d.clip} seed={101 + i} />
      ))}
    </group>
  )
}
