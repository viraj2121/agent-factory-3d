import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type { FigureAction, FigureSpec, WidgetState } from '../widgetRows'

// The little robots of the desktop widget, built in code (no model files): Visor (a humanoid on a hover base) and Scout (a
// two-legged walker), each with three small variations. One WebGL renderer draws every robot in turn and copies the picture
// into that row's own canvas, so many rows cost one graphics context. Drawn at 30 frames a second and paused while the window
// is hidden: the widget runs all day. Decoration: the motion mirrors the state the service infers, nothing more.

const LIGHT: Record<WidgetState, string> = { run: '#4ee7a0', wait: '#ffb547', rest: '#5d6680' }

const paintMat = (c: string) => new THREE.MeshPhysicalMaterial({ color: c, metalness: 0.3, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 })
const steelMat = () => new THREE.MeshPhysicalMaterial({ color: '#2c3038', metalness: 0.9, roughness: 0.35 })
const chromeMat = () => new THREE.MeshPhysicalMaterial({ color: '#c9ced8', metalness: 1, roughness: 0.15 })
const glassMat = () => new THREE.MeshPhysicalMaterial({ color: '#0b0f18', metalness: 0.2, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.02 })
const ledMat = () => new THREE.MeshStandardMaterial({ color: '#000', emissive: '#4ee7a0', emissiveIntensity: 2.2, toneMapped: false })
const at = (o: THREE.Object3D, x = 0, y = 0, z = 0) => (o.position.set(x, y, z), o)
const mesh = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => at(new THREE.Mesh(g, m), x, y, z)
const group = (x = 0, y = 0, z = 0) => at(new THREE.Group(), x, y, z)

interface Built {
  root: THREE.Group
  height: number
  led: THREE.MeshStandardMaterial
  /** Poses the robot for its action at time t (seconds). */
  pose: (action: FigureAction, t: number) => void
}

function visor(spec: FigureSpec): Built {
  const root = new THREE.Group()
  const P = paintMat(spec.paint), L = ledMat()
  root.add(mesh(new THREE.CylinderGeometry(0.34, 0.4, 0.14, 40), steelMat(), 0, 0.2))
  const glow = mesh(new THREE.TorusGeometry(0.33, 0.025, 12, 48), L, 0, 0.12)
  glow.rotation.x = Math.PI / 2
  root.add(glow)
  const body = group(0, 0.3)
  root.add(body)
  body.add(mesh(new THREE.CapsuleGeometry(0.36, 0.5, 8, 24), P, 0, 0.62))
  const belt = mesh(new THREE.TorusGeometry(0.36, 0.035, 12, 40), steelMat(), 0, 0.42)
  belt.rotation.x = Math.PI / 2
  body.add(belt)
  // variation 2: a chest light bar instead of a round light
  body.add(spec.variant === 2 ? mesh(new RoundedBoxGeometry(0.22, 0.05, 0.02, 2, 0.02), L, 0, 0.8, 0.36) : mesh(new THREE.CircleGeometry(0.07, 24), L, 0, 0.78, 0.365))
  const head = group(0, 1.25)
  body.add(head)
  head.add(mesh(new THREE.SphereGeometry(0.3, 40, 24), P))
  // the glass visor: a band of a sphere centred on the front (+z)
  head.add(mesh(new THREE.SphereGeometry(0.305, 40, 24, Math.PI * 0.08, Math.PI * 0.84, Math.PI * 0.32, Math.PI * 0.3), glassMat()))
  const eyes = new THREE.Group()
  head.add(eyes)
  for (const x of [-0.1, 0.1]) {
    const e = mesh(new THREE.CapsuleGeometry(0.03, 0.05, 4, 12), L, x, 0.03, 0.29)
    e.rotation.z = Math.PI / 2
    eyes.add(e)
  }
  // variation 1: an antenna; variation 2: ear pods
  if (spec.variant === 1) {
    head.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 8), chromeMat(), 0.12, 0.36))
    head.add(mesh(new THREE.SphereGeometry(0.035, 16, 12), L, 0.12, 0.48))
  }
  if (spec.variant === 2) for (const x of [-0.31, 0.31]) {
    const pod = mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.06, 24), steelMat(), x, 0.02)
    pod.rotation.z = Math.PI / 2
    head.add(pod)
  }
  const arms = [-1, 1].map((side) => {
    const a = group(side * 0.44, 0.92)
    body.add(a)
    a.add(mesh(new THREE.SphereGeometry(0.09, 20, 16), steelMat()))
    a.add(mesh(new THREE.CapsuleGeometry(0.075, 0.38, 6, 16), P, 0, -0.28))
    a.add(mesh(new THREE.SphereGeometry(0.08, 20, 16), steelMat(), 0, -0.55))
    return a
  })
  return {
    root, height: 1.75, led: L,
    pose(action, t) {
      body.position.y = 0.3 + Math.sin(t * 1.6) * 0.03 - (action === 'rest' ? 0.05 : 0)
      eyes.scale.y = action === 'rest' ? 0.35 : 1
      if (action === 'type') {
        head.rotation.set(0.28 + Math.sin(t * 2) * 0.03, -0.25, 0)
        arms.forEach((a, i) => a.rotation.set(-1.15 + Math.sin(t * 9 + i * Math.PI) * 0.12, 0, i ? -0.25 : 0.25))
      } else if (action === 'work') {
        head.rotation.set(0.2, -0.2, 0)
        arms.forEach((a, i) => a.rotation.set(-0.9 + Math.sin(t * 3.5 + i * Math.PI) * 0.45, 0, i ? -0.2 : 0.2))
      } else if (action === 'look') {
        head.rotation.set(0.12, Math.sin(t * 0.9) * 0.5, 0)
        arms[0].rotation.set(-0.3, 0, 0.12)
        arms[1].rotation.set(-1.9, 0, -0.5)
      } else if (action === 'wave') {
        head.rotation.set(-0.05, 0.25, Math.sin(t * 1.5) * 0.06)
        arms[0].rotation.set(0, 0, 0.12)
        arms[1].rotation.set(0, 0, 2.55 + Math.sin(t * 7) * 0.28)
      } else {
        head.rotation.set(0.5, 0, 0.08)
        arms.forEach((a, i) => a.rotation.set(0.05, 0, i ? -0.06 : 0.06))
      }
    },
  }
}

function scout(spec: FigureSpec): Built {
  const root = new THREE.Group()
  const P = paintMat(spec.paint), L = ledMat()
  const hips = group(0, 0.62)
  root.add(hips)
  const legs = [-1, 1].map((side) => {
    const l = group(side * 0.17, 0)
    hips.add(l)
    l.add(mesh(new THREE.CapsuleGeometry(0.07, 0.38, 6, 16), steelMat(), 0, -0.28))
    l.add(mesh(new RoundedBoxGeometry(0.2, 0.08, 0.28, 3, 0.03), P, 0, -0.56, 0.04))
    return l
  })
  const body = group(0, -0.1)
  hips.add(body)
  body.add(mesh(new RoundedBoxGeometry(0.6, 0.5, 0.42, 5, 0.12), P, 0, 0.28))
  body.add(mesh(new RoundedBoxGeometry(0.34, 0.16, 0.02, 3, 0.03), glassMat(), 0, 0.3, 0.215))
  const bars = [0, 1, 2].map((i) => mesh(new THREE.BoxGeometry(0.06, 0.06, 0.01), L, -0.09 + i * 0.09, 0.3, 0.228))
  bars.forEach((b) => body.add(b))
  const head = group(0, 0.6)
  body.add(head)
  head.add(mesh(new THREE.SphereGeometry(0.24, 40, 24, 0, Math.PI * 2, 0, Math.PI * 0.55), P))
  head.add(mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.05, 40), steelMat(), 0, -0.02))
  const lensGroup = group(0, 0.06, 0.2)
  head.add(lensGroup)
  const lensCase = mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.08, 28), steelMat())
  lensCase.rotation.x = Math.PI / 2
  lensGroup.add(lensCase)
  const lens = mesh(new THREE.CircleGeometry(0.05, 28), L, 0, 0, 0.045)
  lensGroup.add(lens)
  // variation 0: one antenna; 1: two antennas; 2: a light dome on top instead
  const antennas = (spec.variant === 1 ? [-0.1, 0.1] : spec.variant === 0 ? [0.1] : []).map((x) => {
    const a = group(x, 0.2)
    head.add(a)
    a.add(mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.28, 8), chromeMat(), 0, 0.14))
    a.add(mesh(new THREE.SphereGeometry(0.035, 16, 12), L, 0, 0.3))
    return a
  })
  if (spec.variant === 2) head.add(mesh(new THREE.SphereGeometry(0.06, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), L, 0, 0.22))
  return {
    root, height: 1.6, led: L,
    pose(action, t) {
      lens.scale.set(1, action === 'rest' ? 0.3 : 1, 1)
      if (action === 'work') {
        const st = Math.sin(t * 4)
        legs[0].rotation.x = st * 0.25
        legs[1].rotation.x = -st * 0.25
        hips.position.y = 0.62 + Math.abs(Math.cos(t * 4)) * 0.03
        head.rotation.set(0.3, -0.3, 0)
      } else if (action === 'type' || action === 'look') {
        legs.forEach((l) => (l.rotation.x = 0))
        hips.position.y = 0.62
        head.rotation.set(action === 'type' ? 0.35 : 0.1, action === 'look' ? Math.sin(t * 0.9) * 0.55 : -0.2, 0)
      } else if (action === 'wave') {
        legs.forEach((l) => (l.rotation.x = 0))
        hips.position.y = 0.62 + Math.abs(Math.sin(t * 3)) * 0.04
        head.rotation.set(-0.08, 0.15, Math.sin(t * 2) * 0.12)
        antennas.forEach((a) => (a.rotation.z = Math.sin(t * 6) * 0.35))
      } else {
        legs.forEach((l) => (l.rotation.x = -0.6))
        hips.position.y = 0.42
        head.rotation.set(0.45, 0, 0.1)
        antennas.forEach((a) => (a.rotation.z = 0.6))
      }
      if (action !== 'wave' && action !== 'rest') antennas.forEach((a) => (a.rotation.z = Math.sin(t * 1.3) * 0.06))
      bars.forEach((b, i) => b.scale.setScalar(action === 'rest' ? 0.5 : action === 'type' ? 0.6 + 0.5 * Math.abs(Math.sin(t * 6 + i)) : 1))
    },
  }
}

interface Figure {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  scene: THREE.Scene
  turn: THREE.Group
  built: Built
  action: FigureAction
  state: WidgetState
  phase: number
  yaw: number
}

/** Where each state turns the robot: busy ones turn toward their work, waiting ones face you, resting ones half away. */
const FACING: Record<WidgetState, number> = { run: -0.55, wait: 0.05, rest: -0.3 }

/** Draws every robot of the widget with one renderer. Create one; attach a canvas per row; detach it when the row goes. */
export class FigureStage {
  private renderer: THREE.WebGLRenderer
  private camera = new THREE.PerspectiveCamera(24, 1, 0.1, 50)
  private env: THREE.Texture
  private figures = new Set<Figure>()
  private start = performance.now()
  private last = 0

  private width: number
  private height: number

  constructor(width: number, height: number) {
    this.width = width
    this.height = height
    const res = Math.min(2, (window.devicePixelRatio || 1) * 1.25)
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true })
    this.renderer.setPixelRatio(res)
    this.renderer.setSize(width, height, false)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.env = new THREE.PMREMGenerator(this.renderer).fromScene(new RoomEnvironment(), 0.04).texture
    this.renderer.setAnimationLoop((now) => this.frame(now))
  }

  attach(canvas: HTMLCanvasElement, spec: FigureSpec, action: FigureAction, state: WidgetState, seed: number): Figure {
    const scale = this.renderer.getPixelRatio()
    canvas.width = Math.round(this.width * scale)
    canvas.height = Math.round(this.height * scale)
    const scene = new THREE.Scene()
    scene.environment = this.env
    scene.environmentIntensity = 0.85
    const key = new THREE.DirectionalLight(0xfff1e0, 2.2)
    key.position.set(2.5, 4, 3)
    const rim = new THREE.DirectionalLight(0x9fc0ff, 1.5)
    rim.position.set(-3, 2.5, -3)
    scene.add(key, rim, new THREE.HemisphereLight(0xe8eeff, 0x1b1e28, 0.35))
    const built = spec.shape === 'visor' ? visor(spec) : scout(spec)
    const turn = new THREE.Group()
    turn.add(built.root)
    scene.add(turn)
    const f: Figure = { canvas, ctx: canvas.getContext('2d')!, scene, turn, built, action, state, phase: (seed % 997) * 0.37, yaw: FACING[state] }
    this.update(f, action, state)
    this.figures.add(f)
    return f
  }

  update(f: Figure, action: FigureAction, state: WidgetState): void {
    f.action = action
    f.state = state
    f.built.led.emissive.set(LIGHT[state])
    f.built.led.emissiveIntensity = state === 'rest' ? 0.35 : 2.2
  }

  detach(f: Figure): void {
    this.figures.delete(f)
    f.scene.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      m.geometry.dispose()
      ;(Array.isArray(m.material) ? m.material : [m.material]).forEach((mat) => mat.dispose())
    })
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null)
    this.figures.forEach((f) => this.detach(f))
    this.env.dispose()
    this.renderer.dispose()
  }

  private frame(now: number): void {
    // about 30 frames a second, and nothing at all while the window is hidden
    if (document.hidden || now - this.last < 33) return
    const dt = Math.min(0.1, (now - this.last) / 1000)
    this.last = now
    const t = (now - this.start) / 1000
    for (const f of this.figures) {
      if (!f.canvas.isConnected) continue
      f.built.pose(f.action, t + f.phase)
      f.yaw += (FACING[f.state] - f.yaw) * Math.min(1, dt * 3)
      f.turn.rotation.y = f.yaw + Math.sin(t * 0.5 + f.phase) * 0.06
      const h = f.built.height
      this.camera.position.set(h * 0.32, h * 0.7, h * 3.1)
      this.camera.lookAt(0, h * 0.48, 0)
      this.renderer.render(f.scene, this.camera)
      f.ctx.clearRect(0, 0, f.canvas.width, f.canvas.height)
      f.ctx.drawImage(this.renderer.domElement, 0, 0)
    }
  }
}

export type { Figure }
