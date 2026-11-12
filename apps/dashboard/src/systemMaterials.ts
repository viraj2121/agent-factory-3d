import { AdditiveBlending, Color, ShaderMaterial, Texture, Vector3 } from 'three'
import type { PlanetMaps } from './planetTextures'
import type { PlanetKind } from './systemLayout'

// Shaders of the solar system level. Each does its own lighting from the star (at the origin), so nothing here depends on
// the hall's lights. The surface pictures hold sRGB numbers and are decoded here, as for the sky photo.

const DECODE = /* glsl */ `
  vec3 dec(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
`

/** What a kind of world wears besides its surface: a sea glint, an atmosphere, and whether its cracks glow by day. */
const LOOK: Record<PlanetKind, { atmo: [number, number, number]; atmoK: number; spec: number; emit: number }> = {
  ocean: { atmo: [0.35, 0.6, 1.0], atmoK: 0.9, spec: 0.22, emit: 0 },
  lava: { atmo: [1, 0.4, 0.2], atmoK: 0.15, spec: 0, emit: 1.1 },
  desert: { atmo: [0.9, 0.6, 0.35], atmoK: 0.15, spec: 0, emit: 0 },
  rocky: { atmo: [0.8, 0.4, 0.3], atmoK: 0.25, spec: 0, emit: 0 },
  gasring: { atmo: [0.85, 0.75, 0.55], atmoK: 0.5, spec: 0, emit: 0 },
  gas: { atmo: [0.55, 0.7, 0.95], atmoK: 0.5, spec: 0, emit: 0 },
  ice: { atmo: [0.55, 0.85, 0.9], atmoK: 0.6, spec: 0, emit: 0 },
  barren: { atmo: [0, 0, 0], atmoK: 0, spec: 0, emit: 0 },
}

const WORLD_VERTEX = /* glsl */ `
  varying vec2 vUv; varying vec3 vN; varying vec3 vW;
  void main() {
    vUv = uv;
    vN = normalize(mat3(modelMatrix) * normal);
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`

export interface PlanetUniforms {
  /** Brightness of the night-side city lights, 0..1 (set every frame: steady when working, blinking when it needs you). */
  city: { value: number }
  /** Colour and strength of the status rim light on the lit side. */
  rim: { value: Color }
  rimK: { value: number }
  time: { value: number }
}

const blank = new Texture()

/** One planet's material. The star is at the origin, so the light comes from there. `light` is the star's colour. */
export function makePlanetMaterial(kind: PlanetKind, maps: PlanetMaps, light: [number, number, number], tint: string): { material: ShaderMaterial; uniforms: PlanetUniforms } {
  const look = LOOK[kind]
  const uniforms = {
    uAlbedo: { value: maps.albedo },
    uLights: { value: maps.lights },
    uClouds: { value: maps.clouds ?? blank },
    uHasClouds: { value: maps.clouds ? 1 : 0 },
    uStar: { value: new Vector3(0, 0, 0) },
    uLight: { value: new Color(...light) },
    uAtmo: { value: new Color(...look.atmo) },
    uAtmoK: { value: look.atmoK },
    uSpec: { value: look.spec },
    uEmit: { value: look.emit },
    uCity: { value: 0 },
    uRim: { value: new Color('#8fa7d0') },
    uRimK: { value: 0.25 },
    uTime: { value: 0 },
    uTint: { value: new Color(tint) },
  }
  const material = new ShaderMaterial({
    uniforms,
    vertexShader: WORLD_VERTEX,
    fragmentShader: /* glsl */ `
      uniform vec3 uTint;
      uniform sampler2D uAlbedo; uniform sampler2D uLights; uniform sampler2D uClouds; uniform float uHasClouds;
      uniform vec3 uStar; uniform vec3 uLight; uniform vec3 uAtmo; uniform float uAtmoK; uniform float uSpec; uniform float uEmit;
      uniform float uCity; uniform vec3 uRim; uniform float uRimK; uniform float uTime;
      varying vec2 vUv; varying vec3 vN; varying vec3 vW;
      ${DECODE}
      void main() {
        vec3 N = normalize(vN);
        vec3 L = normalize(uStar - vW);
        vec3 V = normalize(cameraPosition - vW);
        float ndl = dot(N, L);
        vec3 alb = dec(texture2D(uAlbedo, vUv).rgb);
        float ca = texture2D(uClouds, vec2(fract(vUv.x + uTime * 0.002), vUv.y)).a * uHasClouds;
        // the project's own colour, kept to the same brightness, bends the whole surface toward its hue
        alb *= mix(vec3(1.0), uTint / max(dot(uTint, vec3(0.3, 0.5, 0.2)), 0.05), 0.5);
        alb = mix(alb, vec3(0.9), ca * 0.9);
        float day = smoothstep(-0.07, 0.5, ndl);
        vec3 col = alb * uLight * day * 1.35;
        vec3 H = normalize(L + V);
        col += uLight * uSpec * pow(max(dot(N, H), 0.0), 60.0) * day * (1.0 - ca);
        float night = 1.0 - smoothstep(-0.12, 0.08, ndl);
        col += dec(texture2D(uLights, vUv).rgb) * (uCity * night + uEmit);
        float edge = 1.0 - max(dot(N, V), 0.0);
        // a faint cool fill from the camera's side, so the night side still shows its surface
        col += alb * vec3(0.45, 0.55, 0.85) * 0.2 * max(dot(N, V), 0.0) * (1.0 - day * 0.6);
        col += uAtmo * pow(edge, 3.0) * smoothstep(-0.25, 0.6, ndl) * uAtmoK;
        col += uRim * pow(edge, 2.5) * smoothstep(-0.1, 0.6, ndl) * uRimK;
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
  })
  return {
    material,
    uniforms: {
      city: uniforms.uCity,
      rim: { value: uniforms.uRim.value },
      rimK: uniforms.uRimK,
      time: uniforms.uTime,
    },
  }
}

/**
 * The red dwarf, computed live (no picture): soft boiling granules that drift and change, big dark spots, a very bright
 * centre that goes darker and redder toward the edge (limb darkening). Values above 1 so the bloom makes it glow. Decoration.
 */
export function makeStarMaterial(): { material: ShaderMaterial; time: { value: number } } {
  const uniforms = { uTime: { value: 0 } }
  const material = new ShaderMaterial({
    uniforms,
    toneMapped: false,
    vertexShader: 'varying vec3 vP; varying vec3 vN; varying vec3 vW; void main() { vP = position; vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: /* glsl */ `
      uniform float uTime; varying vec3 vP; varying vec3 vN; varying vec3 vW;
      float h3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float vn(vec3 x) {
        vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(h3(i), h3(i + vec3(1, 0, 0)), f.x), mix(h3(i + vec3(0, 1, 0)), h3(i + vec3(1, 1, 0)), f.x), f.y),
                   mix(mix(h3(i + vec3(0, 0, 1)), h3(i + vec3(1, 0, 1)), f.x), mix(h3(i + vec3(0, 1, 1)), h3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
      }
      float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * vn(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }
      void main() {
        vec3 N = normalize(vN);
        vec3 V = normalize(cameraPosition - vW);
        float mu = clamp(dot(N, V), 0.0, 1.0);
        vec3 p = normalize(vP);
        float t = uTime;
        // granules: soft cells that boil (the pattern slowly changes by sliding through a third dimension)
        vec3 warp = vec3(fbm(p * 3.0 + t * 0.02), fbm(p * 3.0 + 5.2 - t * 0.02), fbm(p * 3.0 + 9.1)) - 0.5;
        float g1 = fbm(p * 9.0 + warp * 1.2 + vec3(0.0, t * 0.035, 0.0));
        float g2 = fbm(p * 26.0 + warp * 0.6 + vec3(t * 0.05, 0.0, 0.0));
        float gran = smoothstep(0.25, 0.8, g1 * 0.65 + g2 * 0.45);
        // big dark spots and bright patches around them
        float sp = fbm(p * 2.2 + 3.3 + t * 0.004);
        float spot = smoothstep(0.62, 0.74, sp);
        float bright = smoothstep(0.52, 0.62, sp) * (1.0 - spot);
        float heat = clamp(0.28 + gran * 0.6 + bright * 0.25 - spot * 0.55, 0.0, 1.0);
        vec3 deep = vec3(0.4, 0.04, 0.01);
        vec3 mid = vec3(0.95, 0.24, 0.05);
        vec3 hot = vec3(1.0, 0.5, 0.2);
        vec3 col = mix(deep, mid, smoothstep(0.0, 0.55, heat));
        col = mix(col, hot, smoothstep(0.55, 1.0, heat));
        // limb darkening: dimmer and redder toward the edge
        float limb = 0.25 + 0.75 * pow(mu, 0.5);
        col *= limb * 2.2 * (1.0 + 0.05 * sin(t * 0.7) + 0.03 * sin(t * 1.9 + 1.0)); // a slow, faint breathing
        col = mix(col, col * vec3(1.0, 0.55, 0.35), pow(1.0 - mu, 2.0));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
  })
  return { material, time: uniforms.uTime }
}

/** One glowing arch of plasma (a tube): bright knots run along it while its life is up. Additive, lit by itself. */
export function makeLoopMaterial(): { material: ShaderMaterial; life: { value: number }; time: { value: number } } {
  const uniforms = { uLife: { value: 0 }, uTime: { value: 0 } }
  const material = new ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */ `
      uniform float uLife; uniform float uTime; varying vec2 vUv;
      void main() {
        float along = sin(3.14159265 * vUv.x);
        float knots = 0.6 + 0.4 * sin(vUv.x * 24.0 - uTime * 2.2);
        float a = pow(along, 0.7) * knots * uLife;
        gl_FragColor = vec4(vec3(1.0, 0.42, 0.14) * a * 1.8, 1.0);
      }
    `,
  })
  return { material, life: uniforms.uLife, time: uniforms.uTime }
}

export interface CoronaUniforms {
  time: { value: number }
  /** 0..1: how bright the flare is right now, and which way round the star it is. */
  flare: { value: number }
  flareAngle: { value: number }
}

/** A soft glow round the star with faint, slowly moving streamers, on a square that always faces the camera. The star's disc is at the middle fifth. */
export function makeCoronaMaterial(color: [number, number, number]): { material: ShaderMaterial; uniforms: CoronaUniforms } {
  const uniforms = { uTime: { value: 0 }, uFlare: { value: 0 }, uFA: { value: 0 }, uColor: { value: new Color(...color) } }
  const material = new ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uFlare; uniform float uFA; uniform vec3 uColor; varying vec2 vUv;
      void main() {
        vec2 p = (vUv - 0.5) * 2.0;
        float r = length(p);
        float ang = atan(p.y, p.x);
        // streamers: wide, soft and uneven, fading with distance (no hard rays)
        float s1 = 0.5 + 0.5 * sin(ang * 5.0 + sin(ang * 2.0 + uTime * 0.05) * 1.6 + uTime * 0.03);
        float s2 = 0.5 + 0.5 * sin(ang * 11.0 - uTime * 0.04 + sin(ang * 4.0) * 1.2);
        float streak = 0.55 + 0.45 * s1 * (0.6 + 0.4 * s2);
        float inside = smoothstep(0.17, 0.23, r);
        float d = max(r - 0.2, 0.0);
        float glow = (exp(-d * 11.0) * 0.55 + exp(-d * 3.4) * 0.22) * inside;
        float rays = exp(-d * 4.2) * inside * streak * 0.22;
        float da = abs(mod(ang - uFA + 3.14159265, 6.2831853) - 3.14159265);
        float flare = uFlare * exp(-da * da * 14.0) * exp(-d * 9.0) * inside * 1.6;
        float a = (glow + rays + flare) * smoothstep(1.0, 0.55, r);
        gl_FragColor = vec4(uColor * a, 1.0);
      }
    `,
  })
  return { material, uniforms: { time: uniforms.uTime, flare: uniforms.uFlare, flareAngle: uniforms.uFA } }
}

/** A planet's rings: thin bands with a gap, lit by the star, dark where the planet's shadow falls. Radii are in the globe's own units. */
export function makeRingMaterial(color: [number, number, number], inner: number, outer: number): { material: ShaderMaterial; centre: Vector3; radius: { value: number } } {
  const centre = new Vector3()
  const uniforms = { uColor: { value: new Color(...color) }, uInner: { value: inner }, uOuter: { value: outer }, uCentre: { value: centre }, uRadius: { value: 1 }, uStar: { value: new Vector3() } }
  const material = new ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    side: 2,
    vertexShader: 'varying float vR; varying vec3 vW; void main() { vR = length(position.xy); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uInner; uniform float uOuter; uniform vec3 uCentre; uniform float uRadius; uniform vec3 uStar;
      varying float vR; varying vec3 vW;
      float h(float x) { return fract(sin(x * 127.1) * 43758.5453); }
      void main() {
        float t = (vR - uInner) / (uOuter - uInner);
        float band = 0.55 + 0.45 * sin(t * 70.0) * (0.6 + 0.4 * h(floor(t * 40.0)));
        float density = band * smoothstep(0.0, 0.06, t) * smoothstep(1.0, 0.9, t);
        density *= 1.0 - 0.85 * smoothstep(0.6, 0.62, t) * smoothstep(0.69, 0.67, t);
        vec3 L = normalize(uStar - vW);
        vec3 oc = vW - uCentre;
        float b = dot(oc, L);
        float c = dot(oc, oc) - uRadius * uRadius;
        float shade = (b < 0.0 && b * b - c > 0.0) ? 0.06 : 1.0;
        gl_FragColor = vec4(uColor * shade * 0.9, density * 0.8);
        #include <colorspace_fragment>
      }
    `,
  })
  return { material, centre, radius: uniforms.uRadius }
}