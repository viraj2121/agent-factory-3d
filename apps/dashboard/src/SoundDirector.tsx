import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Vector3 } from 'three'
import { HUB, HUB_LAYOUT } from './hubLayout'
import type { Project } from './projects'
import { sound, type Listening } from './soundEngine'
import { focusAt, lookPoint, type FocusId } from './soundFocus'

declare global {
  interface Window {
    /** The hall's sound engine, for checking in the browser: `__sound.on`, `__sound.level()`, `__sound.focus`. */
    __sound?: typeof sound
  }
}

/** A new focus must hold this long before sound follows it, so sweeping the camera past things does not make them stutter. */
const SETTLE_SECONDS = 0.25

/**
 * Tells the sound engine, every frame, where the camera is and what it is focused on (the point the camera orbits:
 * the core, a bay, the cradle, the launch pad, the library, the belt, the studio, or the whole hall). Only the sounds of
 * that element play. Draws nothing.
 */
export default function SoundDirector({ project }: { project: Project }) {
  const tools = useMemo(
    () => ({ right: new Vector3(), forward: new Vector3(), core: new Vector3(...HUB.coreCenter), view: { camera: [0, 0, 0], right: [1, 0, 0], activity: 0, distanceToCore: 40, nearBay: null } as Listening }),
    [],
  )
  const pending = useRef<{ id: FocusId; since: number }>({ id: 'overview', since: 0 })

  useEffect(() => {
    window.__sound = sound
    document.addEventListener('visibilitychange', sound.pauseWhenHidden)
    return () => document.removeEventListener('visibilitychange', sound.pauseWhenHidden)
  }, [])

  useFrame(({ camera, controls, clock }, dt) => {
    if (!sound.on) return
    const { view, right, forward, core } = tools
    right.setFromMatrixColumn(camera.matrixWorld, 0)
    camera.getWorldDirection(forward)
    view.camera = [camera.position.x, camera.position.y, camera.position.z]
    view.right = [right.x, right.y, right.z]
    view.activity = project.status === 'idle' ? Math.min(project.activity, 0.2) : project.activity
    view.distanceToCore = camera.position.distanceTo(core)

    // what has the attention: the point the camera orbits, or (if that cannot be read) where it looks on the floor
    const orbit = (controls as { target?: Vector3 } | null)?.target
    const seen = focusAt(orbit ? [orbit.x, orbit.y, orbit.z] : lookPoint(view.camera, [forward.x, forward.y, forward.z]))
    const now = clock.getElapsedTime()
    if (seen !== pending.current.id) pending.current = { id: seen, since: now }
    if (pending.current.id !== sound.focus && now - pending.current.since >= SETTLE_SECONDS) sound.setFocus(pending.current.id)

    // key taps come from the bay that has the focus, if robots are at work in it
    view.nearBay = null
    if (sound.focus.startsWith('bay:')) {
      const bay = HUB_LAYOUT.bays.find((b) => `bay:${b.id}` === sound.focus)
      const workers = bay ? project.agents[bay.id] : 0
      if (bay && workers > 0) {
        const distance = Math.hypot(bay.position[0] - camera.position.x, 1 - camera.position.y, bay.position[2] - camera.position.z)
        view.nearBay = { workers, distance, position: [bay.position[0], 1, bay.position[2]] }
      }
    }
    sound.frame(Math.min(dt, 0.1), view)
  })
  return null
}
