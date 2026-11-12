import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { baseName, cleanPath, projectKey, readHead, readTail, redactTarget } from '../src/util.ts'

describe('cleanPath and projectKey', () => {
  it('gives the same project key to the spellings different agents use for one folder', () => {
    const spellings = ['E:\\Projects\\agent-factory-3d', 'e:/projects/agent-factory-3d/', 'file:///e%3A/Projects/agent-factory-3d', '\\\\?\\E:\\Projects\\agent-factory-3d']
    const keys = new Set(spellings.map(projectKey))
    expect(keys.size).toBe(1)
  })

  it('keeps the readable spelling with forward slashes and no trailing slash', () => {
    expect(cleanPath('E:\\Projects\\agent-factory-3d\\')).toBe('E:/Projects/agent-factory-3d')
    expect(cleanPath('file:///e%3A/My_Repo')).toBe('e:/My_Repo')
    expect(cleanPath('/home/me/app/')).toBe('/home/me/app')
  })

  it('names a project after its folder', () => {
    expect(baseName('E:/Projects/agent-factory-3d')).toBe('agent-factory-3d')
    expect(baseName('/')).toBe('/')
    expect(baseName('')).toBe('unknown')
  })
})

describe('redactTarget', () => {
  it('hides secret-looking arguments, flags with values and URL credentials', () => {
    expect(redactTarget('npx', ['-y', 'some-mcp', '--token', 'abc123'])).toBe('npx -y some-mcp --token ***')
    expect(redactTarget('node', ['srv.js', '--api-key=sk-ant-xyz'])).toBe('node srv.js --api-key=***')
    expect(redactTarget('npx', ['pkg', 'ghp_abcdefghijklmnopqrstuvwxyz0123456789'])).toBe('npx pkg ***')
    expect(redactTarget('https://user:pw@host.example/mcp?token=abc&x=1', [])).toBe('https://***@host.example/mcp?token=***&x=1')
  })

  it('leaves ordinary targets alone', () => {
    expect(redactTarget('uvx', ['blender-mcp'])).toBe('uvx blender-mcp')
    expect(redactTarget('https://mcp.example.com/sse', [])).toBe('https://mcp.example.com/sse')
  })
})

describe('readTail and readHead', () => {
  const dir = mkdtempSync(join(tmpdir(), 'svc-'))

  it('reads a small file whole', () => {
    const f = join(dir, 'small.jsonl')
    writeFileSync(f, 'a\nb\nc\n')
    expect(readTail(f, 1000)).toBe('a\nb\nc\n')
    expect(readHead(f, 1000)).toBe('a\nb\nc\n')
  })

  it('reads only the end of a big file and drops the cut first line', () => {
    const f = join(dir, 'big.jsonl')
    writeFileSync(f, Array.from({ length: 1000 }, (_, i) => `line-${i}`).join('\n') + '\n')
    const tail = readTail(f, 100)
    expect(tail.length).toBeLessThanOrEqual(100)
    expect(tail.startsWith('line-')).toBe(true)
    expect(tail.endsWith('line-999\n')).toBe(true)
  })

  it('drops an unfinished last line in the head', () => {
    const f = join(dir, 'head.jsonl')
    writeFileSync(f, 'one\ntwo\nthr')
    expect(readHead(f, 9)).toBe('one\ntwo\n')
  })

  it('returns an empty string for a file that is not there', () => {
    expect(readTail(join(dir, 'nope'), 100)).toBe('')
  })
})
