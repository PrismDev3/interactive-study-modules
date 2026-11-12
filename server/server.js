/**
 * Game server: serves the static game and runs online play over WebSockets (/ws).
 * Accounts are username + password (scrypt). One live session per account.
 * Rooms: a permanent Central Hub plus player-made rooms that close when empty.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { createSocial, UPLOAD_RE } from './social.js';
import { normalizePlayerState } from '../src/PlayerState.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.resolve(process.env.GAME_DATA_DIR || path.join(ROOT, 'server', 'data'));
const USERS_FILE = path.join(DATA, 'users.json');
const PORT = Number(process.env.PORT) || 8080;

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.obj': 'text/plain', '.mtl': 'text/plain', '.glb': 'model/gltf-binary',
  '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.vtt': 'text/vtt',
};
const BLOCKED = [/^\/server(\/|$)/, /^\/node_modules(\/|$)/, /^\/My Game Files(\/|$)/, /\.nds$/i, /^\/package/];

// ─── Static files ──────────────────────────────────────────────────────────
const EMBED_ALLOW = /^https:\/\/(vidsrc\.sh|vidsrc\.me|2embed\.cc|vidlink\.pro)\//i;

async function serveEmbedProxy(req, res) {
  const qs = new URL(req.url, 'http://x').searchParams;
  const target = qs.get('url');
  if (!target || !EMBED_ALLOW.test(target)) { res.writeHead(400).end('Bad embed URL'); return; }
  try {
    const r = await fetch(target, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36', 'Referer': target } });
    if (!r.ok) { res.writeHead(502).end('Upstream error'); return; }
    let html = await r.text();
    // Inject <base> so relative URLs in the embed resolve back to the original origin
    const origin = new URL(target).origin;
    const baseTag = `<base href="${origin}/">`;
    // Inject SW registration so the service worker intercepts sub-requests from this proxied page
    const swScript = `<script>if('serviceWorker' in navigator){navigator.serviceWorker.register('/adblock-sw.js',{scope:'/'}).catch(()=>{});}</script>`;
    html = html.replace(/<head([^>]*)>/i, `<head$1>${baseTag}${swScript}`);
    if (!/<head/i.test(html)) html = baseTag + swScript + html;
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Frame-Options': 'SAMEORIGIN',
    });
    res.end(html);
  } catch (e) { res.writeHead(502).end('Proxy error'); }
}

const server = http.createServer((req, res) => {
  let urlPath;
  try { urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400).end(); return; }
  if (urlPath === '/embed-proxy') { serveEmbedProxy(req, res); return; }
  if (urlPath === '/') urlPath = '/index.html';
  const up = UPLOAD_RE.exec(urlPath);
  if (up) { social.serveUpload(res, up); return; }
  const file = path.normalize(path.join(ROOT, urlPath));
  if (!file.startsWith(ROOT + path.sep) || BLOCKED.some(r => r.test(urlPath))) { res.writeHead(404).end('Not found'); return; }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404).end('Not found'); return; }
    sendStatic(req, res, file, st);
  });
});

// ─── Static delivery: brotli/gzip + real caching ──────────────────────────
const COMPRESSIBLE = new Set(['.html', '.js', '.json', '.obj', '.mtl', '.css', '.svg', '.txt', '.glb']);
const VERSIONED_URL = /[?&]v=[^&]+/;
const gzCache = new Map(); // file -> { mtimeMs, buf }
const INLINE_GZIP_LIMIT = 8 * 1024 * 1024;

function sendStatic(req, res, file, st) {
  const ext = path.extname(file).toLowerCase();
  const etag = 'W/"' + st.size.toString(16) + '-' + Math.floor(st.mtimeMs).toString(16) + '"';
  const versioned = VERSIONED_URL.test(req.url || '');
  res.setHeader('Content-Type', TYPES[ext] ?? 'application/octet-stream');
  res.setHeader('ETag', etag);
  res.setHeader('X-File-Size', st.size); // real size, so loaders can show true progress through gzip/brotli
  res.setHeader('Vary', 'Accept-Encoding');
  res.setHeader('Cache-Control', versioned ? 'public, max-age=31536000, immutable' : 'no-cache');
  // Versioned URLs never change contents, so no revalidation is needed for them.
  if (!versioned && req.headers['if-none-match'] === etag) { res.writeHead(304).end(); return; }
  // Video: byte ranges so the SpideyFlix player can seek
  if (/^video\//.test(TYPES[ext] || '')) {
    res.setHeader('Accept-Ranges', 'bytes');
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (m) {
      const start = m[1] ? +m[1] : Math.max(0, st.size - +m[2]);
      const end = m[1] && m[2] ? Math.min(+m[2], st.size - 1) : st.size - 1;
      if (start > end || start >= st.size) { res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }).end(); return; }
      res.writeHead(206, { 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 });
      fs.createReadStream(file, { start, end }).pipe(res); return;
    }
    res.writeHead(200, { 'Content-Length': st.size });
    fs.createReadStream(file).pipe(res); return;
  }

  const enc = String(req.headers['accept-encoding'] || '');
  if (COMPRESSIBLE.has(ext) && st.size > 512) {
    if (/\bbr\b/.test(enc)) {
      const br = sidecar(file + '.br', st);
      if (br) return sendPrecompressed(res, br, 'br');
    }
    if (/\bgzip\b/.test(enc)) {
      const gz = sidecar(file + '.gz', st);
      if (gz) return sendPrecompressed(res, gz, 'gzip');
      if (st.size <= INLINE_GZIP_LIMIT) {
        const hit = gzCache.get(file);
        let buf;
        if (hit && hit.mtimeMs === st.mtimeMs) buf = hit.buf;
        else { buf = zlib.gzipSync(fs.readFileSync(file), { level: 6 }); gzCache.set(file, { mtimeMs: st.mtimeMs, buf }); }
        res.writeHead(200, { 'Content-Encoding': 'gzip', 'Content-Length': buf.length });
        res.end(buf);
        return;
      }
    }
  }
  res.writeHead(200, { 'Content-Length': st.size });
  fs.createReadStream(file).pipe(res);
}

/** A precompressed sidecar is only used if it is at least as new as the source. */
function sidecar(candidate, srcStat) {
  try {
    const s = fs.statSync(candidate);
    if (!s.isFile() || s.size < 1024 || s.mtimeMs + 1000 < srcStat.mtimeMs) return null;
    return { path: candidate, size: s.size };
  } catch { return null; }
}

function sendPrecompressed(res, f, encoding) {
  res.writeHead(200, { 'Content-Encoding': encoding, 'Content-Length': f.size });
  fs.createReadStream(f.path).pipe(res);
}
// ─── Accounts ──────────────────────────────────────────────────────────────
fs.mkdirSync(DATA, { recursive: true });
let users = {};
try { users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); } catch { users = {}; }
const saveUsers = () => fs.writeFile(USERS_FILE, JSON.stringify(users, null, 1), () => {});
const NAME_RE = /^[A-Za-z0-9_]{3,16}$/;
const ROOM_EMOTES = new Set(['wave', 'highfive']);

// Locker prices (must match src/Gear.js and the priced suits in src/Variants.js)
const PRICES = {
  hood_red: 400, hood_white: 400, hair_gwen: 600, headphones: 500, backpack: 800, catpack: 2500, cape: 1500,
  'suit:golden': 20000,
  'emote:griddy': 1500, 'emote:orange': 1500, 'emote:floss': 1000, 'emote:default': 800,
  'emote:takel': 1200, 'emote:dab': 500, 'emote:hype': 800, 'emote:robot': 1000,
  'emote:wiggle': 600, 'emote:patriot': 800, 'emote:dancewalk': 800, 'emote:breakdance': 1500, 'emote:windmill': 1500,
};
const walletOf = u => ({ studs: u.studs ?? 0, owned: u.owned ?? [], infinite: !!u.infinite });

function hashPass(pass, salt) {
  return crypto.scryptSync(pass, salt, 32).toString('hex');
}

function register(name, pass) {
  if (!NAME_RE.test(name ?? '')) return 'Username must be 3-16 letters, numbers or _';
  if (typeof pass !== 'string' || pass.length < 4 || pass.length > 64) return 'Password must be 4-64 characters';
  const key = name.toLowerCase();
  if (users[key]) return 'That username is taken';
  const salt = crypto.randomBytes(16).toString('hex');
  users[key] = { name, salt, hash: hashPass(pass, salt), created: Date.now() };
  saveUsers();
  return null;
}

function login(name, pass) {
  const u = users[(name ?? '').toLowerCase()];
  if (!u || typeof pass !== 'string') return [null, 'Wrong username or password'];
  const ok = crypto.timingSafeEqual(Buffer.from(hashPass(pass, u.salt), 'hex'), Buffer.from(u.hash, 'hex'));
  return ok ? [u.name, null] : [null, 'Wrong username or password'];
}

// ─── Rooms ─────────────────────────────────────────────────────────────────
const rooms = new Map();
const online = new Map(); // lowercase name -> client
const PLATFORM_OWNER = 'jexel';
const isPlatformOwner = name => String(name ?? '').toLowerCase() === PLATFORM_OWNER;
let nextId = 1, nextRoom = 1;

const DORM_KEYS = ['wall', 'floor', 'bed', 'couch', 'rug', 'light', 'poster'];
const cleanDorm = d => {
  const out = {};
  for (const k of DORM_KEYS) if (Number.isInteger(d?.[k]) && d[k] >= 0 && d[k] < 16) out[k] = d[k];
  return out;
};
function makeRoom({ name, max, pass, pvp, villains, time, health = true, emotes = true, kind, dorm }, owner, id = `r${nextRoom++}`) {
  const isDorm = kind === 'dorm' && id !== 'hub';
  const room = {
    id, owner,
    kind: isDorm ? 'dorm' : 'world',
    dorm: isDorm ? cleanDorm(dorm) : null,
    name: String(name || 'Room').slice(0, 24),
    max: id === 'hub' ? 32 : Math.min(isDorm ? 5 : 16, Math.max(2, Number(max) || 8)),
    pass: pass ? String(pass).slice(0, 32) : '',
    pvp: !isDorm && !!pvp, villains: !isDorm && !!villains, health: !!health, emotes: !!emotes,
    time: ['day', 'sunset'].includes(time) ? time : 'day',
    players: new Map(),
    ranks: new Map(),   // lowercase name -> 1 mod, 2 admin (owner is 3)
    colors: new Map(),  // lowercase name -> '#rrggbb' name-tag colour
  };
  rooms.set(id, room);
  return room;
}
makeRoom({ name: 'Central Hub', max: 32, pvp: false, villains: false, time: 'day' }, null, 'hub');

const roomInfo = r => ({
  id: r.id, name: r.name, players: r.players.size, max: r.max, locked: !!r.pass,
  pvp: r.pvp, villains: r.villains, health: r.health, emotes: r.emotes, time: r.time, owner: r.owner,
  kind: r.kind, dorm: r.dorm,
});
const rankOf = (room, name) => {
  if (!room || !name) return 0;
  const key = name.toLowerCase();
  if (room.owner?.toLowerCase() === key) return 3;
  return Math.max(isPlatformOwner(key) ? 2 : 0, room.ranks.get(key) ?? 0);
};
const playerInfo = c => ({ id: c.id, name: c.name, variant: c.variant, state: c.state,
  rank: rankOf(c.room, c.name), color: c.room?.colors.get(c.name?.toLowerCase()) ?? null,
  ownerBadge: isPlatformOwner(c.name) });
const ownerBans = room => (room.owner ? (users[room.owner.toLowerCase()]?.bans ?? []) : []);

/**
 * The room's world host: the highest-ranked connected player (owner 3, admin 2, mod 1 is not
 * enough), lowest id to break ties. Only this client may stream summoned characters, so two
 * admins never fight over the same room. The server decides it; clients never supply a rank.
 */
const hostOf = room => {
  let best = null, bestRank = 0;
  for (const p of room.players.values()) {
    const r = rankOf(room, p.name);
    if (r < 2) continue;
    if (!best || r > bestRank || (r === bestRank && p.id < best.id)) { best = p; bestRank = r; }
  }
  return best;
};
function announceHost(room) {
  const host = hostOf(room);
  broadcast(room, { t: 'host', id: host?.id ?? null });
  return host;
}

function send(c, msg) { if (c.ws.readyState === 1) c.ws.send(JSON.stringify(msg)); }
function broadcast(room, msg, except) {
  const data = JSON.stringify(msg);
  for (const p of room.players.values()) if (p !== except && p.ws.readyState === 1) p.ws.send(data);
}

function transferRoomOwner(room, nextOwner, automatic = false) {
  if (!nextOwner || room.players.get(nextOwner.id) !== nextOwner) return false;
  room.owner = nextOwner.name;
  const ranks = [...room.players.values()].map(p => ({ id: p.id, rank: rankOf(room, p.name) }));
  broadcast(room, { t: 'owner', id: nextOwner.id, name: nextOwner.name, room: roomInfo(room), ranks });
  broadcast(room, { t: 'sys', text: automatic
    ? `${nextOwner.name} is now the owner as the longest-present player.`
    : `${nextOwner.name} is now the room owner.` });
  for (const p of room.players.values()) social?.presenceChanged(p.name.toLowerCase());
  return true;
}

function leaveRoom(c) {
  const room = c.room;
  if (!room) return;
  room.players.delete(c.id);
  c.room = null;
  broadcast(room, { t: 'leave', id: c.id });
  if (room.owner?.toLowerCase() === c.name?.toLowerCase()) {
    let successor = null;
    for (const p of room.players.values()) {
      if (!successor || p.joinedAt < successor.joinedAt || (p.joinedAt === successor.joinedAt && p.id < successor.id)) successor = p;
    }
    if (successor) transferRoomOwner(room, successor, true);
    else room.owner = null;
  }
  if (room.id !== 'hub' && room.players.size === 0) rooms.delete(room.id);
  else announceHost(room);
  if (c.name) social.presenceChanged(c.name.toLowerCase());
}

function joinRoom(c, room) {
  leaveRoom(c);
  room.players.set(c.id, c);
  c.room = room;
  c.joinedAt = Date.now();
  c.state = null;
  social?.presenceChanged(c.name.toLowerCase());
  send(c, { t: 'joined', room: roomInfo(room), you: c.id, rank: rankOf(room, c.name), ownerBadge: isPlatformOwner(c.name), host: hostOf(room)?.id ?? null, players: [...room.players.values()].filter(p => p !== c).map(playerInfo) });
  if (room.flix) send(c, { t: 'flix', flix: room.flix });   // catch up to watch party in progress
  broadcast(room, { t: 'join', player: playerInfo(c) }, c);
  announceHost(room);
}

// ─── Messages ──────────────────────────────────────────────────────────────
const social = createSocial({ DATA, users, saveUsers, online, rooms, send, joinRoom, ownerBans, isPlatformOwner, rankOf });
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 1024 * 1024 });

wss.on('connection', ws => {
  const c = { ws, id: nextId++, name: null, variant: 'classic', room: null, state: null, chatT: 0, stateAt: 0 };

  ws.on('message', raw => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m.t !== 'string') return;

    if (m.t === 'register' || m.t === 'login') {
      if (c.name) return;
      if (m.t === 'register') {
        const err = register(m.name, m.pass);
        if (err) return send(c, { t: 'auth', ok: false, err });
      }
      const [name, err] = login(m.name, m.pass);
      if (!name) return send(c, { t: 'auth', ok: false, err });
      if (online.has(name.toLowerCase())) return send(c, { t: 'auth', ok: false, err: `${name} is already playing right now` });
      c.name = name;
      online.set(name.toLowerCase(), c);
      c.user = users[name.toLowerCase()];
      send(c, { t: 'auth', ok: true, name, id: c.id, ownerBadge: isPlatformOwner(name), wallet: walletOf(c.user), friends: c.user.friends ?? [], progress: c.user.progress ?? null, prefs: c.user.prefs ?? null });
      send(c, social.snapshot(name.toLowerCase()));
      return social.presenceChanged(name.toLowerCase());
    }
    if (!c.name) return; // everything below needs a login
    if (raw.length > 16 * 1024 && m.t !== 'dmImg') return;   // only image uploads may be large
    if (social.handle(c, m)) return;

    switch (m.t) {
      case 'buy': {
        const u = c.user, price = PRICES[m.id];
        if (!u || price == null) return;
        u.owned ??= [];
        if (!u.owned.includes(m.id) && (u.infinite || (u.studs ?? 0) >= price)) {
          if (!u.infinite) u.studs = (u.studs ?? 0) - price;
          u.owned.push(m.id);
          saveUsers();
        }
        return send(c, { t: 'wallet', wallet: walletOf(u) });
      }
      case 'gift': {
        // Server-authoritative stud transfer. The client never mutates either balance: it asks,
        // the server validates every rule and re-sends both real wallets.
        const u = c.user;
        const amount = Math.floor(Number(m.amount));
        const toName = String(m.to ?? '').trim();
        const cid = String(m.cid ?? '').slice(0, 64);
        const fail = err => send(c, { t: 'giftResult', ok: false, err, cid });
        if (!u) return;
        if (!toName || !cid) return fail('Missing recipient');
        if (!Number.isFinite(amount) || amount < 1) return fail('Enter an amount of at least 1 stud');
        if (amount > 100000) return fail('The most you can gift at once is 100,000 studs');
        const to = users[toName.toLowerCase()];
        if (!to) return fail('That player has no account');
        if (toName.toLowerCase() === c.name.toLowerCase()) return fail('You cannot gift yourself');
        if (u.blocked?.includes(toName.toLowerCase()) || to.blocked?.includes(c.name.toLowerCase())) return fail('You cannot gift this player');
        // Idempotency: a retried packet (flaky connection, double click) must not pay twice.
        u.giftIds ??= [];
        if (u.giftIds.includes(cid)) return send(c, { t: 'giftResult', ok: true, duplicate: true, amount, to: toName, wallet: walletOf(u) });
        const now = Date.now();
        u.giftAt = Array.isArray(u.giftAt) ? u.giftAt.filter(t => now - t < 60000) : [];
        if (u.giftAt.length >= 12) return fail('Too many gifts this minute, try again shortly');
        if (!u.infinite && (u.studs ?? 0) < amount) return fail('You do not have that many studs');
        // Apply atomically in memory, then persist and broadcast both balances.
        if (!u.infinite) u.studs = (u.studs ?? 0) - amount;
        to.studs = (to.studs ?? 0) + amount;
        u.giftAt.push(now);
        u.giftIds = [...u.giftIds.slice(-49), cid];
        saveUsers();
        send(c, { t: 'giftResult', ok: true, amount, to: toName, wallet: walletOf(u) });
        const target = online.get(toName.toLowerCase());
        if (target) {
          send(target, { t: 'wallet', wallet: walletOf(to) });
          send(target, { t: 'giftReceived', from: c.name, amount });
        }
        return send(c, { t: 'wallet', wallet: walletOf(u) });
      }
      case 'prefs': {
        // Player-room feature toggles (Skill Tree / Skill Select) follow the account, so they
        // survive a reload and a different machine.
        const u = c.user;
        if (!u) return;
        const next = {};
        if (typeof m.skillTree === 'boolean') next.skillTree = m.skillTree;
        if (typeof m.skillSelect === 'boolean') next.skillSelect = m.skillSelect;
        u.prefs = { ...(u.prefs ?? {}), ...next };
        saveUsers();
        return send(c, { t: 'prefs', prefs: u.prefs });
      }
      case 'rooms':
        return send(c, { t: 'rooms', list: [...rooms.values()].map(roomInfo) });
      case 'create': {
        const room = makeRoom(m, c.name);
        return joinRoom(c, room);
      }
      case 'join': {
        const room = rooms.get(m.id);
        if (!room) return send(c, { t: 'error', err: 'That room no longer exists' });
        if (room.players.size >= room.max) return send(c, { t: 'error', err: 'That room is full' });
        if (room.pass && room.pass !== m.pass) return send(c, { t: 'error', err: 'Wrong room password' });
        if (ownerBans(room).includes(c.name.toLowerCase())) return send(c, { t: 'error', err: `You're banned from ${room.owner}'s rooms` });
        return joinRoom(c, room);
      }
      case 'leave':
        return leaveRoom(c);
      case 'variant':
        c.variant = String(m.v).slice(0, 120);
        if (c.user) c.user.lastVariant = c.variant;
        if (c.room) broadcast(c.room, { t: 'variant', id: c.id, v: c.variant }, c);
        return;
      case 'state':
        if (!c.room) return;
        const now = Date.now();
        if (now - c.stateAt < 22) return; // allow up to ~45 Hz, above the game's 15 Hz sender
        c.stateAt = now;
        const state = normalizePlayerState(m.s);
        if (!state) return;
        c.state = state;
        return broadcast(c.room, { t: 'state', id: c.id, s: state }, c);
      case 'emote':
        if (!c.room?.emotes || !ROOM_EMOTES.has(m.e)) return;
        if (Date.now() - (c.emoteAt ?? 0) < 700) return;
        c.emoteAt = Date.now();
        broadcast(c.room, { t: 'emote', id: c.id, e: m.e }, c);
        return;
      case 'ents': {
        // Summoned characters: only the server-elected host's game runs them; everyone else
        // draws ghosts. This is what makes an assigned admin's summon tools actually work
        // without handing world authority to every client.
        if (!c.room || !Array.isArray(m.list)) return;
        if (hostOf(c.room) !== c) return;
        return broadcast(c.room, { t: 'ents', list: m.list.slice(0, 40) }, c);
      }
      case 'hitEnt': {
        // A punch on a summoned character goes to the host, whose game applies it
        if (!c.room) return;
        const host = hostOf(c.room);
        if (host && host !== c) send(host, { t: 'hitEnt', ent: m.ent, dmg: Math.min(3, Number(m.dmg) || 1), from: m.from });
        return;
      }
      case 'dorm': {   // owner restyles the dorm; everyone inside sees it
        if (!c.room || c.room.kind !== 'dorm' || rankOf(c.room, c.name) < 2) return;
        c.room.dorm = cleanDorm({ ...c.room.dorm, ...m.dorm });
        broadcast(c.room, { t: 'dorm', dorm: c.room.dorm });
        return;
      }
      case 'flix': {   // dorm watch-party: owner controls playback, state syncs to all
        if (!c.room || c.room.kind !== 'dorm') return;
        const isRoomOwner = c.room.owner?.toLowerCase() === c.name?.toLowerCase();
        if (!isRoomOwner) return;   // only room owner may send flix commands
        // m.flix = { item?: {id,title,embed,src,...}, playing: bool, t: number } | null (stop)
        const fx = m.flix;
        if (!fx) {
          c.room.flix = null;
          broadcast(c.room, { t: 'flix', flix: null });
        } else {
          // Sanitise: only carry safe fields (no arbitrary JS)
          const item = fx.item ? {
            id: String(fx.item.id ?? '').slice(0, 200),
            title: String(fx.item.title ?? '').slice(0, 200),
            embed: fx.item.embed ? String(fx.item.embed).slice(0, 500) : undefined,
            src: fx.item.src ? String(fx.item.src).slice(0, 500) : undefined,
            poster: fx.item.poster ? String(fx.item.poster).slice(0, 500) : undefined,
            year: Number(fx.item.year) || undefined,
            genre: fx.item.genre ? String(fx.item.genre).slice(0, 80) : undefined,
            desc: fx.item.desc ? String(fx.item.desc).slice(0, 500) : undefined,
          } : (c.room.flix?.item ?? null);
          c.room.flix = { item, playing: !!fx.playing, t: Math.max(0, Number(fx.t) || 0), ts: Date.now() };
          broadcast(c.room, { t: 'flix', flix: c.room.flix });
        }
        return;
      }
      case 'typing':
        if (c.room) broadcast(c.room, { t: 'typing', id: c.id, on: !!m.on }, c);
        return;
      case 'chat': {
        if (!c.room) return;
        const now = Date.now();
        if (now - c.chatT < 600) return; // simple flood guard
        c.chatT = now;
        const text = String(m.text ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 140);
        if (!text) return;
        const data = JSON.stringify({ t: 'chat', id: c.id, name: c.name, rank: rankOf(c.room, c.name), text });   // sender shows it locally
        for (const p of c.room.players.values()) if (p !== c && p.ws.readyState === 1 && !social.blocks(p.name, c.name)) p.ws.send(data);
        return;
      }
      // ── Moderation: owner > admin > mod > player. You can only act on (or promote to)
      //    ranks below your own, so nobody can out-rank the room owner. ──
      case 'mod': {
        const room = c.room;
        if (!room) return;
        const target = room.players.get(m.target);
        if (!target) return;
        if (m.action === 'transferOwner') {
          if (room.owner?.toLowerCase() !== c.name.toLowerCase() || target === c) return;
          if (!transferRoomOwner(room, target)) return;
          return announceHost(room);
        }
        // Portal guns are an admin-only gift. Self-targeting is allowed here, unlike moderation.
        if (m.action === 'portal') {
          if (rankOf(room, c.name) < 2) return;
          return broadcast(room, { t: 'portal', id: target.id, on: m.on !== false });
        }
        if (target === c) return;
        const a = rankOf(room, c.name), t = rankOf(room, target.name), tn = target.name.toLowerCase();
        const sys = text => broadcast(room, { t: 'sys', text });
        if (m.action === 'kick' && a >= 1 && t < a) {
          send(target, { t: 'kicked', text: `You were kicked by ${c.name}` });
          leaveRoom(target);
          return sys(`${target.name} was kicked by ${c.name}`);
        }
        if (m.action === 'ban' && a >= 2 && t < a && room.owner) {
          const ou = users[room.owner.toLowerCase()];
          if (!ou) return;
          ou.bans = [...new Set([...(ou.bans ?? []), tn])];
          saveUsers();
          send(target, { t: 'kicked', text: `You were banned from ${room.owner}'s rooms` });
          leaveRoom(target);
          return sys(`${target.name} was banned`);
        }
        if (m.action === 'rank' && a >= 2 && t < a) {
          const v = Math.max(0, Math.min(2, Number(m.value) | 0));
          if (v >= a) return;
          if (v === 0) room.ranks.delete(tn); else room.ranks.set(tn, v);
          broadcast(room, { t: 'rank', id: target.id, rank: v });
          announceHost(room);
          social.presenceChanged(tn);
          return sys(`${target.name} is now ${['a player', 'a moderator', 'an admin'][v]}`);
        }
        if (m.action === 'color' && a >= 1 && t < a && /^#[0-9a-f]{6}$/i.test(m.value)) {
          room.colors.set(tn, m.value);
          return broadcast(room, { t: 'nameColor', id: target.id, color: m.value });
        }
        return;
      }
      // ── Web-swing races: a mod+ starts one; the server times it and decides the winner ──
      case 'race': {
        const room = c.room;
        if (!room || (rankOf(room, c.name) < 1 && room.id !== 'hub') || room.race) return;   // anyone can start one in the hub
        const x = Number(m.x), y = Number(m.y), z = Number(m.z);
        if (![x, y, z].every(Number.isFinite)) return;
        room.race = { x, y, z, start: Date.now() + 3000 };
        room.race.timer = setTimeout(() => { if (room.race) { room.race = null; broadcast(room, { t: 'raceOff' }); } }, 4 * 60 * 1000);
        return broadcast(room, { t: 'race', x, y, z, by: c.name });
      }
      case 'raceDone': {
        const room = c.room, r = room?.race;
        if (!r || Date.now() < r.start + 2000) return;      // no finishing before (or right at) GO
        clearTimeout(r.timer);
        room.race = null;
        room.wins ??= new Map();
        const wins = (room.wins.get(c.name) ?? 0) + 1;
        room.wins.set(c.name, wins);
        if (c.user && !c.user.infinite) { c.user.studs = (c.user.studs ?? 0) + 1000; saveUsers(); send(c, { t: 'wallet', wallet: walletOf(c.user) }); }
        return broadcast(room, { t: 'raceWin', name: c.name, winnerId: c.id, secs: Math.round((Date.now() - r.start) / 1000), wins });
      }
      case 'unban': {
        if (!c.user) return;
        c.user.bans = (c.user.bans ?? []).filter(n => n !== String(m.name).toLowerCase());
        saveUsers();
        return send(c, { t: 'bans', list: c.user.bans });
      }
      case 'progress': {
        // Story progress + gold bricks: validated, merged (never lowers what's saved)
        if (!c.user) return;
        const old = c.user.progress ?? { chaptersDone: 0, goldBricks: [] };
        const ch = Math.max(0, Math.min(6, Number(m.chaptersDone) | 0));
        const gb = Array.isArray(m.goldBricks) ? m.goldBricks.map(Number).filter(n => Number.isInteger(n) && n >= 0 && n < 8) : [];
        c.user.progress = { v: 1, chaptersDone: Math.max(old.chaptersDone, ch), goldBricks: [...new Set([...old.goldBricks, ...gb])] };
        saveUsers();
        return send(c, { t: 'progress', progress: c.user.progress });
      }
      case 'hit': {
        if (!c.room?.pvp) return;
        const target = c.room.players.get(m.target);
        if (target) send(target, { t: 'hit', from: c.id, dir: m.dir, slam: !!m.slam });
        return;
      }
    }
  });

  ws.on('close', () => {
    leaveRoom(c);
    if (c.name && online.get(c.name.toLowerCase()) === c) { online.delete(c.name.toLowerCase()); social.presenceChanged(c.name.toLowerCase()); }
  });
});

server.listen(PORT, () => console.log(`LEGO Spider-Man server on http://localhost:${PORT}`));
