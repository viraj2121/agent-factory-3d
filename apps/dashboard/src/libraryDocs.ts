import type { DocFile } from './live/wire'
import { vscodeUrl } from './crewDetails'

export interface DocGroup {
  /** Folder inside the project, '' for the project folder itself. */
  folder: string
  files: DocFile[]
}

/** The files grouped by folder, in the order each folder first appears (the service sends the project folder first). */
export function groupDocs(files: DocFile[]): DocGroup[] {
  const groups = new Map<string, DocGroup>()
  for (const file of files) {
    const folder = file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : ''
    const g = groups.get(folder) ?? { folder, files: [] }
    g.files.push(file)
    groups.set(folder, g)
  }
  return [...groups.values()]
}

export function sizeText(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '?'
  if (bytes < 1024) return `${Math.round(bytes)} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${Number.isInteger(kb) ? kb : Math.round(kb * 10) / 10} KB`
  const mb = kb / 1024
  return `${Number.isInteger(mb) ? mb : Math.round(mb * 10) / 10} MB`
}

/** A link that opens the file in VS Code. */
export const docLink = (projectPath: string, rel: string): string => vscodeUrl(`${projectPath.replace(/[\/]+$/, '')}/${rel}`)
