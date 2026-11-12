import { useEffect, useRef, useState } from 'react'
import { FLY_EVENT, STOP_FLIGHT_EVENT, type FlyRequest } from './HubCamera'
import { hubCameraFor } from './hubCameraConfig'
import { createTour, noteInput, stepTour } from './tour'
import { reducedMotion, uiStore, useUi } from './uiSettings'

const PARAMS = new URLSearchParams(window.location.search)
const systemReduced = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

const seconds = () => performance.now() / 1000

/**
 * The camera tour. After half a minute with nothing touched, the camera glides round the hall (each bay, the
 * cradle, the studio, the core, the sky). Any mouse move, click, wheel, key or touch stops it where it is and
 * gives control back. It waits while a panel is open or a project is changing. Renders its on/off button
 * (put it in the button bar) and a small note while it plays.
 */
export default function IdleTour({ blocked }: { blocked: boolean }) {
  const ui = useUi()
  // on unless the settings say off, the address says `?tour=off`, or motion is reduced
  const enabled = ui.tourSeconds > 0 && PARAMS.get('tour') !== 'off' && !reducedMotion(ui.motion, systemReduced())
  const idleAfter = ui.tourSeconds || 30
  const [touring, setTouring] = useState(false)
  const state = useRef(createTour(seconds()))
  const flags = useRef({ enabled, blocked, idleAfter })

  useEffect(() => {
    flags.current = { enabled, blocked, idleAfter }
  }, [enabled, blocked, idleAfter])

  useEffect(() => {
    const touched = () => {
      const r = noteInput(state.current, seconds())
      state.current = r.state
      if (r.stopFlight) {
        window.dispatchEvent(new Event(STOP_FLIGHT_EVENT))
        setTouring(false)
      }
    }
    let last: [number, number] | null = null
    const moved = (e: PointerEvent) => {
      // small shakes of the hand do not count
      if (last && Math.hypot(e.clientX - last[0], e.clientY - last[1]) < 5) return
      last = [e.clientX, e.clientY]
      touched()
    }
    const events: [string, EventListener][] = [
      ['pointerdown', touched],
      ['wheel', touched],
      ['keydown', touched],
      ['touchstart', touched],
      ['pointermove', moved as EventListener],
    ]
    events.forEach(([name, fn]) => window.addEventListener(name, fn, { passive: true }))

    const timer = window.setInterval(() => {
      const r = stepTour(state.current, seconds(), { enabled: flags.current.enabled, blocked: flags.current.blocked || document.hidden, idleAfter: flags.current.idleAfter })
      state.current = r.state
      if (r.go) {
        window.dispatchEvent(new CustomEvent<FlyRequest>(FLY_EVENT, { detail: { view: hubCameraFor(r.go.focus), ms: r.go.fly } }))
      }
      setTouring(r.state.touring)
    }, 400)

    return () => {
      events.forEach(([name, fn]) => window.removeEventListener(name, fn))
      window.clearInterval(timer)
    }
  }, [])

  const toggle = () => {
    if (enabled) uiStore.set({ tourSeconds: 0 })
    else uiStore.set({ tourSeconds: ui.tourSeconds || 30, ...(reducedMotion(ui.motion, systemReduced()) ? { motion: 'full' as const } : {}) })
  }

  return (
    <>
      <button className={`ibtn${enabled ? ' on' : ''}`} onClick={toggle} aria-label={`Camera tour ${enabled ? 'on' : 'off'}`} data-tip={`Camera tour ${enabled ? 'on' : 'off'} (T)`}>
        🎬
      </button>
      {touring && <div className="tourcaption">Camera tour · move the mouse or press a key to take over</div>}
    </>
  )
}
