import { closeSync, fstatSync, openSync, readSync } from 'node:fs'

/** A folder as a readable path: forward slashes, no `file://`, no `\\?\`, no trailing slash. */
export function cleanPath(input: string): string {
  let p = input.trim()
  if (/^file:\/\//i.test(p)) {
    p = p.replace(/^file:\/\/\/?/i, '')
    try {
      p = decodeURIComponent(p)
    } catch {
      // keep the raw text
    }
    if (!/^[a-zA-Z]:/.test(p)) p = '/' + p
  }
  p = p.replace(/^\\\\\?\\/, '').replace(/\\/g, '/')
  while (p.length > 1 && p.endsWith('/') && !/^[a-zA-Z]:\/$/.test(p)) p = p.slice(0, -1)
  return p
}

/** What decides that two agents work in the same project: the folder, compared without case. */
export function projectKey(input: string): string {
  return cleanPath(input).toLowerCase()
}

export function baseName(path: string): string {
  const p = cleanPath(path)
  if (!p) return 'unknown'
  if (p === '/') return '/'
  return p.slice(p.lastIndexOf('/') + 1) || p
}

const SECRET_FLAG = /^--?(token|api[-_]?key|secret|password|passwd|auth|authorization|bearer|key|access[-_]?token)$/i
const SECRET_VALUE = /^(ghp_|gho_|ghu_|ghs_|github_pat_|sk-|xox[abprs]-|AIza|eyJ[A-Za-z0-9_-]{15,})/
const SECRET_QUERY = /([?&](?:token|key|secret|api_?key|apikey|password|auth|access_token)=)[^&\s]*/gi

function redactUrl(text: string): string {
  return text.replace(/(\b[a-z][a-z0-9+.-]*:\/\/)[^/\s@]+@/gi, '$1***@').replace(SECRET_QUERY, '$1***')
}

/** A command line or URL to show people, with anything that looks like a secret replaced by ***. */
export function redactTarget(command: string, args: readonly string[]): string {
  const out: string[] = []
  let previous = ''
  for (const raw of [command, ...args]) {
    let token = String(raw)
    const eq = token.match(/^(--?[\w-]+)=(.*)$/)
    if (SECRET_FLAG.test(previous)) token = '***'
    else if (eq && SECRET_FLAG.test(eq[1])) token = `${eq[1]}=***`
    else if (SECRET_VALUE.test(token)) token = '***'
    else token = redactUrl(token)
    out.push(token)
    previous = String(raw)
  }
  return out.join(' ')
}

/** The last `maxBytes` of a text file, starting at a whole line. Empty when the file cannot be read. */
export function readTail(file: string, maxBytes: number): string {
  let fd: number | undefined
  try {
    fd = openSync(file, 'r')
    const size = fstatSync(fd).size
    const start = Math.max(0, size - maxBytes)
    const buffer = Buffer.alloc(size - start)
    readSync(fd, buffer, 0, buffer.length, start)
    let text = buffer.toString('utf8')
    if (start > 0) {
      const nl = text.indexOf('\n')
      text = nl === -1 ? '' : text.slice(nl + 1)
    }
    return text
  } catch {
    return ''
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
}

/** The first `maxBytes` of a text file, ending at a whole line. Empty when the file cannot be read. */
export function readHead(file: string, maxBytes: number): string {
  let fd: number | undefined
  try {
    fd = openSync(file, 'r')
    const size = fstatSync(fd).size
    const buffer = Buffer.alloc(Math.min(size, maxBytes))
    readSync(fd, buffer, 0, buffer.length, 0)
    let text = buffer.toString('utf8')
    if (size > maxBytes) {
      const nl = text.lastIndexOf('\n')
      text = nl === -1 ? '' : text.slice(0, nl + 1)
    }
    return text
  } catch {
    return ''
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
}

/** Parse the lines of a JSON-lines text, skipping any line that is not JSON (an unfinished one, for example). */
export function parseJsonLines(text: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    try {
      const value: unknown = JSON.parse(line)
      if (value && typeof value === 'object' && !Array.isArray(value)) out.push(value as Record<string, unknown>)
    } catch {
      // not a whole record
    }
  }
  return out
}

export const asString = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null)
export const asRecord = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null)
export const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
export const toMillis = (v: unknown): number => {
  if (typeof v === 'number') return v < 1e12 ? v * 1000 : v
  if (typeof v === 'string') {
    const t = Date.parse(v)
    return Number.isNaN(t) ? Number.NaN : t
  }
  return Number.NaN
}
