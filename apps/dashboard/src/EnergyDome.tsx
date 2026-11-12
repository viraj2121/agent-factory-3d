import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, Color, ShaderMaterial, SphereGeometry, Vector3, type Mesh } from 'three'
import { DOME, domeStrength } from './dome'
import type { ProjectStatus } from './projects'

const VERTEX = `
varying vec3 vNormalV;
varying vec3 vViewV;
varying vec3 vLocal;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vNormalV = normalize(normalMatrix * normal);
  vViewV = -mv.xyz;
  vLocal = position;
  gl_Position = projectionMatrix * mv;
}
`

/** A bright rim where the surface turns away from you, and a fine net of latitude and longitude lines. */
const FRAGMENT = `
uniform vec3 uColor;
uniform float uStrength;
varying vec3 vNormalV;
varying vec3 vViewV;
varying vec3 vLocal;
float gridLine(float v, float w) {
  float fw = fwidth(v);
  float d = abs(fract(v + 0.5) - 0.5);
  return (1.0 - smoothstep(max(w - fw, 0.0), w + fw, d)) * (1.0 - smoothstep(0.15, 0.45, fw));
}
void main() {
  float facing = abs(dot(normalize(vNormalV), normalize(vViewV)));
  float rim = pow(1.0 - facing, 2.4);
  vec3 p = normalize(vLocal);
  float lat = gridLine(acos(clamp(p.y, -1.0, 1.0)) * 6.0 / 3.14159, 0.03);
  float lon = gridLine(atan(p.x, p.z) * 12.0 / 6.28318, 0.03);
  float net = max(lat, lon) * (0.25 + 0.75 * rim);
  vec3 col = uColor * (rim * 0.9 + net * 0.55);
  gl_FragColor = vec4(col * uStrength, 1.0);
}
`

let geometry: SphereGeometry | null = null
/** One half-sphere, shared by the hall's dome and every miniature's. */
function domeGeometry(): SphereGeometry {
  if (!geometry) geometry = new SphereGeometry(DOME.radius, 56, 20, 0, Math.PI * 2, 0, Math.PI / 2)
  return geometry
}

/** How strong the dome is for a project's status: full while running, a little brighter when it needs you, dim when idle. */
const STATUS_STRENGTH: Record<ProjectStatus, number> = { running: 1, 'needs-you': 1.15, idle: 0.55 }

/**
 * A faint energy dome over a hall. It is only drawn from far away: it fades out as the camera comes
 * closer (judged from the dome's own size, so a miniature island fades sooner), and clicks pass through it.
 */
export default function EnergyDome({ accent, status }: { accent: string; status: ProjectStatus }) {
  const mesh = useRef<Mesh>(null)
  const world = useMemo(() => new Vector3(), [])
  const scale = useMemo(() => new Vector3(), [])
  const material = useMemo(
    () => new ShaderMaterial({ vertexShader: VERTEX, fragmentShader: FRAGMENT, uniforms: { uColor: { value: new Color() }, uStrength: { value: 0 } }, transparent: true, blending: AdditiveBlending, depthWrite: false, fog: false }),
    [],
  )
  material.uniforms.uColor.value.set(accent)

  useFrame(({ camera }) => {
    const m = mesh.current
    if (!m) return
    m.getWorldPosition(world)
    m.getWorldScale(scale)
    const s = DOME.strength * STATUS_STRENGTH[status] * domeStrength(camera.position.distanceTo(world), scale.x)
    material.uniforms.uStrength.value = s
    m.visible = s > 0.01
  })

  return <mesh ref={mesh} geometry={domeGeometry()} material={material} scale-y={DOME.squash} visible={false} renderOrder={5} raycast={() => null} />
}
