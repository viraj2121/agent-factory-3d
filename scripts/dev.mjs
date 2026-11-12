// Starts the whole app on any system: the agent service (127.0.0.1:4317) and the dashboard (localhost:5173).
//   npm start                 install packages on the first run, start both, stop both with Ctrl+C
//   npm start -- --open       also open the page in the browser
// Windows users can still double-click start-factory.bat.
import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { connect } from 'node:net'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const apps = [
  { name: 'service', dir: join(root, 'apps', 'agent-service'), port: 4317, args: ['start'] },
  // the service only accepts pages from 5173 and 4173, so the dashboard port must not change
  { name: 'dashboard', dir: join(root, 'apps', 'dashboard'), port: 5173, args: ['run', 'dev', '--', '--port', '5173', '--strictPort'] },
]
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'

const major = Number(process.versions.node.split('.')[0])
if (major < 22) {
  console.error(`Node 22 or newer is needed (this is ${process.versions.node}). Get it from https://nodejs.org`)
  process.exit(1)
}

const inUse = (port) =>
  new Promise((resolve) => {
    const s = connect({ host: '127.0.0.1', port })
    s.once('connect', () => (s.destroy(), resolve(true)))
    s.once('error', () => resolve(false))
  })

for (const app of apps) {
  if (!existsSync(join(app.dir, 'node_modules'))) {
    console.log(`Installing the ${app.name} packages (first run only)...`)
    const r = spawnSync(npm, ['install'], { cwd: app.dir, stdio: 'inherit', shell: process.platform === 'win32' })
    if (r.status !== 0) process.exit(r.status ?? 1)
  }
}

const children = []
for (const app of apps) {
  if (await inUse(app.port)) {
    console.log(`The ${app.name} is already running on port ${app.port}, leaving it alone.`)
    continue
  }
  const child = spawn(npm, app.args, { cwd: app.dir, stdio: 'inherit', shell: process.platform === 'win32' })
  child.on('exit', (code) => {
    if (code) console.error(`The ${app.name} stopped (exit code ${code}).`)
  })
  children.push(child)
}

const stop = () => {
  for (const c of children) c.kill()
  process.exit(0)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)

if (process.argv.includes('--open')) {
  for (let i = 0; i < 60 && !(await inUse(5173)); i++) await new Promise((r) => setTimeout(r, 1000))
  const url = 'http://localhost:5173'
  const cmd = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]]
  spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true }).unref()
}
console.log('\nRunning: http://localhost:5173   (agent service: http://127.0.0.1:4317). Press Ctrl+C to stop.\n')
