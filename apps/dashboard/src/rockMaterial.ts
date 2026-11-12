import { Color, MeshStandardMaterial } from 'three'
import { getDetailTexture } from './shellDetail'

/** Shared clock for the glowing veins: one number, updated once per frame. */
export const ROCK_TIME = { value: 0 }

const VERTEX_DECLARE = 'varying vec3 vRockPos;\n'
const VERTEX_BODY = '\nvRockPos = position;\n'

const FRAGMENT_DECLARE = `
varying vec3 vRockPos;
uniform sampler2D uDetail;
uniform vec3 uVein;
uniform float uTime;
`

/** Layered strata, and cracks that glow in the project colour. */
const DIFFUSE_BODY = `
#include <map_fragment>
float rockVein = 0.0;
{
  vec3 p = vRockPos;
  float warp = texture2D(uDetail, p.xz * 0.05).b;
  float band = sin(p.y * 2.4 + warp * 5.0) * 0.5 + 0.5;
  float fine = sin(p.y * 9.0 + warp * 9.0) * 0.5 + 0.5;
  diffuseColor.rgb *= 0.72 + 0.4 * band + 0.1 * fine;
  float v = max(texture2D(uDetail, p.xz * 0.16 + vec2(p.y * 0.05)).g, texture2D(uDetail, p.zy * 0.14).g);
  rockVein = smoothstep(0.85, 0.94, v) * smoothstep(-0.8, -2.2, p.y);
}
`

const EMISSIVE_BODY = `
#include <emissivemap_fragment>
totalEmissiveRadiance += uVein * rockVein * (0.95 + 0.45 * sin(uTime * 1.4 + vRockPos.y * 1.7));
`

/** A rock material: strata and glowing veins, in `accent`. */
export function makeRockMaterial(base: string, accent: string): MeshStandardMaterial {
  const material = new MeshStandardMaterial({ color: base, roughness: 0.95, flatShading: true, side: 2 })
  const vein = new Color(accent)
  material.userData.vein = vein
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uDetail = { value: getDetailTexture() }
    shader.uniforms.uVein = { value: vein }
    shader.uniforms.uTime = ROCK_TIME
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${VERTEX_DECLARE}`).replace('#include <begin_vertex>', `#include <begin_vertex>${VERTEX_BODY}`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAGMENT_DECLARE}`)
      .replace('#include <map_fragment>', DIFFUSE_BODY)
      .replace('#include <emissivemap_fragment>', EMISSIVE_BODY)
  }
  material.customProgramCacheKey = () => 'rock-v1'
  return material
}
