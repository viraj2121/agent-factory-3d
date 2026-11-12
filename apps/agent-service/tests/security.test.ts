import { mkdtempSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { allowedOrigins, checkRequest, loadToken, tokenMatches } from '../src/security.ts'

const origins = allowedOrigins(undefined)
const base = { port: 4317, origins }

describe('allowedOrigins', () => {
  it('allows the Vite dev and preview servers by default, and extra origins from the environment', () => {
    expect(origins.has('http://localhost:5173')).toBe(true)
    expect(origins.has('http://127.0.0.1:5173')).toBe(true)
    expect(origins.has('http://localhost:4173')).toBe(true)
    expect(allowedOrigins('https://a.example, http://b.example/').has('http://b.example')).toBe(true)
  })

  it('never allows a wildcard', () => {
    expect(allowedOrigins('*').has('*')).toBe(false)
    expect(allowedOrigins('null').has('null')).toBe(false)
  })
})

describe('checkRequest', () => {
  it('accepts a local host with an allowed origin, or with no origin (tools such as curl)', () => {
    expect(checkRequest({ ...base, host: '127.0.0.1:4317', origin: 'http://localhost:5173' })).toEqual({ ok: true })
    expect(checkRequest({ ...base, host: 'localhost:4317', origin: undefined })).toEqual({ ok: true })
  })

  it('refuses another web page asking from the browser', () => {
    const r = checkRequest({ ...base, host: '127.0.0.1:4317', origin: 'https://evil.example' })
    expect(r).toMatchObject({ ok: false, status: 403 })
    expect(checkRequest({ ...base, host: '127.0.0.1:4317', origin: 'null' })).toMatchObject({ ok: false, status: 403 })
  })

  it('refuses a Host that is not this computer, against DNS rebinding', () => {
    expect(checkRequest({ ...base, host: 'evil.example:4317', origin: undefined })).toMatchObject({ ok: false, status: 403 })
    expect(checkRequest({ ...base, host: '127.0.0.1:9999', origin: undefined })).toMatchObject({ ok: false, status: 403 })
    expect(checkRequest({ ...base, host: undefined, origin: undefined })).toMatchObject({ ok: false, status: 403 })
  })
})

describe('tokens', () => {
  it('creates a token file once and reads it back', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tok-'))
    const a = loadToken(dir)
    const b = loadToken(dir)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(b).toBe(a)
    expect(readFileSync(join(dir, 'token'), 'utf8').trim()).toBe(a)
    expect(statSync(join(dir, 'token')).isFile()).toBe(true)
  })

  it('matches only the exact bearer token', () => {
    expect(tokenMatches('Bearer abc', 'abc')).toBe(true)
    expect(tokenMatches('Bearer abd', 'abc')).toBe(false)
    expect(tokenMatches('abc', 'abc')).toBe(false)
    expect(tokenMatches(undefined, 'abc')).toBe(false)
    expect(tokenMatches('Bearer ', '')).toBe(false)
  })
})
