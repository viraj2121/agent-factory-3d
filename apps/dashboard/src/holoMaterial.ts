import { Color, DoubleSide, ShaderMaterial } from 'three'

/** One shared hologram surface: a grid, a bright rim, and a scanline that sweeps up. `uTime` is updated once a frame. */
export const HOLO = new ShaderMaterial({
  transparent: true,
  depthWrite: false,
  side: DoubleSide,
  uniforms: { uTime: { value: 0 }, uColor: { value: new Color('#7fe9ff') } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform float uTime; uniform vec3 uColor; varying vec2 vUv;
    void main() {
      vec2 g = abs(fract(vUv * vec2(12.0, 8.0)) - 0.5);
      float grid = 1.0 - smoothstep(0.44, 0.5, max(g.x, g.y));
      float edge = max(1.0 - smoothstep(0.0, 0.035, min(vUv.x, 1.0 - vUv.x)), 1.0 - smoothstep(0.0, 0.05, min(vUv.y, 1.0 - vUv.y)));
      float sweep = 1.0 - smoothstep(0.0, 0.12, abs(fract(vUv.y - uTime * 0.22) - 0.5) * 0.5 - 0.0);
      float lines = 0.5 + 0.5 * sin(vUv.y * 160.0);
      float flicker = 0.94 + 0.06 * sin(uTime * 37.0);
      float a = (0.22 + 0.5 * edge + 0.16 * grid + 0.12 * lines * 0.5 + 0.18 * sweep) * flicker;
      gl_FragColor = vec4(mix(vec3(0.04, 0.23, 0.27), uColor, clamp(edge + grid * 0.5 + sweep * 0.4, 0.0, 1.0)), clamp(a, 0.0, 0.9));
    }
  `,
})
