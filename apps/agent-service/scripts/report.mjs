// Report what an agent is doing to the hub, from any tool that can run a command (a hook, a wrapper script, a shell alias).
//
//   node scripts/report.mjs --agent Aider --session my-chat --event tool --tool Edit --cwd "E:/Work/App"
//   node scripts/report.mjs --agent Aider --session my-chat --event waiting --title "Needs a decision"
//
// Events: start, prompt, tool, tool_result, waiting, stop. --cwd defaults to the current folder.
// The token comes from ~/.ai-factory/token (created when the service first starts). Port: AGENT_SERVICE_PORT (default 4317).
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

const { values } = parseArgs({
  options: {
    agent: { type: 'string' },
    session: { type: 'string' },
    event: { type: 'string' },
    cwd: { type: 'string', default: process.cwd() },
    tool: { type: 'string' },
    command: { type: 'string' },
    title: { type: 'string' },
    model: { type: 'string' },
  },
})

if (!values.agent || !values.session || !values.event) {
  console.error('Needs --agent, --session and --event (start, prompt, tool, tool_result, waiting or stop).')
  process.exit(2)
}

let token
try {
  token = readFileSync(join(homedir(), '.ai-factory', 'token'), 'utf8').trim()
} catch {
  console.error('No token found. Start the service once (npm start in apps/agent-service) to create ~/.ai-factory/token.')
  process.exit(2)
}

const port = process.env.AGENT_SERVICE_PORT ?? '4317'
const body = { agent: values.agent, sessionId: values.session, event: values.event, cwd: values.cwd, tool: values.tool, command: values.command, title: values.title, model: values.model }
try {
  const res = await fetch(`http://127.0.0.1:${port}/api/hook`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) })
  if (res.status !== 202) {
    console.error(`The service answered ${res.status}: ${await res.text()}`)
    process.exit(1)
  }
} catch {
  console.error(`The service is not running on 127.0.0.1:${port}.`)
  process.exit(1)
}
