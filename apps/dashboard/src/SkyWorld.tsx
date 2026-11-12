import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import { AdditiveBlending, Color, DataTexture, LinearMipmapLinearFilter, NoColorSpace, Object3D, RGBAFormat, type InstancedMesh, type ShaderMaterial } from 'three'
import { ROCK_TIME, makeRockMaterial } from './rockMaterial'
import { AURORA_TIME, makeAurora, makeMoon, makePhotoSky, makePlanet, skyLow } from './skyMaterials'
import { SUN, skyMapToWorld, skyPhotoFor } from './spaceScene'
import { useQuality } from './qualityContext'
import { LensFlare, SunAndGiant } from './FarSpace'
import { themeFor, type SkyTheme } from './themes'
import { useUi } from './uiSettings'
import { radialData } from './lifeMath'
import { HUB } from './hubLayout'
import { rockGeometry } from './rock'
import type { Project } from './projects'

const ROCK = '#3a322b'

let softTexture: DataTexture | null = null
/** One soft round blob, shared by every glow and cloud. */
function getSoft(): DataTexture {
  if (!softTexture) {
    softTexture = new DataTexture(radialData(64), 64, 64, RGBAFormat)
    softTexture.needsUpdate = true
  }
  return softTexture
}


/** A soft coloured glow behind and under a rock, so it floats in its own light. */
function Glow({ y, size, color, opacity = 0.35 }: { y: number; size: number; color: string; opacity?: number }) {
  // lying flat under the rock: a camera-facing sprite this big would cut through the hall
  return (
    <mesh position={[0, y, 0]} rotation-x={-Math.PI / 2}>
      <planeGeometry args={[size, size]} />
      <meshBasicMaterial map={getSoft()} color={color} transparent opacity={opacity} depthWrite={false} blending={AdditiveBlending} fog={false} />
    </mesh>
  )
}

/** Small rocks drifting around an island or the hub: [angle, radius factor, height, size]. */
const CHUNKS: [number, number, number, number][] = [
  [0.4, 1.3, -3.5, 1.2],
  [1.7, 1.45, -1.2, 0.8],
  [2.9, 1.25, -5.5, 1.4],
  [4.1, 1.5, -2.4, 0.9],
  [5.3, 1.35, -6.5, 1.1],
]

function Chunks({ radius, scale = 1.6 }: { radius: number; scale?: number }) {
  const ref = useRef<InstancedMesh>(null)
  const geo = useMemo(() => rockGeometry(1, 1.7, 9), [])
  useEffect(() => {
    const m = ref.current
    if (!m) return
    const d = new Object3D()
    CHUNKS.forEach(([a, r, y, s], i) => {
      d.position.set(Math.sin(a) * radius * r, y * scale, Math.cos(a) * radius * r)
      d.rotation.set(0.3 * i, a, 0.2)
      d.scale.setScalar(s * scale)
      d.updateMatrix()
      m.setMatrixAt(i, d.matrix)
    })
    m.instanceMatrix.needsUpdate = true
  }, [radius, scale])
  return (
    <instancedMesh ref={ref} args={[geo, undefined, CHUNKS.length]}>
      <meshStandardMaterial color={ROCK} roughness={0.95} flatShading side={2} />
    </instancedMesh>
  )
}

/** The rock the main hub floats on, with a glowing rim and a few drifting chunks. */
function HubRock({ accent }: { accent: string }) {
  const geo = useMemo(() => rockGeometry(HUB.roomRadius + 0.4, 22, 3), [])
  const material = useMemo(() => makeRockMaterial(ROCK, accent), [accent])
  return (
    <group>
      <mesh geometry={geo} material={material} position={[0, -0.06, 0]} />
      <mesh position={[0, -0.12, 0]} rotation-x={Math.PI / 2}>
        <torusGeometry args={[HUB.roomRadius + 0.3, 0.14, 8, 96]} />
        <meshBasicMaterial color={accent} toneMapped={false} />
      </mesh>
      <Chunks radius={HUB.roomRadius} scale={2.6} />
      <Glow y={-11} size={70} color={accent} opacity={0.3} />
    </group>
  )
}

/** Real space behind everything, in the chosen theme: a black sky with the Milky Way and nebulae painted in, the
 * horizon nudged by the project's status, and the theme's far objects (a moon, aurora curtains, a planet below). */
function SkyBackdrop({ project, theme, system = false }: { project: Project; theme: SkyTheme; system?: boolean }) {
  const photo = useTexture(skyPhotoFor(useQuality()))
  // the photo is a normal sRGB picture; the sky shader reads it with its own gradient, so it needs mip maps
  useMemo(() => {
    photo.colorSpace = NoColorSpace
    photo.minFilter = LinearMipmapLinearFilter
    photo.anisotropy = 8
    photo.needsUpdate = true
  }, [photo])
  const sky = useMemo(() => makePhotoSky(theme, photo, skyMapToWorld().transpose()), [theme, photo])
  const moon = useMemo(() => makeMoon(), [])
  const planet = useMemo(() => makePlanet(theme.rim), [theme])
  const aurora = useMemo<ShaderMaterial>(() => makeAurora(project.accent, theme.aurora), [project.accent, theme])
  const target = useMemo(() => {
    const [r, g, b] = skyLow(project.status)
    return new Color(theme.low[0] + r * 0.08, theme.low[1] + g * 0.08, theme.low[2] + b * 0.08)
  }, [project.status, theme])
  useEffect(() => () => { sky.dispose(); planet.dispose() }, [sky, planet])
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    AURORA_TIME.value = t
    ROCK_TIME.value = t
    ;(sky.uniforms.uLow.value as Color).lerp(target, 0.02)
    // in the solar system the photo is dimmed, so the sun and the planets stand out against it
    const u = sky.uniforms.uExposure as { value: number }
    u.value += (theme.photoExposure * (system ? 0.5 : 1) - u.value) * 0.06
  })
  return (
    <group>
      <mesh material={sky} renderOrder={-10}>
        <sphereGeometry args={[320, 48, 32]} />
      </mesh>
      {theme.moon && !system && (
        <mesh position={[-120, 62, -210]} material={moon} renderOrder={-9}>
          <planeGeometry args={[60, 60]} />
        </mesh>
      )}
      {theme.planet && !system && (
        <mesh position={[0, -760, -260]} material={planet} renderOrder={-9}>
          <sphereGeometry args={[560, 64, 32]} />
        </mesh>
      )}
      {theme.aurora > 0 && !system && (
        <>
          <mesh position={[0, 58, -200]} material={aurora} renderOrder={-8}>
            <planeGeometry args={[340, 70, 80, 1]} />
          </mesh>
          <mesh position={[-150, 50, -120]} rotation={[0, 0.9, 0]} material={aurora} renderOrder={-8}>
            <planeGeometry args={[240, 55, 60, 1]} />
          </mesh>
        </>
      )}
    </group>
  )
}

export default function SkyWorld({ project, system = false }: { project: Project; system?: boolean }) {
  const theme = themeFor(useUi().theme)
  // in the solar system level only the sky photo stays: the system has its own star and worlds
  if (system) return <group><SkyBackdrop project={project} theme={theme} system /></group>
  return (
    <group>
      <SkyBackdrop project={project} theme={theme} />
      <SunAndGiant theme={theme} />
      {/* the sun as a key light: islands get a lit side and a dark side (no shadow of its own) */}
      <directionalLight position={[SUN.direction[0] * 100, SUN.direction[1] * 100, SUN.direction[2] * 100]} intensity={0.85} color={new Color(...theme.sun)} />
      <LensFlare />
      <HubRock accent={project.accent} />
    </group>
  )
}
