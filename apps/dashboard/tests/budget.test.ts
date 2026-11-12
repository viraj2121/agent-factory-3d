import { readdirSync, readFileSync, statSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const MODELS = new URL('../public/models/', import.meta.url)
const SRC = new URL('../src/', import.meta.url)
const ROOT = new URL('../../../', import.meta.url)

describe('asset budget', () => {
  it('keeps all models under 25 MB together', () => {
    const total = readdirSync(MODELS).reduce((sum, f) => sum + statSync(new URL(f, MODELS)).size, 0)
    expect(total).toBeLessThan(25_000_000)
  })

  it('has every model that the code loads', () => {
    const names = new Set<string>()
    for (const file of readdirSync(SRC).filter((f) => f.endsWith('.tsx') || f.endsWith('.ts'))) {
      const text = readFileSync(new URL(file, SRC), 'utf8')
      for (const m of text.matchAll(/\/models\/([A-Za-z0-9_${}.\-]+\.glb)/g)) names.add(m[1])
    }
    const onDisk = new Set(readdirSync(MODELS))
    for (const n of names) {
      if (n.includes('${')) continue // built from a variant name, checked by robotModels.test.ts
      expect(onDisk.has(n), n).toBe(true)
    }
  })

  it('lists every third-party asset with a licence', () => {
    const text = readFileSync(new URL('ATTRIBUTIONS.md', ROOT), 'utf8')
    const rows = text.split('\n').filter((l) => l.startsWith('|') && !/^\|\s*-/.test(l) && !/^\|\s*Asset/i.test(l))
    for (const row of rows) {
      const cells = row.split('|').map((c) => c.trim()).filter((_, i, a) => i > 0 && i < a.length - 1)
      expect(cells.every((c) => c.length > 0), row).toBe(true)
    }
  })
})
