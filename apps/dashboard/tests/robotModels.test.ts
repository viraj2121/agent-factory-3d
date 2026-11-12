import { describe, expect, it } from 'vitest'
import { EXTRA_CLIPS, EXTRA_VARIANTS, ROBOT_CLIPS, ROBOT_VARIANTS } from '../src/robotVariants'
import { bytes, readGlb } from './glbReader'

describe.each(ROBOT_VARIANTS)('robot-%s.glb', (variant) => {
  const file = `robot-${variant}.glb`

  it('has every robot clip', () => {
    const names = (readGlb(file).animations ?? []).map((a) => a.name)
    expect(names).toEqual(expect.arrayContaining([...ROBOT_CLIPS]))
  })

  it('is skinned with the five bones', () => {
    const gltf = readGlb(file)
    expect(gltf.skins?.length).toBeGreaterThan(0)
    const nodes = (gltf.nodes ?? []).map((n) => n.name)
    for (const bone of ['root', 'body', 'head', 'arm_l', 'arm_r']) expect(nodes).toContain(bone)
  })

  it('stays under 400 KB', () => {
    expect(bytes(file)).toBeLessThan(400_000)
  })
})

describe.each(EXTRA_VARIANTS)('robot-%s.glb (extra robots)', (variant) => {
  const file = `robot-${variant}.glb`

  it('has every robot clip and every extra clip', () => {
    const names = (readGlb(file).animations ?? []).map((a) => a.name)
    expect(names).toEqual(expect.arrayContaining([...ROBOT_CLIPS, ...EXTRA_CLIPS]))
  })

  it('is skinned with the five bones', () => {
    const gltf = readGlb(file)
    expect(gltf.skins?.length).toBeGreaterThan(0)
    const nodes = (gltf.nodes ?? []).map((n) => n.name)
    for (const bone of ['root', 'body', 'head', 'arm_l', 'arm_r']) expect(nodes).toContain(bone)
  })

  it('stays under 450 KB', () => {
    expect(bytes(file)).toBeLessThan(450_000)
  })
})
