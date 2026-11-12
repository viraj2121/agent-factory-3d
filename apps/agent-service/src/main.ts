import { homedir } from 'node:os'
import { join } from 'node:path'
import { Scanner } from './scanner.ts'
import { allowedOrigins, loadToken } from './security.ts'
import { createService } from './server.ts'
import { SettingsStore } from './settings.ts'

// Starts the agent service: node --no-warnings src/main.ts   (npm start)
// AGENT_SERVICE_PORT (default 4317), AGENT_SERVICE_ORIGINS (extra allowed browser origins, comma separated),
// AGENT_SERVICE_DAYS (how many days back sessions and subagent runs are read, 1 to 365, default 7)
// AGENT_SERVICE_ROOTS (folders to look in for agent setup files, separated by ;  default: next to folders where agents were used)

function vscodeUserDir(home: string): string {
  if (process.platform === 'win32') return join(process.env.APPDATA ?? join(home, 'AppData', 'Roaming'), 'Code', 'User')
  if (process.platform === 'darwin') return join(home, 'Library', 'Application Support', 'Code', 'User')
  return join(home, '.config', 'Code', 'User')
}

const home = homedir()
const port = Number(process.env.AGENT_SERVICE_PORT ?? 4317)
const tokenDir = join(home, '.ai-factory')
const token = loadToken(tokenDir)
const settings = new SettingsStore(join(tokenDir, 'settings.json'))
const days = Math.min(365, Math.max(1, Math.floor(Number(process.env.AGENT_SERVICE_DAYS) || 7)))
const service = createService({
  scanner: new Scanner({ home, vscodeUser: vscodeUserDir(home), roots: process.env.AGENT_SERVICE_ROOTS, maxAgeMs: days * 24 * 3600 * 1000, settings: () => settings.get() }),
  settings,
  token,
  origins: allowedOrigins(process.env.AGENT_SERVICE_ORIGINS),
})

const actual = await service.listen(port)
console.log(`Agent service listening on http://127.0.0.1:${actual} (this computer only)`)
console.log('  GET  /api/health  /api/snapshot  /api/events')
console.log(`  POST /api/hook    needs the token in ${join(tokenDir, 'token')}`)
console.log(`Settings: ${settings.file}${settings.problems.length ? ` (problems: ${settings.problems.join('; ')})` : ''}`)
console.log('Observing Claude Code, Codex and GitHub Copilot (read-only). Stop with Ctrl+C.')

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void service.close().then(() => process.exit(0))
  })
}
