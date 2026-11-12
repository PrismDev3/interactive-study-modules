/**
 * LEGO plastic look for character models.
 * Patches a MeshStandardMaterial in place (other code keeps its references):
 *  - glossier ABS plastic with a tight highlight
 *  - fresnel rim light, tinted by the brick colour, so figures pop off the city
 *  - a cool sky bounce from above and a warm ground bounce from below
 *  - slight contrast lift on printed decals
 * Every patched material shares one shader program.
 */
import * as THREE from 'three';

const done = new WeakSet();
export const plasticFX = { rim: 0.55, sky: 0.12 };

const uRim = { value: plasticFX.rim };
const uSky = { value: plasticFX.sky };

export function polishMaterial(mat) {
  if (!mat || done.has(mat) || !mat.isMeshStandardMaterial || mat.transparent && mat.opacity < 0.95) return mat;
  done.add(mat);
  if (mat.metalness < 0.3) {
    mat.roughness = Math.min(mat.roughness ?? 0.28, 0.24); // premium glossy injection-molded ABS plastic
    mat.metalness = Math.max(mat.metalness ?? 0.05, 0.08); // slight specular body
    mat.envMapIntensity = 1.45;                            // rich studio environment reflections
  }
  if (mat.map) mat.map.anisotropy = Math.max(mat.map.anisotropy || 1, 16);
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    sh.uniforms.uRim = uRim;
    sh.uniforms.uSky = uSky;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uRim;\nuniform float uSky;')
      .replace('#include <opaque_fragment>', `
        {
          vec3 vdir = normalize(vViewPosition);
          float ndv = saturate(dot(normal, vdir));
          float fres = pow(1.0 - ndv, 3.0);
          vec3 tint = mix(vec3(1.0), diffuseColor.rgb, 0.45);
          outgoingLight += fres * uRim * tint * 0.6;
          // view-space up is roughly world up for a chase camera
          float up = normal.y * 0.5 + 0.5;
          outgoingLight += diffuseColor.rgb * mix(vec3(0.55, 0.42, 0.32), vec3(0.62, 0.78, 1.0), up) * uSky;
        }
        #include <opaque_fragment>`);
  };
  const key = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => (key ? key() : '') + '|plasticFX1';
  mat.needsUpdate = true;
  return mat;
}

export function polishMesh(m) {
  if (!m?.isMesh) return m;
  for (const mat of [].concat(m.material)) polishMaterial(mat);
  m.receiveShadow = true;
  return m;
}

export function polishObject(root) {
  root?.traverse?.(polishMesh);
  return root;
}

/** Live tuning from the console: setPlastic({ rim: 0.8 }) */
export function setPlastic(o = {}) {
  Object.assign(plasticFX, o);
  uRim.value = plasticFX.rim;
  uSky.value = plasticFX.sky;
}
if (typeof window !== 'undefined') window.setPlastic = setPlastic;
