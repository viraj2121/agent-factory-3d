/** How much the page spends on looks. Higher tiers look better and cost more frame rate. */
export type Tier = 'high' | 'balanced' | 'fast' | 'lite'
export type Mode = 'auto' | Tier

export const MODES: Mode[] = ['auto', 'high', 'balanced', 'fast', 'lite']

/** From the best picture to the cheapest. */
export const TIERS: Tier[] = ['high', 'balanced', 'fast', 'lite']

export interface QualitySettings {
  /** Ambient shading: soft darkening in corners and under things. It re-draws the scene, so it is the costliest effect. */
  ao: boolean
  /** Zoom blur when the camera is close. */
  dof: boolean
  /** Glow around bright things. */
  bloom: boolean
  shadows: boolean
  shadowMap: number
  /** Shadows are redrawn every this many frames (1 is every frame). Moving things still cast shadows; they just update a hair later. */
  shadowEvery: number
  /** Lowest and highest render resolution, as a multiple of the screen's pixels. */
  dpr: [number, number]
  /** For computers with no graphics card: plain materials, fewer lights, no shield dome, no glass blur. */
  simple: boolean
  /** How much weather to draw outside the hall. */
  weather: 'full' | 'light' | 'off'
  /** Film finish in space: lens flare from the sun, fine grain and darker corners. */
  film: boolean
  /** Which Milky Way photo to wrap around the scene: 4K or 2K. */
  skyPhoto: 'large' | 'small'
}

const SETTINGS: Record<Tier, QualitySettings> = {
  high: { ao: true, dof: true, bloom: true, shadows: true, shadowMap: 2048, shadowEvery: 2, dpr: [1, 1.25], simple: false, weather: 'full', film: true, skyPhoto: 'large' },
  balanced: { ao: false, dof: true, bloom: true, shadows: true, shadowMap: 2048, shadowEvery: 2, dpr: [1, 1.25], simple: false, weather: 'full', film: true, skyPhoto: 'large' },
  fast: { ao: false, dof: false, bloom: true, shadows: true, shadowMap: 1024, shadowEvery: 3, dpr: [1, 1], simple: false, weather: 'light', film: true, skyPhoto: 'small' },
  lite: { ao: false, dof: false, bloom: false, shadows: false, shadowMap: 512, shadowEvery: 1, dpr: [0.6, 0.75], simple: true, weather: 'off', film: false, skyPhoto: 'small' },
}

/** Whether the shadows are redrawn on frame number `frame`, when they are redrawn every `every` frames. */
export const shadowsDue = (frame: number, every: number): boolean => !(every > 1) || frame % Math.floor(every) === 0

export const settingsFor = (tier: Tier): QualitySettings => SETTINGS[tier]

/** Below this many frames per second the automatic mode steps down one tier. */
const STEP_DOWN: Record<Tier, number> = { high: 52, balanced: 38, fast: 28, lite: 0 }

/** The tier automatic mode moves to after seeing `fps`. It only ever steps down, so the picture never flickers. */
export function nextTier(tier: Tier, fps: number): Tier {
  if (!Number.isFinite(fps) || fps <= 0 || fps >= STEP_DOWN[tier]) return tier
  return TIERS[Math.min(TIERS.length - 1, TIERS.indexOf(tier) + 1)]
}

/** A saved mode, or auto when it is missing or not one of the known modes. */
export function parseMode(value: string | null | undefined): Mode {
  return MODES.find((m) => m === value) ?? 'auto'
}

/** The tier to draw with: the one automatic mode has reached, or the one you picked. */
export function tierFor(mode: Mode, reached: Tier): Tier {
  return mode === 'auto' ? reached : mode
}

/**
 * Where automatic mode should start, judging by the name the browser gives the graphics chip: `lite` when
 * the processor does the drawing, `fast` on small built-in chips, `balanced` on stronger built-in ones, and
 * nothing (start at the top) for real graphics cards and anything unknown.
 */
export function classifyRenderer(name: string | null | undefined): Tier | null {
  if (!name) return null
  if (/swiftshader|llvmpipe|softpipe|software|basic render/i.test(name)) return 'lite'
  if (/intel/i.test(name)) return /\barc\b/i.test(name) ? 'balanced' : 'fast'
  if (/mali|adreno|powervr|videocore/i.test(name)) return 'fast'
  if (/radeon(\(tm\))?\s+(graphics|vega)/i.test(name)) return 'balanced'
  return null
}

/** Asks the browser which graphics chip it has, and where automatic mode should start because of it. */
export function detectStartTier(): Tier {
  try {
    const gl = document.createElement('canvas').getContext('webgl2')
    const info = gl?.getExtension('WEBGL_debug_renderer_info')
    const name = info ? String(gl!.getParameter(info.UNMASKED_RENDERER_WEBGL)) : null
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
    return classifyRenderer(name) ?? 'high'
  } catch {
    return 'high'
  }
}
