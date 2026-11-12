/**
 * SceneSetup.js
 * Builds the renderer, camera, lighting, and loads the city OBJ.
 */
import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { pieces, raiseLowBuildings, buildBridgeDetail, colorizeBuildings, tagFacades, dropUnderBridges, smoothBridgeRamps, bridgeProfile, removeFloatingGlass, removeFloatingProps, settleRooftopProps, isBuildingMat, legoMaterial, buildRoofStuds, STUD_RANGE, STUD_NEAR, NIGHT_LEVEL } from './LegoCity.js?v=91';
import { computeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import { settings } from './Settings.js?v=62';
import { GFX, AutoRes, LOW, QUALITY } from './Perf.js?v=20';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries as mergeGeo } from 'three/addons/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

const GROUND_UV = new Set(['asphalt', 'sidewalk', 'path', 'grass', 'concrete', 'paint']);
const GROUND_CHUNK_MATS = new Set([...GROUND_UV, 'water']);
const MAX_CITY_FAR = 16000;
// Stacked ground layers, far enough apart to hold up when viewed from high above
const LIFT = { asphalt: 0.03, paint: 0.08, sidewalk: 0.1, grass: 0.13, path: 0.16, water: -0.05 };
// The map's baked-in trees were exported with every trunk 1.67 m above its own base, so all
// 1,565 of them hovered over the pavement. Sink the tree materials onto the surface below.
const TREE_MATS = new Set(['bark', 'leaves', 'leaves_dark']);
const TREE_SINK = 1.67;

/**
 * Blocks in the map have bare paved lots where a building is missing (or was cleared). Rasterise
 * the city top-down, find paved areas no building, prop or landmark stands on, and put a building
 * on each rectangle of them that sits inside a block (walled by buildings, away from roads).
 */
// ── Baked-city cache ────────────────────────────────────────────────────────────────────────
// Parsing the 68 MB OBJ and re-running the whole clean-up pipeline costs ~12 s on a fast desktop
// and far more on a Chromebook, and its output never changes between visits. The finished tiles
// are kept in IndexedDB, keyed by the OBJ version and this module's own ?v= (which bump.mjs
// changes whenever SceneSetup or LegoCity changes), so a repeat visit only rebuilds the BVHs.
// `?nocitycache` forces the full pipeline.
const CITY_OBJ_V = 12;
const CITY_BAKE_KEY = `obj${CITY_OBJ_V}|${import.meta.url.split('?')[1] ?? 'dev'}`;
const CITY_BAKE_OFF = /[?&]nocitycache\b/.test(location.search);
function openBakeDb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('wob-city', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('bake');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
const idbReq = q => new Promise((res, rej) => { q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
async function readCityBake() {
  if (CITY_BAKE_OFF || !window.indexedDB) return null;
  try {
    const db = await openBakeDb();
    const store = db.transaction('bake').objectStore('bake');
    const meta = await idbReq(store.get('meta'));
    if (!meta || meta.key !== CITY_BAKE_KEY) { db.close(); return null; }
    const tiles = await idbReq(store.getAll(IDBKeyRange.bound('tile:', 'tile:\uffff')));
    db.close();
    if (tiles.length !== meta.count) return null;
    tiles.sort((a, b) => a.i - b.i);
    return { meta, tiles };
  } catch (e) { console.warn('[SceneSetup] city cache read failed:', e?.message); return null; }
}
/** Written one tile per transaction, yielding between tiles, so the menu never hitches. `meta`
 *  is removed first and written last: a half-written bake has no meta and is ignored. */
async function writeCityBake(meta, tiles) {
  if (CITY_BAKE_OFF || !window.indexedDB) return;
  try {
    const db = await openBakeDb();
    await idbReq(db.transaction('bake', 'readwrite').objectStore('bake').clear());
    for (const t of tiles) {
      await idbReq(db.transaction('bake', 'readwrite').objectStore('bake').put(t, 'tile:' + String(t.i).padStart(5, '0')));
      await new Promise(r => setTimeout(r, 30));
    }
    await idbReq(db.transaction('bake', 'readwrite').objectStore('bake').put({ ...meta, key: CITY_BAKE_KEY, count: tiles.length }, 'meta'));
    db.close();
    console.info(`[Perf] city bake cached (${tiles.length} tiles)`);
  } catch (e) { console.warn('[SceneSetup] city cache write failed:', e?.message); }
}

function fillEmptyLots(geoByMat, buildingGeos, bridgeGeos) {
  const C = 3;                                   // grid cell, metres
  const ROAD = new Set(['asphalt', 'paint']), OPEN = new Set(['sidewalk', 'concrete']);
  const PARK = new Set(['grass', 'path', 'water']);
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const [k, e] of geoByMat) if (OPEN.has(k.replace('#nn', ''))) for (const g of e.geos) {
    g.computeBoundingBox(); const b = g.boundingBox;
    x0 = Math.min(x0, b.min.x); z0 = Math.min(z0, b.min.z); x1 = Math.max(x1, b.max.x); z1 = Math.max(z1, b.max.z);
  }
  if (!isFinite(x0)) return;
  const W = Math.ceil((x1 - x0) / C) + 1, H = Math.ceil((z1 - z0) / C) + 1;
  if (W * H > 4e6) return;
  // bits: 1 open paving, 2 road, 4 park, 8 occupied, 16 building wall, 32 keep-out
  const cell = new Uint8Array(W * H);
  const mark = (g, bit, flatOnly, maxY = Infinity, pad = 0) => {
    const a = g.attributes.position.array;
    for (let i = 0; i + 8 < a.length; i += 9) {
      const ys = Math.min(a[i + 1], a[i + 4], a[i + 7]);
      if (ys > maxY) continue;
      if (flatOnly && Math.max(a[i + 1], a[i + 4], a[i + 7]) - ys > 0.5) continue;
      const i0 = Math.max(0, Math.floor((Math.min(a[i], a[i + 3], a[i + 6]) - x0 - pad) / C));
      const i1 = Math.min(W - 1, Math.floor((Math.max(a[i], a[i + 3], a[i + 6]) - x0 + pad) / C));
      const j0 = Math.max(0, Math.floor((Math.min(a[i + 2], a[i + 5], a[i + 8]) - z0 - pad) / C));
      const j1 = Math.min(H - 1, Math.floor((Math.max(a[i + 2], a[i + 5], a[i + 8]) - z0 + pad) / C));
      if ((i1 - i0 + 1) * (j1 - j0 + 1) > 40000) continue;
      for (let x = i0; x <= i1; x++) for (let z = j0; z <= j1; z++) cell[z * W + x] |= bit;
    }
  };
  const bset = new Set(buildingGeos.map(b => b.geo));
  for (const [k, e] of geoByMat) {
    const name = k.replace('#nn', '');
    for (const g of e.geos) {
      if (OPEN.has(name)) mark(g, 1, true, 4);
      else if (ROAD.has(name)) mark(g, 2, true, 4);
      else if (PARK.has(name)) mark(g, 4, true, 6);
      else if (name === 'spawn') mark(g, 32, false, Infinity, 20);
      else mark(g, bset.has(g) ? 8 | 16 : 8, false, 40);
    }
  }
  for (const b of buildingGeos) if (b.landmark) mark(b.geo, 32, false, Infinity, 25);
  for (const g of bridgeGeos) mark(g, 32, false, Infinity, 25);
  const free = i => (cell[i] & 63) === 1;
  // Free cells next to a road are the pavement in front of buildings: keep a walkway
  const near = (x, z, bit, r) => {
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
      const xx = x + dx, zz = z + dz;
      if (xx >= 0 && zz >= 0 && xx < W && zz < H && cell[zz * W + xx] & bit) return true;
    }
    return false;
  };
  const ok = new Uint8Array(W * H);
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) if (free(z * W + x) && !near(x, z, 2 | 4, 2)) ok[z * W + x] = 1;
  // Greedy rectangles over the usable cells
  const used = new Uint8Array(W * H), rects = [];
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    if (!ok[z * W + x] || used[z * W + x]) continue;
    let w = 0; while (x + w < W && ok[z * W + x + w] && !used[z * W + x + w] && w < 14) w++;
    let h = 0;
    grow: while (z + h < H && h < 14) { for (let k = 0; k < w; k++) if (!ok[(z + h) * W + x + k] || used[(z + h) * W + x + k]) break grow; h++; }
    for (let a = 0; a < h; a++) for (let k = 0; k < w; k++) used[(z + a) * W + x + k] = 1;
    if (w < 4 || h < 4) continue;                // under 12 m: not a lot
    // Must sit inside a block: buildings on at least two sides
    let sides = 0;
    const wallAt = (xx, zz) => xx >= 0 && zz >= 0 && xx < W && zz < H && (cell[zz * W + xx] & 16);
    const side = (cells) => cells.some(([xx, zz]) => wallAt(xx, zz));
    const span = (n, f) => Array.from({ length: n }, (_, k) => f(k));
    if (side(span(h, k => [x - 1, z + k]))) sides++;
    if (side(span(h, k => [x + w, z + k]))) sides++;
    if (side(span(w, k => [x + k, z - 1]))) sides++;
    if (side(span(w, k => [x + k, z + h]))) sides++;
    if (sides < 2) continue;
    rects.push([x, z, w, h]);
  }
  if (!rects.length) return;
  // Ground height of each lot from the paving under it
  const keys = [...geoByMat.keys()].filter(k => isBuildingMat(k) && geoByMat.get(k).geos[0]?.attributes.normal);
  if (!keys.length) return;
  const box = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d).toNonIndexed(); g.deleteAttribute('uv'); g.translate(x, y, z); return g; };
  let n = 0;
  for (const [x, z, w, h] of rects) {
    const r = Math.abs(Math.sin((x * 12.9898 + z * 78.233)) * 43758.5453) % 1;
    const bx = x0 + (x + w / 2) * C, bz = z0 + (z + h / 2) * C;
    const sw = w * C - 1.5, sd = h * C - 1.5, ht = 18 + Math.floor(r * 10) * 4.5;
    const key = keys[Math.floor(r * 97) % keys.length];
    const geos = [box(sw, ht, sd, bx, ht / 2 - 0.5, bz)];
    if (ht > 30 && sw > 14 && sd > 14) geos.push(box(sw * 0.7, ht * 0.25, sd * 0.7, bx, ht + ht * 0.125 - 0.5, bz));   // setback
    for (const g of geos) { geoByMat.get(key).geos.push(g); buildingGeos.push({ geo: g, matName: key, bridge: false }); }
    n++;
  }
  console.log(`[SceneSetup] filled ${n} empty lots with buildings`);
}

/**
 * The map's street trees are single green cubes sitting on the pavement. Replace each canopy with
 * a proper street tree: a trunk and a stepped, slightly irregular crown in two greens.
 */
function rebuildTrees(geoByMat) {
  const box = (w, h, d, x, y, z, ry = 0) => {
    const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
    g.deleteAttribute('uv');
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    return g;
  };
  // The map gives every tree two overlapping canopy boxes but only one trunk. After the tree
  // materials are sunk, those old trunk components sit exactly on the ground, so use their
  // bottoms as anchors. Grouping both canopies onto one anchor avoids building two floating
  // trees per original tree (the old code started each new trunk at a canopy bottom).
  const anchors = [];
  for (const g of geoByMat.get('bark')?.geos ?? []) {
    for (const p of pieces(g)) {
      const w = Math.max(p.max[0] - p.min[0], p.max[2] - p.min[2]);
      if (w > 12 || w < 0.4) continue;
      anchors.push({ cx: (p.min[0] + p.max[0]) / 2, cz: (p.min[2] + p.max[2]) / 2, base: p.min[1] });
    }
  }
  const canopies = [];
  for (const key of ['leaves', 'leaves_dark']) {
    const e = geoByMat.get(key);
    if (!e) continue;
    for (const g of e.geos) {
      for (const p of pieces(g)) {
        const w = Math.max(p.max[0] - p.min[0], p.max[2] - p.min[2]);
        if (w > 12 || w < 0.4) continue;
        canopies.push({ cx: (p.min[0] + p.max[0]) / 2, cz: (p.min[2] + p.max[2]) / 2, w, base: p.min[1], top: p.max[1] });
      }
    }
  }
  // Some map trees are planted as close as 1 m apart. Assign each canopy to its nearest trunk
  // instead of collecting everything within a radius, or those clusters steal each other's
  // canopies and leave half-built trees.
  const groups = anchors.map(() => []);
  for (const c of canopies) {
    let best = -1, bestD = Infinity;
    for (let i = 0; i < anchors.length; i++) {
      const a = anchors[i], d = Math.hypot(c.cx - a.cx, c.cz - a.cz);
      if (d < bestD) { bestD = d; best = i; }
    }
    if (best >= 0) groups[best].push(c);
  }
  const light = [], dark = [], bark = [];
  let n = 0;
  for (let i = 0; i < anchors.length; i++) {
    const t = anchors[i], group = groups[i];
    if (!group.length) continue;
    const crownBase = Math.min(...group.map(c => c.base));
    const crownTop = Math.max(...group.map(c => c.top));
    const crownW = Math.max(...group.map(c => c.w));
    const h = (Math.sin(t.cx * 12.9898 + t.cz * 78.233) * 43758.5453) % 1;
    const r = Math.abs(h), ry = r * Math.PI;
    const s = Math.max(2.2, Math.min(crownW, 5.4, (crownTop - crownBase) / 1.155));
    const trunkTop = crownBase + 0.35, trunkBottom = t.base - 0.2;
    bark.push(box(0.45, Math.max(0.8, trunkTop - trunkBottom), 0.45, t.cx, (trunkTop + trunkBottom) / 2, t.cz, ry));
    const y0 = crownBase;
    (r > 0.5 ? dark : light).push(box(s, s * 0.45, s, t.cx, y0 + s * 0.225, t.cz, ry));
    (r > 0.5 ? light : dark).push(box(s * 0.8, s * 0.4, s * 0.8, t.cx + 0.2, y0 + s * 0.62, t.cz - 0.15, ry + 0.4));
    dark.push(box(s * 0.5, s * 0.35, s * 0.5, t.cx - 0.1, y0 + s * 0.98, t.cz + 0.1, ry + 0.8));
    n++;
  }
  if (!n) return;
  const set = (k, geos) => {
    const e = geoByMat.get(k) ?? [...geoByMat.values()].find(v => v.mat?.name === k);
    if (e) e.geos = geos;
  };
  set('leaves', light);
  if (geoByMat.has('leaves_dark')) set('leaves_dark', dark); else light.push(...dark);
  if (geoByMat.has('bark')) set('bark', bark); else light.push(...bark);
  console.log(`[SceneSetup] rebuilt ${n} street trees`);
}

/**
 * The map's ocean sat 8 cm above the beach, so the waterline sliced through the sand and the
 * green shore in long blue/red/green bands. Drop the sea to a proper depth below the shore;
 * the park reservoir (same material, around y 2.4) is left where it is.
 */
const SEA_DROP = 0.3;
function sinkSea(geo) {
  const p = geo.attributes.position, a = p.array;
  for (let t = 0; t + 8 < a.length; t += 9) {
    if (Math.max(a[t + 1], a[t + 4], a[t + 7]) < 2) {
      a[t + 1] -= SEA_DROP; a[t + 4] -= SEA_DROP; a[t + 7] -= SEA_DROP;
    }
  }
  p.needsUpdate = true;
}

/** Road markings and paving sit exactly on the asphalt; lift them a hair so they never flicker. */
function liftGround(g, name) {
  if (LIFT[name]) g.translate(0, LIFT[name], 0);
  if (!GROUND_UV.has(name)) return;
  const pos = g.attributes.position, uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) { uv[i * 2] = pos.getX(i) / 4; uv[i * 2 + 1] = pos.getZ(i) / 4; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

export class SceneSetup {
  constructor(container) {
    this.container = container;
    this._buildRenderer();
    this._buildScene();
    this._buildLights();
    this._buildSkybox();
    // Build the aircraft up front so the swinging controller can receive their meshes as anchors
    // the moment the player spawns (they used to be created lazily on the first tick, after the
    // controller had already been handed the empty list).
    this._buildAir();
    // Start in daytime and cycle day → sunset → night every 4 minutes. Online rooms with a
    // fixed time call lockTime() so everyone in the room sees the same sky.
    this.setTime('day');
    const CYCLE = ['day', 'sunset', 'night'];
    this._timeCycle = setInterval(() => {
      if (this._timeLocked) return;
      this.setTime(CYCLE[(CYCLE.indexOf(this.timeOfDay) + 1) % CYCLE.length]);
    }, 240000);

    window.addEventListener('resize', () => this._onResize());
  }

  // ─── Renderer ────────────────────────────────────────────────────────────
  _buildRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      antialias: GFX.antialias,
      powerPreference: 'high-performance',
    });
    this.quality = QUALITY;
    this._degradeStep = 0;
    this.autoRes = new AutoRes(this.renderer, { onDrop: step => this.degrade(step) });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = GFX.shadows;
    this.renderer.shadowMap.type = GFX.softShadows ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    // Atmospheric depth haze blending into sky horizon
    this.scene.fog = new THREE.FogExp2(0x1a1528, 0.0012); // Exponential atmospheric fog for natural depth

    this.camera = new THREE.PerspectiveCamera(
      70, window.innerWidth / window.innerHeight, 0.08, GFX.far
    );
    this.camera.position.set(0, 5, 10);

    // Setup Postprocessing Composer (UnrealBloom & Cinematic Color Grading) if supported by tier
    this._buildPostProcessing();
    // Render distance (Settings): how far the city is drawn, with the haze ending just before it
    this._baseViewDist = 0;
    const view = () => {
      let d = settings.get('viewDist');
      try { if (localStorage.getItem('viewDist') === null && LOW) d = 650; } catch (e) {}
      this._baseViewDist = d;
      this.camera.far = d + 60;
      this.camera.updateProjectionMatrix();
      if (this.scene.fog?.isFogExp2) {
        // FogExp2 density: target ~d metres for natural falloff
        this.scene.fog.density = Math.max(0.0005, 2.5 / d);
      } else if (this.scene.fog) {
        this.scene.fog.near = Math.min(220, d * 0.3); this.scene.fog.far = d;
      }
    };
    view();
    settings.onChange(k => { if (k === 'viewDist') view(); });
  }

  _buildScene() {
    this.scene.background = new THREE.Color(0x8ecbff);
    // Soft studio reflections so plastic has highlights and metal studs actually look metallic
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.34;
  }

  // ─── Lighting ─────────────────────────────────────────────────────────────
  _buildLights() {
    // Sky/ground bounce keeps faces in shade readable (no black half-faces)
    this.hemi = new THREE.HemisphereLight(0xc4dcff, 0x5a4c40, 0.62);
    this.scene.add(this.hemi);

    this.sunLight = new THREE.DirectionalLight(0xffd8a8, 2.45); // golden afternoon sun
    this.sunLight.position.set(80, 160, 60);
    this.sunLight.castShadow = GFX.shadows;
    this.sunLight.shadow.mapSize.set(GFX.shadowMap, GFX.shadowMap);
    const sc = this.sunLight.shadow.camera;
    sc.near = 1; sc.far = 500;
    sc.left = sc.bottom = -GFX.shadowRange; sc.right = sc.top = GFX.shadowRange;
    this.sunLight.shadow.bias = -0.0004;
    this.sunLight.shadow.normalBias = 0.05;
    this.scene.add(this.sunLight, this.sunLight.target);

    this.fillLight = new THREE.DirectionalLight(0x9fb8ff, 0.22);
    this.fillLight.position.set(-60, 40, -80);
    this.scene.add(this.fillLight);

    // A tiny pool of real street lamps follows the player: warm pools on the asphalt are what
    // make a night street read as lit, and three shadow-less point lights stay cheap. Low tier
    // keeps none and relies on emissive lenses + bloom only.
    this.streetLights = [];
    this._streetLampSpots = [];
    if (GFX.tier !== 'low') {
      const count = GFX.tier === 'ultra' ? 5 : GFX.tier === 'high' ? 4 : 3;
      for (let i = 0; i < count; i++) {
        const l = new THREE.PointLight(0xffcf8a, 0, 22, 1.6);
        l.castShadow = false;
        this.scene.add(l);
        this.streetLights.push(l);
      }
    }
  }

  /** Lamp head positions from the street props, used to place the light pool. */
  setStreetLamps(perches = []) {
    this._streetLampSpots = perches.filter(p => p.kind === 'lamp').map(p => ({ x: p.x, y: p.y - 0.55, z: p.z }));
  }

  /** Keep the warm lamp pool on the nearest lamps around the player. */
  _tickStreetLights(pos) {
    const lights = this.streetLights;
    if (!lights?.length || !this._streetLampSpots.length) return;
    const night = this.timeOfDay === 'night' ? 1 : this.timeOfDay === 'sunset' ? 0.45 : 0;
    if (!night) { for (const l of lights) l.intensity = 0; return; }
    // Re-pick the nearest lamps 4x a second (top-k insertion, no allocation, no full sort)
    this._lampT = (this._lampT ?? 0) - 1;
    if (this._lampT > 0 && this._lampNight === night) return;
    this._lampT = 15; this._lampNight = night;
    const k = lights.length, bp = this._lampBest ??= new Array(k), bd = this._lampBestD ??= new Float64Array(k);
    let n = 0;
    for (const p of this._streetLampSpots) {
      const d = (p.x - pos.x) ** 2 + (p.z - pos.z) ** 2;
      if (d > 170 * 170 || (n === k && d >= bd[k - 1])) continue;
      let j = n < k ? n++ : k - 1;
      while (j > 0 && bd[j - 1] > d) { bd[j] = bd[j - 1]; bp[j] = bp[j - 1]; j--; }
      bd[j] = d; bp[j] = p;
    }
    for (let i = 0; i < k; i++) {
      if (i >= n) { lights[i].intensity = 0; continue; }
      lights[i].position.set(bp[i].x, bp[i].y, bp[i].z);
      lights[i].intensity = 26 * night;
    }
  }

  _buildPostProcessing() {
    this.composer = null;
    if (!GFX.bloom) return;
    try {
      const renderPass = new RenderPass(this.scene, this.camera);
      const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        GFX.bloomStrength ?? 0.5,
        GFX.bloomRadius ?? 0.65,
        GFX.bloomThreshold ?? 0.82
      );
      
      // Cinematic Vignette and subtle contrast grading pass
      const gradeShader = {
        uniforms: {
          tDiffuse: { value: null },
          vignetteDarkness: { value: 0.95 },
          vignetteOffset: { value: 1.1 },
          nightBoost: { value: 0.0 },
        },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform sampler2D tDiffuse;
          uniform float vignetteDarkness;
          uniform float vignetteOffset;
          uniform float nightBoost;
          varying vec2 vUv;
          void main() {
            vec4 col = texture2D(tDiffuse, vUv);
            // Vignette calculation
            vec2 uv = (vUv - vec2(0.5)) * vec2(vignetteOffset);
            float dist = dot(uv, uv);
            col.rgb *= clamp(1.0 - dist * vignetteDarkness, 0.0, 1.0);
            
            // Subtle cinematic contrast & saturation enhancement
            col.rgb = pow(col.rgb, vec3(0.96)); // gentle contrast lift
            gl_FragColor = col;
          }
        `
      };
      const gradePass = new ShaderPass(gradeShader);

      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(renderPass);
      this.composer.addPass(bloomPass);
      this.composer.addPass(gradePass);
      this.bloomPass = bloomPass;
      this.gradePass = gradePass;
      console.info('[SceneSetup] Post-processing initialized with UnrealBloom and Cinematic Color Grading');
    } catch (err) {
      console.warn('[SceneSetup] Post-processing initialization failed, falling back to direct render:', err);
      this.composer = null;
    }
  }

  /** Pin the sky to one time (online rooms); stops the automatic day/night cycle. */
  lockTime(time) { this._timeLocked = true; this.setTime(time); }

  /** Story time-of-day lighting. Day is also the reset state after a night mission. */
  setTime(time) {
    this.timeOfDay = time;
    const u = this.sky.material.uniforms;
    if (time === 'night') {
      // Primary visual target: rich cinematic twilight/night with deep purple/navy skies and warm city bounce
      u.horizon.value.setRGB(0.44, 0.22, 0.48); // twilight magenta/violet horizon glow
      u.zenith.value.setRGB(0.08, 0.05, 0.16);  // deep night violet-indigo
      u.sunCol.value.setRGB(0.95, 0.75, 0.9);   // soft moon/dusk rim
      this.scene.background.set(0x120e24);
      if (this.scene.fog.isFogExp2) {
        this.scene.fog.color.set(0x181226);
        this.scene.fog.density = 0.0014;
      } else if (this.scene.fog) {
        this.scene.fog.color.set(0x181226);
      }
      this.hemi.color.set(0x7890cc);         // cool ambient sky fill
      this.hemi.groundColor.set(0x402518);   // warm golden street reflection bounce
      this.hemi.intensity = 0.65;
      this.sunLight.color.set(0x8faee0);     // moonlight
      this.sunLight.intensity = 0.95;
      this.fillLight.color.set(0xf5a045);    // warm city-wide neon/street ambient fill
      this.fillLight.intensity = 0.55;
      this._sunOffset = [-100, 90, -60];
      if (this.gradePass) this.gradePass.uniforms.nightBoost.value = 1.0;
      NIGHT_LEVEL.value = 1;
      this.renderer.toneMappingExposure = 0.95;
      this.scene.environmentIntensity = 0.5;
    } else if (time === 'sunset') {
      u.horizon.value.setRGB(1.0, 0.55, 0.32);
      u.zenith.value.setRGB(0.25, 0.28, 0.62);
      u.sunCol.value.setRGB(1.0, 0.6, 0.25);
      this.scene.background.set(0xd98a6a);
      if (this.scene.fog.isFogExp2) {
        this.scene.fog.color.set(0x60322c);
        this.scene.fog.density = 0.0012;
      } else if (this.scene.fog) {
        this.scene.fog.color.set(0xf0a27a);
      }
      this.hemi.color.set(0xffc8a0); this.hemi.groundColor.set(0x8a6a60); this.hemi.intensity = 1.4;
      this.sunLight.color.set(0xffa060); this.sunLight.intensity = 2.4;
      this.fillLight.color.set(0x9fb8ff); this.fillLight.intensity = 0.22;
      this._sunOffset = [140, 60, 40];
      if (this.gradePass) this.gradePass.uniforms.nightBoost.value = 0.0;
      NIGHT_LEVEL.value = 0.55;
      this.renderer.toneMappingExposure = 0.88;
      this.scene.environmentIntensity = 0.4;
    } else {
      u.horizon.value.setRGB(0.88, 0.85, 0.92);
      u.zenith.value.setRGB(0.20, 0.42, 0.84);
      u.sunCol.value.setRGB(1.0, 0.92, 0.75);
      this.scene.background.set(0x8ecbff);
      if (this.scene.fog.isFogExp2) {
        this.scene.fog.color.set(0xa0b8dc);
        this.scene.fog.density = 0.0008;
      } else if (this.scene.fog) {
        this.scene.fog.color.set(0xd8d4e6);
      }
      this.hemi.color.set(0xc4dcff); this.hemi.groundColor.set(0x5a4c40); this.hemi.intensity = 0.72;
      this.sunLight.color.set(0xfff0d0); this.sunLight.intensity = 2.6;
      this.fillLight.color.set(0x9fb8ff); this.fillLight.intensity = 0.3;
      this._sunOffset = [130, 120, 80];
      if (this.gradePass) this.gradePass.uniforms.nightBoost.value = 0.0;
      NIGHT_LEVEL.value = 0.08;
      this.renderer.toneMappingExposure = 0.8;
      this.scene.environmentIntensity = 0.34;
    }
  }

  /** Keep the shadow-casting sun centred on the player. */
  followSun(p) {
    (this._followPos ??= new THREE.Vector3()).copy(p);
    this.sunLight.target.position.copy(p);
    const o = this._sunOffset ?? [130, 120, 80]; // lower sun = longer, prettier shadows
    this.sunLight.position.set(p.x + o[0], p.y + o[1], p.z + o[2]);
  }

  // ─── Skybox (gradient + stars) ────────────────────────────────────────────
  _buildSkybox() {
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      uniforms: {
        horizon: { value: new THREE.Color(0.93, 0.86, 0.82) },
        zenith: { value: new THREE.Color(0.22, 0.45, 0.86) },
        sunCol: { value: new THREE.Color(1.0, 0.9, 0.7) },
      },
      fragmentShader: `
        uniform vec3 horizon;
        uniform vec3 zenith;
        uniform vec3 sunCol;
        varying vec3 vDir;
        void main() {
          float t = clamp(vDir.y, 0.0, 1.0);
          vec3 col = mix(horizon, zenith, pow(t, 0.6));
          // Sun: wide glow + bright disc
          vec3 sunDir = normalize(vec3(0.67, 0.62, 0.41));
          float d = max(dot(vDir, sunDir), 0.0);
          col += sunCol * (pow(d, 48.0) * 0.45 + pow(d, 900.0) * 1.6);
          // Paler band near the horizon
          col = mix(col, horizon * 1.05, smoothstep(0.25, 0.0, vDir.y) * 0.5);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(3500, 24, 16), skyMat);
    this.sky.renderOrder = -1;
    this.scene.add(this.sky);
    this._buildClouds();
  }

  /** Chunky LEGO-brick clouds drifting high over the city. */
  _buildClouds() {
    const pieces = [];
    const rnd = (a, b) => a + Math.random() * (b - a);
    for (let c = 0; c < 36; c++) {
      const cx = 483 + rnd(-1600, 1600), cz = 1473 + rnd(-1600, 1600), cy = rnd(320, 460);
      const n = 3 + Math.floor(Math.random() * 4);
      for (let i = 0; i < n; i++) {
        const w = rnd(40, 90), h = rnd(14, 24), dpt = rnd(30, 60);
        const g = new THREE.BoxGeometry(w, h, dpt);
        g.translate(cx + rnd(-50, 50), cy + (i % 2) * h * 0.6, cz + rnd(-30, 30));
        pieces.push(g);
      }
    }
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, emissive: 0xdde8f5, emissiveIntensity: 0.35, fog: false });
    this.clouds = new THREE.Mesh(mergeGeo(pieces), mat);
    this.scene.add(this.clouds);
  }

  /** Per-frame ambience (drifting clouds). */
  tick(dt) {
    if (this.clouds) this.clouds.position.x += dt * 3;
    this._tickStreetLights(this._followPos ?? this.camera.position);
    if (!this.air) this._buildAir();
    const t = (this._airT = (this._airT ?? 0) + dt);
    for (const a of this.air) {
      const ang = a.phase + t * a.speed;
      a.mesh.position.set(a.cx + Math.cos(ang) * a.r, a.y + Math.sin(t * 0.3 + a.phase) * a.bob, a.cz + Math.sin(ang) * a.r);
      a.mesh.rotation.y = -ang + (a.speed > 0 ? Math.PI : 0);
      if (a.rotor) a.rotor.rotation.y += dt * 30;
      if (a.beacon) a.beacon.visible = (t * 1.2 + a.phase) % 1 < 0.15;
    }
  }

  /** Airliners circling high over the city, and news/tour helicopters lower down. */
  _buildAir() {
    this.air = [];
    const M = (c, e = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.45, metalness: 0.2, emissive: e ? c : 0, emissiveIntensity: e });
    const white = M(0xf2f4f6), blue = M(0x1d4f9c), grey = M(0x5a6068), glass = M(0x203040), red = M(0xff2a2a, 2);
    const add = (g, w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); g.add(b); return b; };
    const cx = 483, cz = 1473;
    for (let i = 0; i < 4; i++) {
      const g = new THREE.Group();
      add(g, 4, 4, 40, white, 0, 0, 0);              // fuselage
      add(g, 4.1, 1.2, 40.1, blue, 0, -0.8, 0);      // livery stripe
      add(g, 3.4, 2.4, 3, glass, 0, 0.5, -20.5);     // cockpit
      add(g, 44, 0.6, 7, white, 0, -0.6, 2);         // wings
      add(g, 14, 0.5, 4, white, 0, 0.6, 18);         // tailplane
      add(g, 0.6, 7, 5, blue, 0, 4.5, 18);           // fin
      for (const s of [-1, 1]) add(g, 2.4, 2.4, 6, grey, s * 9, -2.2, 0);   // engines
      const beacon = add(g, 0.8, 0.8, 0.8, red, 0, -2.4, 0);
      this.scene.add(g);
      this.air.push({ mesh: g, beacon, kind: 'plane', cx: cx + (i - 1.5) * 300, cz, r: 1200 + i * 250, y: 380 + i * 60, bob: 4, speed: (i % 2 ? -1 : 1) * (0.05 - i * 0.006), phase: i * 1.7 });
    }
    for (let i = 0; i < 3; i++) {
      const g = new THREE.Group();
      const body = i === 0 ? blue : i === 1 ? M(0xc22a1d) : white;
      add(g, 2.6, 2.6, 5, body, 0, 0, 0);
      add(g, 2.4, 1.6, 1.4, glass, 0, 0.3, -2.8);
      add(g, 0.7, 0.7, 6, body, 0, 0.6, 5);           // tail boom
      add(g, 0.2, 2, 1.2, grey, 0, 1.4, 7.6);        // tail rotor fin
      for (const s of [-1, 1]) add(g, 0.2, 0.2, 5, grey, s * 1.1, -1.8, 0);   // skids
      const rotor = new THREE.Group(); rotor.position.y = 1.8;
      add(rotor, 13, 0.12, 0.6, grey, 0, 0, 0); add(rotor, 0.6, 0.12, 13, grey, 0, 0, 0);
      g.add(rotor);
      const beacon = add(g, 0.4, 0.4, 0.4, red, 0, -1.4, 2);
      this.scene.add(g);
      this.air.push({ mesh: g, rotor, beacon, kind: 'heli', cx: cx + (i - 1) * 500, cz: cz + (i - 1) * 400, r: 230 + i * 90, y: 96 + i * 22, bob: 8, speed: (i % 2 ? -1 : 1) * 0.12, phase: i * 2.1 });
    }
    // Two news choppers low enough over Midtown that a rooftop swing can actually reach them.
    for (let i = 0; i < 2; i++) {
      const g = new THREE.Group();
      const body = i ? M(0xc22a1d) : M(0x1d4f9c);
      add(g, 2.6, 2.6, 5, body, 0, 0, 0);
      add(g, 2.4, 1.6, 1.4, glass, 0, 0.3, -2.8);
      add(g, 0.7, 0.7, 6, body, 0, 0.6, 5);
      add(g, 0.2, 2, 1.2, grey, 0, 1.4, 7.6);
      for (const s of [-1, 1]) add(g, 0.2, 0.2, 5, grey, s * 1.1, -1.8, 0);
      const rotor = new THREE.Group(); rotor.position.y = 1.8;
      add(rotor, 13, 0.12, 0.6, grey, 0, 0, 0); add(rotor, 0.6, 0.12, 13, grey, 0, 0, 0);
      g.add(rotor);
      const beacon = add(g, 0.4, 0.4, 0.4, red, 0, -1.4, 2);
      // A searchlight cone makes the low chopper readable from the street at night.
      const lamp = new THREE.Mesh(new THREE.ConeGeometry(4.5, 26, 12, 1, true),
        new THREE.MeshBasicMaterial({ color: 0xfff1c4, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      lamp.position.set(0, -12, -6);
      lamp.rotation.x = 0.22;
      g.add(lamp);
      this.scene.add(g);
      this.air.push({ mesh: g, rotor, beacon, kind: 'heli', cx: cx + (i ? 120 : -90), cz: cz + (i ? -70 : 150), r: 120 + i * 60, y: 62 + i * 16, bob: 5, speed: (i ? -1 : 1) * 0.18, phase: 0.8 + i * 2.4 });
    }
    // Published to the controller so a web can attach to these moving anchors.
    this.airTargets = this.air.map(a => ({ node: a.mesh, kind: a.kind }));
  }

  /**
   * Raise every aircraft's flight circle above the tallest building it passes over, so nothing
   * flies through the skyline. Run once after the city loads (one-off raycasts, no per-frame cost).
   */
  clearAirOfBuildings(meshes) {
    if (!this.air || !meshes?.length) return;
    const ray = new THREE.Raycaster(), o = new THREE.Vector3(), down = new THREE.Vector3(0, -1, 0);
    ray.firstHitOnly = true;
    for (const a of this.air) {
      let top = 0;
      const halfW = a.kind === 'plane' ? 24 : 8;   // wingspan / rotor reach either side of the path
      for (let k = 0; k < 96; k++) {
        const ang = (k / 96) * Math.PI * 2, x = a.cx + Math.cos(ang) * a.r, z = a.cz + Math.sin(ang) * a.r;
        for (const off of [-halfW, 0, halfW]) {
          ray.set(o.set(x + Math.cos(ang) * off, 1500, z + Math.sin(ang) * off), down);
          const hit = ray.intersectObjects(meshes, false)[0];
          if (hit) top = Math.max(top, hit.point.y);
        }
      }
      const clearance = (a.kind === 'plane' ? 60 : 18) + a.bob;
      if (a.y < top + clearance) a.y = top + clearance;
    }
  }

  // ─── Ground plane (catches player below city geometry) ────────────────────
  _buildGround() {
    const geo = new THREE.PlaneGeometry(12000, 12000, 1, 1);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x111118, roughness: 0.95, metalness: 0.0,
    });
    const ground = new THREE.Mesh(geo, mat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(890, -0.08, 1760); // centered on city map extents
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  // ─── City OBJ loader (async) ───────────────────────────────────────────────
  /**
   * Loads city_map.obj + city_map.mtl and adds them to the scene.
   * @param {function(number, string): void} onProgress  — frac 0→1, message
   * @returns {Promise<THREE.Group>} the loaded city group
   */
  async loadCity(onProgress = () => {}) {
    const tLoad = performance.now();
    const stages = {}; let tMark = tLoad;
    const mark = k => { const n = performance.now(); stages[k] = Math.round(n - tMark); tMark = n; };
    onProgress(0, 'Loading city materials...');

    // 1. Load MTL first
    const mtlLoader = new MTLLoader();
    mtlLoader.setPath('assets/models/');
    let materials;
    try {
      materials = await new Promise((res, rej) =>
        mtlLoader.load('city_map.mtl?v=12', res, undefined, rej)
      );
      materials.preload();
    } catch (e) {
      console.warn('[SceneSetup] MTL load failed, using defaults:', e.message);
    }

    // Shared by the full pipeline and the cached path: one finished tile geometry → one mesh.
    const mergedGroup = new THREE.Group();
    const chunks = [];
    const CELL = 400, matCache = new Map();
    const addTile = (srcMat, merged, cx, cz, globalGround) => {
      if (!matCache.has(srcMat)) matCache.set(srcMat, legoMaterial(srcMat));
      const mat = matCache.get(srcMat);
      // Some buildings in the OBJ are wound inside-out; single-sided faces would be invisible
      // from the street and raycasts (collision) would pass straight through them.
      // Road markings and walkways sit flush on the asphalt; pull them forward to stop flicker
      // Tie-breaks for coplanar surfaces: decals and upper layers win, trims and seams lose
      const OFFSET = { paint: [-4, -8], sidewalk: [-2, -4], path: [-3, -6], grass: [-2, -4], window: [-2, -4], glass_blue: [-2, -4], seam: [2, 6], concrete: [1, 3] };
      const off = OFFSET[mat?.name];
      if (off) {
        mat.polygonOffset = true;
        [mat.polygonOffsetFactor, mat.polygonOffsetUnits] = off;
      }
      // Each 400 m tile needs its own material so it can fade over the draw-distance band.
      const tileMat = mat.clone();
      tileMat.onBeforeCompile = mat.onBeforeCompile;
      tileMat.customProgramCacheKey = mat.customProgramCacheKey;
      const mesh = new THREE.Mesh(merged, tileMat);
      mesh.castShadow    = !GROUND_CHUNK_MATS.has(srcMat?.name);
      mesh.receiveShadow = true;
      mesh.userData.tile = { matName: srcMat?.name ?? null, cx, cz, globalGround: !!globalGround };
      // Ground tiles stay opaque and visible: Three.js already frustum-culls them, and the
      // camera far plane plus fog limit their view range. Distance-fading by tile center creates
      // holes in the floor when a high camera can still see the tile itself.
      const distanceFaded = !globalGround && !GROUND_CHUNK_MATS.has(srcMat?.name);
      if (distanceFaded) {
        tileMat.transparent = true;
        tileMat.opacity = 0;
        tileMat.depthWrite = false;
        mesh.visible = false;
        mesh.userData.chunk = { x: (cx + 0.5) * CELL, z: (cz + 0.5) * CELL, alpha: 0 };
        chunks.push(mesh);
      }
      mergedGroup.add(mesh);
      return mesh;
    };
    const finishCity = () => {
      // Bridge piers (collidable, part of the city) and railings/lamps/lane lines (decoration)
      if (this.bridges?.length) {
        const { piers, deco } = buildBridgeDetail(this.bridges);
        piers.geometry.computeBoundsTree?.();
        mergedGroup.add(piers);
        this.scene.add(deco);
      }
      this.scene.add(mergedGroup);
      this.cityGroup = mergedGroup;
      this.chunks = chunks;
      this._chunkCellSize = CELL;
      this._chunkLast = performance.now();
      console.info(`[SceneSetup] ${chunks.length} city chunks fading with distance`);
      mark('finish');
      onProgress(0.95, 'Snapping on roof studs…');
      // Kept out of cityGroup so collision raycasts don't test every stud
      // 70k individual studs are a high-only luxury: medium and low skip them.
      if (GFX.studs) this.roofStuds = buildRoofStuds(mergedGroup.children, new THREE.Vector3(483, 0, 1473));
      if (this.roofStuds) this.scene.add(this.roofStuds);
      mark('studs');
      onProgress(1, 'City ready');
      this.loadTiming = { stages, totalMs: Math.round(performance.now() - tLoad), drawCalls: mergedGroup.children.length };
      window.__loadTiming = this.loadTiming;
      console.info(`[Perf] city ready in ${this.loadTiming.totalMs} ms · ${this.loadTiming.drawCalls} merged meshes${stages.cacheRead != null ? ' (from cache)' : ''}`);
      return mergedGroup;
    };

    // 1b. A bake from an earlier visit skips the download, the parse and the whole pipeline.
    const bake = materials ? await readCityBake() : null;
    if (bake) {
      mark('cacheRead');
      onProgress(0.6, 'Unpacking city…');
      this.bridges = bake.meta.bridges.map(b => ({ ...b, f: bridgeProfile(b.pts) }));
      for (const t of bake.tiles) {
        const g = new THREE.BufferGeometry();
        for (const [name, a] of Object.entries(t.attrs)) g.setAttribute(name, new THREE.BufferAttribute(a.array, a.itemSize, a.normalized));
        g.computeBoundingBox(); g.computeBoundingSphere();
        g.computeBoundsTree();
        addTile(t.matName ? materials.create(t.matName) : undefined, g, t.cx, t.cz, t.globalGround);
      }
      mark('cacheBuild');
      return finishCity();
    }

    // 2. Load OBJ
    const objLoader = new OBJLoader();
    if (materials) objLoader.setMaterials(materials);

    onProgress(0.05, 'Downloading city map…');

    const cityGroup = await new Promise((res, rej) =>
      objLoader.load(
        'assets/models/city_map.obj?v=12',
        res,
        e => {
          if (e.total) onProgress(0.05 + Math.min(1, e.loaded / e.total) * 0.80, 'Loading city map…');
        },
        rej
      )
    );

    mark('fetchParse');
    onProgress(0.87, 'Merging city geometry…');

    // ── Merge geometries by material to reduce 1000+ draw calls → ~20 ──────
    // Collect all geometries keyed by material name
    const geoByMat = new Map();   // matName → { mat, geos[] }
    const buildingGeos = [];
    const bridgeGeos = [];
    const bridgeItems = [];
    const roofPropGeos = [];
    // Baked-in parked cars, floating lamp posts and the giant octagon roof "studs" are replaced
    // by the game's own moving cars, traffic lights, street props and roof studs.
    const SKIP_GROUPS = /^(Traffic|Street_Props|Studs|Boats)$/;   // Boats: replaced by modelled ferries (Ferries.js)
    let skipped = 0;
    let seen = 0;
    cityGroup.traverse(n => {
      // This merge is CPU-bound and can run long on a slow machine. Tick progress so the title
      // screen can tell "still working" from "download hung".
      if (++seen % 500 === 0) onProgress(0.87 + Math.min(0.09, seen / 60000), 'Merging city geometry…');
      if (!n.isMesh) return;
      if (SKIP_GROUPS.test(n.name)) { skipped++; return; }
      n.updateWorldMatrix(true, false);
      const src = n.geometry.index ? n.geometry.toNonIndexed() : n.geometry;
      const pos = src.attributes.position;
      const mats = Array.isArray(n.material) ? n.material : [n.material];
      if (mats.every(m => m?.name === 'spawn')) return;
      const groups = src.groups.length && Array.isArray(n.material)
        ? src.groups
        : [{ start: 0, count: pos.count, materialIndex: 0 }];

      // Keep only position+normal so every geometry merges (mixed UVs make merge return null)
      for (const grp of groups) {
        const m = mats[grp.materialIndex] ?? mats[0];
        if (m?.name === 'spawn') continue;
        // The map's separate window slabs are replaced by windows drawn into the walls
        if (m?.name === 'window') continue;
        const g = new THREE.BufferGeometry();
        const end = Math.min(grp.start + grp.count, pos.count);
        g.setAttribute('position', new THREE.BufferAttribute(pos.array.slice(grp.start * 3, end * 3), 3));
        if (src.attributes.normal) {
          g.setAttribute('normal', new THREE.BufferAttribute(src.attributes.normal.array.slice(grp.start * 3, end * 3), 3));
        }
        g.applyMatrix4(n.matrixWorld);
        liftGround(g, m?.name);
        if (TREE_MATS.has(m?.name)) g.translate(0, -TREE_SINK, 0);
        const bridge = /^Bridge_/.test(n.name);
        if (/^Rooftop_Props/.test(n.name)) roofPropGeos.push(g);
        if (bridge) { bridgeGeos.push(g); bridgeItems.push({ geo: g, name: n.name, matName: m?.name }); }
        if (isBuildingMat(m?.name) || (!bridge && /^(Buildings_|Landmark_)/.test(n.name))) buildingGeos.push({ geo: g, matName: m?.name, bridge, landmark: /^Landmark_/.test(n.name) });
        const key = (m?.name || '__default') + (src.attributes.normal ? '' : '#nn');
        if (!geoByMat.has(key)) geoByMat.set(key, { mat: m, geos: [] });
        geoByMat.get(key).geos.push(g);
      }
    });

    mark('split');
    rebuildTrees(geoByMat);
    this.bridges = smoothBridgeRamps(bridgeItems);
    dropUnderBridges(buildingGeos.filter(b => !b.bridge), bridgeGeos, 6, roofPropGeos);
    raiseLowBuildings(buildingGeos.filter(b => !b.bridge && isBuildingMat(b.matName)), roofPropGeos);
    fillEmptyLots(geoByMat, buildingGeos, bridgeGeos);
    // Props left hanging by the clear-up/raise above are set down on the roof below, or removed
    {
      const propSet = new Set(roofPropGeos);
      const solids = [];
      for (const { geos } of geoByMat.values()) for (const g of geos) if (!propSet.has(g)) solids.push(g);
      settleRooftopProps(roofPropGeos, solids);
    }
    // Bridge stonework (towers, pier platforms) shares the building materials, but it is not a
    // building: colouring it brick-red and drawing window grids on it made the piers under the
    // deck look like houses growing out of the bridge.
    const realBuildings = buildingGeos.filter(b => !b.bridge && isBuildingMat(b.matName));
    colorizeBuildings(realBuildings);
    tagFacades(realBuildings);
    mark('process');
    // Tile each material into 400 m cells: the GPU then skips every tile that is off-screen or
    // past the view distance, instead of drawing the whole city every frame
    const tiles = [];
    for (const { mat: srcMat, geos } of geoByMat.values()) {
      const cells = new Map();
      const wideGround = [];
      for (const g of geos) {
        if (!g.boundingBox) g.computeBoundingBox();
        const b = g.boundingBox;
        // A map-sized ground surface cannot belong to the chunk at its midpoint: doing so makes
        // the entire floor disappear as soon as the camera moves a few chunks away. Keep those
        // few broad ground meshes in a single frustum-culled draw instead of distance-fading them.
        if (GROUND_CHUNK_MATS.has(srcMat?.name) &&
            Math.max(b.max.x - b.min.x, b.max.z - b.min.z) >= CELL * 2) {
          wideGround.push(g);
          continue;
        }
        const cx = Math.floor((b.min.x + b.max.x) / 2 / CELL), cz = Math.floor((b.min.z + b.max.z) / 2 / CELL);
        const k = cx + ',' + cz;
        if (!cells.has(k)) cells.set(k, []);
        cells.get(k).push(g);
      }
      const colorized = geos.some(g => g.attributes.color), tagged = geos.some(g => g.attributes.aFace);
      for (const [k, list] of cells) {
        const [cx, cz] = k.split(',').map(Number);
        tiles.push({ mat: srcMat, geos: list, colorized, tagged, cx, cz });
      }
      if (wideGround.length) tiles.push({ mat: srcMat, geos: wideGround, colorized, tagged, globalGround: true });
    }
    for (const { mat: srcMat, geos, colorized, tagged, cx, cz, globalGround } of tiles) {
      // Bridge stonework is not colourised per building and does not get facade window tags, so
      // it reaches these buckets without `color`/`aFace`. mergeGeometries needs one attribute set
      // for the whole bucket: give the stone pieces a neutral LEGO masonry tint and an empty
      // facade tag (zeros = plain wall, same as a roof), instead of letting the merge drop the
      // whole mesh.
      for (const g of geos) {
        const n = g.attributes.position.count;
        if (colorized && !g.attributes.color) {
          g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(0.72), 3));
        }
        if (tagged && !g.attributes.aFace) {
          g.setAttribute('aFace', new THREE.Int16BufferAttribute(new Int16Array(n * 4), 4));
        }
      }
      const merged = mergeGeometries(geos, false);
      if (!merged) { console.warn('[SceneSetup] merge failed for', srcMat?.name); continue; }
      if (srcMat?.name === 'water') sinkSea(merged);
      if (srcMat?.name === 'paint') thinRoadDashes(merged);
      if (!merged.attributes.normal) merged.computeVertexNormals();
      merged.computeBoundsTree();
      addTile(srcMat, merged, cx, cz, globalGround);
    }

    mark('mergeBvh');
    {
      const GLASS = new Set(['window', 'glass_blue']), SKIP = new Set(['window', 'glass_blue', 'water', 'paint']);
      const ms = mergedGroup.children;
      removeFloatingGlass(ms.filter(m => GLASS.has(m.material?.name)), ms.filter(m => !SKIP.has(m.material?.name)));
      // Bridges (their whole span, plus margin) and Liberty Island keep their hanging parts
      const keepOut = (this.bridges ?? []).map(b => {
        const lo = b.lo - 20, hi = b.hi + 20, l0 = b.latC - b.width / 2 - 30, l1 = b.latC + b.width / 2 + 30;
        return b.ax === 0 ? [lo, hi, l0, l1] : [l0, l1, lo, hi];
      });
      keepOut.push([-330, -110, -530, -350]);
      removeFloatingProps(ms, ms.filter(m => !SKIP.has(m.material?.name)), keepOut);
    }
    mark('floaters');
    console.log(`[SceneSetup] Skipped ${skipped} baked-in prop meshes`);
    // Snapshot the finished tiles for the next visit (array references only; written when idle).
    {
      const tilesOut = mergedGroup.children.map((m, i) => ({
        i, ...m.userData.tile,
        attrs: Object.fromEntries(Object.entries(m.geometry.attributes).map(([k, a]) => [k, { array: a.array, itemSize: a.itemSize, normalized: a.normalized }])),
      }));
      const meta = { bridges: (this.bridges ?? []).map(({ f, ...b }) => b) };
      setTimeout(() => writeCityBake(meta, tilesOut), 6000);
    }
    return finishCity();
  }

  /** Fade nearby 400 m city tiles in, and retire them as the player leaves the draw band. */
  _updateChunks(now) {
    const chunks = this.chunks;
    if (!chunks?.length || !this.camera) return;
    if (now - (this._chunkLast ?? 0) < 90) return;      // 11 Hz is plenty for a distance fade
    const dt = Math.min(0.5, Math.max(0, (now - (this._chunkLast ?? now)) / 1000));
    this._chunkLast = now;
    const p = this.camera.position;
    const height = Math.max(0, p.y); // city ground is approximately y=0
    const baseDist = this._baseViewDist || (this.camera.far - 60);
    // Estimate where the bottom edge of the view reaches the ground. At altitude the camera
    // often looks toward the horizon; adding height once is not enough to keep that ground in
    // the far plane. Use the lower-center frustum ray and leave the normal view distance beyond
    // its ground hit so the city remains visible in front of the horizon.
    const viewDir = this._chunkViewDir ??= new THREE.Vector3();
    const viewUp = this._chunkViewUp ??= new THREE.Vector3();
    const groundRay = this._chunkGroundRay ??= new THREE.Vector3();
    this.camera.getWorldDirection(viewDir);
    viewUp.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
    groundRay.copy(viewDir).addScaledVector(viewUp, -Math.tan(THREE.MathUtils.degToRad(this.camera.fov * 0.5))).normalize();
    const rayDown = Math.max(0, -groundRay.y);
    const groundHitDist = rayDown > 0.04 ? height / rayDown : 0;
    const groundReach = groundHitDist * Math.hypot(groundRay.x, groundRay.z);
    const neededFar = Math.min(this.farCap ?? Infinity, MAX_CITY_FAR, Math.max(
      baseDist + 60 + height,
      groundHitDist + baseDist + 60,
    ));   // farCap: enclosed sets (the cage arena) don't need the city drawn behind their walls
    if (Math.abs(this.camera.far - neededFar) > 5) {
      this.camera.far = neededFar;
      this.camera.updateProjectionMatrix();
    }
    if (this.scene.fog) {
      this.scene.fog.far = Math.max(baseDist, neededFar - 60);
      this.scene.fog.near = Math.min(220, this.scene.fog.far * 0.3);
    }
    const fogFar = this.scene.fog?.far ?? this.camera.far;
    const dist = Math.min(this.camera.far, fogFar + 80);
    const cellSize = this._chunkCellSize ?? 400;
    const show = Math.min(MAX_CITY_FAR, Math.max(dist * 0.9, groundReach + baseDist * 0.9) + cellSize * 0.72);
    const band = Math.max(60, dist * 0.12);
    const k = 1 - Math.exp(-5 * dt);
    for (const mesh of chunks) {
      const c = mesh.userData.chunk;
      if (!c) continue;
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      const target = d <= show ? 1 : d >= show + band ? 0 : 1 - (d - show) / band;
      if (target > 0 && !mesh.visible) mesh.visible = true;
      c.alpha += (target - c.alpha) * k;
      if (c.alpha > 0.995) c.alpha = 1;
      else if (c.alpha < 0.004 && target < 0.01) c.alpha = 0;
      const mat = mesh.material;
      if (c.alpha === 1) {
        if (mat.transparent) { mat.transparent = false; mat.depthWrite = true; mat.needsUpdate = true; }
        mat.opacity = 1;
      } else {
        if (!mat.transparent) { mat.transparent = true; mat.depthWrite = false; mat.needsUpdate = true; }
        mat.opacity = c.alpha;
      }
      if (c.alpha === 0 && target === 0) mesh.visible = false;
    }
    // Roof studs are sub-meter detail. From high up, studs outlive their faded roofs visually
    // and read as floating specks, so keep them for close, low-altitude views only.
    if (this.roofStuds) {
      const studCenterDist = Math.hypot(483 - p.x, 1473 - p.z);
      const on = this._degradeStep < 2 && height < 220 && studCenterDist < 700;
      this.roofStuds.visible = on;
      if (on) for (const cell of this.roofStuds.children) {
        const c = cell.userData.cell;
        const d = Math.hypot(c.x - p.x, c.z - p.z);
        cell.visible = c.lod === 0 ? d < STUD_NEAR : d >= STUD_NEAR && d < STUD_RANGE;
      }
    }
  }

  /**
   * One step down the quality ladder when frames stay slow even after AutoRes has lowered the
   * render scale. Step 1 removes shadow maps (the single biggest per-frame GPU cost); step 2
   * shortens the draw distance and hides roof decoration and clouds.
   */
  degrade(step) {
    const s = Math.max(this._degradeStep, step);
    if (s === this._degradeStep && s > 0) return;
    this._degradeStep = s;
    if (s >= 1) {
      if (this.composer) {
        this._postDisabled = true;
        console.info('[Perf] adaptive: post-processing disabled');
      }
      if (this.renderer.shadowMap.enabled) {
        this.renderer.shadowMap.enabled = false;
        if (this.sunLight) this.sunLight.castShadow = false;
        this.scene.traverse(o => {
          const m = o.material;
          for (const x of (Array.isArray(m) ? m : [m])) if (x) x.needsUpdate = true;
        });
        console.info('[Perf] adaptive: shadows off (sustained low frame rate)');
      }
    }
    if (s >= 2) {
      this.autoRes.setCap(Math.min(0.9, this.autoRes.cap));
      if (this.camera) { this.camera.far = Math.min(this.camera.far, 700); this.camera.updateProjectionMatrix(); }
      if (this.roofStuds) this.roofStuds.visible = false;
      if (this.clouds) this.clouds.visible = false;
      console.info('[Perf] adaptive: shorter draw distance, decoration hidden');
    }
  }

  // ─── Resize ───────────────────────────────────────────────────────────────
  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    if (this.composer) this.composer.setSize(window.innerWidth, window.innerHeight);
  }

  render() {
    this.sky?.position.copy(this.camera.position);
    this.autoRes.tick();
    this._updateChunks(performance.now());
    if (this.composer && !this._postDisabled) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }
}


/** The OBJ's lane dashes are fat square slabs that read as random white tiles: squeeze each
 *  short dash across its narrow side so it becomes a thin painted stripe. Long lines are left alone. */
function thinRoadDashes(geo) {
  const P = geo.attributes.position, a = P.array;
  const dashes = [];
  for (const p of pieces(geo)) {
    const dx = p.max[0] - p.min[0], dz = p.max[2] - p.min[2];
    if (Math.max(dx, dz) > 7 || Math.min(dx, dz) < 0.45) continue;
    dashes.push({ p, dx, dz, x: (p.min[0] + p.max[0]) / 2, z: (p.min[2] + p.max[2]) / 2 });
  }
  // The dashes are near-square, so their own shape can't say which way the road runs (that
  // squeezed some rows the wrong way into stripes lying across the road). Use the nearest
  // dashes in line with it: a lane line is a long run of dashes, a row across the road only a few.
  const cell = 60, grid = new Map(), key = (i, j) => i * 100003 + j;
  for (const d of dashes) { const k = key(Math.floor(d.x / cell), Math.floor(d.z / cell)); (grid.get(k) ?? grid.set(k, []).get(k)).push(d); }
  for (const d of dashes) {
    const { p, dx, dz } = d;
    let runX = 0, runZ = 0;
    const ci = Math.floor(d.x / cell), cj = Math.floor(d.z / cell);
    for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) for (const o of grid.get(key(i, j)) ?? []) {
      if (o === d) continue;
      const ax = Math.abs(o.x - d.x), az = Math.abs(o.z - d.z);
      if (az < 0.6 && ax < cell) runX++;
      else if (ax < 0.6 && az < cell) runZ++;
    }
    // Road runs along the longer run; squeeze the other axis. A tie falls back to the dash shape.
    const axis = runX > runZ ? 2 : runZ > runX ? 0 : (dx < dz ? 0 : 2);
    const short = axis === 0 ? dx : dz;
    const c = (p.min[axis] + p.max[axis]) / 2, k = 0.22 / short;
    for (const t of p.tris) for (let v = 0; v < 3; v++) { const i = (t * 3 + v) * 3 + axis; a[i] = c + (a[i] - c) * k; }
  }
  P.needsUpdate = true;
}
