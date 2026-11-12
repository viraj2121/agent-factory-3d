import { LatheGeometry, Vector2, type BufferGeometry } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/** The low, thick wall round the hall's edge: where it sits, how high, and how many light posts stand on it. */
export const PARAPET = { inner: 14.75, outer: 15.15, height: 1.2, posts: 24, postHeight: 0.5 }

const SEGMENTS = 96

/** The ring as three faces (outer, top, inner), each lit with its own flat normal. Centred on the hall, floor at y = 0. */
export function parapetGeometry(): BufferGeometry {
  const face = (points: [number, number][]) => new LatheGeometry(points.map(([x, y]) => new Vector2(x, y)), SEGMENTS)
  return mergeGeometries([
    face([[PARAPET.outer, 0], [PARAPET.outer, PARAPET.height]]),
    face([[PARAPET.outer, PARAPET.height], [PARAPET.inner, PARAPET.height]]),
    face([[PARAPET.inner, PARAPET.height], [PARAPET.inner, 0]]),
  ])
}

/** Angles of the light posts, evenly round the ring. */
export function postAngles(): number[] {
  return Array.from({ length: PARAPET.posts }, (_, i) => (i / PARAPET.posts) * Math.PI * 2)
}
