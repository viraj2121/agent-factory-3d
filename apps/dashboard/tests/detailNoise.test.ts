import { describe, expect, it } from 'vitest'
import { detailNoiseData } from '../src/detailNoise'

const SIZE = 64
const at = (d: Uint8Array, x: number, y: number, c: number) => d[((((y % SIZE) + SIZE) % SIZE) * SIZE + (((x % SIZE) + SIZE) % SIZE)) * 4 + c]

describe('detailNoiseData', () => {
  const data = detailNoiseData(SIZE, 7)

  it('fills every pixel, opaque, with a spread of values in every channel', () => {
    expect(data).toHaveLength(SIZE * SIZE * 4)
    for (let c = 0; c < 3; c++) {
      let lo = 255
      let hi = 0
      for (let i = c; i < data.length; i += 4) {
        lo = Math.min(lo, data[i])
        hi = Math.max(hi, data[i])
      }
      expect(hi - lo, `channel ${c}`).toBeGreaterThan(90)
    }
    for (let i = 3; i < data.length; i += 4) expect(data[i]).toBe(255)
  })

  it('is the same every time for the same seed and different for another', () => {
    expect(detailNoiseData(SIZE, 7)).toEqual(data)
    expect(detailNoiseData(SIZE, 8)).not.toEqual(data)
  })

  it('tiles: the step across the wrap-around edge is no bigger than a normal step', () => {
    for (let c = 0; c < 3; c++) {
      let inside = 0
      let edge = 0
      for (let y = 0; y < SIZE; y++) {
        for (let x = 1; x < SIZE; x++) inside += Math.abs(at(data, x, y, c) - at(data, x - 1, y, c))
        edge += Math.abs(at(data, 0, y, c) - at(data, SIZE - 1, y, c))
      }
      expect(edge / SIZE).toBeLessThan((inside / (SIZE * (SIZE - 1))) * 2.5 + 2)
      let insideV = 0
      let edgeV = 0
      for (let x = 0; x < SIZE; x++) {
        for (let y = 1; y < SIZE; y++) insideV += Math.abs(at(data, x, y, c) - at(data, x, y - 1, c))
        edgeV += Math.abs(at(data, x, 0, c) - at(data, x, SIZE - 1, c))
      }
      expect(edgeV / SIZE).toBeLessThan((insideV / (SIZE * (SIZE - 1))) * 2.5 + 2)
    }
  })
})
