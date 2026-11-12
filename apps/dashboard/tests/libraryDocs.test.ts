import { describe, expect, it } from 'vitest'
import type { DocFile } from '../src/live/wire'
import { docLink, groupDocs, sizeText } from '../src/libraryDocs'

const f = (path: string, bytes = 100): DocFile => ({ path, name: path.split('/').pop()!, bytes, modifiedAt: 0 })

describe('groupDocs', () => {
  it('puts the files of the project folder first, then one group per folder, in order', () => {
    const g = groupDocs([f('README.md'), f('docs/a.md'), f('docs/b.md'), f('docs/guides/c.md'), f('CHANGELOG.md')])
    expect(g.map((x) => x.folder)).toEqual(['', 'docs', 'docs/guides'])
    expect(g[0].files.map((x) => x.name)).toEqual(['README.md', 'CHANGELOG.md'])
    expect(g[1].files).toHaveLength(2)
  })
  it('is empty for no files', () => {
    expect(groupDocs([])).toEqual([])
  })
})

describe('sizeText', () => {
  it('says bytes, KB and MB in short plain form', () => {
    expect(sizeText(0)).toBe('0 B')
    expect(sizeText(900)).toBe('900 B')
    expect(sizeText(2048)).toBe('2 KB')
    expect(sizeText(1536)).toBe('1.5 KB')
    expect(sizeText(5 * 1024 * 1024)).toBe('5 MB')
  })
  it('copes with a bad number', () => {
    expect(sizeText(NaN)).toBe('?')
  })
})

describe('docLink', () => {
  it('opens the file in VS Code from the project folder and the relative path', () => {
    expect(docLink('E:\\Projects\\App','docs/a b.md')).toBe('vscode://file/E:/Projects/App/docs/a%20b.md')
  })
  it('does not double the slash when the folder ends with one', () => {
    expect(docLink('/home/me/app/', 'x.md')).toBe('vscode://file/home/me/app/x.md')
  })
})
