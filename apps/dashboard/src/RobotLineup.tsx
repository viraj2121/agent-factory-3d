import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { Environment, Lightformer, OrbitControls, Stats } from '@react-three/drei'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import RoleRobot from './RoleRobot'
import { EXTRA_VARIANTS, ROBOT_VARIANTS, primaryClip, type AnyClip } from './robotVariants'

const EXTRA_CLIP: Record<(typeof EXTRA_VARIANTS)[number], AnyClip> = {
  designer: 'draw', keeper: 'gauge', driver: 'drive', pocket: 'wave', crawler: 'test',
  terminal: 'typing', gauge: 'test', plug: 'assemble', cassette: 'idle2', fishbowl: 'idle',
}

// Preview of every robot shape. Top row: each shape doing its own action. Bottom row: the same
// shapes with different seeds, so colours, size and timing differ. Not real agent data.
export default function RobotLineup() {
  return (
    <Canvas onCreated={({ scene }) => { Object.assign(window, { __scene: scene }) }} dpr={[1, 1.5]} camera={{ position: [0, 2.2, 7], fov: 36 }} style={{ position: 'absolute', inset: 0 }} shadows>
      <color attach="background" args={['#120d09']} />
      <ambientLight intensity={0.8} color="#fff3e4" />
      <directionalLight position={[3, 6, 5]} intensity={2} color="#ffe2bd" castShadow shadow-bias={-0.0004} shadow-normalBias={0.04} shadow-mapSize={[2048, 2048]} />
      <Environment resolution={128} background={false}>
        <Lightformer form="rect" intensity={2} color="#ffe6c8" position={[0, 5, 4]} scale={[8, 2, 1]} />
      </Environment>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[30, 20]} />
        <meshStandardMaterial color="#2a2119" roughness={0.8} metalness={0.2} />
      </mesh>
      <Suspense fallback={null}>
        {ROBOT_VARIANTS.map((variant, i) => (
          <RoleRobot key={`a-${variant}`} position={[-3 + i * 1.5, 0, 0.8]} variant={variant} clip={primaryClip(variant)} seed={i + 1} />
        ))}
        {ROBOT_VARIANTS.map((variant, i) => (
          <RoleRobot key={`b-${variant}`} position={[-3 + i * 1.5, 0, -0.9]} variant={variant} clip={i % 2 ? 'idle2' : 'wave'} seed={i + 11} />
        ))}
        {EXTRA_VARIANTS.map((variant, i) => (
          <RoleRobot key={`c-${variant}`} position={[(i - (EXTRA_VARIANTS.length - 1) / 2) * 1.35, 0, 2.5]} variant={variant} clip={EXTRA_CLIP[variant]} seed={i + 21} />
        ))}
      </Suspense>
      <OrbitControls target={[0, 0.8, 0]} minDistance={2.5} maxDistance={14} />
      <EffectComposer multisampling={0}>
        <Bloom mipmapBlur luminanceThreshold={1.2} intensity={0.45} />
      </EffectComposer>
      <Stats />
    </Canvas>
  )
}
