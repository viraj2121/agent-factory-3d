import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { Html, useAnimations, useGLTF } from '@react-three/drei'
import { SkeletonUtils } from 'three-stdlib'
import { Color, DataTexture, MeshPhysicalMaterial, Quaternion, Vector3, RepeatWrapping, RGBAFormat, type Group, type Material, type Mesh, type MeshStandardMaterial, type Object3D } from 'three'
import { enableShadows } from './shadows'
import { EXTRA_VARIANTS, GESTURE_CLIPS, ROBOT_VARIANTS, robotLook, type AnyClip, type AnyVariant, type GestureClip } from './robotVariants'
import { BREAK_CLIPS, breakAt, emoteFor, gestureLoops, gestureSeconds, pickGesture, registerClick, tooSoon } from './gestures'
import { scuffData } from './scuff'
import { mergeSkinned, shareSkeleton } from './mergeSkinned'
import { applyRobotLivery } from './robotLivery'
import { sound } from './soundEngine'
import { useQuality } from './qualityContext'
import { SPINNERS, bobAt, localAxis, spinAngle } from './spinners'

/** Materials that robots with the same look share, so a hall full of robots does not mean hundreds of materials. */
const shared = new Map<string, Material>()

/** Models whose parts have already been joined by material. */
const joined = new WeakSet<object>()

let scuffTexture: DataTexture | null = null
/** One shared wear texture for every robot's glossy parts. */
function getScuffTexture(): DataTexture {
  if (!scuffTexture) {
    scuffTexture = new DataTexture(scuffData(128), 128, 128, RGBAFormat)
    scuffTexture.wrapS = scuffTexture.wrapT = RepeatWrapping
    scuffTexture.repeat.set(3, 3)
    scuffTexture.needsUpdate = true
  }
  return scuffTexture
}

/** The invisible click area round each shape, in metres at normal size: radius and height. */
const COLLIDER: Partial<Record<AnyVariant, [number, number]>> = {
  pocket: [0.27, 0.72],
  crawler: [0.55, 0.75],
  gauge: [0.34, 1.0],
  cassette: [0.32, 1.0],
}
const DEFAULT_COLLIDER: [number, number] = [0.32, 1.15]

const turn = new Quaternion()

const isGesture = (clip: AnyClip): clip is GestureClip => (GESTURE_CLIPS as readonly string[]).includes(clip)

// load every robot file up front, so switching project never shows an empty hall while new shapes download
for (const v of [...ROBOT_VARIANTS, ...EXTRA_VARIANTS]) useGLTF.preload(`/models/robot-${v}.glb`)

declare global {
  interface Window {
    /** Every gesture a click has started, for checking in the browser: which robot, which gesture, and when. */
    __gestureLog?: { variant: string; clip: string; at: number }[]
  }
}

/**
 * One robot of a given shape. Its colours, size and animation timing come from `seed`, so two
 * robots of the same shape still look and move differently.
 *
 * Click it and it plays a gesture picked at random from the ones it likes (dance, cheer, bow, shrug, flex,
 * salute or spin), then goes back to work. `onGesture` tells a parent when that starts and ends, so a robot
 * that walks about can stand still meanwhile. `breakSeed` gives a seated robot small breaks (stretch, look around, wave).
 */
export default function RoleRobot({
  position,
  variant,
  clip,
  seed,
  rotationY = 0,
  clipRef,
  scaleMul = 1,
  interactive = true,
  breakSeed,
  mood = 'bright',
  onGesture,
  onPick,
  onReady,
  afterPose,
}: {
  position: [number, number, number]
  variant: AnyVariant
  clip: AnyClip
  seed: number
  rotationY?: number
  /** When given, the robot follows this value as it changes, without re-rendering the page. */
  clipRef?: MutableRefObject<AnyClip>
  scaleMul?: number
  /** Clicking plays a gesture. On by default. */
  interactive?: boolean
  /** When set, the robot takes small breaks of its own from time to time. */
  breakSeed?: number
  /** Eyes: lit (working), dim (asleep) or off (standing by). */
  mood?: 'bright' | 'asleep' | 'off'
  onGesture?: (active: boolean) => void
  /** Called on every real click (not a drag), besides the gesture. The hall uses it to open the agent's details. */
  onPick?: () => void
  /** Called once the model is built, with the model's root and the size it is drawn at. */
  onReady?: (model: Object3D, size: number) => void
  /** Called every frame after the animation has been applied, to adjust bones by hand. */
  afterPose?: (model: Object3D, t: number, dt: number) => void
}) {
  const { scene, animations } = useGLTF(`/models/robot-${variant}.glb`)
  const look = useMemo(() => robotLook(seed), [seed])
  const simple = useQuality().simple

  const eyeColor = mood === 'bright' ? look.eye : mood === 'asleep' ? '#3f7886' : '#2e3a55'
  const eyeGlow = mood === 'bright' ? 1 : mood === 'asleep' ? 0.18 : 0.03

  const clone = useMemo(() => {
    if (!joined.has(scene)) {
      mergeSkinned(scene)
      joined.add(scene)
    }
    const copy = SkeletonUtils.clone(scene)
    shareSkeleton(copy)
    const cache = new Map<Material, Material>()
    copy.traverse((o) => {
      const mesh = o as Mesh
      if (!mesh.isMesh) return
      const original = mesh.material as MeshStandardMaterial
      let own = cache.get(original) as MeshStandardMaterial | undefined
      if (!own) {
        // Body and accent parts get a glossy clear coat so they read as polished plastic.
        const glossy = original.name.endsWith('Body') || original.name.endsWith('Accent')
        const glow = original.name.endsWith('Eyes') || original.name.endsWith('Glow')
        // parts that do not change from robot to robot use the model's own material; eyes and glow are shared by colour
        // (and in simple mode so is the paint, which has no livery); only the painted parts in full detail are one per robot
        const key = glow ? `${original.uuid}|${eyeColor}|${eyeGlow}` : glossy && simple ? `${original.uuid}|${look.tint}|${look.eye}` : null
        if (!glossy && !glow) {
          cache.set(original, original)
          mesh.material = original
          return
        }
        const reused = key ? (shared.get(key) as MeshStandardMaterial | undefined) : undefined
        if (reused) {
          cache.set(original, reused)
          mesh.material = reused
          return
        }
        own = glossy && !simple
          ? new MeshPhysicalMaterial({
              name: original.name,
              color: original.color,
              roughness: 0.4,
              roughnessMap: getScuffTexture(),
              bumpMap: getScuffTexture(),
              bumpScale: 0.6,
              metalness: 0,
              clearcoat: 0.9,
              clearcoatRoughness: 0.12,
              envMapIntensity: 1.4,
            })
          : original.clone()
        if (original.name.endsWith('Body')) own.color.set(look.tint)
        if (original.name.endsWith('Eyes') || original.name.endsWith('Glow')) {
          own.color.set(eyeColor)
          own.emissive.set(eyeColor)
          own.emissiveIntensity = eyeGlow
        }
        if (original.name.endsWith('Accent')) own.color.set(look.eye)
        if (glossy && !simple) applyRobotLivery(own, { stripe: new Color(look.eye), seed, isBody: original.name.endsWith('Body') })
        if (key) shared.set(key, own)
        cache.set(original, own)
      }
      mesh.material = own
    })
    enableShadows(copy)
    return copy
  }, [scene, look, simple, seed, eyeColor, eyeGlow])

  // pieces that keep moving whatever the robot is doing: the cassette's reels, the fish in the bowl
  const spinners = useMemo(() => {
    const list = SPINNERS[variant] ?? []
    if (!list.length) return []
    clone.updateMatrixWorld(true)
    const rootInverse = clone.getWorldQuaternion(new Quaternion()).invert()
    return list.flatMap((s) => {
      const node = clone.getObjectByName(s.node)
      if (!node) return []
      const own = rootInverse.clone().multiply(node.getWorldQuaternion(new Quaternion()))
      const parent = rootInverse.clone().multiply((node.parent ?? clone).getWorldQuaternion(new Quaternion()))
      return [
        {
          node,
          rest: node.quaternion.clone(),
          restPosition: node.position.clone(),
          axis: localAxis(new Vector3(...s.axis), own),
          up: new Vector3(0, 1, 0).applyQuaternion(parent.invert()),
          speed: s.speed,
          bob: s.bob ?? 0,
        },
      ]
    })
  }, [clone, variant])

  const { actions } = useAnimations(animations, clone)

  const playing = useRef<AnyClip | null>(null)
  const gesture = useRef<{ clip: GestureClip; until: number } | null>(null)
  const now = useRef(0)
  const taps = useRef<{ last: GestureClip | null; lastAt: number | null; recent: number[] }>({ last: null, lastAt: null, recent: [] })
  const [emote, setEmote] = useState<{ symbol: string; id: number } | null>(null)
  const emoteId = useRef(0)
  const root = useRef<Group>(null)

  useEffect(() => {
    onReady?.(clone, look.scale * scaleMul)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clone])

  useFrame(({ clock }, dt) => {
    const t = clock.getElapsedTime()
    now.current = t
    afterPose?.(clone, t, dt)
    for (const s of spinners) {
      s.node.quaternion.copy(s.rest).multiply(turn.setFromAxisAngle(s.axis, spinAngle(s.speed, t, look.offset * 6.28)))
      if (s.bob) s.node.position.copy(s.restPosition).addScaledVector(s.up, bobAt(s.bob, t, look.offset))
    }
    let want: AnyClip
    if (gesture.current && t < gesture.current.until) want = gesture.current.clip
    else {
      if (gesture.current) {
        gesture.current = null
        onGesture?.(false)
        setEmote(null)
      }
      const base = clipRef ? clipRef.current : clip
      const pause = breakSeed !== undefined && !(BREAK_CLIPS as readonly string[]).includes(base) ? breakAt(breakSeed, t) : null
      want = pause ? pause.clip : base
    }
    if (want === playing.current) return
    const next = actions[want]
    if (!next) return
    const first = playing.current === null
    if (playing.current) actions[playing.current]?.fadeOut(0.3)
    next.reset().setEffectiveTimeScale(isGesture(want) ? 1 : look.speed).fadeIn(first ? 0.25 : 0.3).play()
    if (first) next.time = look.offset * next.getClip().duration
    playing.current = want
  })

  const [radius, height] = COLLIDER[variant] ?? DEFAULT_COLLIDER
  const size = look.scale * scaleMul

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (e.delta > 5) return // that was a drag to turn the view, not a click
    onPick?.()
    const t = now.current
    const memory = taps.current
    if (tooSoon(memory.lastAt, t)) return
    memory.lastAt = t
    const { recent, excited } = registerClick(memory.recent, t)
    memory.recent = recent
    const next: GestureClip = excited ? 'spin' : pickGesture(variant, memory.last, Math.random)
    memory.last = next
    gesture.current = { clip: next, until: t + gestureSeconds(next, gestureLoops(next, Math.random)) }
    onGesture?.(true)
    emoteId.current += 1
    setEmote({ symbol: emoteFor(next), id: emoteId.current })
    ;(window.__gestureLog ??= []).push({ variant, clip: next, at: t })
    if (root.current) {
      const at = root.current.getWorldPosition(new Vector3())
      sound.gesture(next, [at.x, at.y + 1, at.z])
    }
  }

  return (
    <group ref={root} position={position} rotation={[0, rotationY, 0]}>
      <primitive object={clone} scale={size} />
      {interactive && (
        <mesh
          position={[0, (height * size) / 2, 0]}
          onClick={onClick}
          onPointerOver={(e) => {
            e.stopPropagation()
            document.body.style.cursor = 'pointer'
          }}
          onPointerOut={() => {
            document.body.style.cursor = ''
          }}
        >
          <cylinderGeometry args={[radius * size, radius * size, height * size, 10]} />
          <meshBasicMaterial visible={false} />
        </mesh>
      )}
      {emote && (
        <Html key={emote.id} position={[0, height * size + 0.25, 0]} center zIndexRange={[6, 0]} style={{ pointerEvents: 'none' }}>
          <div className="emote">{emote.symbol}</div>
        </Html>
      )}
    </group>
  )
}
