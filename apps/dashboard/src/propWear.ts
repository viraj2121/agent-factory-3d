import type { Material } from 'three'
import { getDetailTexture } from './shellDetail'

const VERTEX_DECLARE = 'varying vec3 vWearPos;\nvarying vec3 vWearNrm;\n'
const VERTEX_BODY = '\nvWearPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWearNrm = normalize(mat3(modelMatrix) * normal);\n'

const FRAGMENT_DECLARE = 'varying vec3 vWearPos;\nvarying vec3 vWearNrm;\nuniform sampler2D uDetail;\n'

/** Scratches, soft grime and a little grain, projected from three sides so it fits any shape. */
const FRAGMENT_BODY = `
#include <map_fragment>
{
  vec3 p = vWearPos;
  vec3 w = abs(normalize(vWearNrm));
  w /= (w.x + w.y + w.z);
  float scr = texture2D(uDetail, p.zy * 1.6).g * w.x + texture2D(uDetail, p.xz * 1.6).g * w.y + texture2D(uDetail, p.xy * 1.6).g * w.z;
  float blot = texture2D(uDetail, p.xz * 0.3 + vec2(p.y * 0.2)).b;
  float grain = texture2D(uDetail, p.xz * 3.1 + p.yy).r;
  scr = smoothstep(0.62, 0.86, scr);
  diffuseColor.rgb *= (0.84 + 0.3 * blot) * (0.94 + 0.12 * grain);
  diffuseColor.rgb += vec3(0.07, 0.065, 0.06) * scr;
}
`

/** Adds scratches and grime to a lit material so props look used. Safe to call twice on the same material. */
export function applyPropWear(material: Material): void {
  if (material.userData.worn) return
  material.userData.worn = true
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uDetail = { value: getDetailTexture() }
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${VERTEX_DECLARE}`).replace('#include <begin_vertex>', `#include <begin_vertex>${VERTEX_BODY}`)
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${FRAGMENT_DECLARE}`).replace('#include <map_fragment>', FRAGMENT_BODY)
  }
  material.customProgramCacheKey = () => 'prop-wear-v1'
  material.needsUpdate = true
}

/** The bay materials that are plain surfaces. Lights, screens and notes are left as they are. */
export const WEAR_MATERIALS = new Set(['BayDark', 'BaySteel', 'BayTrim', 'BayPlastic', 'BayCream', 'BayTab'])
