import { DataTexture, LinearMipmapLinearFilter, LinearFilter, RGBAFormat, RepeatWrapping, type Material } from 'three'
import { detailNoiseData } from './detailNoise'

let noise: DataTexture | null = null
/** One shared wear texture for every surface that gets detail. */
export function getDetailTexture(): DataTexture {
  if (!noise) {
    noise = new DataTexture(detailNoiseData(256, 11), 256, 256, RGBAFormat)
    noise.wrapS = noise.wrapT = RepeatWrapping
    noise.minFilter = LinearMipmapLinearFilter
    noise.magFilter = LinearFilter
    noise.generateMipmaps = true
    noise.needsUpdate = true
  }
  return noise
}

const VERTEX_DECLARE = 'varying vec3 vDetailPos;\nvarying vec3 vDetailNrm;\n'

const VERTEX_BODY = `
vDetailPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
vDetailNrm = normalize(mat3(modelMatrix) * normal);
`

/** Pattern from the mesh's own coordinates, so a miniature hall shows the same plates as the full one and the pattern moves with it. */
const VERTEX_BODY_LOCAL = `
vDetailPos = transformed;
vDetailNrm = normalize(mat3(modelMatrix) * normal);
`

const FRAGMENT_DECLARE = `
varying vec3 vDetailPos;
varying vec3 vDetailNrm;
uniform sampler2D uDetail;
// a thin line wherever v crosses a whole number; it fades out with distance instead of shimmering
float dLine(float v, float w) {
  float fw = fwidth(v);
  float d = abs(fract(v + 0.5) - 0.5);
  return (1.0 - smoothstep(max(w - fw, 0.0), w + fw, d)) * (1.0 - smoothstep(0.1, 0.35, fw));
}
float dHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
`

/** Plates, seams, bolts, scratches and a hazard band on the floor; plates, rivets, rust and grime on the walls. */
const FRAGMENT_BODY = `
#include <map_fragment>
float dSeam = 0.0;
float dScratch = 0.0;
float dBlot = 0.5;
{
  vec3 p = vDetailPos;
  vec3 n = normalize(vDetailNrm);
  float up = smoothstep(0.7, 0.95, n.y);
  float side = 1.0 - smoothstep(0.2, 0.5, abs(n.y));
  vec3 c = diffuseColor.rgb;
  if (up > 0.0) {
    vec2 g = p.xz / 2.0;
    float pv = dHash(floor(g));
    float seam = max(dLine(g.x, 0.009), dLine(g.y, 0.009));
    float hi = max(dLine(g.x - 0.014, 0.008), dLine(g.y - 0.014, 0.008)) * (1.0 - seam);
    vec2 f = fract(g);
    vec2 q = min(f, 1.0 - f) - vec2(0.05);
    float bolt = (1.0 - smoothstep(0.012, 0.02, length(q))) * (1.0 - smoothstep(0.1, 0.35, fwidth(g.x)));
    float sc1 = texture2D(uDetail, vec2(p.x * 0.5 + pv * 7.0, p.z * 0.02 + pv)).g;
    float sc2 = texture2D(uDetail, vec2(p.z * 0.5 + pv * 3.0, p.x * 0.02 + pv * 5.0)).g;
    float scr = smoothstep(0.62, 0.9, max(sc1, sc2));
    float blot = texture2D(uDetail, p.xz * 0.045).b;
    float grain = texture2D(uDetail, p.xz * 1.7).r;
    vec3 fc = c * (0.92 + 0.16 * pv);
    fc *= 0.8 + 0.4 * blot;
    fc *= 0.92 + 0.16 * grain;
    fc = mix(fc, fc * 0.3, seam);
    fc += vec3(0.06) * hi + vec3(0.1) * bolt + vec3(0.11, 0.1, 0.09) * scr;
    float r = length(p.xz);
    float band = smoothstep(14.25, 14.3, r) * (1.0 - smoothstep(14.7, 14.75, r));
    float stripe = step(0.5, fract((p.x + p.z) * 1.1));
    fc = mix(fc, mix(vec3(0.03), vec3(0.62, 0.42, 0.06), stripe), band);
    c = mix(c, fc, up);
    dSeam = seam * up;
    dScratch = scr * up;
    dBlot = blot;
  }
  if (side > 0.0) {
    float u = atan(p.x, p.z) * 15.0;
    vec2 g = vec2(u / 3.0, p.y / 1.5);
    float pv = dHash(floor(g));
    float seam = max(dLine(g.x, 0.008), dLine(g.y, 0.008));
    float hi = max(dLine(g.x - 0.012, 0.007), dLine(g.y - 0.012, 0.007)) * (1.0 - seam);
    float dy = abs(fract(g.y + 0.5) - 0.5) * 1.5;
    float rivet = (1.0 - smoothstep(0.012, 0.02, abs(dy - 0.09))) * (1.0 - smoothstep(0.03, 0.05, abs(fract(u / 0.5) - 0.5) * 0.5)) * (1.0 - smoothstep(0.1, 0.35, fwidth(u)));
    float rust = texture2D(uDetail, vec2(u * 0.35 + pv, p.y * 0.012)).g;
    float rustMask = smoothstep(0.68, 0.92, rust);
    float blot = texture2D(uDetail, vec2(u * 0.05, p.y * 0.06)).b;
    float grime = 1.0 - 0.3 * (1.0 - smoothstep(0.0, 3.0, p.y));
    vec3 wc = c * (0.9 + 0.2 * pv) * (0.8 + 0.4 * blot) * grime;
    wc = mix(wc, wc * 0.3, seam);
    wc += vec3(0.05) * hi + vec3(0.09) * rivet;
    wc = mix(wc, vec3(0.34, 0.17, 0.07) * (0.6 + 0.8 * blot), rustMask * 0.42);
    c = mix(c, wc, side);
    dSeam = max(dSeam, seam * side);
  }
  diffuseColor.rgb = c;
}
`

const ROUGHNESS_BODY = `
#include <roughnessmap_fragment>
roughnessFactor = clamp(roughnessFactor + 0.15 * (dBlot - 0.5) - 0.3 * dScratch + 0.2 * dSeam, 0.12, 1.0);
`

/**
 * Adds wear detail to a lit material without a larger image: the pattern is worked out from where each
 * point is in the world (or, with `local`, on the mesh itself). Only upward faces (floor) and upright faces (walls) change.
 */
export function applyShellDetail(material: Material, local = false): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uDetail = { value: getDetailTexture() }
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${VERTEX_DECLARE}`).replace('#include <begin_vertex>', `#include <begin_vertex>\n${local ? VERTEX_BODY_LOCAL : VERTEX_BODY}`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAGMENT_DECLARE}`)
      .replace('#include <map_fragment>', FRAGMENT_BODY)
      .replace('#include <roughnessmap_fragment>', ROUGHNESS_BODY)
  }
  material.customProgramCacheKey = () => (local ? 'shell-detail-v1-local' : 'shell-detail-v1')
  material.needsUpdate = true
}
