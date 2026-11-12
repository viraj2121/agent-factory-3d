import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { BoxGeometry, CanvasTexture, Color, DoubleSide, InstancedBufferAttribute, MeshBasicMaterial, MeshStandardMaterial, Object3D, PlaneGeometry, SRGBColorSpace, ShaderMaterial, type InstancedMesh, type Mesh } from 'three'
import type { Project } from './projects'
import { SHELF_Y, inUnit } from './library'
import { layoutBooks } from './libraryBooks'
import { docLink, sizeText } from './libraryDocs'
import { timeAgo } from './live/liveProjects'

// The project's markdown files, as real books on the shelves (one shelf per folder, a nameplate on each) and the five newest
// as cards floating in the glass column. Only names, sizes and dates: the files are never read.

// cool, muted colours: green and amber are kept for real agent status
const TONES = ['#7c6fd6', '#4fa3c7', '#c77fa8', '#8fa7d0', '#b08968', '#6fb3a8', '#a392d9']
const BOOK = new BoxGeometry(1, 1, 1)
const QUAD = new PlaneGeometry(1, 1)
const CELL = { w: 256, h: 40, cols: 4 }
const MAX_SPINES = 150

const fit = (g: CanvasRenderingContext2D, text: string, width: number): string => {
  if (g.measureText(text).width <= width) return text
  let t = text
  while (t.length > 3 && g.measureText(t + '…').width > width) t = t.slice(0, -1)
  return t + '…'
}

/** One picture holding every spine's file name, so all the spines are drawn in one go. */
function spineAtlas(names: string[]): CanvasTexture {
  const rows = Math.max(1, Math.ceil(names.length / CELL.cols))
  const canvas = document.createElement('canvas')
  canvas.width = CELL.w * CELL.cols
  canvas.height = CELL.h * rows
  const g = canvas.getContext('2d')!
  g.font = '600 24px system-ui, sans-serif'
  g.textBaseline = 'middle'
  g.fillStyle = '#f6f2ff'
  names.forEach((n, i) => g.fillText(fit(g, n.replace(/\.(md|markdown|mdx)$/i, ''), CELL.w - 14), (i % CELL.cols) * CELL.w + 8, Math.floor(i / CELL.cols) * CELL.h + CELL.h / 2 + 1))
  const t = new CanvasTexture(canvas)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 4
  return t
}

function spineMaterial(atlas: CanvasTexture, rows: number): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    uniforms: { uMap: { value: atlas }, uGrid: { value: [CELL.cols, rows] } },
    vertexShader: /* glsl */ `
      attribute vec2 aCell; uniform vec2 uGrid; varying vec2 vUv;
      void main() {
        vUv = vec2((aCell.x + uv.x) / uGrid.x, 1.0 - (aCell.y + 1.0 - uv.y) / uGrid.y);
        vec4 p = vec4(position, 1.0);
        #ifdef USE_INSTANCING
          p = instanceMatrix * p;
        #endif
        gl_Position = projectionMatrix * modelViewMatrix * p;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap; varying vec2 vUv;
      void main() { vec4 c = texture2D(uMap, vUv); gl_FragColor = vec4(c.rgb * 0.95, c.a); }
    `,
  })
}

function textTexture(text: string, sub: string | null, width: number, height: number, size: number): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const g = canvas.getContext('2d')!
  g.fillStyle = '#120d22'
  g.fillRect(0, 0, width, height)
  g.strokeStyle = '#a78bfa'
  g.lineWidth = 3
  g.strokeRect(2, 2, width - 4, height - 4)
  g.textBaseline = 'middle'
  g.fillStyle = '#efe9ff'
  g.font = `600 ${size}px system-ui, sans-serif`
  g.fillText(fit(g, text, width - 24), 12, sub ? height * 0.36 : height / 2)
  if (sub) {
    g.fillStyle = '#b9a8f5'
    g.font = `500 ${Math.round(size * 0.7)}px system-ui, sans-serif`
    g.fillText(fit(g, sub, width - 24), 12, height * 0.74)
  }
  const t = new CanvasTexture(canvas)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 4
  return t
}

const hash01 = (s: string): number => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return ((h >>> 0) % 1000) / 1000
}

export default function ShelfBooks({ project, dais }: { project: Project; dais: { x: number; z: number } }) {
  const docs = project.live?.docs
  const key = (docs ?? []).map((d) => `${d.path}:${d.modifiedAt}:${d.bytes}`).join('|')
  // the layout depends on the files, not on which array object carried them
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const layout = useMemo(() => layoutBooks(docs ?? [], Date.now()), [key])
  const { books, plates, recent } = layout
  const body = useRef<InstancedMesh>(null)
  const spines = useRef<InstancedMesh>(null)
  const ribbons = useRef<InstancedMesh>(null)
  const cards = useRef<(Mesh | null)[]>([])
  const [hover, setHover] = useState<number | null>(null)
  const dummy = useMemo(() => new Object3D(), [])

  const places = useMemo(
    () =>
      books.map((b) => {
        const [x, y, z] = inUnit(b.unit, b.along, 0.22, SHELF_Y[b.level])
        return { x, y, z, yaw: Math.atan2(x, z) + Math.PI }
      }),
    [books],
  )

  const atlas = useMemo(() => spineAtlas(books.slice(0, MAX_SPINES).map((b) => b.name)), [books])
  const spineMat = useMemo(() => spineMaterial(atlas, Math.max(1, Math.ceil(Math.min(books.length, MAX_SPINES) / CELL.cols))), [atlas, books.length])
  const cellAttr = useMemo(() => {
    const a = new Float32Array(Math.max(1, books.length) * 2)
    books.forEach((_, i) => {
      a[i * 2] = i % CELL.cols
      a[i * 2 + 1] = Math.floor(i / CELL.cols)
    })
    return new InstancedBufferAttribute(a, 2)
  }, [books])
  const bookMat = useMemo(() => new MeshStandardMaterial({ roughness: 0.62, metalness: 0.05 }), [])
  const ribbonMat = useMemo(() => new MeshBasicMaterial({ color: new Color('#fff1c9').multiplyScalar(1.6), toneMapped: false }), [])
  const plateTextures = useMemo(() => plates.map((p) => textTexture(p.text, null, 512, 44, 28)), [plates])
  const cardTextures = useMemo(() => recent.map((r) => textTexture(r.name.replace(/\.(md|markdown|mdx)$/i, ''), `${r.path.includes('/') ? r.path.slice(0, r.path.lastIndexOf('/')) : 'project folder'} · ${timeAgo(r.modifiedAt, Date.now())}`, 512, 160, 44)), [recent])

  useEffect(() => () => { atlas.dispose(); spineMat.dispose(); bookMat.dispose(); ribbonMat.dispose(); plateTextures.forEach((t) => t.dispose()); cardTextures.forEach((t) => t.dispose()) }, [atlas, spineMat, bookMat, ribbonMat, plateTextures, cardTextures])

  // lay the books, their spine names and the ribbons on the shelves
  useEffect(() => {
    const m = body.current
    const s = spines.current
    const r = ribbons.current
    if (!m || !s || !r) return
    const colour = new Color()
    let ribbonCount = 0
    books.forEach((b, i) => {
      const p = places[i]
      dummy.rotation.set(0, p.yaw, 0)
      dummy.position.set(p.x, p.y + b.height / 2, p.z)
      dummy.scale.set(b.thickness, b.height, b.depth)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
      m.setColorAt(i, colour.set(TONES[b.tone % TONES.length]).multiplyScalar(0.7 + 0.3 * hash01(b.path)))
      // the spine label sits on the front face, text running up the spine
      const fx = Math.sin(p.yaw)
      const fz = Math.cos(p.yaw)
      dummy.rotation.order = 'YXZ'
      dummy.rotation.set(0, p.yaw, Math.PI / 2)
      dummy.position.set(p.x + fx * (b.depth / 2 + 0.002), p.y + b.height / 2, p.z + fz * (b.depth / 2 + 0.002))
      dummy.scale.set(b.height * 0.9, b.thickness * 0.82, 1)
      dummy.updateMatrix()
      s.setMatrixAt(i, dummy.matrix)
      dummy.rotation.order = 'XYZ'
      if (b.recent) {
        dummy.rotation.set(0, p.yaw, 0)
        dummy.position.set(p.x + fx * (b.depth / 2 - 0.012), p.y + b.height + 0.022, p.z + fz * (b.depth / 2 - 0.012))
        dummy.scale.set(Math.max(0.012, b.thickness * 0.35), 0.06, 0.008)
        dummy.updateMatrix()
        r.setMatrixAt(ribbonCount++, dummy.matrix)
      }
    })
    m.count = books.length
    s.count = Math.min(books.length, MAX_SPINES)
    r.count = ribbonCount
    m.visible = s.visible = books.length > 0
    r.visible = ribbonCount > 0
    for (const mesh of [m, s, r]) mesh.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
    s.geometry.setAttribute('aCell', cellAttr)
  }, [books, places, dummy, cellAttr])

  // the five newest files float up the glass column on cards
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    cards.current.forEach((c, i) => {
      if (!c) return
      const angle = t * 0.45 + (i / Math.max(1, recent.length)) * Math.PI * 2
      const rise = (t * 0.06 + i / Math.max(1, recent.length)) % 1
      c.position.set(dais.x + Math.sin(angle) * 0.3, 0.75 + rise * 1.3, dais.z + Math.cos(angle) * 0.3)
      c.rotation.set(0, angle, 0)
      c.scale.setScalar(0.5 + 0.5 * Math.sin(rise * Math.PI))
    })
  })

  const open = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 5 || e.instanceId === undefined || !project.live) return
    e.stopPropagation()
    const a = document.createElement('a')
    a.href = docLink(project.live.path, books[e.instanceId].path)
    a.click()
  }
  const h = hover !== null ? books[hover] : null
  const hp = hover !== null ? places[hover] : null

  return (
    <group>
      <instancedMesh
        ref={body}
        args={[BOOK, bookMat, 150]}
        frustumCulled={false}
        visible={false}
        onPointerMove={(e) => {
          e.stopPropagation()
          setHover(e.instanceId ?? null)
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => {
          setHover(null)
          document.body.style.cursor = ''
        }}
        onClick={open}
      />
      <instancedMesh ref={spines} args={[QUAD, spineMat, MAX_SPINES]} frustumCulled={false} visible={false} raycast={() => null} />
      <instancedMesh ref={ribbons} args={[BOOK, ribbonMat, 150]} frustumCulled={false} visible={false} raycast={() => null} />

      {plates.map((p, i) => {
        const [x, y, z] = inUnit(p.unit, -0.5, 0.325, SHELF_Y[p.level] + 0.008)
        return (
          <mesh key={`${p.shelf}`} position={[x, y, z]} rotation={[0, Math.atan2(x, z) + Math.PI, 0]} raycast={() => null}>
            <planeGeometry args={[0.9, 0.077]} />
            <meshBasicMaterial map={plateTextures[i]} toneMapped={false} />
          </mesh>
        )
      })}

      {recent.map((r, i) => (
        <mesh key={r.path} ref={(m) => { cards.current[i] = m }} raycast={() => null}>
          <planeGeometry args={[0.5, 0.156]} />
          <meshBasicMaterial map={cardTextures[i]} toneMapped={false} side={DoubleSide} transparent opacity={0.96} />
        </mesh>
      ))}

      {h && hp && (
        <Html center position={[hp.x, hp.y + h.height + 0.3, hp.z]} zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
          <div className="planet-label">
            <b>{h.name}</b>
            <span>{h.path.includes('/') ? h.path.slice(0, h.path.lastIndexOf('/')) : 'project folder'} · {sizeText(h.bytes)} · {timeAgo(h.modifiedAt, Date.now())} · click to open</span>
          </div>
        </Html>
      )}
    </group>
  )
}
