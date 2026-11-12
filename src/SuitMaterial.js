/**
 * SuitMaterial.js
 * Custom ShaderMaterial that replicates the hero suit look:
 *   - Red/blue PBR base with subtle hexagonal web pattern
 *   - Anisotropic sheen (the suit has a slight fabric sheen)
 *   - Emissive eye / web-shooter glow (driven by a uniform)
 *   - Normal map + roughness map support
 *
 * Drop texture files into /assets/textures/ and pass them via options.
 */
import * as THREE from 'three';

export function createSuitMaterial(options = {}) {
  const {
    albedoMap    = null,
    normalMap    = null,
    roughnessMap = null,
    metallicMap  = null,
    eyeGlowColor = new THREE.Color(0xffffff),
    eyeGlowIntensity = 1.0,
  } = options;

  // ── Build a MeshStandardMaterial-like setup with custom shader injection ──
  // We extend MeshStandardMaterial via onBeforeCompile to keep shadow casting
  // and all PBR lighting without rewriting the full lighting model.
  const mat = new THREE.MeshStandardMaterial({
    color:     0xcc1111,  // suit red base; real color comes from albedoMap
    roughness: 0.55,
    metalness: 0.15,
    map:          albedoMap    || null,
    normalMap:    normalMap    || null,
    roughnessMap: roughnessMap || null,
    metalnessMap: metallicMap  || null,
    envMapIntensity: 0.9,
  });

  // Uniforms injected into the shader
  mat.userData.eyeGlowColor     = { value: eyeGlowColor };
  mat.userData.eyeGlowIntensity = { value: eyeGlowIntensity };
  mat.userData.webPatternScale  = { value: 18.0 };  // how tight the hex grid is
  mat.userData.sheenStrength    = { value: 0.3 };
  mat.userData.time             = { value: 0 };

  mat.onBeforeCompile = (shader) => {
    // Inject uniforms
    shader.uniforms.eyeGlowColor     = mat.userData.eyeGlowColor;
    shader.uniforms.eyeGlowIntensity = mat.userData.eyeGlowIntensity;
    shader.uniforms.webPatternScale  = mat.userData.webPatternScale;
    shader.uniforms.sheenStrength    = mat.userData.sheenStrength;
    shader.uniforms.uTime            = mat.userData.time;

    // ── Vertex additions ──────────────────────────────────────────────────
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      /* glsl */`
      #include <common>
      varying vec2 vSuitUV;
      `
    ).replace(
      '#include <begin_vertex>',
      /* glsl */`
      #include <begin_vertex>
      vSuitUV = uv;
      `
    );

    // ── Fragment additions ────────────────────────────────────────────────
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      /* glsl */`
      #include <common>
      uniform vec3  eyeGlowColor;
      uniform float eyeGlowIntensity;
      uniform float webPatternScale;
      uniform float sheenStrength;
      uniform float uTime;
      varying vec2  vSuitUV;

      // Hexagonal grid SDF for web pattern lines
      // Returns distance to nearest hex edge (0 = on edge, 1 = center of hex)
      float hexPattern(vec2 uv, float scale) {
        uv *= scale;
        vec2 r = vec2(1.0, 1.732);
        vec2 h = r * 0.5;
        vec2 a = mod(uv, r) - h;
        vec2 b = mod(uv - h, r) - h;
        vec2 gv = dot(a, a) < dot(b, b) ? a : b;
        // Distance from hex grid lines
        float d = length(gv);
        return smoothstep(0.42, 0.48, d);
      }

      // Sheen: brightens at grazing angles
      float sheenFactor(vec3 normal, vec3 viewDir) {
        float NdotV = clamp(dot(normal, viewDir), 0.0, 1.0);
        return pow(1.0 - NdotV, 3.0);
      }
      `
    );

    // Modify the final output to overlay the hex web pattern + sheen
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      /* glsl */`
      #include <dithering_fragment>

      // Web-line overlay: darken on the hex lines
      float hexMask = hexPattern(vSuitUV, webPatternScale);
      gl_FragColor.rgb = mix(gl_FragColor.rgb * 0.55, gl_FragColor.rgb, hexMask);

      // Fabric sheen: additive highlight at edges
      // vNormal and vViewPosition are available from Three's standard shader
      vec3 norm = normalize(vNormal);
      // Approximate view direction from transformed position
      float sheen = sheenFactor(norm, normalize(-vViewPosition));
      gl_FragColor.rgb += sheenStrength * sheen * vec3(0.6, 0.6, 1.0);
      `
    );
  };

  // Eye/web-shooter glow — handled as a *separate* MeshBasicMaterial on the
  // sub-mesh.  createEyeMaterial() returns it pre-configured.
  mat.needsUpdate = true;
  return mat;
}

/** Pulsing emissive material for eyes and web-shooters */
export function createEyeMaterial(color = 0xffffff) {
  return new THREE.MeshBasicMaterial({ color, toneMapped: false });
}

/** Call this every frame to animate the suit's time-based effects */
export function tickSuitMaterial(mat, dt) {
  if (mat.userData.time) {
    mat.userData.time.value += dt;
  }
}

/** Call to set eye glow strength (0–1 range, e.g. during web-shoot) */
export function setEyeGlow(mat, intensity) {
  if (mat.userData.eyeGlowIntensity) {
    mat.userData.eyeGlowIntensity.value = intensity;
  }
}
