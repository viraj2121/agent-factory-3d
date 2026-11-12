import { randomBytes, timingSafeEqual } from 'node:crypto'
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// The service listens on 127.0.0.1 only (see server.ts). On top of that every request is checked:
// - Host must be this computer on this port (so a web page cannot reach us through a DNS name it controls),
// - Origin, when the browser sends one, must be on the allow list (so another web page cannot read the snapshot),
// - posting events needs a bearer token from a file a web page cannot read.

const DEFAULT_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173', 'http://127.0.0.1:4173']

export function allowedOrigins(extra: string | undefined): Set<string> {
  const set = new Set(DEFAULT_ORIGINS)
  for (const raw of (extra ?? '').split(',')) {
    const o = raw.trim().replace(/\/+$/, '')
    if (o && o !== '*' && o !== 'null') set.add(o)
  }
  return set
}

export interface RequestCheck {
  host: string | undefined
  origin: string | undefined
  port: number
  origins: ReadonlySet<string>
}

export type CheckResult = { ok: true } | { ok: false; status: number; message: string }

export function checkRequest({ host, origin, port, origins }: RequestCheck): CheckResult {
  const hostOk = host !== undefined && [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`].includes(host.toLowerCase())
  if (!hostOk) return { ok: false, status: 403, message: 'Host not allowed: this service only answers on 127.0.0.1.' }
  if (origin !== undefined && !origins.has(origin)) return { ok: false, status: 403, message: 'Origin not allowed.' }
  return { ok: true }
}

/** The shared secret for POST /api/hook. Created on first use, in a folder of the user own. */
export function loadToken(dir: string): string {
  const file = join(dir, 'token')
  try {
    const existing = readFileSync(file, 'utf8').trim()
    if (/^[0-9a-f]{64}$/.test(existing)) return existing
  } catch {
    // create below
  }
  mkdirSync(dir, { recursive: true })
  const token = randomBytes(32).toString('hex')
  writeFileSync(file, token + '\n', { mode: 0o600 })
  try {
    chmodSync(file, 0o600)
  } catch {
    // Windows ignores modes; the file lives in the user profile
  }
  return token
}

export function tokenMatches(header: string | undefined, token: string): boolean {
  if (!header || !token || !header.startsWith('Bearer ')) return false
  const given = Buffer.from(header.slice(7))
  const want = Buffer.from(token)
  return given.length === want.length && timingSafeEqual(given, want)
}
