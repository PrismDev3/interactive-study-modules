/**
 * Perf.js — graphics profiles for the device.
 *
 * Four modes: low, medium, high, and auto (adaptive, the default). Auto picks low on
 * Chromebook-class hardware (ChromeOS, 4 cores or fewer, 4 GB or less) and high otherwise.
 * `localStorage.gfx` = 'low' | 'medium' | 'high' overrides the pick; absent or 'auto' means
 * adaptive. Low really is the performance profile now: no MSAA, no shadow maps, a lower
 * internal resolution and a shorter view distance. The previous "low" preset still enabled
 * antialiasing and 1024px shadows, which is why Chromebooks struggled.
 */
let pref = null;
try { pref = localStorage.getItem('gfx'); } catch (e) {}
if (pref === 'performance') pref = 'low';
if (pref === 'auto' || pref === '') pref = null;

const ua = navigator.userAgent || '';
const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
const phone = coarse && Math.min(screen.width || 9999, screen.height || 9999) <= 560;
const weak = /CrOS/.test(ua) || (navigator.hardwareConcurrency ?? 8) <= 4 || (navigator.deviceMemory ?? 8) <= 4 || phone;
const detected = weak ? 'low' : 'high';
const explicit = ['low', 'medium', 'high', 'ultra'].includes(pref) ? pref : null;

export const QUALITY = explicit ?? detected;
export const ADAPTIVE = !explicit;
export const LOW = QUALITY === 'low';
export const ULTRA = QUALITY === 'ultra';

const PROFILES = {
  low: {
    tier: 'low', antialias: false, shadows: false, shadowMap: 512, shadowRange: 45, softShadows: false,
    maxRatio: 1, minRatio: 0.8, far: 900, fogFar: 850, npcs: 8, cars: 6, studs: false, minimapHz: 4,
    bloom: false, reflections: 'cheap', pbrWindows: false, normalMaps: false,
  },
  medium: {
    // Integrated GPUs / standard laptops: soft shadows, crisp scale, lightweight post-fx
    tier: 'medium', antialias: false, shadows: true, shadowMap: 1024, shadowRange: 65, softShadows: false,
    maxRatio: 1.25, minRatio: 0.9, far: 1600, fogFar: 1400, npcs: 20, cars: 14, studs: false, minimapHz: 8,
    bloom: false, reflections: 'planar', pbrWindows: true, normalMaps: false,
  },
  high: {
    // Gaming computers: antialias, soft shadows, studs, bloom, full reflections
    tier: 'high', antialias: true, shadows: true, shadowMap: 2048, shadowRange: 90, softShadows: true,
    maxRatio: 2, minRatio: 0.95, far: 4000, fogFar: 1800, npcs: 36, cars: 22, studs: true, minimapHz: 12,
    bloom: true, bloomStrength: 0.45, bloomRadius: 0.6, bloomThreshold: 0.85,
    reflections: 'screen', pbrWindows: true, normalMaps: true,
  },
  ultra: {
    // Powerful gaming computers: max resolution, 4096 shadow map, extended soft contact, full post-fx & normal maps
    tier: 'ultra', antialias: true, shadows: true, shadowMap: 4096, shadowRange: 130, softShadows: true,
    maxRatio: 2.5, minRatio: 1.0, far: 6000, fogFar: 2200, npcs: 48, cars: 30, studs: true, minimapHz: 16,
    bloom: true, bloomStrength: 0.6, bloomRadius: 0.75, bloomThreshold: 0.8,
    reflections: 'screen', pbrWindows: true, normalMaps: true,
  },
};

// A phone at DPR 3 asks for nine times the pixels of its CSS size. The city is fill-rate bound,
// so cap the internal buffer near 1.5x: still crisp on a small screen, far fewer pixels.
if (coarse) {
  for (const p of Object.values(PROFILES)) {
    p.maxRatio = Math.min(p.maxRatio, 1.5);
    p.minRatio = Math.min(p.minRatio, 0.8);
  }
}

export const GFX = PROFILES[QUALITY];
console.log(`[Perf] graphics: ${QUALITY}${ADAPTIVE ? ' (adaptive)' : ''} · ${navigator.hardwareConcurrency ?? '?'} cores`);

/**
 * Dynamic resolution plus a two-step quality drop.
 * Resolution moves first (cheapest, invisible in stills). If frames stay below ~30 fps for
 * six seconds it calls onDrop(1) once, then onDrop(2), which SceneSetup uses to turn off
 * shadows and then shorten the draw distance. A single unstable second never triggers a drop,
 * and it never upgrades past the profile's cap.
 */
export class AutoRes {
  constructor(renderer, { onDrop } = {}) {
    this.r = renderer;
    this.onDrop = onDrop;
    this.cap = Math.min(devicePixelRatio || 1, GFX.maxRatio);
    this.ratio = this.cap;
    this.r.setPixelRatio(this.ratio);
    this.last = performance.now();
    this.avg = 16;
    this.t = 0;
    this.slowT = 0;
    this.fastT = 0;
    this.drops = 0;
  }

  setCap(cap) {
    this.cap = Math.max(0.85, Math.min(this.cap, cap));
    if (this.ratio > this.cap) {
      this.ratio = this.cap;
      this.r.setPixelRatio(this.ratio);
    }
  }

  tick() {
    const now = performance.now();
    const dt = Math.min(200, Math.max(0, now - this.last));
    this.last = now;
    this.avg += (dt - this.avg) * 0.05;
    this.t += dt;

    if (this.avg > 33) { this.slowT += dt; this.fastT = 0; }
    else if (this.avg < 19) { this.fastT += dt; this.slowT = 0; }
    else { this.slowT = 0; this.fastT = 0; }

    if (this.t < 1000) return;
    this.t = 0;

    let r = this.ratio;
    if (this.avg > 32) r = Math.max(GFX.minRatio, r - 0.05);
    else if (this.avg < 18 && this.slowT === 0) r = Math.min(this.cap, r + 0.05);
    if (Math.abs(r - this.ratio) > 0.01) {
      this.ratio = r;
      this.r.setPixelRatio(r);
    }

    // Sustained trouble that resolution alone did not fix: step the profile down.
    if (this.slowT > 4500 && this.drops < 2) {
      this.slowT = 0;
      this.drops++;
      this.onDrop?.(this.drops);
    }
  }
}
