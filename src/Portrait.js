/**
 * Portrait.js — renders a round portrait of any outfit (suit + gear) with a small offscreen
 * renderer, in the style of the ripped LEGO portrait (yellow disc, white ring, chunky pixels).
 */
import * as THREE from 'three';
import { LegoSpidey } from './LegoSpidey.js?v=183';
import { rigOpts, dressRig, heroOf } from './Characters.js?v=67';
import { applyGear } from './Gear.js?v=65';
import { parseOutfit } from './Outfit.js?v=65';

const RES = 64; // rendered small on purpose, shown scaled up for the pixel look
let ctx = null;
const cache = new Map();
let queue = Promise.resolve();
// The Locker asks for one thumbnail per gear item, all on the same suit. Building a whole new
// figure for each (and never freeing it) is what made opening the Locker stall: keep the last
// plain-suit figure and only swap the gear on it.
let base = null;   // { suit, rig }
const free = rig => rig?.root?.traverse(n => { if (n.isMesh) for (const m of [].concat(n.material ?? [])) m?.dispose(); });
// Let the page draw and handle input between thumbnails instead of rendering a batch in one go.
const breathe = () => new Promise(r => (window.requestIdleCallback ? requestIdleCallback(() => r(), { timeout: 120 }) : setTimeout(r, 16)));

function setup() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = RES;
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, preserveDrawingBuffer: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7050, 1.8));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(1.5, 2, 3);
  scene.add(key);
  const cam = new THREE.PerspectiveCamera(26, 1, 0.1, 20);
  cam.position.set(0.55, 1.75, 2.4);
  cam.lookAt(0, 1.45, 0);
  ctx = { renderer, scene, cam, canvas };
}

/** Data URL for an outfit code; `view` 'back' shows the back (for backpacks/capes). Cached. */
export function portraitURL(code, view = 'front') {
  const ck = `${code}@${view}`;
  if (cache.has(ck)) return cache.get(ck);
  const job = queue.then(async () => {
    if (!ctx) setup();
    const o = parseOutfit(code);
    const glb = String(code).startsWith('glb:');
    await breathe();
    const reusable = !glb && !heroOf(o.suit);
    let rig;
    if (reusable && base?.suit === o.suit) rig = base.rig;
    else {
      rig = glb ? await new LegoSpidey({ skin: code }).load() : dressRig(await new LegoSpidey(rigOpts(o.suit)).load(), o.suit);
      if (reusable) { free(base?.rig); base = { suit: o.suit, rig }; }
    }
    if (glb) rig.update?.(0.016, { speed: 0, grounded: true });
    if (reusable) applyGear(rig, o.gear);
    if (!glb) rig.root.position.y = 0; else rig.root.position.y = 0;
    rig.root.rotation.y = 0.35;
    ctx.scene.add(rig.root);
    // Frame the head whatever the figure's size: big-figs like Venom are taller and wider than a minifig
    rig.root.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(rig.root), top = bb.max.y;
    let big = false; rig.root.traverse(o => { if (o.userData?.bigfig) big = true; });
    const k = big ? Math.max(1, (top - bb.min.y) / 1.9) : 1, dy = big ? top - 1.4 - 0.12 * k : 0;
    if (view === 'back') { ctx.cam.position.set(-0.55 * k, 1.4 + dy, -2.05 * k); ctx.cam.lookAt(0, 1.15 + dy, 0); }
    else if (view === 'head') { ctx.cam.position.set(0.4 * k, 1.75 + dy, 1.75 * k); ctx.cam.lookAt(0, 1.62 + dy, 0); }
    else { ctx.cam.position.set(0.55 * k, 1.75 + dy, 2.4 * k); ctx.cam.lookAt(0, 1.45 + dy, 0); }
    ctx.renderer.render(ctx.scene, ctx.cam);
    ctx.scene.remove(rig.root);
    if (!reusable) free(rig);

    const out = document.createElement('canvas');
    out.width = out.height = RES;
    const g = out.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#ffffff';
    g.beginPath(); g.arc(RES / 2, RES / 2, RES / 2, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#f6c21a';
    g.beginPath(); g.arc(RES / 2, RES / 2, RES / 2 - 4, 0, Math.PI * 2); g.fill();
    g.save();
    g.beginPath(); g.arc(RES / 2, RES / 2, RES / 2 - 4, 0, Math.PI * 2); g.clip();
    g.drawImage(ctx.canvas, 0, 0);
    g.restore();
    return out.toDataURL();
  });
  queue = job.catch(() => {});
  cache.set(ck, job);
  // Suit + gear combinations are effectively unbounded, and every entry holds a data URL.
  // Keep the cache small; the Locker re-renders on demand and renders are serialised.
  while (cache.size > 80) cache.delete(cache.keys().next().value);
  return job;
}
