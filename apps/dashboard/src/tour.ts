/** The camera tour: after a while with nothing touched, the camera glides from place to place. */

export interface TourStop {
  /** What `hubCameraFor` takes: a bay, `orb`, `studio`, `cart`, `sky`, or nothing for the wide view. */
  focus: string | undefined
  /** Flight time in milliseconds. */
  fly: number
  /** How long to stay once there, in milliseconds. */
  hold: number
}

const stop = (focus: string | undefined, fly = 4200, hold = 5000): TourStop => ({ focus, fly, hold })

/** Round the ring, then the core, the cart and out to the sky. */
export const TOUR_STOPS: TourStop[] = [
  stop(undefined, 3600, 4000),
  stop('development'),
  stop('rest'),
  stop('launchpad', 4200, 6000),
  stop('review'),
  stop('studio'),
  stop('planning'),
  stop('library'),
  stop('orb'),
  stop('cart', 4200, 4000),
  stop('sky', 4800, 6500),
]

/** Seconds with nothing touched before the tour starts. */
export const IDLE_AFTER = 30

export interface TourState {
  /** When something was last touched, in seconds. */
  lastInput: number
  touring: boolean
  /** Index of the next stop to fly to. Kept between tours, so each one starts somewhere new. */
  next: number
  /** When to leave for the next stop, in seconds. */
  nextAt: number
}

export const createTour = (now: number): TourState => ({ lastInput: now, touring: false, next: 0, nextAt: 0 })

/** Something was touched (mouse, wheel, key, finger). Ends a tour; `stopFlight` says the camera should stop where it is. */
export function noteInput(state: TourState, now: number): { state: TourState; stopFlight: boolean } {
  if (!Number.isFinite(now)) return { state, stopFlight: false }
  return { state: { ...state, lastInput: now, touring: false }, stopFlight: state.touring }
}

/**
 * Called a few times a second. Returns the next state and, when the camera should set off, the stop to
 * fly to. While the tour is switched off or blocked (a panel is open, a project is changing), nothing
 * moves and the idle wait starts again from now.
 */
export function stepTour(state: TourState, now: number, opts: { enabled: boolean; blocked: boolean; idleAfter?: number }): { state: TourState; go: TourStop | null } {
  if (!Number.isFinite(now)) return { state, go: null }
  if (!opts.enabled || opts.blocked) return { state: { ...state, touring: false, lastInput: now }, go: null }
  const due = state.touring ? now >= state.nextAt : now - state.lastInput >= (opts.idleAfter ?? IDLE_AFTER)
  if (!due) return { state, go: null }
  const go = TOUR_STOPS[state.next % TOUR_STOPS.length]
  return {
    state: { ...state, touring: true, next: (state.next + 1) % TOUR_STOPS.length, nextAt: now + (go.fly + go.hold) / 1000 },
    go,
  }
}
