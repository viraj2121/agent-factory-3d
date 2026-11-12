import type { DocFile } from './live/wire'
import { LIBRARY } from './library'

// The library's shelves hold the project's real markdown files as books: a shelf for every folder (with a nameplate), a
// book for every file, as thick as the file is big. A book edited in the last day has a ribbon. This is plain maths, so it
// is tested; the drawing is in ArchiveHall.tsx. Only names, sizes and dates are used, never contents.

export const SHELF_COUNT = LIBRARY.units * LIBRARY.shelves
/** Usable length of one shelf, in metres, and the little gap left between two books. */
export const SHELF_CAP = 2.1
const GAP = 0.008
/** The shelves show at most this many books (the newest files); the panel lists them all. */
export const MAX_BOOKS = 150
export const RECENT_MS = 86_400_000

export interface Book {
  path: string
  name: string
  bytes: number
  modifiedAt: number
  /** 0 to SHELF_COUNT - 1, filling one unit from the bottom up, then the next. */
  shelf: number
  unit: number
  level: number
  /** Where the book's middle is along the shelf, in metres from the shelf's middle. */
  along: number
  thickness: number
  height: number
  depth: number
  /** Which colour of the palette: the same for every book of a folder. */
  tone: number
  /** Edited in the last day: it gets a ribbon. */
  recent: boolean
}

export interface Plate {
  shelf: number
  unit: number
  level: number
  text: string
}

export interface BookLayout {
  books: Book[]
  plates: Plate[]
  /** Files that have no book (too many, or no shelf left). */
  hidden: number
  /** The five most recently edited files, newest first. */
  recent: DocFile[]
}

/** A book is as thick as its file is big, between 4 and 16 centimetres. */
export function thicknessFor(bytes: number): number {
  const b = Number.isFinite(bytes) && bytes > 0 ? bytes : 0
  return Math.min(0.16, 0.04 + Math.sqrt(b) / 1600)
}

const hash01 = (s: string): number => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return ((h >>> 0) % 10000) / 10000
}

const folderOf = (path: string): string => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '')

export function layoutBooks(files: DocFile[], now: number): BookLayout {
  if (files.length === 0) return { books: [], plates: [], hidden: 0, recent: [] }
  const newest = [...files].sort((a, b) => b.modifiedAt - a.modifiedAt || (a.path < b.path ? -1 : 1))
  const recent = newest.slice(0, 5)
  const shown = newest.slice(0, MAX_BOOKS)
  let hidden = newest.length - shown.length

  const groups = new Map<string, DocFile[]>()
  for (const file of shown) groups.set(folderOf(file.path), [...(groups.get(folderOf(file.path)) ?? []), file])
  const folders = [...groups.keys()].sort((a, b) => (a === '' ? -1 : b === '' ? 1 : a < b ? -1 : a > b ? 1 : 0))

  const books: Book[] = []
  const plates: Plate[] = []
  let shelf = 0
  let used = 0
  let plated = -1
  folders.forEach((folder, tone) => {
    if (used > 0) {
      shelf++
      used = 0
    }
    const name = folder || 'Project folder'
    let started = false
    for (const file of [...groups.get(folder)!].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      const thickness = thicknessFor(file.bytes)
      if (used > 0 && used + thickness > SHELF_CAP) {
        shelf++
        used = 0
      }
      if (shelf >= SHELF_COUNT) {
        hidden++
        continue
      }
      if (plated !== shelf) {
        plates.push({ shelf, unit: Math.floor(shelf / LIBRARY.shelves), level: shelf % LIBRARY.shelves, text: started ? `${name} (more)` : name })
        plated = shelf
      }
      started = true
      books.push({
        path: file.path,
        name: file.name,
        bytes: file.bytes,
        modifiedAt: file.modifiedAt,
        shelf,
        unit: Math.floor(shelf / LIBRARY.shelves),
        level: shelf % LIBRARY.shelves,
        along: -SHELF_CAP / 2 + used + thickness / 2,
        thickness,
        height: 0.3 + 0.08 * hash01(file.path),
        depth: 0.22,
        tone,
        recent: now - file.modifiedAt <= RECENT_MS,
      })
      used += thickness + GAP
    }
  })
  return { books, plates, hidden, recent }
}
