import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { request } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Scanner } from '../src/scanner.ts'
import { allowedOrigins } from '../src/security.ts'
import { createService, type Service } from '../src/server.ts'
import { SettingsStore } from '../src/settings.ts'
import { existsSync, readFileSync } from 'node:fs'

const TOKEN = 'a'.repeat(64)
const root = mkdtempSync(join(tmpdir(), 'svc-'))
const home = join(root, 'home')
const project = join(root, 'MyApp')
const vscodeUser = join(root, 'vscode')
const NOW = Date.now()

const rec = (o: unknown) => JSON.stringify(o)
let service: Service
let store: SettingsStore
let settingsFile = ''
let port = 0

function call(method: string, path: string, opts: { headers?: Record<string, string>; body?: string; host?: string } = {}) {
  return new Promise<{ status: number; headers: Record<string, string | string[] | undefined>; text: string }>((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, method, path, headers: { host: opts.host ?? `127.0.0.1:${port}`, ...opts.headers } }, (res) => {
      let text = ''
      res.on('data', (c) => (text += c))
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, text }))
    })
    req.on('error', reject)
    req.end(opts.body)
  })
}

beforeAll(async () => {
  const dir = join(home, '.claude', 'projects', 'slug')
  mkdirSync(dir, { recursive: true })
  mkdirSync(project, { recursive: true })
  const t = (s: number) => new Date(NOW - s * 1000).toISOString()
  writeFileSync(
    join(dir, 'sess-1.jsonl'),
    [
      rec({ type: 'user', timestamp: t(8), cwd: project, message: { role: 'user', content: [{ type: 'text', text: 'SECRET PROMPT' }] } }),
      rec({ type: 'assistant', timestamp: t(4), message: { model: 'claude-x', role: 'assistant', content: [{ type: 'tool_use', id: '1', name: 'Edit', input: { file_path: 'SECRET.ts' } }] } }),
    ].join('\n'),
  )
  writeFileSync(join(project, 'CLAUDE.md'), 'x')
  writeFileSync(join(project, '.mcp.json'), JSON.stringify({ mcpServers: { demo: { command: 'node', args: ['s.js', '--token', 'SECRETTOKEN'], env: { K: 'SECRETENV' } } } }))
  settingsFile = join(root, 'ai-factory', 'settings.json')
  store = new SettingsStore(settingsFile)
  service = createService({ scanner: new Scanner({ home, vscodeUser, settings: () => store.get() }), token: TOKEN, origins: allowedOrigins(undefined), intervalMs: 100, settings: store })
  port = await service.listen(0)
})

afterAll(async () => {
  await service.close()
})

describe('agent service HTTP', () => {
  it('listens on 127.0.0.1 only', () => {
    const address = service.server.address()
    expect(typeof address === 'object' && address?.address).toBe('127.0.0.1')
  })

  it('answers health', async () => {
    const r = await call('GET', '/api/health')
    expect(r.status).toBe(200)
    expect(JSON.parse(r.text)).toMatchObject({ ok: true })
  })

  it('serves a snapshot with the project, its agent, MCP server and harness, and no message text, secrets or file names', async () => {
    const r = await call('GET', '/api/snapshot', { headers: { origin: 'http://localhost:5173' } })
    expect(r.status).toBe(200)
    expect(r.headers['access-control-allow-origin']).toBe('http://localhost:5173')
    const snap = JSON.parse(r.text)
    expect(snap.version).toBe(1)
    const p = snap.projects.find((x: { name: string }) => x.name === 'MyApp')
    expect(p).toBeTruthy()
    expect(p.sessions[0]).toMatchObject({ agent: 'claude-code', currentTool: 'Edit', department: 'development', state: 'running' })
    expect(p.agents.development).toBe(1)
    expect(p.mcp.find((m: { name: string }) => m.name === 'demo')).toMatchObject({ transport: 'stdio', envKeys: ['K'] })
    expect(p.harness.some((h: { name: string }) => h.name === 'CLAUDE.md')).toBe(true)
    expect(r.text).not.toMatch(/SECRET/)
    expect(snap.capabilities.map((c: { agent: string }) => c.agent)).toEqual(['claude-code', 'codex', 'copilot', 'other'])
    expect(snap.capabilities.every((c: { control: string }) => c.control === 'unsupported')).toBe(true)
  })

  it('refuses another web page, and a wrong Host', async () => {
    expect((await call('GET', '/api/snapshot', { headers: { origin: 'https://evil.example' } })).status).toBe(403)
    expect((await call('GET', '/api/snapshot', { host: 'evil.example' })).status).toBe(403)
    const evil = await call('GET', '/api/snapshot', { headers: { origin: 'https://evil.example' } })
    expect(evil.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('answers the browser preflight only for allowed origins', async () => {
    const ok = await call('OPTIONS', '/api/hook', { headers: { origin: 'http://localhost:5173' } })
    expect(ok.status).toBe(204)
    expect((await call('OPTIONS', '/api/hook', { headers: { origin: 'https://evil.example' } })).status).toBe(403)
  })

  it('takes hook events only with the token, and shows the reported agent', async () => {
    const body = JSON.stringify({ agent: 'Cursor', sessionId: 'c1', cwd: project, event: 'tool', tool: 'Bash', command: 'git push' })
    expect((await call('POST', '/api/hook', { body })).status).toBe(401)
    expect((await call('POST', '/api/hook', { body, headers: { authorization: 'Bearer wrong' } })).status).toBe(401)
    expect((await call('POST', '/api/hook', { body, headers: { authorization: `Bearer ${TOKEN}` } })).status).toBe(202)
    expect((await call('POST', '/api/hook', { body: '{nope', headers: { authorization: `Bearer ${TOKEN}` } })).status).toBe(400)
    expect((await call('POST', '/api/hook', { body: '{}', headers: { authorization: `Bearer ${TOKEN}` } })).status).toBe(400)
    const big = JSON.stringify({ agent: 'x'.repeat(40000) })
    expect([413, 400]).toContain((await call('POST', '/api/hook', { body: big, headers: { authorization: `Bearer ${TOKEN}` } })).status)
    const snap = JSON.parse((await call('GET', '/api/snapshot')).text)
    const p = snap.projects.find((x: { name: string }) => x.name === 'MyApp')
    expect(p.sessions.some((s: { agentLabel: string; source: string; department: string }) => s.agentLabel === 'Cursor' && s.source === 'hook' && s.department === 'development')).toBe(true)
  })

  it('streams a snapshot as the first server-sent event', async () => {
    const first = await new Promise<string>((resolve, reject) => {
      const req = request({ host: '127.0.0.1', port, path: '/api/events', headers: { host: `127.0.0.1:${port}` } }, (res) => {
        expect(res.headers['content-type']).toMatch(/text\/event-stream/)
        let text = ''
        res.on('data', (c) => {
          text += c
          if (text.includes('event: snapshot') && text.endsWith('\n\n')) {
            resolve(text)
            req.destroy()
          }
        })
      })
      req.on('error', (e) => (String(e).includes('socket hang up') ? undefined : reject(e)))
      req.end()
    })
    expect(first).toMatch(/event: snapshot\ndata: \{/)
  })

  it('answers 404 for anything else', async () => {
    expect((await call('GET', '/nope')).status).toBe(404)
    expect((await call('DELETE', '/api/snapshot')).status).toBe(404)
  })
})

describe('settings over HTTP', () => {
  const ORIGIN = 'http://localhost:5173'
  const json = { 'Content-Type': 'application/json' }

  it('reads the settings, the file they live in and the days in use', async () => {
    const r = await call('GET', '/api/settings', { headers: { origin: ORIGIN } })
    expect(r.status).toBe(200)
    const body = JSON.parse(r.text)
    expect(body.settings.hiddenProjects).toEqual([])
    expect(body.file).toBe(settingsFile)
    expect(body.effectiveDays).toBe(7)
    expect(r.headers['access-control-allow-origin']).toBe(ORIGIN)
  })

  it('allows PUT in the browser preflight', async () => {
    const r = await call('OPTIONS', '/api/settings', { headers: { origin: ORIGIN, 'access-control-request-method': 'PUT' } })
    expect(r.status).toBe(204)
    expect(String(r.headers['access-control-allow-methods'])).toContain('PUT')
  })

  it('refuses a change without an allowed page or the token, and from another web page', async () => {
    expect((await call('PUT', '/api/settings', { headers: json, body: '{"days":30}' })).status).toBe(403)
    expect((await call('PUT', '/api/settings', { headers: { ...json, origin: 'https://evil.example' }, body: '{"days":30}' })).status).toBe(403)
    expect(existsSync(settingsFile)).toBe(false)
  })

  it('refuses a wrong change with 400 and keeps the file as it was', async () => {
    const r = await call('PUT', '/api/settings', { headers: { ...json, origin: ORIGIN }, body: '{"days":-3}' })
    expect(r.status).toBe(400)
    expect(JSON.parse(r.text).error).toMatch(/days/)
    expect((await call('PUT', '/api/settings', { headers: { ...json, origin: ORIGIN }, body: 'not json' })).status).toBe(400)
  })

  it('hides a project: saved in the file, gone from the next snapshot, and back when shown again', async () => {
    const snap = JSON.parse((await call('GET', '/api/snapshot')).text)
    const mine = snap.projects.find((p: { name: string }) => p.name === 'MyApp')
    expect(mine).toBeTruthy()
    const r = await call('PUT', '/api/settings', { headers: { ...json, origin: ORIGIN }, body: JSON.stringify({ hiddenProjects: [{ path: mine.path, name: 'MyApp' }] }) })
    expect(r.status).toBe(200)
    expect(JSON.parse(readFileSync(settingsFile, 'utf8')).hiddenProjects[0].name).toBe('MyApp')
    const after = JSON.parse((await call('GET', '/api/snapshot')).text)
    expect(after.projects.map((p: { name: string }) => p.name)).not.toContain('MyApp')
    await call('PUT', '/api/settings', { headers: { ...json, authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ hiddenProjects: [] }) })
    const back = JSON.parse((await call('GET', '/api/snapshot')).text)
    expect(back.projects.map((p: { name: string }) => p.name)).toContain('MyApp')
  })

  it('renames a project for display only', async () => {
    const snap = JSON.parse((await call('GET', '/api/snapshot')).text)
    const mine = snap.projects.find((p: { name: string }) => p.name === 'MyApp')
    await call('PUT', '/api/settings', { headers: { ...json, origin: ORIGIN }, body: JSON.stringify({ projectNames: { [mine.path]: 'My Shop' } }) })
    const after = JSON.parse((await call('GET', '/api/snapshot')).text)
    expect(after.projects.find((p: { path: string }) => p.path === mine.path).name).toBe('My Shop')
  })
})

