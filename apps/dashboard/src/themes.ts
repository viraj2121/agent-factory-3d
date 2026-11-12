// The space around the hub. Every theme wraps the same real Milky Way photo around the scene (NASA's star map) and
// grades it differently, then adds its own far objects: a ringed gas giant, nebula gas, aurora over a planet.
// Colours added on top of the photo are linear light: the picture is encoded for the screen at the end, so tiny
// numbers here already look bright; keep them this small for a black sky.

export type ThemeId = 'deep' | 'nebula' | 'aurora'
export const THEME_IDS: ThemeId[] = ['deep', 'nebula', 'aurora']

type Rgb = [number, number, number]

export interface SkyTheme {
  id: ThemeId
  label: string
  /** Faint colour added overhead and near the horizon, on top of the photo. */
  top: Rgb
  low: Rgb
  /** How bright the Milky Way photo is drawn, and the colour it is graded toward. */
  photoExposure: number
  photoTint: Rgb
  /** Two nebula colours painted over the photo, and how strong they are (0 to 1). */
  nebulaA: Rgb
  nebulaB: Rgb
  nebulaOpacity: number
  /** The aurora ribbon: 0 = none, 1 = full curtains. */
  aurora: number
  /** A crescent moon far off. */
  moon: boolean
  /** A planet's dark night side below the islands, with a lit rim. */
  planet: boolean
  /** Colour of the planet's rim light. */
  rim: Rgb
  /** A ringed gas giant in the distance, its two band colours and its ring colour. */
  giant: boolean
  giantA: Rgb
  giantB: Rgb
  ring: Rgb
  /** The sun's colour. */
  sun: Rgb
  /** The solar system level: the red dwarf's glow, and the colour of the light it casts on the planets. */
  starGlow: Rgb
  starLight: Rgb
}

export const THEMES: Record<ThemeId, SkyTheme> = {
  deep: {
    id: 'deep',
    label: 'Deep space',
    top: [0, 0, 0],
    low: [0.0002, 0.0003, 0.0008],
    photoExposure: 1,
    photoTint: [1, 0.98, 1.02],
    nebulaA: [0.25, 0.12, 0.45],
    nebulaB: [0.06, 0.25, 0.4],
    nebulaOpacity: 0,
    aurora: 0,
    moon: true,
    planet: false,
    rim: [0.4, 0.6, 1],
    giant: true,
    giantA: [0.62, 0.42, 0.25],
    giantB: [0.3, 0.17, 0.09],
    ring: [0.75, 0.66, 0.55],
    sun: [1, 0.93, 0.82],
    starGlow: [1.0, 0.34, 0.2],
    starLight: [1.0, 0.6, 0.4],
  },
  nebula: {
    id: 'nebula',
    label: 'Nebula',
    top: [0.0002, 0, 0.0004],
    low: [0.0016, 0.0005, 0.0026],
    photoExposure: 0.9,
    photoTint: [1.05, 0.9, 1.15],
    nebulaA: [0.7, 0.18, 0.65],
    nebulaB: [0.1, 0.55, 0.65],
    nebulaOpacity: 0.62,
    aurora: 0,
    moon: false,
    planet: false,
    rim: [0.8, 0.4, 1],
    giant: true,
    giantA: [0.42, 0.34, 0.68],
    giantB: [0.13, 0.09, 0.3],
    ring: [0.68, 0.6, 0.85],
    sun: [1, 0.86, 0.95],
    starGlow: [0.95, 0.3, 0.62],
    starLight: [0.98, 0.56, 0.72],
  },
  aurora: {
    id: 'aurora',
    label: 'Aurora planet',
    top: [0, 0.0001, 0.0002],
    low: [0.0003, 0.0016, 0.0018],
    photoExposure: 0.75,
    photoTint: [0.9, 1.05, 1.05],
    nebulaA: [0.08, 0.3, 0.25],
    nebulaB: [0.05, 0.15, 0.35],
    nebulaOpacity: 0.1,
    aurora: 1,
    moon: false,
    planet: true,
    rim: [0.25, 1, 0.65],
    giant: false,
    giantA: [0.3, 0.4, 0.45],
    giantB: [0.1, 0.14, 0.18],
    ring: [0.6, 0.7, 0.7],
    sun: [0.92, 1, 0.96],
    starGlow: [0.32, 0.85, 0.66],
    starLight: [0.62, 0.95, 0.82],
  },
}

export function themeFor(id: unknown): SkyTheme {
  return THEME_IDS.includes(id as ThemeId) ? THEMES[id as ThemeId] : THEMES.deep
}
