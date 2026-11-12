import { AdditiveBlending, BackSide, Color, DoubleSide, Matrix3, ShaderMaterial, Vector3, type Texture } from 'three'
import type { SkyTheme } from './themes'
import type { ProjectStatus } from './projects'

/** The colour of the sky near the horizon for a project's status: calm blue, warm amber when it needs you, dim when idle. */
export function skyLow(status: ProjectStatus): [number, number, number] {
  if (status === 'needs-you') return [0.07, 0.036, 0.014]
  if (status === 'idle') return [0.01, 0.018, 0.04]
  return [0.016, 0.034, 0.075]
}

/** A crescent moon with a soft halo, drawn on a flat square. */
export function makeMoon(): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: false,
    uniforms: {},
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader:
      'varying vec2 vUv; void main() { vec2 p = vUv - 0.5; float d = length(p); float disc = 1.0 - smoothstep(0.17, 0.18, d); float cut = 1.0 - smoothstep(0.15, 0.16, length(p - vec2(0.07, 0.05))); float moon = disc * (1.0 - cut); float halo = exp(-d * 9.0) * 0.35; gl_FragColor = vec4(vec3(0.93, 0.9, 0.82) * moon + vec3(0.5, 0.6, 0.8) * halo, max(moon, halo)); }',
  })
}

/** Time for the aurora, one number updated once a frame. */
export const AURORA_TIME = { value: 0 }

/** A slow ribbon of light high in the sky, tinted by `tint`. */
export function makeAurora(tint: string, strength = 1): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: false,
    blending: AdditiveBlending,
    side: DoubleSide,
    uniforms: { uTime: AURORA_TIME, uTint: { value: new Color(tint) }, uStrength: { value: strength } },
    vertexShader:
      'uniform float uTime; varying vec2 vUv; void main() { vUv = uv; vec3 p = position; p.y += sin(p.x * 0.035 + uTime * 0.4) * 9.0 + sin(p.x * 0.09 - uTime * 0.25) * 3.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }',
    fragmentShader:
      'uniform float uTime; uniform vec3 uTint; uniform float uStrength; varying vec2 vUv; void main() { float curtain = 0.5 + 0.5 * sin(vUv.x * 38.0 + sin(vUv.x * 7.0 + uTime * 0.5) * 3.0); float fade = smoothstep(0.0, 0.35, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y)); vec3 c = mix(vec3(0.15, 0.9, 0.55), uTint, smoothstep(0.2, 0.9, vUv.y)); float edge = smoothstep(0.0, 0.1, vUv.x) * (1.0 - smoothstep(0.9, 1.0, vUv.x)); gl_FragColor = vec4(c * (0.35 + 0.65 * curtain), fade * edge * (0.18 + 0.2 * curtain) * uStrength); }',
  })
}

// ---- real-space sky: black, a Milky Way band with dark dust lanes, painted nebulae and fine stars

const NOISE = /* glsl */ `
  float hash3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float noise3(vec3 x) {
    vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash3(i + vec3(0,0,0)), hash3(i + vec3(1,0,0)), f.x), mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x), mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise3(p); p = p * 2.03 + 11.7; a *= 0.5; } return v; }
`

/** A planet's dark night side far below, with a thin lit rim (the atmosphere) toward the camera. */
export function makePlanet(rim: [number, number, number]): ShaderMaterial {
  return new ShaderMaterial({
    fog: false,
    uniforms: { uRim: { value: new Color(...rim) } },
    vertexShader: 'varying vec3 vN; varying vec3 vView; void main() { vec4 w = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vView = normalize(-w.xyz); gl_Position = projectionMatrix * w; }',
    fragmentShader: /* glsl */ `
      uniform vec3 uRim; varying vec3 vN; varying vec3 vView;
      ${NOISE}
      void main() {
        float f = 1.0 - max(dot(vN, vView), 0.0);
        float rim = pow(f, 14.0);
        vec3 ground = vec3(0.006, 0.01, 0.014) * (0.6 + 0.8 * fbm(vN * 6.0));
        gl_FragColor = vec4(ground + uRim * rim * 0.9, 1.0);
      }
    `,
  })
}

// ---- the photo sky and the far objects of Stage A (sun, gas giant). All of them ignore fog and are decoration.

/**
 * The real Milky Way photo wrapped round the scene, graded by the theme, with the theme's faint horizon colour and
 * nebula gas on top. `toMap` turns a world direction into the photo's own space. `uLow` is nudged by the status.
 */
export function makePhotoSky(theme: SkyTheme, map: Texture, toMap: Matrix3): ShaderMaterial {
  return new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uMap: { value: map },
      uToMap: { value: toMap },
      uExposure: { value: theme.photoExposure },
      uTint: { value: new Color(...theme.photoTint) },
      uTop: { value: new Color(...theme.top) },
      uLow: { value: new Color(...theme.low) },
      uNebA: { value: new Color(...theme.nebulaA) },
      uNebB: { value: new Color(...theme.nebulaB) },
      uNebOpacity: { value: theme.nebulaOpacity },
    },
    vertexShader: 'varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap; uniform mat3 uToMap; uniform float uExposure; uniform vec3 uTint;
      uniform vec3 uTop; uniform vec3 uLow; uniform vec3 uNebA; uniform vec3 uNebB; uniform float uNebOpacity;
      varying vec3 vDir;
      ${NOISE}
      void main() {
        vec3 d = normalize(vDir);
        vec3 m = uToMap * d;
        vec2 uv = vec2(atan(m.x, -m.z) / 6.2831853 + 0.5, asin(clamp(m.y, -1.0, 1.0)) / 3.1415927 + 0.5);
        // the photo's left and right edges meet behind the core: take the gradient from whichever side is smooth
        // there, or a thin seam of the smallest mip level shows
        vec2 uv2 = vec2(fract(uv.x + 0.5), uv.y);
        vec2 dx = dFdx(uv); vec2 dy = dFdy(uv); vec2 dx2 = dFdx(uv2); vec2 dy2 = dFdy(uv2);
        if (dot(dx2, dx2) + dot(dy2, dy2) < dot(dx, dx) + dot(dy, dy)) { dx = dx2; dy = dy2; }
        vec3 photo = textureGrad(uMap, uv, dx, dy).rgb;
        // the JPG is sRGB: back to linear light by hand (the sampler is left plain so this is the only decode)
        photo = mix(photo / 12.92, pow((photo + 0.055) / 1.055, vec3(2.4)), step(0.04045, photo));
        vec3 col = max(photo - 0.0012, 0.0) * uExposure * uTint;
        float h = clamp(d.y, -0.3, 1.0);
        col += mix(uLow, uTop, smoothstep(-0.25, 0.6, h));
        float gas = smoothstep(0.48, 0.85, fbm(d * 1.6 + 7.3));
        float tint = fbm(d * 2.4 + 1.9);
        col += mix(uNebA, uNebB, smoothstep(0.35, 0.65, tint)) * gas * uNebOpacity * 0.12;
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
  })
}

/** A banded gas giant lit by the sun: a soft line between day and night, a thin bright rim on the day side. */
export function makeGiant(theme: SkyTheme, sunDir: Vector3): ShaderMaterial {
  return new ShaderMaterial({
    fog: false,
    uniforms: {
      uSunDir: { value: sunDir.clone().normalize() },
      uA: { value: new Color(...theme.giantA) },
      uB: { value: new Color(...theme.giantB) },
      uSun: { value: new Color(...theme.sun) },
      uRim: { value: new Color(...theme.rim) },
    },
    vertexShader:
      'varying vec3 vN; varying vec3 vWorld; varying vec3 vLocal; void main() { vLocal = normalize(position); vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: /* glsl */ `
      uniform vec3 uSunDir; uniform vec3 uA; uniform vec3 uB; uniform vec3 uSun; uniform vec3 uRim;
      varying vec3 vN; varying vec3 vWorld; varying vec3 vLocal;
      ${NOISE}
      void main() {
        vec3 n = normalize(vN);
        float lat = vLocal.y;
        float warp = fbm(vLocal * 3.0) - 0.5;
        float bands = 0.5 + 0.5 * sin((lat + warp * 0.12) * 26.0);
        bands = mix(bands, fbm(vec3(lat * 34.0, vLocal.x * 2.0, vLocal.z * 2.0)), 0.4);
        float storm = smoothstep(0.1, 0.0, length(vec2(atan(vLocal.x, vLocal.z) - 0.8, (lat + 0.35) * 3.0)));
        vec3 albedo = mix(uB, uA, bands) + vec3(0.25, 0.08, 0.02) * storm;
        float ndl = dot(n, uSunDir);
        float day = smoothstep(-0.25, 0.55, ndl);
        vec3 view = normalize(cameraPosition - vWorld);
        float fres = pow(1.0 - max(dot(n, view), 0.0), 4.0);
        vec3 col = albedo * uSun * day * 0.85 + uRim * fres * smoothstep(-0.15, 0.35, ndl) * 0.5 + albedo * 0.004;
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
  })
}

/** The giant's rings: thin bands with a gap, lit by the sun, dark where the planet's shadow falls on them. */
export function makeRings(theme: SkyTheme, sunDir: Vector3, inner: number, outer: number, centre: Vector3, radius: number): ShaderMaterial {
  return new ShaderMaterial({
    fog: false,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    uniforms: {
      uSunDir: { value: sunDir.clone().normalize() },
      uRing: { value: new Color(...theme.ring) },
      uSun: { value: new Color(...theme.sun) },
      uInner: { value: inner },
      uOuter: { value: outer },
      uCentre: { value: centre.clone() },
      uRadius: { value: radius },
    },
    vertexShader:
      'varying float vR; varying vec3 vWorld; void main() { vR = length(position.xy); vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: /* glsl */ `
      uniform vec3 uSunDir; uniform vec3 uRing; uniform vec3 uSun; uniform float uInner; uniform float uOuter;
      uniform vec3 uCentre; uniform float uRadius;
      varying float vR; varying vec3 vWorld;
      ${NOISE}
      void main() {
        float t = (vR - uInner) / (uOuter - uInner);
        float density = 0.35 + 0.65 * noise3(vec3(t * 60.0, 0.0, 0.0)) * (0.6 + 0.4 * sin(t * 140.0));
        density *= smoothstep(0.0, 0.05, t) * smoothstep(1.0, 0.92, t);
        density *= 1.0 - 0.85 * smoothstep(0.6, 0.62, t) * smoothstep(0.68, 0.66, t);
        // the planet's shadow: does the way to the sun pass through the planet?
        vec3 oc = vWorld - uCentre;
        float b = dot(oc, uSunDir);
        float c = dot(oc, oc) - uRadius * uRadius;
        float shade = (b < 0.0 && b * b - c > 0.0) ? 0.06 : 1.0;
        vec3 col = uRing * uSun * 0.55 * shade;
        gl_FragColor = vec4(col, density * 0.85);
        #include <colorspace_fragment>
      }
    `,
  })
}

/** The sun on a camera-facing square: a white-hot core bright enough to glow, a soft halo and a thin streak. */
export function makeSunGlow(color: [number, number, number]): ShaderMaterial {
  return new ShaderMaterial({
    fog: false,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
    uniforms: { uSun: { value: new Color(...color) } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */ `
      uniform vec3 uSun; varying vec2 vUv;
      void main() {
        vec2 p = (vUv - 0.5) * 2.0;
        float d = length(p);
        float core = smoothstep(0.045, 0.02, d) * 6.0;
        float halo = exp(-d * 14.0) * 1.4 + exp(-d * 4.5) * 0.35;
        float streak = exp(-abs(p.y) * 90.0) * exp(-abs(p.x) * 2.2) * 0.9;
        vec3 col = mix(uSun, vec3(1.0), 0.6) * core + uSun * (halo + streak);
        gl_FragColor = vec4(col * smoothstep(1.0, 0.8, d), 1.0);
      }
    `,
  })
}

/** One lens flare ghost: a soft disc with a brighter edge. `uOpacity` is set every frame. */
export function makeFlareGhost(color: string): ShaderMaterial {
  return new ShaderMaterial({
    fog: false,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: AdditiveBlending,
    toneMapped: false,
    uniforms: { uColor: { value: new Color(color) }, uOpacity: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uOpacity; varying vec2 vUv;
      void main() {
        float d = length(vUv - 0.5) * 2.0;
        float a = smoothstep(1.0, 0.82, d) * (0.35 + 0.65 * smoothstep(0.45, 0.95, d));
        gl_FragColor = vec4(uColor * a * uOpacity, 1.0);
      }
    `,
  })
}