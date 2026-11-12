/**
 * A small tileable wear texture, as RGBA bytes: fine grain plus a few light scratches. Used as a
 * bump and roughness map, so brighter means smoother. Deterministic, so it is the same every run.
 */
export function scuffData(size: number): Uint8Array {
  const data = new Uint8Array(size * size * 4)
  let a = 987654321
  const rand = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const grey = new Float32Array(size * size)
  for (let i = 0; i < grey.length; i++) grey[i] = 215 + rand() * 40

  // a few short scratches that wrap around the edges, darker than the grain
  for (let s = 0; s < size / 3; s++) {
    let x = Math.floor(rand() * size)
    let y = Math.floor(rand() * size)
    const dx = Math.cos(rand() * Math.PI)
    const dy = Math.sin(rand() * Math.PI)
    const len = 6 + Math.floor(rand() * 16)
    for (let k = 0; k < len; k++) {
      const px = ((Math.round(x) % size) + size) % size
      const py = ((Math.round(y) % size) + size) % size
      grey[py * size + px] = 120 + rand() * 50
      x += dx
      y += dy
    }
  }

  for (let i = 0; i < grey.length; i++) {
    const v = Math.round(grey[i])
    data[i * 4] = v
    data[i * 4 + 1] = v
    data[i * 4 + 2] = v
    data[i * 4 + 3] = 255
  }
  return data
}
