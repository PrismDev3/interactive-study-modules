/**
 * Gear.js — LEGO accessories for Spider-Man, built from simple parts and attached to the rig.
 * Head items sit on rig.head (origin = bottom of the head, head is ~0.57 tall, radius ~0.24).
 * Back items sit on rig.torso (minifig model space: back of torso at z ≈ -0.15, shoulders y ≈ 1.3).
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const GEAR = {
  hood_red:   { name: 'Miles Hood',   slot: 'head', price: 400 },
  hood_white: { name: 'Gwen Hood',    slot: 'head', price: 400 },
  hair_gwen:  { name: 'Gwen Hair',    slot: 'hair', price: 600 },
  headphones: { name: 'Headphones',   slot: 'ears', price: 500 },
  backpack:   { name: 'Backpack',     slot: 'back', price: 800 },
  catpack:    { name: 'Cat Backpack', slot: 'back', price: 2500 },
  cape:       { name: 'Cape',         slot: 'back', price: 1500 },
  tophat:     { name: 'Top Hat',      slot: 'head', price: 700 },
  paperbag:   { name: 'Paper Bag',    slot: 'head', price: 300 },
  waldo:      { name: 'Waldo Arms',   slot: 'back', price: 3000 },
  nowaldo:    { name: 'Hide Iron Arms', slot: 'mod', price: 0 },
};

const plastic = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.32, metalness: 0, ...extra });
const mesh = (geo, color, x = 0, y = 0, z = 0, extra) => {
  const m = new THREE.Mesh(geo, plastic(color, extra));
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
};
const rbox = (w, h, d, r, color, x, y, z) => mesh(new RoundedBoxGeometry(w, h, d, 3, r), color, x, y, z);
const studTop = (color, x, y, z, r = 0.05) => mesh(new THREE.CylinderGeometry(r, r, 0.035, 14), color, x, y + 0.0175, z);

/**
 * Solid head shell (hood / hair) turned on a lathe and open at the front. Built with real
 * thickness — outer skin, inner lining, closed side edges and a closed bottom rim — and drawn
 * double-sided, so no angle ever looks through a missing face.
 * `profile` is [radius, y] from the bottom up in head space (head ≈ 0.243 wide, 0.57 tall).
 */
function shell(profile, gap, outer, inner, rim, thick = 0.03, segs = 32) {
  const g = new THREE.Group();
  const start = gap / 2, len = Math.PI * 2 - gap;
  const outPts = profile.map(([r, y]) => new THREE.Vector2(r, y));
  const inPts = profile.map(([r, y]) => new THREE.Vector2(Math.max(0, r - thick), y));
  const skin = (pts, color) => {
    const m = mesh(new THREE.LatheGeometry(pts, segs, start, len), color);
    m.material.side = THREE.DoubleSide;
    return m;
  };
  g.add(skin(outPts, outer), skin(inPts, inner));

  // Close the two edges of the face opening with a strip between the outer and inner skins
  const edge = phi => {
    const pos = [];
    for (let k = 0; k < profile.length - 1; k++) {
      const a = outPts[k], b = outPts[k + 1], c = inPts[k], d = inPts[k + 1];
      const v = (p, y) => [Math.sin(phi) * p.x, y, Math.cos(phi) * p.x];
      pos.push(...v(a, a.y), ...v(b, b.y), ...v(c, c.y), ...v(b, b.y), ...v(d, d.y), ...v(c, c.y));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    const m = mesh(geo, rim);
    m.material.side = THREE.DoubleSide;
    return m;
  };
  g.add(edge(start), edge(start + len));
  // Bottom rim
  const y0 = profile[0][1];
  const bottom = mesh(new THREE.LatheGeometry([new THREE.Vector2(outPts[0].x, y0), new THREE.Vector2(inPts[0].x, y0)], segs, start, len), rim);
  bottom.material.side = THREE.DoubleSide;
  g.add(bottom);
  // Close the crown: the face opening should stop at the forehead, not run over the top
  const top = profile[profile.length - 1][1];
  // Size the dome from the upper part of the profile (not the shoulder flare)
  const upper = profile.reduce((best, p) => (Math.abs(p[1] - top * 0.7) < Math.abs(best[1] - top * 0.7) ? p : best));
  const r = upper[0] * 0.98;
  const cap = mesh(new THREE.SphereGeometry(r, 28, 12, 0, Math.PI * 2, 0, Math.PI * 0.36), outer, 0, top - r, 0);
  g.add(cap);
  return g;
}

/** LEGO hood: snug cowl over the head that flares onto the shoulders, lined in a second colour. */
function hood(outer, lining, trim) {
  // Profile [radius, y] from the shoulder flare right over the crown. It closes above the
  // head's top stud (~0.63 in head space), so the stud is fully covered, exactly like the
  // moulded hood piece: a full dome with a plain face opening in front.
  // Snug, like the moulded LEGO hood: hugs the head, only a small flare at the shoulders
  // Fitted to the extracted head (0.48 wide, ~0.55 tall above the neck): a close shell, crown just over the stud
  const key = [[0.31, -0.02], [0.3, 0.04], [0.286, 0.1], [0.276, 0.18], [0.274, 0.3], [0.27, 0.4],
    [0.256, 0.48], [0.22, 0.548], [0.157, 0.598], [0.08, 0.624], [0.0, 0.632]];   // lining clears the 0.24 head + print
  // Face opening: a rounded oval on the front, from the chin up to the brow (below the stud)
  const yc = 0.24, halfH = 0.22, halfW = 0.82;
  const gapAt = y => {
    const t = Math.abs((y - yc) / halfH);
    return t >= 1 ? 0 : halfW * Math.pow(1 - t ** 4, 0.25);
  };
  return domeShell(key, gapAt, outer, lining, trim, 0.016, true);
}

/** Closed dome (lathe of `key` [r, y]) with a front opening whose half-angle is gapAt(y); real thickness + trim. */
function domeShell(key, gapAt, outer, lining, trim, thick = 0.035, hem = true) {
  const curve = new THREE.CatmullRomCurve3(key.map(([r, y]) => new THREE.Vector3(r, y, 0)));
  const rows = curve.getPoints(40).map(p => [Math.max(0, p.x), p.y]);
  rows[rows.length - 1][0] = 0;
  const segs = 48;
  const build = (inset) => {
    const pos = [], idx = [];
    rows.forEach(([r, y], k) => {
      const g = gapAt(y), rr = Math.max(0, r - inset);
      for (let j = 0; j <= segs; j++) {
        const a = g + (Math.PI * 2 - 2 * g) * (j / segs);
        pos.push(Math.sin(a) * rr, y, Math.cos(a) * rr);
      }
      if (k) for (let j = 0; j < segs; j++) {
        const a = (k - 1) * (segs + 1) + j, b = a + segs + 1;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  };
  const g = new THREE.Group();
  const skin = (geo, color) => { const m = mesh(geo, color); m.material.side = THREE.DoubleSide; return m; };
  g.add(skin(build(0), outer), skin(build(thick), lining));
  // Rolled trim around the face opening and along the bottom hem
  const edge = [];
  for (const sgn of [1, -1]) {
    const side = rows.filter(([, y]) => gapAt(y) > 0).map(([r, y]) => {
      const a = sgn * gapAt(y);
      return new THREE.Vector3(Math.sin(a) * (r - thick / 2), y, Math.cos(a) * (r - thick / 2));
    });
    edge.push(...(sgn > 0 ? side : side.reverse()));
  }
  const rim = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(edge), 80, thick * 0.62, 8, false), trim);
  g.add(rim);
  if (!hem) return g;
  const [r0, y0] = rows[0], g0 = gapAt(y0);
  const hemPts = [];
  for (let j = 0; j <= 40; j++) {
    const a = g0 + (Math.PI * 2 - 2 * g0) * (j / 40);
    hemPts.push(new THREE.Vector3(Math.sin(a) * (r0 - thick / 2), y0, Math.cos(a) * (r0 - thick / 2)));
  }
  g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hemPts), 60, thick * 0.6, 8, false), trim));
  return g;
}

/** Small pixel-art canvas texture painted per texel by `f(x, y) -> 0xRRGGBB`. */
function pixelTex(w, h, f) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d'), d = g.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const col = f(x, y), i = (y * w + x) * 4;
    d.data[i] = col >> 16; d.data[i + 1] = (col >> 8) & 255; d.data[i + 2] = col & 255; d.data[i + 3] = 255;
  }
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  return t;
}
const texMesh = (geo, map, x = 0, y = 0, z = 0) => {
  const m = mesh(geo, 0xffffff, x, y, z);
  m.material.map = map;
  return m;
};

let catTex = null;
/** Orange tabby head wearing a red Spider-Man mask over the eyes, as chunky pixel art. */
function catHeadTexture() {
  if (catTex) return catTex;
  const W = 64, H = 32;
  catTex = pixelTex(W, H, (x, y) => {
    const phi = ((x + 0.5) / W) * Math.PI * 2, th = ((y + 0.5) / H) * Math.PI;
    let a = phi - Math.PI / 2;                       // 0 = straight ahead (+z)
    a = Math.atan2(Math.sin(a), Math.cos(a));
    const el = Math.PI / 2 - th;                     // + up, - down
    const front = Math.abs(a) < 1.45;
    // Mask: forehead down to just under the eyes
    if (front && el > -0.12 && el < 1.0) {
      for (const s of [-1, 1]) {
        const ex = (a - s * 0.42) / 0.3, ey = (el - 0.12) / 0.2;
        const tilt = ey - s * ex * 0.35;
        const r = ex * ex + tilt * tilt;
        if (r < 1) return 0xf4f4f4;                   // white lens
        if (r < 1.7) return 0x141416;                 // black rim
      }
      // web lines: spokes from between the eyes and rings
      const r = Math.hypot(a, el - 0.1), ang = Math.atan2(el - 0.1, a);
      const spoke = Math.abs(((ang / (Math.PI / 5)) % 1 + 1) % 1 - 0.5) < 0.08 && r > 0.08;
      const ring = Math.abs(((r / 0.28) % 1) - 0.5) < 0.09;
      return spoke || ring ? 0x5c0a0e : 0xc4161c;
    }
    // Cream muzzle and chin under the mask
    if (front && Math.abs(a) < 0.75 && el <= -0.12) return (el < -0.3 && Math.abs(a) < 0.12 && el > -0.42) ? 0xe58aa0 : 0xfbe6c8;
    // Orange fur with darker tabby stripes round the back and sides
    const stripe = Math.abs(((a * 3.2) % 1 + 1) % 1 - 0.5) < 0.14 && el > -0.6;
    return stripe ? 0xc9621a : 0xf0882a;
  });
  return catTex;
}

/** LEGO kitten in Spider-Man mask, sitting up in the bag: body, front paws over the rim, head, ears, tail. */
function legoCat() {
  const g = new THREE.Group();
  const orange = 0xf0882a, stripe = 0xc9621a, cream = 0xfbe6c8, pink = 0xf49ab0;
  // Body sitting in the bag (mostly hidden, shoulders show)
  const body = mesh(new THREE.SphereGeometry(0.15, 20, 14), orange, 0, -0.17, -0.02);
  body.scale.set(1.0, 1.1, 0.85);
  g.add(body);
  g.add(mesh(new THREE.SphereGeometry(0.09, 16, 12), cream, 0, -0.18, 0.08));     // chest
  // Head with the masked pixel face
  const head = texMesh(new THREE.SphereGeometry(0.16, 32, 20), catHeadTexture(), 0, 0.03, 0);
  head.scale.set(1.12, 0.92, 1.0);
  g.add(head);
  // Snout bump
  const snout = mesh(new THREE.SphereGeometry(0.06, 16, 12), cream, 0, -0.04, 0.12);
  snout.scale.set(1.3, 0.75, 0.8);
  g.add(snout);
  g.add(mesh(new THREE.SphereGeometry(0.018, 10, 8), pink, 0, -0.02, 0.17));     // nose
  // Ears poking up out of the mask
  for (const sx of [-1, 1]) {
    const ear = new THREE.Group();
    const outer = mesh(new THREE.ConeGeometry(0.07, 0.13, 4), orange);
    outer.rotation.y = Math.PI / 4;
    const inner = mesh(new THREE.ConeGeometry(0.04, 0.085, 4), pink, 0, -0.01, 0.024);
    inner.rotation.y = Math.PI / 4;
    ear.add(outer, inner);
    ear.position.set(sx * 0.1, 0.17, -0.01);
    ear.rotation.z = -sx * 0.3;
    g.add(ear);
  }
  // Front paws hooked over the bag rim, with toe lines
  for (const sx of [-1, 1]) {
    g.add(rbox(0.085, 0.06, 0.11, 0.025, orange, sx * 0.1, -0.15, 0.13));
    g.add(rbox(0.08, 0.02, 0.03, 0.008, cream, sx * 0.1, -0.165, 0.18));
  }
  // Striped tail curling out of the side of the bag
  const tail = new THREE.Group();
  const pts = [[0.14, -0.2, -0.05], [0.24, -0.12, -0.06], [0.28, 0.0, -0.04], [0.25, 0.08, 0.0]].map(p => new THREE.Vector3(...p));
  tail.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.03, 8, false), orange));
  for (const p of pts.slice(1)) tail.add(mesh(new THREE.SphereGeometry(0.033, 10, 8), stripe, p.x, p.y, p.z));
  g.add(tail);
  return g;
}

/** LEGO backpack: rounded body, front pocket, flap, top handle and shoulder straps. */
function pack(body, accent) {
  const g = new THREE.Group();
  g.add(rbox(0.52, 0.56, 0.22, 0.07, body, 0, 1.02, -0.27));
  g.add(rbox(0.38, 0.22, 0.08, 0.04, accent, 0, 0.9, -0.4));        // pocket
  g.add(rbox(0.46, 0.12, 0.25, 0.04, accent, 0, 1.27, -0.27));      // top flap
  const handle = mesh(new THREE.TorusGeometry(0.07, 0.018, 6, 12, Math.PI), 0x1b1b1f, 0, 1.33, -0.27);
  g.add(handle);
  for (const s of [-1, 1]) {
    g.add(rbox(0.07, 0.05, 0.36, 0.02, 0x1b1b1f, s * 0.19, 1.32, -0.09)); // straps over the shoulders
    g.add(rbox(0.07, 0.4, 0.05, 0.02, 0x1b1b1f, s * 0.19, 1.12, 0.165)); // straps down the front (outside the chest)
    g.add(studTop(body, s * 0.12, 1.33, -0.32));
  }
  return g;
}


/** Brown paper grocery bag pulled over the head: crumpled kraft paper, torn eye holes, marker smile, rolled cuff. */
function paperBagTex(face) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#b8895a'; x.fillRect(0, 0, 256, 256);
  // paper fibres and crease shading
  for (let i = 0; i < 900; i++) {
    x.fillStyle = Math.random() < 0.5 ? 'rgba(90,58,28,0.10)' : 'rgba(255,236,200,0.10)';
    x.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 6, 1);
  }
  x.strokeStyle = 'rgba(80,50,22,0.25)'; x.lineWidth = 2;
  for (let i = 0; i < 6; i++) { x.beginPath(); x.moveTo(Math.random() * 256, 0); x.lineTo(Math.random() * 256, 256); x.stroke(); }
  if (face) {
    const hole = (cx, cy) => {
      x.beginPath();
      for (let k = 0; k <= 14; k++) { const a = k / 14 * Math.PI * 2, r = 19 + (k % 2 ? 3 : -2); x.lineTo(cx + Math.cos(a) * r * 0.85, cy + Math.sin(a) * r); }
      x.closePath(); x.fillStyle = '#120c08'; x.fill();
      x.strokeStyle = '#7a5530'; x.lineWidth = 3; x.stroke();
    };
    hole(88, 118); hole(168, 118);
    // marker smile + nose dash
    x.strokeStyle = '#2a1a10'; x.lineWidth = 7; x.lineCap = 'round';
    x.beginPath(); x.moveTo(76, 178); x.quadraticCurveTo(128, 214, 182, 176); x.stroke();
    x.lineWidth = 5; x.beginPath(); x.moveTo(128, 140); x.lineTo(124, 156); x.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function paperBag() {
  const g = new THREE.Group();
  const W = 0.6, D = 0.56, H = 0.7, y0 = -0.04;
  const geo = new THREE.BoxGeometry(W, H, D, 8, 10, 8);
  // Crumple: jitter each vertex a little, pinch the middle of every side in, flare the cuff
  const p = geo.attributes.position, v = new THREE.Vector3();
  const seed = (a, b, c) => { const s = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return s - Math.floor(s) - 0.5; };
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const t = (v.y + H / 2) / H;                                  // 0 at the open neck, 1 at the folded top
    const pinch = 1 - 0.06 * Math.sin(t * Math.PI) - (t > 0.9 ? (t - 0.9) * 0.6 : 0);
    v.x *= pinch; v.z *= pinch;
    v.x += seed(v.x, v.y, v.z) * 0.022; v.y += seed(v.y, v.z, v.x) * 0.012; v.z += seed(v.z, v.x, v.y) * 0.022;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  geo.translate(0, y0 + H / 2, 0);
  const side = new THREE.MeshStandardMaterial({ map: paperBagTex(false), roughness: 0.95, side: THREE.DoubleSide });
  const front = new THREE.MeshStandardMaterial({ map: paperBagTex(true), roughness: 0.95, side: THREE.DoubleSide });
  const none = new THREE.MeshBasicMaterial({ visible: false });   // open at the neck
  const bag = new THREE.Mesh(geo, [side, side, side, none, front, side]);
  bag.castShadow = true;
  g.add(bag);
  // Rolled cuff around the neck opening
  const cuff = new THREE.Mesh(new THREE.BoxGeometry(W + 0.03, 0.06, D + 0.03, 1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x9c7046, roughness: 1, side: THREE.DoubleSide }));
  cuff.geometry.translate(0, y0 + 0.03, 0);
  const hollow = new THREE.Mesh(new THREE.BoxGeometry(W - 0.02, 0.07, D - 0.02), none);
  g.add(cuff);
  // Folded top seam
  const seam = new THREE.Mesh(new THREE.BoxGeometry(W * 0.86, 0.025, 0.05), new THREE.MeshStandardMaterial({ color: 0xa47648, roughness: 1 }));
  seam.position.set(0, y0 + H - 0.02, 0); seam.rotation.z = 0.03;
  g.add(seam);
  void hollow;
  g.rotation.set(0.02, 0.04, -0.03);   // never sits perfectly straight
  return g;
}

export function bobHair(blonde = 0xf2cf62, under = 0xd9ae45) {
  // Molded LEGO bob, swept to one side: rounded crown, flicked ends, a long swoop of bangs
  // across the forehead, a longer strand on one side and a shorter cut on the other.
  const g = new THREE.Group();
  const profile = [[0.3, 0.16], [0.288, 0.22], [0.29, 0.33], [0.282, 0.45], [0.25, 0.56], [0.17, 0.645], [0.0, 0.68]];
  // Solid crown all the way over the top; open only at the face, below the hairline
  const gapAt = y => (y < 0.44 ? 0.95 : y < 0.53 ? 0.95 * Math.sqrt(1 - ((y - 0.44) / 0.09) ** 2) : 0);
  g.add(domeShell(profile, gapAt, blonde, under, under, 0.035, true));
  // Swept bangs: a slab across the forehead that dips down towards one side
  const bangs = rbox(0.4, 0.12, 0.11, 0.045, blonde, 0.03, 0.555, 0.2);
  bangs.rotation.set(-0.3, 0, -0.28);
  g.add(bangs);
  const sweep = rbox(0.15, 0.1, 0.1, 0.04, blonde, -0.17, 0.47, 0.21);
  sweep.rotation.set(-0.25, 0, -0.65);
  g.add(sweep);
  bangs.userData.bangs = sweep.userData.bangs = true;
  // Longer strand behind one cheek, shorter cut on the other side
  const strand = rbox(0.075, 0.28, 0.12, 0.035, blonde, -0.27, 0.27, 0.02);
  strand.rotation.z = 0.1;
  g.add(strand);
  const short = rbox(0.07, 0.15, 0.11, 0.03, blonde, 0.27, 0.37, 0.02);
  short.rotation.z = -0.1;
  g.add(short);
  // Flicked tips at the back of the bob
  for (const sx of [-1, 1]) {
    const tip = rbox(0.12, 0.07, 0.16, 0.03, blonde, sx * 0.23, 0.16, -0.12);
    tip.rotation.z = sx * 0.45;
    g.add(tip);
  }
  return g;
}

const BUILD = {
  paperbag: () => paperBag(),
  // Noir-style top hat: wide brim, tall crown, dark band
  tophat: () => {
    const g = new THREE.Group();
    const brim = mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.035, 32), 0x1b1b1f, 0, 0.37, 0);
    const crown = mesh(new THREE.CylinderGeometry(0.255, 0.27, 0.4, 32), 0x1b1b1f, 0, 0.585, 0);
    const band = mesh(new THREE.CylinderGeometry(0.274, 0.274, 0.07, 32), 0x3a3a40, 0, 0.42, 0);
    const top = mesh(new THREE.CylinderGeometry(0.255, 0.255, 0.012, 32), 0x2a2a30, 0, 0.791, 0);
    g.add(brim, crown, band, top);
    g.rotation.x = -0.06;
    return g;
  },
  waldo: () => ironArms(),
  nowaldo: () => new THREE.Group(),
  hood_red: () => hood(0x8e1b22, 0x1b1b1f, 0x6e141a),   // Miles: maroon hoodie hood, black lining
  hood_white: () => hood(0xf2f2f4, 0xd6d6dc, 0xe6e6ea), // Gwen: all-white hood
  hair_gwen: () => bobHair(),
  headphones: () => {
    const g = new THREE.Group();
    const band = mesh(new THREE.TorusGeometry(0.29, 0.03, 8, 24, Math.PI), 0x1b1b1f, 0, 0.32, 0);
    g.add(band);
    const pad = mesh(new THREE.TorusGeometry(0.29, 0.034, 8, 12, Math.PI * 0.35), 0x5a5e63, 0, 0.32, 0);
    pad.rotation.z = Math.PI * 0.325;
    g.add(pad);
    for (const s of [-1, 1]) {
      const cup = mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.1, 18), 0xc91a09, s * 0.29, 0.29, 0);
      cup.rotation.z = Math.PI / 2;
      g.add(cup);
      const cushion = mesh(new THREE.TorusGeometry(0.085, 0.025, 6, 16), 0x1b1b1f, s * 0.245, 0.29, 0);
      cushion.rotation.y = Math.PI / 2;
      g.add(cushion);
      const cap = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 14), 0xf4f4f4, s * 0.345, 0.29, 0);
      cap.rotation.z = Math.PI / 2;
      g.add(cap);
    }
    return g;
  },
  backpack: () => pack(0x2a4fa8, 0x1f3a7a),
  catpack: () => {
    // A compact, rounded LEGO backpack in the original colours: grey body, black trim, red zips,
    // with the cat peeking out the top
    const g = new THREE.Group();
    const blue = 0x6c6e72, dark = 0x1b1b1f, red = 0xd01012, black = 0x1b1b1f;   // body grey, band/pocket black
    const Z = -0.3;
    g.add(rbox(0.42, 0.44, 0.24, 0.09, blue, 0, 0.98, Z));                       // body
    g.add(rbox(0.43, 0.14, 0.25, 0.06, dark, 0, 1.17, Z));                        // top band / opening rim
    g.add(rbox(0.44, 0.025, 0.26, 0.01, red, 0, 1.1, Z));                         // red zip line under the band
    g.add(rbox(0.3, 0.18, 0.06, 0.04, dark, 0, 0.9, Z - 0.13));                   // front pocket
    g.add(rbox(0.12, 0.03, 0.02, 0.01, red, 0, 0.98, Z - 0.165));                 // pocket zip pull
    for (const s of [-1, 1]) {
      g.add(rbox(0.06, 0.04, 0.32, 0.02, black, s * 0.16, 1.3, -0.12));          // straps over the shoulders
      g.add(rbox(0.06, 0.36, 0.04, 0.02, black, s * 0.16, 1.1, 0.16));           // straps down the front
    }
    const cat = legoCat();
    cat.scale.setScalar(0.72);
    cat.position.set(0, 1.2, Z);
    cat.rotation.y = Math.PI;                                                      // looks out behind you
    g.add(cat);
    g.userData.cat = cat;
    return g;
  },
  cape: () => {
    const g = new THREE.Group();
    // Tapered cloth: narrow at the neck, wide at the hem, gently curved round the back
    const geo = new THREE.PlaneGeometry(1, 1, 8, 10);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i);           // y: 0.5 top → -0.5 bottom
      const t = 0.5 - y;                                 // 0 at the neck, 1 at the hem
      const w = 0.62 + t * 0.38;
      pos.setXYZ(i, x * w, -t * 0.82, -Math.cos(x * Math.PI) * 0.05 * (0.4 + t));
    }
    geo.computeVertexNormals();
    const cloth = mesh(geo, 0xc91a09);
    cloth.material.side = THREE.DoubleSide;
    const pivot = new THREE.Group();
    pivot.position.set(0, 1.34, -0.17);
    pivot.add(cloth);
    // Collar where it clips on at the shoulders
    const collar = mesh(new THREE.TorusGeometry(0.2, 0.035, 6, 16, Math.PI), 0x9e1208, 0, 0, 0.05);
    collar.rotation.set(Math.PI / 2, 0, Math.PI);
    pivot.add(collar);
    g.add(pivot);
    g.userData.cape = pivot;
    return g;
  },
};

/**
 * Iron Spider's four mechanical "waldoes": gold jointed legs from a backpack hub,
 * two per side, each rising out from the shoulders then bending down to a claw tip.
 */
export function ironArms() {
  // Like the LEGO set: a black backpack with four chunky, curved pearl-gold arms that reach
  // out to the sides, each ending in a three-fingered claw that curls forward
  const g = new THREE.Group();
  const gold = 0xd9a92e, goldDark = 0xb0841c, black = 0x1b1b1f;
  const metal = { metalness: 0.35, roughness: 0.28 };
  g.add(rbox(0.36, 0.38, 0.1, 0.03, black, 0, 1.1, -0.21));
  for (const y of [1.22, 0.98]) g.add(rbox(0.42, 0.08, 0.1, 0.025, black, 0, y, -0.26));
  g.userData.waldo = [];
  for (const s of [-1, 1]) {
    for (const top of [true, false]) {
      const leg = new THREE.Group();
      const base = new THREE.Vector3(s * 0.2, top ? 1.22 : 0.98, -0.27);
      leg.position.copy(base);
      // Socket + short connector out of the pack
      const sock = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.07, 14), black, 0, 0, 0);
      sock.rotation.z = Math.PI / 2;
      leg.add(sock);
      // Big curved arm piece: arcs out and up (top pair) or out and down (bottom pair), then curls forward
      const pts = (top
        ? [[0, 0, 0], [0.18, 0.14, -0.04], [0.38, 0.32, -0.02], [0.55, 0.42, 0.1], [0.62, 0.4, 0.26]]
        : [[0, 0, 0], [0.18, -0.1, -0.04], [0.38, -0.24, -0.02], [0.55, -0.3, 0.12], [0.6, -0.26, 0.28]])
        .map(([x, y, z]) => new THREE.Vector3(s * x, y, z));
      const curve = new THREE.CatmullRomCurve3(pts);
      // Tapered tube: thick at the shoulder, slimmer at the claw
      const tube = new THREE.TubeGeometry(curve, 28, 0.07, 12, false);
      const tp = tube.attributes.position, c = new THREE.Vector3();
      for (let i = 0; i < tp.count; i++) {
        const seg = Math.floor(i / 13) / 28;          // 0..1 along the arm
        curve.getPointAt(Math.min(1, seg), c);
        const v = new THREE.Vector3().fromBufferAttribute(tp, i).sub(c).multiplyScalar(1 - seg * 0.35);
        tp.setXYZ(i, c.x + v.x, c.y + v.y, c.z + v.z);
      }
      tube.computeVertexNormals();
      leg.add(mesh(tube, gold, 0, 0, 0, metal));
      // Moulded ridges along the arm
      for (const t of [0.22, 0.42, 0.62]) {
        const ring = mesh(new THREE.TorusGeometry(0.068 * (1 - t * 0.35), 0.016, 6, 16), goldDark, 0, 0, 0, metal);
        ring.position.copy(curve.getPointAt(t));
        ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), curve.getTangentAt(t));
        leg.add(ring);
      }
      // Claw: a knuckle and three curved fingers
      const end = curve.getPointAt(1), dir = curve.getTangentAt(1);
      leg.add(mesh(new THREE.SphereGeometry(0.06, 14, 10), goldDark, end.x, end.y, end.z, metal));
      for (let f = 0; f < 3; f++) {
        const a = (f / 3) * Math.PI * 2;
        const off = new THREE.Vector3(Math.cos(a), Math.sin(a), 0).multiplyScalar(0.035);
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
        off.applyQuaternion(q);
        const finger = mesh(new THREE.ConeGeometry(0.028, 0.14, 8), gold, 0, 0, 0, metal);
        finger.position.copy(end).add(off).addScaledVector(dir, 0.07).addScaledVector(off, 0.6);
        finger.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().addScaledVector(off.clone().normalize(), 0.45).normalize());
        leg.add(finger);
      }
      g.add(leg);
      g.userData.waldo.push({ leg, s, ph: s * 1.3 + (top ? 0 : 2) });
    }
  }
  return g;
}

/** Replace the rig's gear with `list` (item ids). */
export function applyGear(rig, list = []) {
  for (const g of rig.gear ?? []) g.parent?.remove(g);
  rig.gear = [];
  for (const id of list) {
    const def = GEAR[id], build = BUILD[id];
    if (!def || !build) continue;
    const g = build();
    // Hair worn under a hood stays tucked inside it, like the real hooded minifig
    if (def.slot === 'hair' && list.some(o => GEAR[o]?.slot === 'head')) g.visible = false;
    (def.slot === 'back' ? rig.torso : rig.head).add(g);
    rig.gear.push(g);
    if (g.userData.waldo) rig.waldo = g.userData.waldo;
  }
  // Iron Spider's built-in arms can be switched off; Noir wears his hat unless another head piece is on
  if (rig.waldoGroup) rig.waldoGroup.visible = !list.includes('nowaldo');
  const base = (rig.npc?.variant ?? '').split('|')[0];
  const auto = { noir: 'tophat', bagman: 'paperbag' }[base];   // suits that come with their own head piece
  if (auto && !list.some(o => GEAR[o]?.slot === 'head')) {
    const hat = BUILD[auto]();
    rig.head.add(hat);
    rig.gear.push(hat);
  }
}

/** Little life for gear: the cape sways with speed, the cat bobs. */
export function animateGear(rig, t, speed = 0) {
  for (const g of rig.gear ?? []) {
    if (g.userData.cape) g.userData.cape.rotation.x = 0.12 + Math.min(speed / 18, 1) * 0.7 + Math.sin(t * 6) * 0.05;
    if (g.userData.cat) g.userData.cat.rotation.y = Math.PI + Math.sin(t * 1.3) * 0.3;
  }
  for (const w of rig.waldo ?? []) {
    w.leg.rotation.z = w.s * Math.sin(t * 1.6 + w.ph) * 0.07;
    w.leg.rotation.x = Math.sin(t * 1.1 + w.ph) * 0.05;
  }
}
