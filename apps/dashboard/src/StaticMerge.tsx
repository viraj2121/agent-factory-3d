import { useLayoutEffect, useRef, type ReactNode } from 'react'
import type { Group } from 'three'
import { mergeStaticByLook } from './mergeStatic'

/** A group whose still meshes are joined by look once, right after it mounts. Keep moving parts outside it. */
export default function StaticMerge({ children }: { children: ReactNode }) {
  const ref = useRef<Group>(null)
  useLayoutEffect(() => {
    if (ref.current) mergeStaticByLook(ref.current)
  }, [])
  return <group ref={ref}>{children}</group>
}
