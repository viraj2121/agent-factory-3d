import { describe, expect, it } from 'vitest'
import type { DocFile } from '../src/live/wire'
import { MAX_BOOKS, RECENT_MS, SHELF_CAP, SHELF_COUNT, layoutBooks, thicknessFor } from '../src/libraryBooks'

const NOW = 1_800_000_000_000
const DAY = 86_400_000
const f = (path: string, bytes = 2000, age = 10 * DAY): DocFile => ({ path, name: path.split('/').pop()!, bytes, modifiedAt: NOW - age })

describe('thicknessFor', () => {
  it('a bigger file is a fatter book, within sensible limits', () => {
    expect(thicknessFor(100)).toBeLessThan(thicknessFor(2_000))
    expect(thicknessFor(2_000)).toBeLessThan(thicknessFor(16_000))
    expect(thicknessFor(0)).toBeGreaterThan(0.02)
    expect(thicknessFor(50_000_000)).toBeLessThanOrEqual(0.16)
  })
  it('copes with a bad number', () => {
    expect(Number.isFinite(thicknessFor(NaN))).toBe(true)
    expect(thicknessFor(-5)).toBe(thicknessFor(0))
  })
})

describe('layoutBooks', () => {
  const many = [f('README.md'), f('docs/a.md'), f('docs/b.md'), f('docs/guides/c.md'), f('docs/guides/d.md'), f('notes/x.md')]

  it('puts every file on a shelf, once', () => {
    const l = layoutBooks(many, NOW)
    expect(l.books.map((b) => b.path).sort()).toEqual(many.map((m) => m.path).sort())
    expect(l.hidden).toBe(0)
  })

  it('gives every folder its own shelf, with a plate naming it', () => {
    const l = layoutBooks(many, NOW)
    const shelfOf = (path: string) => l.books.find((b) => b.path === path)!.shelf
    expect(shelfOf('docs/a.md')).toBe(shelfOf('docs/b.md'))
    expect(shelfOf('docs/a.md')).not.toBe(shelfOf('docs/guides/c.md'))
    expect(shelfOf('README.md')).not.toBe(shelfOf('docs/a.md'))
    expect(l.plates.map((p) => p.text).sort()).toEqual(['Project folder', 'docs', 'docs/guides', 'notes'].sort())
  })

  it('keeps the books of a shelf inside it and clear of each other', () => {
    const files = Array.from({ length: 80 }, (_, i) => f(`docs/f${String(i).padStart(2, '0')}.md`, 500 + i * 900))
    const l = layoutBooks(files, NOW)
    const byShelf = new Map<number, typeof l.books>()
    for (const b of l.books) byShelf.set(b.shelf, [...(byShelf.get(b.shelf) ?? []), b])
    for (const books of byShelf.values()) {
      const sorted = [...books].sort((a, b) => a.along - b.along)
      for (let i = 0; i < sorted.length; i++) {
        expect(sorted[i].along - sorted[i].thickness / 2).toBeGreaterThanOrEqual(-SHELF_CAP / 2 - 1e-9)
        expect(sorted[i].along + sorted[i].thickness / 2).toBeLessThanOrEqual(SHELF_CAP / 2 + 1e-9)
        if (i > 0) expect(sorted[i].along - sorted[i - 1].along).toBeGreaterThanOrEqual((sorted[i].thickness + sorted[i - 1].thickness) / 2)
      }
    }
  })

  it('a folder too big for one shelf carries on to the next, and the plate says so', () => {
    const files = Array.from({ length: 60 }, (_, i) => f(`big/f${String(i).padStart(2, '0')}.md`, 8000))
    const l = layoutBooks(files, NOW)
    const shelves = new Set(l.books.map((b) => b.shelf))
    expect(shelves.size).toBeGreaterThan(1)
    expect(l.plates.some((p) => p.text.endsWith('(more)'))).toBe(true)
  })

  it('never uses more shelves than the library has, and counts what did not fit', () => {
    const files = Array.from({ length: 40 }, (_, i) => f(`dir${String(i).padStart(2, '0')}/a.md`))
    const l = layoutBooks(files, NOW)
    expect(Math.max(...l.books.map((b) => b.shelf))).toBeLessThan(SHELF_COUNT)
    expect(l.books.length + l.hidden).toBe(40)
    expect(l.hidden).toBeGreaterThan(0)
  })

  it('keeps the most recently edited files when there are more than the limit', () => {
    const files = Array.from({ length: MAX_BOOKS + 30 }, (_, i) => f(`d/f${String(i).padStart(3, '0')}.md`, 300, (i + 1) * 1000))
    const l = layoutBooks(files, NOW)
    expect(l.books.length + l.hidden).toBe(MAX_BOOKS + 30)
    expect(l.books.map((b) => b.path)).toContain('d/f000.md')
    expect(l.books.map((b) => b.path)).not.toContain(`d/f${MAX_BOOKS + 29}.md`)
  })

  it('marks files edited in the last day as recent, and lists the five newest', () => {
    const files = [f('old.md', 100, 40 * DAY), f('new1.md', 100, 1000), f('new2.md', 100, 2000), f('new3.md', 100, 3000), f('new4.md', 100, 4000), f('new5.md', 100, 5000), f('new6.md', 100, RECENT_MS + 5)]
    const l = layoutBooks(files, NOW)
    expect(l.books.find((b) => b.path === 'old.md')!.recent).toBe(false)
    expect(l.books.find((b) => b.path === 'new1.md')!.recent).toBe(true)
    expect(l.books.find((b) => b.path === 'new6.md')!.recent).toBe(false)
    expect(l.recent.map((r) => r.path)).toEqual(['new1.md', 'new2.md', 'new3.md', 'new4.md', 'new5.md'])
  })

  it('is the same every time, and empty for no files', () => {
    expect(layoutBooks(many, NOW)).toEqual(layoutBooks(many, NOW))
    expect(layoutBooks([], NOW)).toEqual({ books: [], plates: [], hidden: 0, recent: [] })
  })

  it('gives every folder its own colour index and keeps a folder to one colour', () => {
    const l = layoutBooks(many, NOW)
    const tone = (p: string) => l.books.find((b) => b.path === p)!.tone
    expect(tone('docs/a.md')).toBe(tone('docs/b.md'))
    expect(tone('docs/a.md')).not.toBe(tone('notes/x.md'))
  })

  it('every book has a believable size', () => {
    for (const b of layoutBooks(many, NOW).books) {
      expect(b.height).toBeGreaterThan(0.25)
      expect(b.height).toBeLessThan(0.5)
      expect(b.thickness).toBeGreaterThan(0.02)
    }
  })
})
