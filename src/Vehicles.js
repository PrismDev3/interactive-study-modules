/**
 * Vehicle models imported from the LEGO game files (My Lego Game Files/models/vehicles/data):
 * GENERICCAR for street + bridge traffic, GOONSSPEEDBOAT for harbour speedboats.
 * Both are one vertex-coloured mesh with no textures; pure-white vertices are the paint, so each
 * copy is recoloured per fleet colour. Also holds the shared sea waves (height + shader uniform)
 * that boats float on.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const BASE = 'assets/models/vehicles/';
const cache = {};

/** Load a vehicle GLB once, as a bare geometry: bow along +z, wheels/keel on y = 0, scaled to `len` m. */
function loadGeo(file, len, flip = true) {
  return cache[file] ??= new GLTFLoader().loadAsync(BASE + file + '?v=3').then(g => {
    let geo = null;
    g.scene.updateMatrixWorld(true);
    g.scene.traverse(o => { if (o.isMesh && !geo) geo = o.geometry.clone().applyMatrix4(o.matrixWorld); });
    if (flip) geo.rotateY(Math.PI);   // most extracted vehicles face -z; ours face +z
    geo.computeBoundingBox();
    const b = geo.boundingBox, s = len / (b.max.z - b.min.z);
    geo.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
    geo.scale(s, s, s);
    // Float colours so recolouring is a plain write
    const c = geo.attributes.color;
    if (c && c.normalized) {
      const f = new Float32Array(c.count * 4);
      for (let i = 0; i < c.count; i++) { f[i * 4] = c.getX(i); f[i * 4 + 1] = c.getY(i); f[i * 4 + 2] = c.getZ(i); f[i * 4 + 3] = 1; }
      geo.setAttribute('color', new THREE.BufferAttribute(f, 4));
    }
    // Near-white trim (237) is the glass: tint it light blue so it stops blowing out as white X's
    const cc = geo.attributes.color;
    for (let i = 0; i < cc.count; i++) {
      const r = cc.getX(i), g2 = cc.getY(i), b2 = cc.getZ(i);
      if (Math.abs(r - 0.929) < 0.02 && Math.abs(g2 - 0.929) < 0.02 && Math.abs(b2 - 0.929) < 0.02) cc.setXYZ(i, 0.35, 0.55, 0.7);
    }
    geo.computeBoundingBox(); geo.computeBoundingSphere();
    return geo;
  });
}

/** Copy of `geo` with every vertex near colour `from` (linear 0-1) repainted `hex`. */
function repaint(geo, from, hex) {
  const g = geo.clone(), c = g.attributes.color, col = new THREE.Color(hex);
  for (let i = 0; i < c.count; i++) {
    if (Math.abs(c.getX(i) - from[0]) + Math.abs(c.getY(i) - from[1]) + Math.abs(c.getZ(i) - from[2]) < 0.08) c.setXYZ(i, col.r, col.g, col.b);
  }
  return g;
}

/**
 * Real LEGO Marvel street cars (chars/vehicles/<name>/<name>_nxg.glb). The GLB holds every LOD as loose
 * root meshes in the parts' own space, plus empty locator nodes (root, chassis, wheelPos, body, doors).
 * Bake: LOD0 body parts at the body node, the wheel parts at each wheelPos, front turned to +z.
 */
const GAME = 'assets/models/vehicles/game/';
function bakeGameCar(name) {
  return cache[name] ??= new GLTFLoader().loadAsync(GAME + name + '_nxg.glb?v=1').then(g => {
    g.scene.updateMatrixWorld(true);
    const node = n => { let f = null; g.scene.traverse(o => { if (!f && o.name.toLowerCase().replace(/_/g, '') === n) f = o; }); return f; };
    const meshes = g.scene.children.filter(o => o.isMesh);
    const info = meshes.map(m => {
      m.geometry.computeBoundingBox();
      const b = m.geometry.boundingBox, c = b.getCenter(new THREE.Vector3()), sz = b.getSize(new THREE.Vector3());
      const wheel = Math.abs(c.y) < 0.01 && Math.abs(c.z) < 0.01 && sz.y < 0.25 && Math.abs(sz.y - sz.z) < 0.01 && sz.x < 0.13;
      return { m, b, sz, wheel };
    });
    // LOD0 ends where a body part repeats (the next LOD starts over)
    const seen = []; let cut = info.length;
    for (let i = 0; i < info.length; i++) {
      const it = info[i]; if (it.wheel) continue;
      if (seen.some(o => o.b.min.distanceTo(it.b.min) < 0.03 && o.b.max.distanceTo(it.b.max) < 0.03)) { cut = i; break; }
      seen.push(it);
    }
    const lod = info.slice(0, cut);
    const wheels = info.filter(i => i.wheel);
    const tyre = wheels.reduce((a, w) => (w.sz.y > a.sz.y ? w : a), wheels[0]);
    const rim = wheels.find(w => w.sz.x > 0.001 && w.sz.y < tyre.sz.y - 0.02);
    const hubL = wheels.find(w => w.sz.x < 0.001 && w.b.max.x < 0), hubR = wheels.find(w => w.sz.x < 0.001 && w.b.min.x > 0);
    const body = node('body'), dL = node('doorl'), dR = node('doorr');
    // Door panels hinge at their origin and run back along +z (~0.25 long); everything else is body
    const doors = lod.filter(i => !i.wheel && i.sz.z > 0.18 && i.sz.z < 0.36 && i.b.min.z > -0.06 && i.b.min.z < 0.01 && i.sz.x < 0.25 && i.sz.y < 0.25)
      // The hinge turns local y into outward x: the panel sitting lower in y is the left door
      .sort((p, q) => (p.b.min.y + p.b.max.y) - (q.b.min.y + q.b.max.y));
    const parts = [];
    const add = (it, mat) => {
      const geo = it.m.geometry.clone().applyMatrix4(mat);
      for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'color'].includes(k)) geo.deleteAttribute(k);
      parts.push(geo.index ? geo.toNonIndexed() : geo);
    };
    for (const it of lod) {
      if (it.wheel || doors.includes(it)) continue;
      add(it, body.matrixWorld);
    }
    // Doors: build the right door, then mirror it across the car for the left (winding flipped so it isn't culled).
    // Each door is two stacked pieces (upper + lower) in hinge space, already closed: position only.
    const hinge = dR && new THREE.Matrix4().makeTranslation(...dR.getWorldPosition(new THREE.Vector3()).toArray());
    if (hinge) for (const it of doors) {
      add(it, hinge);
      const m = parts[parts.length - 1].clone().applyMatrix4(new THREE.Matrix4().makeScale(-1, 1, 1));
      for (const a of Object.values(m.attributes)) {
        for (let t = 0; t < a.count; t += 3) for (let k = 0; k < a.itemSize; k++) {
          const v = a.array[(t + 1) * a.itemSize + k]; a.array[(t + 1) * a.itemSize + k] = a.array[(t + 2) * a.itemSize + k]; a.array[(t + 2) * a.itemSize + k] = v;
        }
      }
      parts.push(m);
    }
    for (const k of ['fl', 'fr', 'rl', 'rr']) {
      const wp = node('wheelpos' + k); if (!wp) continue;
      const left = wp.getWorldPosition(new THREE.Vector3()).x < 0;
      for (const w of [tyre, rim, left ? hubL : hubR]) if (w) add(w, wp.matrixWorld);
    }
    let geo = mergeGeometries(parts, false);
    // Float RGBA colours so repainting is a plain write
    const c = geo.attributes.color;
    if (c.normalized || c.itemSize !== 4) {
      const f = new Float32Array(c.count * 4);
      for (let i = 0; i < c.count; i++) f.set([c.getX(i), c.getY(i), c.getZ(i), c.itemSize === 4 ? c.getW(i) : 1], i * 4);
      geo.setAttribute('color', new THREE.BufferAttribute(f, 4));
    }
    geo.rotateY(Math.PI);   // game cars face -z; traffic drives along +z (confirmed in play)
    geo.computeBoundingBox();
    const bb = geo.boundingBox, s = 4.3 / (bb.max.z - bb.min.z);
    geo.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
    geo.scale(s, s, s);
    geo.computeBoundingBox(); geo.computeBoundingSphere();
    return geo;
  });
}

/** Most common colour among the body's upper half (the paint), as [r,g,b]. */
function paintColour(geo) {
  const c = geo.attributes.color, p = geo.attributes.position, h = geo.boundingBox.max.y, n = new Map();
  for (let i = 0; i < c.count; i++) {
    if (p.getY(i) < h * 0.35) continue;
    const k = [c.getX(i), c.getY(i), c.getZ(i)].map(v => Math.round(v * 40)).join();
    n.set(k, (n.get(k) || 0) + 1);
  }
  const top = [...n].sort((a, b) => b[1] - a[1])[0][0].split(',').map(v => v / 40);
  return top;
}

const carGeos = new Map();
/** Real game street car (car_fullsize), 4.3 m long, repainted `color`. */
export async function carGeometry(color) {
  if (!carGeos.has(color)) carGeos.set(color, (async () => {
    // Only the full-size car's doors bake cleanly (the taxi and police GLBs leave door holes), so every
    // street car is that model in its fleet colour
    const base = await bakeGameCar('car_fullsize');
    return repaint(base, paintColour(base), color);
  })());
  return carGeos.get(color);
}

/** Imported speedboat (fixed GOONSSPEEDBOAT), ~7.5 m, hull painted `color` (the model's green). */
export async function speedboatGeometry(color) {
  const base = await loadGeo('GOONSSPEEDBOAT.glb', 7.5);
  return repaint(base, [43 / 255, 133 / 255, 0], color);
}

// ---------- Sea waves (shared by boat buoyancy and the water shader) ----------
export const WATER_TIME = { value: 0 };
const WAVES = [   // [dirX, dirZ, wavelength m, amplitude m, speed m/s]
  [1, 0.3, 38, 0.28, 6.5], [-0.4, 1, 21, 0.16, 5.2], [0.7, -0.7, 11, 0.07, 3.8], [0.2, 1, 6.5, 0.035, 2.9],
];
const W = WAVES.map(([x, z, l, a, s]) => { const n = Math.hypot(x, z); return [x / n, z / n, (2 * Math.PI) / l, a, s]; });

/** Sea surface offset (m) from the rest level at (x, z). */
export function waveHeight(x, z, t = WATER_TIME.value) {
  let h = 0;
  for (const [dx, dz, k, a, s] of W) h += a * Math.sin(k * (dx * x + dz * z - s * t));
  return h;
}

/** Adds rolling wave normals and a foamy crest tint to the sea material (flat mesh, no displacement). */
export function addWaterWaves(m) {
  const prevKey = m.customProgramCacheKey?.bind(m);
  m.customProgramCacheKey = () => (prevKey?.() ?? '') + 'sea-waves-v1';
  m.onBeforeCompile = shader => {
    shader.uniforms.uSeaT = WATER_TIME;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSeaW;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvSeaW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    const waves = W.map(([x, z, k, a, s]) =>
      `{ float p = ${k.toFixed(4)} * (${x.toFixed(4)} * vSeaW.x + ${z.toFixed(4)} * vSeaW.z - ${s.toFixed(3)} * uSeaT);
         float c = ${(a * k).toFixed(4)} * cos(p); seaG += vec2(${x.toFixed(4)}, ${z.toFixed(4)}) * c; seaH += ${a.toFixed(4)} * sin(p); }`).join('\n');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSeaW;\nuniform float uSeaT;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        vec2 seaG = vec2(0.0); float seaH = 0.0;
        ${waves}
        // fine ripples on top
        seaG += 0.05 * vec2(sin(vSeaW.x * 1.7 + uSeaT * 2.1), cos(vSeaW.z * 1.9 - uSeaT * 1.7));
        vec3 wn = normalize(vec3(-seaG.x, 1.0, -seaG.y));
        normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
        float crest = smoothstep(0.32, 0.52, seaH);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.85, 0.93, 1.0), crest * 0.35);
        diffuseColor.rgb *= 0.9 + 0.12 * seaH;`);
  };
}
