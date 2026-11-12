import type { Color, Material } from 'three'
import { getDetailTexture } from './shellDetail'

const VERTEX_DECLARE = 'varying vec3 vLocalPos;\nvarying vec3 vLocalNrm;\n'
const VERTEX_BODY = '\nvLocalPos = position;\nvLocalNrm = normal;\n'

const FRAGMENT_DECLARE = `
varying vec3 vLocalPos;
varying vec3 vLocalNrm;
uniform sampler2D uDetail;
uniform vec3 uStripe;
uniform float uSeed;
uniform float uIsBody;
float lvHash(float n) { return fract(sin(n * 12.9898 + uSeed * 4.1414) * 43758.5453); }
`

/** Painted-plastic look: a colour stripe, panel lines, an ID plate with a barcode, and worn edges. */
const DIFFUSE_BODY = `
#include <map_fragment>
float lvPlate = 0.0;
float lvBars = 0.0;
{
  vec3 lp = vLocalPos;
  vec3 c = diffuseColor.rgb;
  float front = smoothstep(0.35, 0.6, vLocalNrm.z);
  if (uIsBody > 0.5) {
    // colour stripe around the waist
    float stripe = 1.0 - smoothstep(0.012, 0.022, abs(lp.y - 0.3));
    c = mix(c, uStripe * 0.85, stripe);
    // panel lines
    float pl = max(1.0 - smoothstep(0.002, 0.005, abs(lp.x)), 1.0 - smoothstep(0.002, 0.005, abs(lp.y - 0.5)));
    c *= 1.0 - 0.45 * pl;
    // ID plate on the chest with a barcode of glowing bars
    float inPlate = front * (1.0 - smoothstep(0.075, 0.085, abs(lp.x))) * (1.0 - smoothstep(0.034, 0.04, abs(lp.y - 0.4)));
    float bar = floor((lp.x + 0.075) / 0.0214);
    float lit = step(0.5, lvHash(bar)) * (1.0 - smoothstep(0.007, 0.0107, abs(fract((lp.x + 0.075) / 0.0214) - 0.5) * 0.0214));
    c = mix(c, vec3(0.05, 0.055, 0.065), inPlate);
    lvPlate = inPlate;
    lvBars = inPlate * lit * (1.0 - smoothstep(0.016, 0.022, abs(lp.y - 0.4)));
  }
  // worn edges: paint chipped where the surface turns away from the camera
  float rim = 1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition)));
  float chips = texture2D(uDetail, lp.xy * 2.6 + lp.zy * 1.9 + vec2(uSeed * 0.07)).g;
  float wear = smoothstep(0.58, 0.85, chips) * smoothstep(0.3, 0.8, rim);
  c = mix(c, vec3(0.62, 0.62, 0.65), wear * 0.55);
  diffuseColor.rgb = c;
}
`

const EMISSIVE_BODY = `
#include <emissivemap_fragment>
totalEmissiveRadiance += uStripe * lvBars * 2.2;
`

/**
 * Gives a robot's painted material a livery. `stripe` is the colour of the waist stripe and the ID bars, `seed`
 * makes each robot's barcode and wear different, and `isBody` is true for the main body (accent parts only get wear).
 */
export function applyRobotLivery(material: Material, options: { stripe: Color; seed: number; isBody: boolean }): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uDetail = { value: getDetailTexture() }
    shader.uniforms.uStripe = { value: options.stripe }
    shader.uniforms.uSeed = { value: options.seed }
    shader.uniforms.uIsBody = { value: options.isBody ? 1 : 0 }
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${VERTEX_DECLARE}`).replace('#include <begin_vertex>', `#include <begin_vertex>${VERTEX_BODY}`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAGMENT_DECLARE}`)
      .replace('#include <map_fragment>', DIFFUSE_BODY)
      .replace('#include <emissivemap_fragment>', EMISSIVE_BODY)
  }
  material.customProgramCacheKey = () => 'robot-livery-v1'
  material.needsUpdate = true
}
