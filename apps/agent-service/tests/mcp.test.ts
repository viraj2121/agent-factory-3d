import { describe, expect, it } from 'vitest'
import { mcpFromClaudeJson, mcpFromCodexToml, mcpFromVscodeJson, parseToml } from '../src/mcp.ts'

describe('parseToml (the small part Codex config files use)', () => {
  it('reads tables, strings, arrays, numbers, booleans and inline tables', () => {
    const t = parseToml(`
top = "x"
[a.b]
n = 3
ok = true
list = ["one", 'two']
inline = { K = "v", L = "w" }
[a."quoted name".c]
s = "deep"
multi = [
  "p",
  "q",
]
`)
    expect(t.top).toBe('x')
    expect((t.a as any).b).toEqual({ n: 3, ok: true, list: ['one', 'two'], inline: { K: 'v', L: 'w' } })
    expect((t.a as any)['quoted name'].c).toEqual({ s: 'deep', multi: ['p', 'q'] })
  })

  it('ignores comments and lines it does not understand', () => {
    expect(parseToml('# hi\nx = 1 # trailing\n???\n[t]\ny = "a # not a comment"').t).toEqual({ y: 'a # not a comment' })
  })
})

describe('mcpFromCodexToml', () => {
  const toml = `
[mcp_servers.node_repl]
command = "C:\\\\tools\\\\node.exe"
args = ["repl.js", "--token", "abc123"]
[mcp_servers.node_repl.env]
SECRET_KEY = "super-secret-value"
PATH_EXTRA = "x"
[mcp_servers.remote]
url = "https://mcp.example.com/mcp?token=zzz"
`
  it('lists stdio and http servers, with env key names only and secrets hidden', () => {
    const list = mcpFromCodexToml(toml, 'C:/Users/me/.codex/config.toml', 'user')
    expect(list.map((s) => s.name)).toEqual(['node_repl', 'remote'])
    const [stdio, http] = list
    expect(stdio.transport).toBe('stdio')
    expect(stdio.envKeys).toEqual(['SECRET_KEY', 'PATH_EXTRA'])
    expect(stdio.target).toContain('--token ***')
    expect(http.transport).toBe('http')
    expect(http.target).toBe('https://mcp.example.com/mcp?token=***')
    expect(JSON.stringify(list)).not.toMatch(/super-secret|abc123|zzz/)
    expect(list.every((s) => s.agent === 'codex' && s.status === 'configured')).toBe(true)
  })
})

describe('mcpFromClaudeJson', () => {
  const servers = {
    blender: { command: 'uvx', args: ['blender-mcp'] },
    web: { type: 'http', url: 'https://x.example/mcp', headers: { Authorization: 'Bearer SECRETTOKEN' } },
    live: { type: 'sse', url: 'https://y.example/sse' },
  }
  it('reads stdio, http and sse servers, never header values', () => {
    const list = mcpFromClaudeJson(servers, '.mcp.json', 'project', new Set())
    expect(list.map((s) => [s.name, s.transport])).toEqual([['blender', 'stdio'], ['web', 'http'], ['live', 'sse']])
    expect(JSON.stringify(list)).not.toMatch(/SECRETTOKEN/)
  })

  it('marks servers that Claude says need signing in', () => {
    const list = mcpFromClaudeJson({ 'claude.ai Zomato': { type: 'http', url: 'https://z' } }, 'x', 'user', new Set(['claude.ai Zomato']))
    expect(list[0].status).toBe('needs-auth')
  })

  it('copes with nothing, or something that is not a server list', () => {
    expect(mcpFromClaudeJson(undefined, 'x', 'user', new Set())).toEqual([])
    expect(mcpFromClaudeJson({ broken: 5 }, 'x', 'user', new Set())[0].transport).toBe('unknown')
  })
})

describe('mcpFromVscodeJson', () => {
  it('reads the servers of a VS Code mcp.json, including comments in the file', () => {
    const text = `{
      // Copilot agent mode servers
      "servers": { "github": { "type": "http", "url": "https://api.githubcopilot.com/mcp/" }, "local": { "command": "node", "args": ["s.js"], "env": { "A": "b" } } },
      "inputs": []
    }`
    const list = mcpFromVscodeJson(text, '.vscode/mcp.json', 'project')
    expect(list.map((s) => [s.name, s.transport, s.agent])).toEqual([['github', 'http', 'copilot'], ['local', 'stdio', 'copilot']])
    expect(list[1].envKeys).toEqual(['A'])
  })

  it('returns nothing for a file that is not JSON', () => {
    expect(mcpFromVscodeJson('nope', 'x', 'user')).toEqual([])
  })
})
