/**
 * swing-bench.js — dev-only web-swing benchmark (never imported by the game).
 *
 * In the browser console, while in game:
 *   const b = await import('/tools/swing-bench.js?' + Date.now());
 *   b.findStreets();            // street start points near the player
 *   b.bench();                  // runs every street both ways, prints a summary
 *
 * Steps hero.update(1/60) directly, so results don't depend on the tab's frame rate
 * (a hidden browser pane throttles requestAnimationFrame to 2–3 fps).
 * Webs are enabled in memory only (noWebs/noPowers off); nothing is saved.
 */
const H = () => window.hero;

/** Points near the player where a street runs straight for 120+ units both ways, walls 8–30 units each side. */
export function findStreets({ radius = 220, step = 20, y = 22, max = 6 } = {}) {
  const h = H(), V = h.root.position.constructor, rc = h.webPhysics.raycaster;
  const meshes = h.cityMeshes.length ? h.cityMeshes : h.collisionMeshes;
  const cast = (o, d, far = 300) => { rc.set(o, d); rc.far = far; return rc.intersectObjects(meshes, false)[0]?.distance ?? Infinity; };
  const p0 = h.root.position, out = [];
  for (let x = -radius; x <= radius && out.length < max; x += step) for (let z = -radius; z <= radius && out.length < max; z += step) {
    const o = new V(p0.x + x, y, p0.z + z);
    for (const [ax, az] of [[1, 0], [0, 1]]) {
      const f = cast(o, new V(ax, 0, az)), b = cast(o, new V(-ax, 0, -az));
      if (f < 120 || b < 120) continue;
      const l = cast(o, new V(-az, 0, ax), 60), r = cast(o, new V(az, 0, -ax), 60);
      if (l < 8 || r < 8 || l > 30 || r > 30) continue;
      // recentre across the street
      const c = (l - r) / 2;
      o.x += -az * c; o.z += ax * c;
      if (out.some(s => Math.hypot(s.p.x - o.x, s.p.z - o.z) < 60)) continue;
      out.push({ p: o.clone(), dir: [ax, az], width: +(l + r).toFixed(0) });
    }
  }
  return out;
}

/** One run: start airborne at p moving along dir with W+E held. */
export function run(p, dir, { secs = 8, speed = 15 } = {}) {
  const h = H(), w = h.webPhysics;
  h.noWebs = false; h.noPowers = false; h.inputLocked = false;
  const yaw = Math.atan2(-dir[0], -dir[1]);   // camera sits behind: looks along -(sin yaw, cos yaw)
  const reset = () => {
    if (w.isSwinging) w.releaseWeb(false);
    h.isClimbing = h.isWallRun = h.isPerched = h.isGrounded = false; h.perchZip = null; h.trick = null; h.landT = 0;
    h.root.position.copy(p); h.velocity.set(dir[0] * speed, 0, dir[1] * speed);
    h._webCooldown = 0; h._climbCooldown = 0.5; h._yaw = yaw; h._pitch = 0.25;
  };
  for (const k of Object.keys(h._keys)) h._keys[k] = false;
  for (let i = 0; i < 40; i++) { reset(); h.update(1 / 60); }   // settle the camera behind the player
  reset();
  h._keys.KeyW = true; h._keys.KeyE = true;
  let swings = 0, wall = 0, ground = 0, was = false, prev = 'A', sp = 0, n = 0, lat = 0;
  for (let i = 0; i < secs * 60; i++) {
    // Swings fire on the E key-down edge, not while held: press again whenever a web is free.
    if (!w.isSwinging && !h.isGrounded && (h._webCooldown ?? 0) <= 0) h._handleWebFire();
    h.update(1 / 60);
    const s = w.isSwinging ? 'S' : h.isClimbing ? 'C' : h.isWallRun ? 'W' : h.isGrounded ? 'G' : 'A';
    if (s === 'S' && !was) swings++;
    if ((s === 'C' || s === 'W') && prev !== 'C' && prev !== 'W') wall++;
    if (s === 'G' && prev !== 'G') ground++;
    was = s === 'S'; prev = s;
    sp += h.velocity.length(); n++;
    lat = Math.max(lat, Math.abs((h.root.position.x - p.x) * -dir[1] + (h.root.position.z - p.z) * dir[0]));
    if (s === 'C') break;   // climbing a wall = run over
  }
  for (const k of Object.keys(h._keys)) h._keys[k] = false;
  const along = (h.root.position.x - p.x) * dir[0] + (h.root.position.z - p.z) * dir[1];
  return { swings, wall, ground, along: Math.round(along), avgSpeed: +(sp / n).toFixed(1), maxLateral: Math.round(lat), secs: +(n / 60).toFixed(1) };
}

/** Every street, both directions. Returns rows + totals. */
export function bench(opts = {}) {
  const h = H(), home = h.root.position.clone();
  const streets = opts.streets ?? findStreets();
  const rows = [];
  for (const s of streets) for (const sgn of [1, -1]) {
    const dir = [s.dir[0] * sgn, s.dir[1] * sgn];
    rows.push({ at: `${Math.round(s.p.x)},${Math.round(s.p.z)}`, dir: dir.join(','), width: s.width, ...run(s.p, dir, opts) });
  }
  h.root.position.copy(home); h.velocity.set(0, 0, 0);
  const sum = k => rows.reduce((a, r) => a + r[k], 0);
  const total = { runs: rows.length, swings: sum('swings'), wallHits: sum('wall'), groundTouches: sum('ground'),
    avgAlong: Math.round(sum('along') / rows.length), avgSpeed: +(sum('avgSpeed') / rows.length).toFixed(1),
    fullRuns: rows.filter(r => r.secs >= (opts.secs ?? 8) - 0.05).length };
  return { total, rows };
}
