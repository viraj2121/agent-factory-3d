import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, Float32BufferAttribute, Line, LineBasicMaterial, PointsMaterial, type Group } from 'three'
import type { Project } from './projects'
import { arcAt, arcPath, dustMotes, meteorPath, meteorsAt, spaceWeatherFor, type SpaceWeather as Weather } from './spaceWeather'
import { sound } from './soundEngine'

const METEOR_POOL = 6
const TAIL = 26 // metres
const ARC_POINTS = 17

/**
 * Space weather outside the shield dome, from the status of the project you look at: slow dust when idle, a meteor
 * shower while agents work (more meteors the busier it is), and an ion storm, crackling arcs over the dome, when it
 * needs you. Decoration driven by status. `light` mode draws less dust and no arcs.
 */
export default function SpaceWeatherLayer({ project, mode }: { project: Project; mode: 'full' | 'light' }) {
  const target = useMemo(() => spaceWeatherFor(project.status, project.activity), [project.status, project.activity])
  const now = useRef<Weather>({ ...target })
  const dustGroup = useRef<Group>(null)
  const lastArc = useRef(-1)

  const dust = useMemo(() => {
    const motes = dustMotes(mode === 'full' ? 420 : 160, 5)
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(motes.flat(), 3))
    const m = new PointsMaterial({ color: new Color('#9fb6d8'), size: 0.35, sizeAttenuation: true, transparent: true, opacity: 0.5, depthWrite: false, blending: AdditiveBlending, fog: false })
    return { g, m }
  }, [mode])

  // a few streak lines reused for every meteor: a bright head fading into a tail
  const meteors = useMemo(
    () =>
      Array.from({ length: METEOR_POOL }, () => {
        const g = new BufferGeometry()
        g.setAttribute('position', new BufferAttribute(new Float32Array(6), 3))
        g.setAttribute('color', new BufferAttribute(new Float32Array([2.4, 2.4, 2.6, 1, 0.3, 0.4, 0.7, 0]), 4))
        const line = new Line(g, new LineBasicMaterial({ vertexColors: true, transparent: true, toneMapped: false, depthWrite: false, blending: AdditiveBlending, fog: false }))
        line.frustumCulled = false
        line.visible = false
        return line
      }),
    [],
  )

  const arc = useMemo(() => {
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(ARC_POINTS * 3), 3))
    const line = new Line(g, new LineBasicMaterial({ color: new Color(1.6, 1.1, 3.2), transparent: true, opacity: 0, toneMapped: false, depthWrite: false, blending: AdditiveBlending }))
    line.frustumCulled = false
    line.visible = false
    return line
  }, [])

  useEffect(
    () => () => {
      dust.g.dispose()
      dust.m.dispose()
      for (const l of meteors) {
        l.geometry.dispose()
        ;(l.material as LineBasicMaterial).dispose()
      }
      arc.geometry.dispose()
      ;(arc.material as LineBasicMaterial).dispose()
    },
    [dust, meteors, arc],
  )

  useFrame(({ clock }, dt) => {
    const t = clock.getElapsedTime()
    // ease toward the weather the status asks for, so changing project never makes it pop
    const k = Math.min(1, dt * 0.5)
    const w = now.current
    w.dust += (target.dust - w.dust) * k
    w.meteors += (target.meteors - w.meteors) * k
    w.storm += (target.storm - w.storm) * k

    dust.m.opacity = 0.5 * w.dust
    if (dustGroup.current) dustGroup.current.rotation.y += dt * 0.006

    const active = meteorsAt(t, w.meteors).slice(0, METEOR_POOL)
    meteors.forEach((line, i) => {
      const m = active[i]
      line.visible = !!m
      if (!m) return
      const { from, to } = meteorPath(m.id)
      const len = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]) || 1
      const head = from.map((v, j) => v + (to[j] - v) * m.progress)
      const back = Math.min(TAIL, len * m.progress) / len
      const tail = head.map((v, j) => v - (to[j] - from[j]) * back)
      const pos = line.geometry.getAttribute('position') as BufferAttribute
      pos.setXYZ(0, head[0], head[1], head[2])
      pos.setXYZ(1, tail[0], tail[1], tail[2])
      pos.needsUpdate = true
      // fade in quickly, out at the end
      ;(line.material as LineBasicMaterial).opacity = Math.min(1, m.progress * 6) * (1 - m.progress) ** 0.6
    })

    const flash = mode === 'full' ? arcAt(t, w.storm) : { level: 0, id: -1 }
    if (flash.id !== lastArc.current) {
      lastArc.current = flash.id
      if (flash.id >= 0) {
        const pos = arc.geometry.getAttribute('position') as BufferAttribute
        arcPath(flash.id).forEach((p, i) => pos.setXYZ(i, p[0], p[1], p[2]))
        pos.needsUpdate = true
        sound.thunder(0.15)
      }
    }
    arc.visible = flash.level > 0
    ;(arc.material as LineBasicMaterial).opacity = flash.level
  })

  return (
    <group>
      <group ref={dustGroup}>
        <points geometry={dust.g} material={dust.m} frustumCulled={false} />
      </group>
      {meteors.map((line, i) => (
        <primitive key={i} object={line} />
      ))}
      <primitive object={arc} />
    </group>
  )
}
