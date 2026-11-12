import { readFileSync, statSync } from 'node:fs'
import { expect } from 'vitest'

export interface GltfNode {
  name?: string
  translation?: [number, number, number]
  children?: number[]
}

export interface Gltf {
  animations?: { name: string }[]
  nodes?: GltfNode[]
  skins?: unknown[]
  materials?: { name?: string; doubleSided?: boolean }[]
  images?: unknown[]
}

export const MODELS = new URL('../public/models/', import.meta.url)

export function readGlb(file: string): Gltf {
  const buf = readFileSync(new URL(file, MODELS))
  expect(buf.toString('utf8', 0, 4)).toBe('glTF')
  const jsonLength = buf.readUInt32LE(12)
  return JSON.parse(buf.toString('utf8', 20, 20 + jsonLength))
}

export const bytes = (file: string) => statSync(new URL(file, MODELS)).size
