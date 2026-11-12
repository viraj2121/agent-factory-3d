import { STUDIO } from './hubLayout'

/** A pen stroke on the board, in metres from the board centre (x right, y up). */
export type Stroke = [number, number][]

function circle(cx: number, cy: number, r: number, n = 40): Stroke {
  return Array.from({ length: n + 1 }, (_, i) => [cx + r * Math.cos((i / n) * Math.PI * 2), cy + r * Math.sin((i / n) * Math.PI * 2)])
}

const W = STUDIO.boardWidth / 2
const H = STUDIO.boardHeight / 2

/** Three drawings: a house outline, a diagram of linked circles, and a wave with an arrow. */
export const STROKES: Stroke[] = [
  [[-W + 0.4, -H + 0.2], [-W + 0.4, 0.0], [-W + 1.0, 0.45], [-W + 1.6, 0.0], [-W + 1.6, -H + 0.2], [-W + 0.4, -H + 0.2]],
  [...circle(0.1, 0.1, 0.4), [0.5, 0.1], [1.0, 0.1], ...circle(1.4, 0.1, 0.3).slice(0, 30)],
  Array.from({ length: 30 }, (_, i): [number, number] => [-0.9 + (i / 29) * 2.8, -0.45 + 0.22 * Math.sin((i / 29) * Math.PI * 4)]),
]

const CYCLE = 8

/** How much of a stroke is drawn, 0 to 1: draws for 3 s, holds, wipes away, and repeats. */
export function strokeProgress(t: number, index: number): number {
  const p = (((t + index * 2.2) % CYCLE) + CYCLE) % CYCLE
  if (p < 3) return p / 3
  if (p < 6.5) return 1
  return 1 - (p - 6.5) / (CYCLE - 6.5)
}

/** Adds points along a stroke so no two neighbours are further apart than `step`. */
export function resample(stroke: Stroke, step: number): Stroke {
  if (stroke.length < 2) return stroke.map((p) => [...p] as [number, number])
  const out: Stroke = [[...stroke[0]] as [number, number]]
  for (let i = 1; i < stroke.length; i++) {
    const [x0, y0] = stroke[i - 1]
    const [x1, y1] = stroke[i]
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step))
    for (let k = 1; k <= n; k++) out.push([x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n])
  }
  return out
}
