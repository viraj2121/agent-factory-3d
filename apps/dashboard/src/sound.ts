import type { Vec3 } from './hallLayout'
import type { GestureClip } from './robotVariants'

// The numbers behind the hall's sound: how loud, how high, which side, which notes. The sounds themselves
// are made by `soundEngine.ts`. Nothing here needs a speaker, so all of it is tested.

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0)

/** How loud a sound is at `distance` metres from the camera: full within six metres, then fading gently, so the hall is still heard from the wide view. */
export function distanceGain(distance: number): number {
  if (!Number.isFinite(distance)) return 0
  return Math.min(1, Math.pow(6 / Math.max(distance, 0.001), 0.8))
}

/** The loudness of everything at the volume slider's position (0 to 1): 0 is silent, and a bit over 1 at the top, for rooms that need it. */
export const masterGain = (volume: number): number => (Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) * 1.2 : 0)

/** Where the slider starts the first time. */
export const DEFAULT_VOLUME = 0.45

/** How loud a sound that belongs to one corner of the hall is at `distance` metres: full within 4 m, nothing beyond `reach` metres. */
export function nearGain(distance: number, reach = 18): number {
  if (!Number.isFinite(distance)) return 0
  const k = Math.min(1, Math.max(0, (distance - 4) / (reach - 4)))
  return (1 - k) * (1 - k)
}

/** Left (-1) to right (+1) for a sound at `source`, seen from a camera at `camera` whose right-hand direction is `right`. Never fully to one side. */
export function panFor(camera: Vec3, right: Vec3, source: Vec3): number {
  const d: Vec3 = [source[0] - camera[0], source[1] - camera[1], source[2] - camera[2]]
  const length = Math.hypot(...d)
  if (!Number.isFinite(length) || length < 0.01) return 0
  const dot = (d[0] * right[0] + d[1] * right[1] + d[2] * right[2]) / length
  return Math.min(0.85, Math.max(-0.85, dot))
}

/** The core's low hum: pitch and loudness rise with how busy the project is; louder near the core, but always faintly there. */
export function humSettings(activity: number, distanceToCore: number): { frequency: number; gain: number } {
  const a = clamp01(activity)
  const far = Number.isFinite(distanceToCore) ? distanceToCore : 40
  const near = clamp01(1 - (far - 3) / 30)
  return { frequency: 52 + 22 * a, gain: (0.04 + 0.07 * a) * (0.4 + 0.6 * near) }
}

/** How loud key taps are from the nearest bay with `workers` robots at work, `distance` metres away. Silent beyond 16 m. */
export function typingGain(workers: number, distance: number): number {
  if (!(workers > 0) || !Number.isFinite(distance) || distance >= 16) return 0
  return 0.22 * Math.min(3, workers) * Math.pow(1 - Math.max(0, distance) / 16, 1.5)
}

/** Seconds until the next key tap: 0.06 to 0.56, from a random number between 0 and 1. */
export function nextTypingDelay(rand: () => number): number {
  const r = rand()
  return 0.06 + (Number.isFinite(r) ? Math.min(1, Math.max(0, r)) : 0.5) * 0.5
}

export interface Note {
  frequency: number
  /** Seconds after the sound starts. */
  start: number
  duration: number
  gain: number
  wave: OscillatorType
  /** When set, the pitch glides to this by the end of the note. */
  slideTo?: number
}

const n = (frequency: number, start: number, duration: number, gain: number, wave: OscillatorType = 'triangle', slideTo?: number): Note => ({
  frequency,
  start,
  duration,
  gain,
  wave,
  slideTo,
})

const GESTURE_NOTES: Record<GestureClip, Note[]> = {
  dance: [n(523, 0, 0.2, 0.09), n(659, 0.25, 0.2, 0.09), n(784, 0.5, 0.2, 0.09), n(659, 0.75, 0.3, 0.09)],
  dance2: [n(392, 0, 0.18, 0.09), n(494, 0.2, 0.18, 0.09), n(587, 0.4, 0.18, 0.09), n(740, 0.6, 0.18, 0.09), n(587, 0.8, 0.3, 0.09)],
  cheer: [n(440, 0, 0.15, 0.1), n(659, 0.12, 0.15, 0.1), n(880, 0.24, 0.15, 0.1), n(880, 0.42, 0.5, 0.1, 'sine')],
  bow: [n(330, 0, 0.4, 0.08, 'sine'), n(262, 0.45, 0.5, 0.08, 'sine')],
  shrug: [n(392, 0, 0.22, 0.09), n(311, 0.28, 0.35, 0.09)],
  flex: [n(110, 0, 0.3, 0.13, 'sawtooth'), n(165, 0.03, 0.25, 0.08, 'square')],
  salute: [n(392, 0, 0.12, 0.07, 'square'), n(523, 0.16, 0.12, 0.07, 'square'), n(659, 0.32, 0.4, 0.07, 'square')],
  spin: [n(300, 0, 0.85, 0.09, 'sine', 1400)],
  stretch: [n(220, 0, 0.7, 0.06, 'sine', 330)],
  highfive: [n(600, 0, 0.07, 0.1, 'square'), n(900, 0.09, 0.09, 0.1, 'square')],
}

/** The little tune a robot plays when it performs a gesture. */
export const gestureNotes = (clip: GestureClip): Note[] => GESTURE_NOTES[clip]

/** The tonal part of a capsule arriving: a soft blip, or a bright chime when it reaches the cradle. */
export function tubeNotes(kind: 'arrive' | 'finish'): Note[] {
  return kind === 'finish'
    ? [n(784, 0, 1.2, 0.12, 'sine'), n(1175, 0.09, 1.2, 0.09, 'sine'), n(1568, 0.18, 1, 0.06, 'sine')]
    : [n(520, 0, 0.18, 0.06, 'triangle')]
}
