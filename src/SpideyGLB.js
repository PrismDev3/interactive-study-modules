/**
 * SpideyGLB.js — the extracted LEGO Marvel Spider-Man model, mounted on the
 * procedural animation rig used by LegoSpidey.
 *
 * The GLBs are skinned minifigs split into head/body/arm/leg/hand/face meshes.
 * We bake each mesh in its bind pose, rotate the figure to face +Z (the game's
 * facing convention), scale it to the game's 1.9-unit minifig height and parent
 * the parts at the same shoulder/hip/neck pivots the old OBJ rig used. That
 * keeps all of the existing animation, gear and web-hand code working.
 */
import * as THREE from 'three';
import { polishMesh } from './PlasticFX.js?v=2';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DESIGNS } from './SuitDesigns.js?v=64';
import { paintDesignOnto } from './GLBSuitPaint.js?v=36';
import { variantDef } from './Variants.js?v=67';

const DIR = new URL('../assets/models/spidey/glb/', import.meta.url).href;
const HEIGHT = 1.9;
const MODELS = {
  symbiote: 'spidermanblack.glb',
  ff: 'spidermanff.glb',
  bagman: 'spidermanff.glb',   // FF suit; the paper bag is gear (Gear.js) worn automatically
  iron: 'ironspider.glb',
  superior: 'superiorspiderman.glb',
  peter: 'peterparker.glb',
};
const modelCache = new Map();
const texCache = new Map();

function loadModel(file) {
  if (!modelCache.has(file)) {
    modelCache.set(file, new Promise((res, rej) => {
      new GLTFLoader().load(DIR + file, res, undefined, rej);
    }));
  }
  return modelCache.get(file);
}

const rgb = hex => {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

function paletteFor(key) {
  const v = variantDef(key);
  if (v.red && v.line && v.blue) return v;
  const sw = v.swatch ?? ['#c4161c', '#1f3fa8'];
  const red = rgb(sw[0]), blue = rgb(sw[1]);
  return { ...v, red, blue, line: red.map(c => Math.round(c * 0.55)) };
}

/** Recolour a print texture using the same red/blue/web-line classification as Variants.js. */
function recolourTexture(map, pal, key) {
  const img = map?.image;
  if (!img?.width || !img?.height) return map;
  const ck = `${key}|${map.uuid}|${pal.red}|${pal.blue}|${pal.line}`;
  if (texCache.has(ck)) return texCache.get(ck);
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0, c.width, c.height);
  const data = g.getImageData(0, 0, c.width, c.height), px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], gg = px[i + 1], b = px[i + 2];
    if (px[i + 3] < 8) continue;
    const max = Math.max(r, gg, b), min = Math.min(r, gg, b), d = max - min;
    // Whites, blacks and neutral shading (eyes, outlines) keep their colour.
    if (max < 12 || d < 24 || d / max < 0.2) continue;
    let h = max === r ? ((gg - b) / d) % 6 : max === gg ? (b - r) / d + 2 : (r - gg) / d + 4;
    h = (h * 60 + 360) % 360;
    let target = null, ref = 1;
    if (h >= 300 || h < 40) {
      if (max > 110) { target = pal.red; ref = max / 180; }
      else { target = pal.line; ref = 1; }
    } else if (h >= 170 && h < 300) {
      target = pal.blue; ref = max / 160;
    }
    if (!target) continue;
    px[i] = Math.min(255, target[0] * ref);
    px[i + 1] = Math.min(255, target[1] * ref);
    px[i + 2] = Math.min(255, target[2] * ref);
  }
  g.putImageData(data, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.name = `${map.name || 'print'}_${key}`;
  t.colorSpace = map.colorSpace ?? THREE.SRGBColorSpace;
  t.flipY = map.flipY;
  t.wrapS = map.wrapS; t.wrapT = map.wrapT;
  t.repeat.copy(map.repeat); t.offset.copy(map.offset);
  t.center.copy(map.center); t.rotation = map.rotation;
  t.anisotropy = 8;
  t.needsUpdate = true;
  texCache.set(ck, t);
  return t;
}

function materialFor(src, part, pal, key) {
  const base = Array.isArray(src.material) ? src.material[0] : src.material;
  const mat = base.clone();
  mat.roughness = 0.33;
  if (/^(hair|hat|helmet)/i.test(part)) mat.side = THREE.DoubleSide;   // open underneath
  if (/^face_/.test(part)) { mat.polygonOffset = true; mat.polygonOffsetFactor = -2; mat.polygonOffsetUnits = -4; }   // no flicker on the head
  mat.metalness = 0;
  if (mat.map) mat.map.anisotropy = 8;
  if (pal) {
    if (part.startsWith('body_') || part === 'head_back') {
      if (mat.map) mat.map = recolourTexture(mat.map, pal, `${key}:${part}`);
    } else if (/^(arm_|leg_|hips)/.test(part)) {
      mat.map = null;
      mat.color.setRGB(pal.blue[0] / 255, pal.blue[1] / 255, pal.blue[2] / 255);
    } else if (part === 'head_front' || part.startsWith('hand_')) {
      mat.map = null;
      mat.color.setRGB(pal.red[0] / 255, pal.red[1] / 255, pal.red[2] / 255);
    }
  }
  return mat;
}

/**
 * Build one complete rig for `variantKey`.
 * Returns null when the model cannot be loaded so LegoSpidey can fall back to the old OBJ.
 */
export async function buildSpideyGLB(variantKey = 'classic') {
  const base = String(variantKey).split('|')[0];
  const file = MODELS[base] || 'spiderman.glb';
  const gltf = await loadModel(file);
  const src = gltf.scene;
  src.updateMatrixWorld(true);

  const parts = [], bones = {};
  src.traverse(o => {
    if (o.isMesh) parts.push(o);
    if (o.isBone) bones[o.name] = o;
  });
  if (!parts.length) return null;

  const byName = n => parts.filter(p => p.name === n || p.name.startsWith(n + '_'));
  const one = n => byName(n)[0] || null;

  // Bake the bind pose and face the figure down +Z exactly like the old minifig.
  const rotY = new THREE.Matrix4().makeRotationY(Math.PI);
  const geos = new Map();
  const box = new THREE.Box3();
  for (const p of parts) {
    const g = p.geometry.clone();
    g.applyMatrix4(p.matrixWorld);
    g.applyMatrix4(rotY);
    g.computeBoundingBox();
    box.union(g.boundingBox);
    geos.set(p, g);
  }
  const minY = box.min.y;
  const S = HEIGHT / Math.max(0.0001, box.max.y - minY);

  // Bake the scale/shift once; the same geometry is then parented at its pivot.
  for (const g of geos.values()) {
    g.translate(0, -minY, 0);
    g.scale(S, S, S);
    g.computeBoundingBox();
  }
  const prep = p => geos.get(p);
  const pivotOf = (name, fallback) => {
    const b = bones[name];
    if (!b) return fallback;
    const v = new THREE.Vector3().setFromMatrixPosition(b.matrixWorld);
    v.applyMatrix4(rotY);
    v.y -= minY;
    v.multiplyScalar(S);
    return v;
  };
  const bboxOf = list => {
    const b = new THREE.Box3();
    for (const p of list) {
      const g = prep(p);
      g.computeBoundingBox();
      b.union(g.boundingBox);
    }
    return b;
  };

  // The source rig's left limbs are on -X; the 180° rotation puts them on +X,
  // which is the old rig's side 1. Side -1 (the web-shooting right hand) is +X in source space.
  const arms = {
    [-1]: { mesh: one('arm_right'), hand: one('hand_right'), bone: 'RightArm' },
    [1]:  { mesh: one('arm_left'),  hand: one('hand_left'),  bone: 'LeftArm' },
  };
  const legs = {
    [-1]: { mesh: one('leg_right'), bone: 'RightUpLeg', knee: 'RightLeg' },
    [1]:  { mesh: one('leg_left'),  bone: 'LeftUpLeg',  knee: 'LeftLeg' },
  };
  // Hair / hats ride on the head too (Peter Parker's model has a hair piece)
  const headParts = [...byName('head_front'), ...byName('head_back'), ...parts.filter(p => /^face_\d/.test(p.name) && p.name !== 'face_5'), ...parts.filter(p => /^(hair|hat|helmet)/i.test(p.name))];  // every face piece: eyes, brows, mouth
  const bodyParts = [...byName('body_front'), ...byName('body_back')];
  const hipPart = one('hips');

  const headFallback = bboxOf(headParts);
  const neck = pivotOf('Neck', new THREE.Vector3(0, headFallback.min.y, 0));

  const pal = (base !== 'classic' && file === 'spiderman.glb') ? paletteFor(base) : null;

  const root = new THREE.Group();
  root.position.y = -0.5;
  const spin = new THREE.Group(); spin.position.y = 1.0; root.add(spin);
  const inner = new THREE.Group(); inner.position.y = -1.0; spin.add(inner);
  const body = new THREE.Group(); inner.add(body);
  const torso = new THREE.Group(); body.add(torso);

  const meshes = [];
  const add = (parent, source, part, pivot) => {
    if (!source) return null;
    const g = prep(source);
    if (pivot) g.translate(-pivot.x, -pivot.y, -pivot.z);
    const m = new THREE.Mesh(g, materialFor(source, part, pal, variantKey));
    m.castShadow = true; polishMesh(m);
    m.userData.part = part;
    parent.add(m); meshes.push(m);
    return m;
  };

  // Torso and hips stay in model space so the body lean rotates around the feet,
  // exactly where the old rig's body group pivoted.
  for (const p of bodyParts) add(torso, p, p.name);
  add(body, hipPart, 'hips');

  const head = new THREE.Group();
  head.position.copy(neck);
  torso.add(head);
  for (const p of headParts) add(head, p, p.name, neck);

  const arm = {}, leg = {}, kneeGeo = {}, handLocal = {};
  for (const s of [-1, 1]) {
    const a = arms[s], l = legs[s];
    const ab = bboxOf([a.mesh].filter(Boolean));
    const ap = pivotOf(a.bone, new THREE.Vector3((ab.min.x + ab.max.x) / 2, ab.max.y, (ab.min.z + ab.max.z) / 2));
    arm[s] = new THREE.Group();
    arm[s].position.copy(ap);
    torso.add(arm[s]);
    add(arm[s], a.mesh, a.mesh?.name ?? 'arm', ap);
    const hm = add(arm[s], a.hand, a.hand?.name ?? 'hand', ap);
    if (hm) {
      // The mesh is already in arm-local space, so its centre is the real hand anchor.
      hm.geometry.computeBoundingBox();
      handLocal[s] = hm.geometry.boundingBox.getCenter(new THREE.Vector3());
    } else {
      // Fallback: use the bottom of the arm if the extracted model has no separate hand.
      const am = arm[s].children[0];
      if (am) {
        am.geometry.computeBoundingBox();
        const b = am.geometry.boundingBox;
        handLocal[s] = new THREE.Vector3((b.min.x + b.max.x) / 2, b.min.y, (b.min.z + b.max.z) / 2);
      }
    }

    const lb = bboxOf([l.mesh].filter(Boolean));
    const lp = pivotOf(l.bone, new THREE.Vector3((lb.min.x + lb.max.x) / 2, lb.max.y, (lb.min.z + lb.max.z) / 2));
    leg[s] = new THREE.Group();
    leg[s].position.copy(lp);
    body.add(leg[s]);
    const lm = add(leg[s], l.mesh, l.mesh?.name ?? 'leg', lp);
    if (lm) {
      const knee = pivotOf(l.knee, null);
      const ky = knee && lp ? knee.y - lp.y : 0;
      const pos = lm.geometry.attributes.position;
      kneeGeo[s] = {
        geo: lm.geometry,
        pos: pos.array.slice(),
        nrm: lm.geometry.attributes.normal?.array.slice(),
        ky,
        kz: 0,
      };
    }
  }

  const rig = { root, spin, body, torso, head, arm, leg, meshes, kneeGeo, handLocal };
  // Suits without their own extracted model: paint the hand-made design onto the real model
  if (pal && DESIGNS[base]) {
    try { paintDesignOnto(rig, DESIGNS[base]); } catch (e) { console.warn('[SpideyGLB] suit paint failed', base, e.message); }
  }
  // Iron Spider's extracted head is blank red: paint its mask (eyes, webbing) on
  if (base === 'iron') { try { paintDesignOnto(rig, DESIGNS.iron, { only: /^head/ }); } catch (e) {} }
  if (base === 'peter') {
    // Peter's own look (zip hoodie + striped tee), reddish-brown hair, and his camera
    try { paintDesignOnto(rig, DESIGNS.peterhoodie, { skip: /^(head|face|hair)/ }); } catch (e) {}
    for (const m of meshes) if (/^hair/.test(m.userData.part ?? '')) { m.material = m.material.clone(); m.material.color.setHex(0x7a3a18); }
    const cam = new THREE.Group();
    const black = new THREE.MeshStandardMaterial({ color: 0x16171a, roughness: 0.35 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.13, 0.11), black);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.09, 16), black);
    lens.rotation.x = Math.PI / 2; lens.position.set(0, 0, 0.09);
    const glass = new THREE.Mesh(new THREE.CircleGeometry(0.045, 16), new THREE.MeshStandardMaterial({ color: 0xbfe0ff, roughness: 0.05, metalness: 0.3 }));
    glass.position.set(0, 0, 0.136);
    const flash = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.035, 0.05), new THREE.MeshStandardMaterial({ color: 0xd0d4da, roughness: 0.3 }));
    flash.position.set(-0.05, 0.08, 0.01);
    cam.add(body, lens, glass, flash);
    const hand = handLocal?.[-1] ?? new THREE.Vector3(0, -0.55, 0.05);
    cam.position.copy(hand).add(new THREE.Vector3(0, -0.02, 0.12));
    arm[-1].add(cam);
    rig.camera = cam;
  }
  return rig;
}
