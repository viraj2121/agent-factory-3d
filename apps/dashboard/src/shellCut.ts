import type { BufferGeometry } from 'three'

/**
 * A copy of `geometry` with every triangle that reaches above `maxY` removed (heights are judged after
 * adding `offsetY`, where the mesh sits). Used to take the tall wall, roof and beams off the baked hall,
 * leaving the floor and its edge.
 */
export function keepLow(geometry: BufferGeometry, offsetY: number, maxY: number): BufferGeometry {
  const pos = geometry.getAttribute('position')
  const index = geometry.index
  const count = index ? index.count : pos.count
  const kept: number[] = []
  for (let t = 0; t < count; t += 3) {
    const a = index ? index.getX(t) : t
    const b = index ? index.getX(t + 1) : t + 1
    const c = index ? index.getX(t + 2) : t + 2
    if (pos.getY(a) + offsetY <= maxY && pos.getY(b) + offsetY <= maxY && pos.getY(c) + offsetY <= maxY) kept.push(a, b, c)
  }
  const out = geometry.clone()
  out.setIndex(kept)
  return out
}
