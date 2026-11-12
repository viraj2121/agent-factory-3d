/**
 * The energy dome over a hall shows only from far away. `near` and `far` are camera distances for a
 * full-size hall: closer than `near` it is invisible, past `far` it is at full strength.
 */
export const DOME = { near: 23, far: 48, radius: 15.3, squash: 0.85, strength: 0.85 }

/** How visible the dome is, 0 to 1, for a camera `distance` away. `scale` is the hall's size (a miniature island is under 1). */
export function domeStrength(distance: number, scale = 1): number {
  if (Number.isNaN(distance)) return 0
  const k = (distance - DOME.near * scale) / ((DOME.far - DOME.near) * scale)
  const t = Math.min(1, Math.max(0, k))
  return t * t * (3 - 2 * t)
}
