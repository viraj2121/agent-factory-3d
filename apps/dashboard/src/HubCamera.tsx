import { useEffect, useRef } from 'react'
import { OrbitControls } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { MathUtils, type PerspectiveCamera } from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { reducedMotion, useUi } from './uiSettings'
import type { Vec3 } from './hallLayout'
import { HUB_ZOOM_LIMITS, POLAR_LIMITS, clampTarget, hubCameraFor, isCloseUp, type CameraView } from './hubCameraConfig'
import { flightAt } from './flight'
import { systemCamera } from './systemLayout'

// Wide view of the whole hub. You can turn all the way round it, zoom toward the middle of the
// screen (so the point you orbit never drifts), and right-drag to move that point, which is kept
// inside the room. Press R or use the Reset view button to come back. `?focus=<department>` starts
// close on one bay. Preset angles and click-to-focus are planned for later and belong here.
export const HUB_CAMERA = hubCameraFor(new URLSearchParams(window.location.search).get('focus') ?? undefined)

/** Dispatched on `window` by the Reset view button. */
export const RESET_VIEW_EVENT = 'hub-reset-view'

/** Dispatched on `window` to stop a flight where the camera is, handing control back. */
export const STOP_FLIGHT_EVENT = 'hub-stop-flight'

/** Dispatched on `window` to fly the camera. `detail` is a FlyRequest. */
export const FLY_EVENT = 'hub-fly'

export interface FlyRequest {
  view: CameraView
  /** Flight time in milliseconds. */
  ms: number
  /** Jump here first instead of starting from where the camera is. */
  from?: CameraView
  /** Keep the controls off and the orbit point unclamped until the next reset or flight without a lock. */
  lock?: boolean
}

export interface ViewState {
  /** True when zoomed in close, where the zoom blur should be on. */
  close: boolean
  target: Vec3
}

const dist = (a: Vec3, b: Vec3) => Math.hypot(...a.map((v, i) => v - b[i]))

export const INITIAL_VIEW: ViewState = {
  close: isCloseUp(dist(HUB_CAMERA.position, HUB_CAMERA.target)),
  target: HUB_CAMERA.target,
}

export default function HubCamera({ onView, level = 'hall', systemCount = 8 }: { onView?: (view: ViewState) => void; level?: 'hall' | 'system'; systemCount?: number }) {
  const controls = useRef<OrbitControlsImpl>(null)
  const ui = useUi()
  // in the solar system the view drifts round slowly on its own (about three minutes a turn), unless motion is reduced
  const drift = level === 'system' && !reducedMotion(ui.motion, !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
  // the solar system is far bigger than the hall: wider zoom, no clamp on the orbit point, and its own reset view
  const levelRef = useRef({ level, systemCount })
  levelRef.current = { level, systemCount }
  const flight = useRef<{ from: CameraView; to: CameraView; start: number; ms: number } | null>(null)
  const locked = useRef(false)

  useEffect(() => {
    const c = controls.current
    if (c && levelRef.current.level === 'system') {
      const home = systemCamera(levelRef.current.systemCount)
      c.object.position.set(...home.position)
      c.target.set(...home.target)
      c.update()
    }
  }, [])

  useEffect(() => {
    const fly = (e: Event) => {
      const c = controls.current
      if (!c) return
      const { view, ms, from, lock } = (e as CustomEvent<FlyRequest>).detail
      const cam = c.object as PerspectiveCamera
      const start: CameraView = from ?? {
        position: [cam.position.x, cam.position.y, cam.position.z],
        target: [c.target.x, c.target.y, c.target.z],
        fov: cam.fov,
      }
      locked.current = !!lock
      c.enabled = !lock
      flight.current = { from: start, to: view, start: performance.now(), ms: Math.max(1, ms) }
    }
    const reset = () => {
      const c = controls.current
      if (!c) return
      flight.current = null
      locked.current = false
      c.enabled = true
      const home = levelRef.current.level === 'system' ? systemCamera(levelRef.current.systemCount) : HUB_CAMERA
      c.object.position.set(...home.position)
      c.target.set(...home.target)
      c.update()
      onView?.({ close: isCloseUp(dist(HUB_CAMERA.position, HUB_CAMERA.target)), target: HUB_CAMERA.target })
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'r' || e.key === 'R') reset()
    }
    const stop = () => {
      const c = controls.current
      if (!c || !flight.current) return
      flight.current = null
      onView?.({ close: isCloseUp(c.object.position.distanceTo(c.target)), target: [c.target.x, c.target.y, c.target.z] })
    }
    window.addEventListener(FLY_EVENT, fly)
    window.addEventListener(STOP_FLIGHT_EVENT, stop)
    window.addEventListener(RESET_VIEW_EVENT, reset)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener(FLY_EVENT, fly)
      window.removeEventListener(STOP_FLIGHT_EVENT, stop)
      window.removeEventListener(RESET_VIEW_EVENT, reset)
      window.removeEventListener('keydown', onKey)
    }
  }, [onView])

  useFrame(() => {
    const f = flight.current
    const c = controls.current
    if (!f || !c) return
    const t = (performance.now() - f.start) / f.ms
    const v = flightAt(f.from, f.to, t)
    const cam = c.object as PerspectiveCamera
    cam.position.set(...v.position)
    c.target.set(...v.target)
    cam.fov = v.fov
    cam.updateProjectionMatrix()
    c.update()
    if (t >= 1) {
      flight.current = null
      onView?.({ close: isCloseUp(cam.position.distanceTo(c.target)), target: v.target })
    }
  })

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      target={HUB_CAMERA.target}
      enableDamping
      autoRotate={drift}
      autoRotateSpeed={0.3}
      dampingFactor={0.08}
      zoomSpeed={0.8}
      enablePan
      screenSpacePanning
      minDistance={level === 'system' ? 6 : HUB_ZOOM_LIMITS.min}
      maxDistance={level === 'system' ? 420 : HUB_ZOOM_LIMITS.max}
      minPolarAngle={MathUtils.degToRad(POLAR_LIMITS.min)}
      maxPolarAngle={MathUtils.degToRad(POLAR_LIMITS.max)}
      onChange={() => {
        // keep the orbit point inside the room; runs on camera movement, sets nothing in React
        const c = controls.current
        if (!c || locked.current || flight.current || levelRef.current.level === 'system') return
        const next = clampTarget([c.target.x, c.target.y, c.target.z])
        if (next[0] !== c.target.x || next[1] !== c.target.y || next[2] !== c.target.z) c.target.set(...next)
      }}
      onEnd={() => {
        const c = controls.current
        if (!c) return
        onView?.({ close: isCloseUp(c.object.position.distanceTo(c.target)), target: [c.target.x, c.target.y, c.target.z] })
      }}
    />
  )
}
