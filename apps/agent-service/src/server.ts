import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { parseHookEvent } from './adapters/hooks.ts'
import type { Snapshot } from './model.ts'
import { fingerprint, type Scanner } from './scanner.ts'
import { checkRequest, tokenMatches } from './security.ts'
import type { SettingsStore } from './settings.ts'

export interface ServiceOptions {
  scanner: Scanner
  token: string
  origins: ReadonlySet<string>
  /** How often to look at the agents' files. */
  intervalMs?: number
  /** The settings file. Without it /api/settings answers 404. */
  settings?: SettingsStore
}

const MAX_BODY = 16 * 1024

export interface Service {
  server: Server
  /** Starts listening on 127.0.0.1 only. Port 0 picks a free port. */
  listen(port: number): Promise<number>
  close(): Promise<void>
}

export function createService({ scanner, token, origins, intervalMs = 2000, settings }: ServiceOptions): Service {
  const clients = new Set<ServerResponse>()
  let latest: Snapshot | null = null
  let latestPrint = ''
  let timer: NodeJS.Timeout | undefined
  let scanning: Promise<Snapshot> | null = null

  const refresh = (): Promise<Snapshot> => {
    scanning ??= scanner
      .scan()
      .then((snap) => {
        const print = fingerprint(snap)
        const changed = print !== latestPrint
        latest = snap
        latestPrint = print
        if (changed) for (const res of clients) res.write(`event: snapshot\ndata: ${JSON.stringify(snap)}\n\n`)
        return snap
      })
      .finally(() => {
        scanning = null
      })
    return scanning
  }
  /** A scan that surely sees the latest settings: waits for one already running, then starts a new one. */
  const freshScan = async (): Promise<Snapshot> => {
    if (scanning) await scanning.catch(() => null)
    return refresh()
  }

  const send = (res: ServerResponse, status: number, body: unknown, cors: Record<string, string>) => {
    const text = JSON.stringify(body)
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...cors })
    res.end(text)
  }

  const readBody = (req: IncomingMessage): Promise<string | null> =>
    new Promise((resolve) => {
      let size = 0
      let over = false
      const chunks: Buffer[] = []
      req.on('data', (c: Buffer) => {
        size += c.length
        if (over) return
        if (size > MAX_BODY) {
          over = true
          resolve(null)
        } else chunks.push(c)
      })
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      req.on('error', () => resolve(null))
    })

  const server = createServer((req, res) => {
    void (async () => {
      const port = (server.address() as AddressInfo).port
      const origin = typeof req.headers.origin === 'string' ? req.headers.origin : undefined
      const verdict = checkRequest({ host: req.headers.host, origin, port, origins })
      if (!verdict.ok) return send(res, verdict.status, { error: verdict.message }, {})
      const cors: Record<string, string> = origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}
      const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`)

      if (req.method === 'OPTIONS') {
        res.writeHead(204, { ...cors, 'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Max-Age': '600' })
        return res.end()
      }
      if (req.method === 'GET' && url.pathname === '/api/health') return send(res, 200, { ok: true, service: 'ai-factory-agent-service', version: 1, now: Date.now() }, cors)
      if (req.method === 'GET' && url.pathname === '/api/snapshot') return send(res, 200, latest ?? (await refresh()), cors)
      if (req.method === 'GET' && url.pathname === '/api/events') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Content-Type-Options': 'nosniff', ...cors })
        res.write(`retry: 3000\n\n`)
        clients.add(res)
        req.on('close', () => clients.delete(res))
        res.write(`event: snapshot\ndata: ${JSON.stringify(latest ?? (await refresh()))}\n\n`)
        return
      }
      if (url.pathname === '/api/settings' && (req.method === 'GET' || req.method === 'PUT')) {
        if (!settings) return send(res, 404, { error: 'Settings are not available.' }, cors)
        const view = () => ({ settings: settings.get(), file: settings.file, problems: settings.problems, effectiveDays: scanner.effectiveDays() })
        if (req.method === 'GET') return send(res, 200, view(), cors)
        // a change must come from the dashboard (an allowed browser Origin; checked above) or carry the token
        if (!origin && !tokenMatches(req.headers.authorization, token)) return send(res, 403, { error: 'Changing settings needs the dashboard page or the bearer token.' }, cors)
        const body = await readBody(req)
        if (body === null) {
          res.once('finish', () => req.destroy())
          return send(res, 413, { error: 'Body too large or unreadable.' }, { ...cors, Connection: 'close' })
        }
        let json: unknown
        try {
          json = JSON.parse(body)
        } catch {
          return send(res, 400, { error: 'Body must be JSON.' }, cors)
        }
        const result = settings.update(json)
        if (!result.ok) return send(res, 400, { error: result.error }, cors)
        await freshScan()
        return send(res, 200, view(), cors)
      }
      if (req.method === 'POST' && url.pathname === '/api/hook') {
        if (!tokenMatches(req.headers.authorization, token)) return send(res, 401, { error: 'A valid bearer token is required (see ~/.ai-factory/token).' }, cors)
        const body = await readBody(req)
        if (body === null) {
          res.once('finish', () => req.destroy())
          return send(res, 413, { error: 'Body too large or unreadable.' }, { ...cors, Connection: 'close' })
        }
        let json: unknown
        try {
          json = JSON.parse(body)
        } catch {
          return send(res, 400, { error: 'Body must be JSON.' }, cors)
        }
        const parsed = parseHookEvent(json)
        if (!parsed.ok) return send(res, 400, { error: parsed.error }, cors)
        scanner.hooks.ingest(parsed.event, Date.now())
        void refresh()
        return send(res, 202, { ok: true }, cors)
      }
      return send(res, 404, { error: 'Not found.' }, cors)
    })().catch(() => {
      if (!res.headersSent) send(res, 500, { error: 'Internal error.' }, {})
      else res.end()
    })
  })

  return {
    server,
    async listen(port) {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject)
        server.listen(port, '127.0.0.1', () => resolve())
      })
      void refresh()
      timer = setInterval(() => void refresh().catch(() => {}), intervalMs)
      const heartbeat = setInterval(() => {
        for (const res of clients) res.write(': keep-alive\n\n')
      }, 15_000)
      heartbeat.unref()
      server.once('close', () => clearInterval(heartbeat))
      return (server.address() as AddressInfo).port
    },
    async close() {
      if (timer) clearInterval(timer)
      for (const res of clients) res.end()
      clients.clear()
      await new Promise<void>((resolve) => {
        server.close(() => resolve())
        server.closeAllConnections()
      })
    },
  }
}
