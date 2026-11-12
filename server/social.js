/**
 * social.js — friends (mutual requests), block, mute, presence, join-friend and direct messages
 * (text + validated images). All state lives on the server; clients only render it.
 *
 * User record fields: friends[], reqIn[], reqOut[], blocked[], muted[], unread{lc:count}  (all lowercase names)
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const MAX_HISTORY = 200;          // messages kept per conversation
const ACTIVITIES = new Set(['Racing', 'Fighting', 'Web-swinging', 'Story mission', 'Gauntlet', 'Villain waves', 'Exploring']);
const MAX_IMAGE_REPORTS = 1000;
const IMG_MAX = 600 * 1024;       // decoded bytes
const IMG_PER_DAY = 40;
const MAGIC = [
  { ext: 'png', mime: 'image/png', test: b => b.length > 8 && b.readUInt32BE(0) === 0x89504e47 },
  { ext: 'jpg', mime: 'image/jpeg', test: b => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'gif', mime: 'image/gif', test: b => b.length > 6 && /^GIF8[79]a$/.test(b.toString('latin1', 0, 6)) },
  { ext: 'webp', mime: 'image/webp', test: b => b.length > 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP' },
];
export const UPLOAD_RE = /^\/u\/([0-9a-f]{32})\.(png|jpg|gif|webp)$/;

const clean = s => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
const lc = s => clean(s).toLowerCase().slice(0, 16);
const without = (arr, n) => (arr ?? []).filter(x => x !== n);
const add = (arr, n) => [...new Set([...(arr ?? []), n])];

export function createSocial({ DATA, users, saveUsers, online, rooms, send, joinRoom, ownerBans, isPlatformOwner, rankOf }) {
  const UPLOADS = path.join(DATA, 'uploads');
  const DMS_FILE = path.join(DATA, 'dms.json');
  const REPORTS_FILE = path.join(DATA, 'image-reports.json');
  fs.mkdirSync(UPLOADS, { recursive: true });
  let dms = {};
  try { dms = JSON.parse(fs.readFileSync(DMS_FILE, 'utf8')); } catch { dms = {}; }
  let imageReports = [];
  try { imageReports = JSON.parse(fs.readFileSync(REPORTS_FILE, 'utf8')); if (!Array.isArray(imageReports)) imageReports = []; } catch { imageReports = []; }
  let dmSaveT = null;
  const saveDms = () => { clearTimeout(dmSaveT); dmSaveT = setTimeout(() => fs.writeFile(DMS_FILE, JSON.stringify(dms), () => {}), 400); };
  let reportSaveT = null;
  const saveReports = () => { clearTimeout(reportSaveT); reportSaveT = setTimeout(() => fs.writeFile(REPORTS_FILE, JSON.stringify(imageReports), () => {}), 400); };
  const convKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const reportSnapshot = () => imageReports.map(({ id, img, reporter, sender, recipient, ts }) => ({ id, img, reporter, sender, recipient, ts }));
  const pushReportSnapshot = () => {
    for (const [name, c] of online) if (isPlatformOwner?.(name)) send(c, { t: 'imageReports', reports: reportSnapshot() });
  };
  const uploadPath = img => {
    const match = UPLOAD_RE.exec(String(img ?? ''));
    return match ? path.join(UPLOADS, `${match[1]}.${match[2]}`) : null;
  };

  // Group chats: membership lists live on each member's user record (so a group survives a
  // restart without another file), the message log is one shared map keyed by group id.
  const GROUPS_FILE = path.join(DATA, 'groups.json');
  let gmsgs = {};
  try { gmsgs = JSON.parse(fs.readFileSync(GROUPS_FILE, 'utf8')).msgs ?? {}; } catch { gmsgs = {}; }
  let gSaveT = null;
  const saveGmsgs = () => { clearTimeout(gSaveT); gSaveT = setTimeout(() => fs.writeFile(GROUPS_FILE, JSON.stringify({ msgs: gmsgs }), () => {}), 400); };
  const gkey = id => `g:${id}`;
  const myGroups = n => U(n)?.groups ?? [];
  const groupUnread = (n, id) => U(n)?.unread?.[gkey(id)] ?? 0;
  const MAX_GROUP = 12;

  const U = n => users[n];
  const display = n => U(n)?.name ?? n;
  const isFriend = (a, b) => (U(a)?.friends ?? []).includes(b) && (U(b)?.friends ?? []).includes(a);
  const blockedEither = (a, b) => (U(a)?.blocked ?? []).includes(b) || (U(b)?.blocked ?? []).includes(a);

  function presence(n) {
    const c = online.get(n);
    const ownerBadge = !!isPlatformOwner?.(n);
    const globalRank = ownerBadge ? 2 : 0;
    if (!c) return { online: false, room: null, activity: 'Offline', ownerBadge, rank: globalRank };
    const r = c.room;
    if (!r) return { online: true, room: null, activity: 'In menus', ownerBadge, rank: globalRank };
    return {
      online: true,
      ownerBadge,
      rank: rankOf?.(r, n) ?? 0,
      room: { id: r.id, name: r.name, players: r.players.size, max: r.max, locked: !!r.pass },
      activity: c.activity || `Hanging out in ${r.name}`,
    };
  }

  /** Full social picture for one user. */
  function snapshot(n) {
    const u = U(n);
    if (!u) return null;
    // Legacy one-way "friends" lists: only mutual entries count as friends
    const friends = (u.friends ?? []).filter(f => U(f) && isFriend(n, f)).map(f => ({
      name: display(f), variant: online.get(f)?.variant ?? U(f).lastVariant ?? 'classic', ...presence(f),
    }));
    friends.sort((a, b) => (b.online - a.online) || a.name.localeCompare(b.name));
    return {
      t: 'social', friends,
      reqIn: (u.reqIn ?? []).filter(U).map(display),
      reqOut: (u.reqOut ?? []).filter(U).map(display),
      blocked: (u.blocked ?? []).map(display),
      muted: (u.muted ?? []).map(display),
      unread: u.unread ?? {},
      groups: myGroups(n).map(g => ({
        id: g.id, name: g.name, owner: g.owner === n, count: g.members.length,
        members: g.members.map(display), unread: groupUnread(n, g.id),
      })).sort((a, b) => (b.unread - a.unread) || a.name.localeCompare(b.name)),
    };
  }

  const push = n => { const c = online.get(n); if (c) send(c, snapshot(n)); };
  /** Tell every online friend that n's presence changed. */
  function presenceChanged(n) {
    for (const f of U(n)?.friends ?? []) if (online.has(f) && isFriend(n, f)) push(f);
  }
  const toast = (n, text) => { const c = online.get(n); if (c) send(c, { t: 'socialNote', text }); };

  function befriend(a, b) {
    const ua = U(a), ub = U(b);
    ua.friends = add(ua.friends, b); ub.friends = add(ub.friends, a);
    ua.reqIn = without(ua.reqIn, b); ua.reqOut = without(ua.reqOut, b);
    ub.reqIn = without(ub.reqIn, a); ub.reqOut = without(ub.reqOut, a);
  }
  function unfriend(a, b) {
    const ua = U(a), ub = U(b);
    if (ua) { ua.friends = without(ua.friends, b); ua.reqIn = without(ua.reqIn, b); ua.reqOut = without(ua.reqOut, b); }
    if (ub) { ub.friends = without(ub.friends, a); ub.reqIn = without(ub.reqIn, a); ub.reqOut = without(ub.reqOut, a); }
  }

  function deliver(from, to, msg) {
    const k = convKey(from, to);
    const list = dms[k] ??= [];
    list.push(msg);
    if (list.length > MAX_HISTORY) list.splice(0, list.length - MAX_HISTORY);
    saveDms();
    const ut = U(to);
    ut.unread = { ...(ut.unread ?? {}), [from]: Math.min(99, (ut.unread?.[from] ?? 0) + 1) };
    saveUsers();
    const out = { t: 'dm', with: display(from), from: display(from), msg: { ...msg, f: display(msg.f) } };
    const tc = online.get(to); if (tc) send(tc, out);
    const fc = online.get(from); if (fc) send(fc, { ...out, with: display(to) });
  }

  function canDm(c, to) {
    const me = c.name.toLowerCase();
    if (!U(to) || to === me) return 'No such player';
    if (blockedEither(me, to)) return "You can't message this player";
    if (!isFriend(me, to)) return 'You can only message friends';
    return null;
  }

  function rate(c, key, ms) {
    const now = Date.now();
    c.rl ??= {};
    if (now - (c.rl[key] ?? 0) < ms) return false;
    c.rl[key] = now;
    return true;
  }

  /** Returns true when the message was a social one. */
  function handle(c, m) {
    const me = c.name.toLowerCase(), u = c.user;
    const target = lc(m.name ?? m.to);
    const err = text => send(c, { t: 'socialErr', text });
    switch (m.t) {
      case 'social': send(c, snapshot(me)); return true;

      case 'friendReq': case 'friend': {
        if (m.t === 'friend' && !m.on) { unfriend(me, target); saveUsers(); push(me); push(target); return true; }
        if (!rate(c, 'freq', 800)) return true;
        const tu = U(target);
        if (!tu || target === me) return err('No such player'), true;
        if (blockedEither(me, target)) return err("You can't add this player"), true;
        if (isFriend(me, target)) return push(me), true;
        if ((u.reqIn ?? []).includes(target)) { befriend(me, target); saveUsers(); push(me); push(target); toast(target, `${c.name} accepted your friend request`); return true; }
        if ((u.reqOut ?? []).includes(target)) return push(me), true;     // no duplicate requests
        if ((u.reqOut ?? []).length >= 50) return err('Too many pending requests'), true;
        u.reqOut = add(u.reqOut, target); tu.reqIn = add(tu.reqIn, me);
        saveUsers(); push(me); push(target);
        toast(target, `${c.name} sent you a friend request`);
        return true;
      }
      case 'friendAccept': {
        if (!(u.reqIn ?? []).includes(target) || !U(target)) return push(me), true;
        befriend(me, target); saveUsers(); push(me); push(target);
        toast(target, `${c.name} accepted your friend request`);
        return true;
      }
      case 'friendDecline': case 'friendCancel': {
        const tu = U(target);
        u.reqIn = without(u.reqIn, target); u.reqOut = without(u.reqOut, target);
        if (tu) { tu.reqIn = without(tu.reqIn, me); tu.reqOut = without(tu.reqOut, me); }
        saveUsers(); push(me); push(target);
        return true;
      }
      case 'unfriend': unfriend(me, target); saveUsers(); push(me); push(target); return true;

      case 'block': {
        if (!U(target) || target === me) return true;
        unfriend(me, target);
        if (m.on === false) u.blocked = without(u.blocked, target);
        else u.blocked = add(u.blocked, target).slice(-500);
        saveUsers(); push(me); push(target);
        return true;
      }
      case 'mute': {
        if (!U(target) || target === me) return true;
        u.muted = m.on === false ? without(u.muted, target) : add(u.muted, target).slice(-500);
        saveUsers(); push(me);
        return true;
      }

      case 'activity':
        if (!rate(c, 'activity', 2000) || !ACTIVITIES.has(m.text)) return true;
        if (c.activity === m.text) return true;
        c.activity = m.text;
        presenceChanged(me);
        return true;

      case 'joinFriend': {
        const fail = text => send(c, { t: 'error', err: text });
        if (!isFriend(me, target)) return fail('You can only join friends'), true;
        const fc = online.get(target);
        if (!fc) return fail(`${display(target)} is offline`), true;
        const room = fc.room;
        if (!room || !rooms.has(room.id)) return fail(`${display(target)} isn't in a room right now`), true;
        if (room === c.room) return fail(`You're already in ${room.name}`), true;
        if (room.players.size >= room.max) return fail(`${room.name} is full`), true;
        if (room.pass && room.pass !== m.pass) return fail(m.pass ? 'Wrong room password' : `${room.name} is password-locked`), true;
        if (ownerBans(room).includes(me)) return fail(`You're banned from ${room.owner}'s rooms`), true;
        joinRoom(c, room);
        return true;
      }

      case 'groupCreate': {
        if (!rate(c, 'gcreate', 2000)) return err('Slow down a little'), true;
        const name = clean(m.name).slice(0, 28) || 'New group';
        const want = [...new Set((Array.isArray(m.members) ? m.members : []).map(lc).filter(n => n && n !== me))].slice(0, MAX_GROUP - 1);
        if (!want.length) return err('Pick at least one friend'), true;
        for (const n of want) if (!isFriend(me, n)) return err(`${display(n)} is not your friend`), true;
        if (myGroups(me).length >= 20) return err('You have too many groups'), true;
        const id = crypto.randomBytes(5).toString('hex');
        gmsgs[id] = [];
        saveGmsgs();
        for (const n of [me, ...want]) {
          const nu = U(n); if (!nu) continue;
          nu.groups = [{ id, name, owner: me, members: [me, ...want], ts: Date.now() }, ...(nu.groups ?? [])].slice(0, 20);
        }
        saveUsers();
        for (const n of [me, ...want]) {
          push(n);
          if (n !== me) toast(n, `${c.name} added you to ${name}`);
        }
        return true;
      }
      case 'groupMsg': {
        const id = lc(m.id);
        const g = myGroups(me).find(x => x.id === id);
        if (!g) return err('You are not in that group'), true;
        if (!rate(c, `gmsg:${id}`, 300)) return err('Slow down a little'), true;
        const text = clean(m.text).slice(0, 500);
        if (!text) return true;
        const msg = { id: crypto.randomBytes(6).toString('hex'), f: me, x: text, ts: Date.now() };
        const list = (gmsgs[id] ??= []);
        list.push(msg);
        if (list.length > MAX_HISTORY) list.splice(0, list.length - MAX_HISTORY);
        saveGmsgs();
        // Bump the group to the top of every member's list.
        for (const n of g.members) {
          const nu = U(n); if (!nu) continue;
          const copy = (nu.groups ?? []).find(x => x.id === id);
          if (copy) copy.ts = Date.now();
          if (n !== me) nu.unread = { ...(nu.unread ?? {}), [gkey(id)]: Math.min(99, groupUnread(n, id) + 1) };
        }
        saveUsers();
        const out = { t: 'gdm', id, name: g.name, from: display(me), msg: { ...msg, f: display(me) } };
        for (const n of g.members) { const nc = online.get(n); if (nc) send(nc, out); }
        return true;
      }
      case 'groupHistory': {
        const id = lc(m.id);
        const g = myGroups(me).find(x => x.id === id);
        if (!g) return err('You are not in that group'), true;
        const msgs = (gmsgs[id] ?? []).slice(-80).map(x => ({ ...x, f: display(x.f) }));
        if (u.unread?.[gkey(id)]) { u.unread = { ...u.unread }; delete u.unread[gkey(id)]; saveUsers(); }
        send(c, { t: 'groupHistory', id, name: g.name, owner: g.owner === me, members: g.members.map(display), msgs });
        return true;
      }
      case 'groupRead': {
        const id = lc(m.id);
        if (u.unread?.[gkey(id)]) { u.unread = { ...u.unread }; delete u.unread[gkey(id)]; saveUsers(); push(me); }
        return true;
      }
      case 'groupLeave': {
        const id = lc(m.id);
        const mine = myGroups(me).find(x => x.id === id);
        if (!mine) return true;
        const people = [...mine.members];
        for (const n of people) {
          const nu = U(n); if (!nu) continue;
          const copy = (nu.groups ?? []).find(x => x.id === id);
          if (!copy) continue;
          copy.members = copy.members.filter(x => x !== me);
          if (!copy.members.length) {
            nu.groups = (nu.groups ?? []).filter(x => x.id !== id);
            delete gmsgs[id]; saveGmsgs();
          } else if (copy.owner === me) copy.owner = copy.members[0];
        }
        u.groups = (u.groups ?? []).filter(x => x.id !== id);
        if (u.unread?.[gkey(id)]) { u.unread = { ...u.unread }; delete u.unread[gkey(id)]; }
        saveUsers();
        for (const n of people) push(n);
        return true;
      }
      case 'groupAdd': {
        const id = lc(m.id);
        const g = myGroups(me).find(x => x.id === id);
        if (!g) return true;
        if (!isFriend(me, target)) return err('You can only add friends'), true;
        if (g.members.includes(target)) return push(me), true;
        if (g.members.length >= MAX_GROUP) return err('That group is full'), true;
        for (const n of g.members) {
          const copy = U(n)?.groups?.find(x => x.id === id);
          if (copy) copy.members = [...copy.members, target];
        }
        const tu = U(target);
        if (tu) tu.groups = [{ ...g, members: [...g.members, target] }, ...(tu.groups ?? [])].slice(0, 20);
        saveUsers();
        for (const n of [...g.members, target]) push(n);
        toast(target, `${c.name} added you to ${g.name}`);
        return true;
      }
      case 'dmHistory': {
        if (!U(target)) return true;
        const msgs = (dms[convKey(me, target)] ?? []).slice(-80).map(x => ({ ...x, f: display(x.f) }));
        if (u.unread?.[target]) { u.unread = { ...u.unread }; delete u.unread[target]; saveUsers(); }
        send(c, { t: 'dmHistory', with: display(target), msgs, canSend: !canDm(c, target) });
        return true;
      }
      case 'dmRead':
        if (u.unread?.[target]) { u.unread = { ...u.unread }; delete u.unread[target]; saveUsers(); }
        return true;
      case 'dm': {
        const e = canDm(c, target); if (e) return err(e), true;
        if (!rate(c, 'dm', 350)) return err('Slow down a little'), true;
        const text = clean(m.text).slice(0, 500);
        if (!text) return true;
        deliver(me, target, { id: crypto.randomBytes(6).toString('hex'), f: me, x: text, ts: Date.now() });
        return true;
      }
      case 'dmImg': {
        const e = canDm(c, target); if (e) return err(e), true;
        if (!rate(c, 'img', 4000)) return err('Wait a few seconds between images'), true;
        const day = new Date().toISOString().slice(0, 10);
        if (u.imgDay !== day) { u.imgDay = day; u.imgCount = 0; }
        if (u.imgCount >= IMG_PER_DAY) return err('Daily image limit reached'), true;
        if (typeof m.data !== 'string' || m.data.length > IMG_MAX * 1.4) return err('Image is too large (max 600 KB)'), true;
        let buf;
        try { buf = Buffer.from(m.data, 'base64'); } catch { return err('Could not read that image'), true; }
        if (!buf.length || buf.length > IMG_MAX) return err('Image is too large (max 600 KB)'), true;
        const kind = MAGIC.find(k => k.test(buf));          // trust bytes, never the client's type or name
        if (!kind) return err('Only PNG, JPEG, GIF or WebP images'), true;
        const id = crypto.randomBytes(16).toString('hex');
        fs.writeFile(path.join(UPLOADS, `${id}.${kind.ext}`), buf, er => {
          if (er) return err('Upload failed, try again');
          u.imgCount = (u.imgCount ?? 0) + 1;
          deliver(me, target, { id: crypto.randomBytes(6).toString('hex'), f: me, img: `/u/${id}.${kind.ext}`, x: clean(m.text).slice(0, 200), ts: Date.now() });
        });
        return true;
      }
      case 'reportImage': {
        if (!rate(c, 'ireport', 2500)) return err('Please wait before reporting another image'), true;
        const other = lc(m.name), msgId = clean(m.id).slice(0, 16), img = String(m.img ?? '');
        if (!U(other) || other === me || !msgId || !uploadPath(img)) return err('That image report is invalid'), true;
        const msg = (dms[convKey(me, other)] ?? []).find(x => x.id === msgId && x.img === img && lc(x.f) !== me);
        if (!msg) return err('That image is not available to report'), true;
        const file = uploadPath(img);
        if (!file || !fs.existsSync(file)) return err('That image is no longer available'), true;
        if (imageReports.some(r => r.img === img && lc(r.reporterKey ?? r.reporter) === me)) {
          send(c, { t: 'reportImageAck', id: msgId, img, duplicate: true });
          return true;
        }
        if (imageReports.length >= MAX_IMAGE_REPORTS) return err('The owner review queue is full'), true;
        imageReports.unshift({
          id: crypto.randomBytes(8).toString('hex'), img, reporter: display(me), reporterKey: me,
          sender: display(lc(msg.f)), recipient: display(other), ts: Date.now(),
        });
        saveReports();
        send(c, { t: 'reportImageAck', id: msgId, img, duplicate: false });
        pushReportSnapshot();
        return true;
      }
      case 'imageReports':
        if (!isPlatformOwner?.(me)) return err('Owner access required'), true;
        send(c, { t: 'imageReports', reports: reportSnapshot() });
        return true;
      case 'purgeImage': {
        if (!isPlatformOwner?.(me)) return err('Owner access required'), true;
        const report = imageReports.find(r => r.id === clean(m.id).slice(0, 32));
        if (!report) return err('That image report is no longer active'), true;
        const file = uploadPath(report.img);
        if (!file) return err('That image path is invalid'), true;
        try { fs.unlinkSync(file); } catch (e) { if (e.code !== 'ENOENT') return err('Could not remove that image'), true; }
        let removed = 0;
        for (const [key, list] of Object.entries(dms)) {
          const kept = list.filter(x => x.img !== report.img);
          const count = list.length - kept.length;
          removed += count;
          if (count) {
            dms[key] = kept;
            const [a, b] = key.split('|');
            for (const participant of [a, b]) {
              const client = online.get(participant);
              if (client) send(client, { t: 'imageRemoved', img: report.img });
            }
          }
        }
        if (removed) saveDms();
        imageReports = imageReports.filter(r => r.img !== report.img);
        saveReports();
        send(c, { t: 'imagePurged', img: report.img, removed });
        pushReportSnapshot();
        return true;
      }
    }
    return false;
  }

  /** Serve an uploaded image (path already matched UPLOAD_RE). */
  function serveUpload(res, match) {
    const kind = MAGIC.find(k => k.ext === match[2]);
    const file = path.join(UPLOADS, `${match[1]}.${match[2]}`);
    fs.readFile(file, (er, buf) => {
      if (er) { res.writeHead(404).end('Not found'); return; }
      res.writeHead(200, {
        'Content-Type': kind.mime, 'Content-Length': buf.length, 'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'", 'Cache-Control': 'private, max-age=31536000, immutable',
      });
      res.end(buf);
    });
  }

  /** Room chat filter: is either side blocking the other? */
  const blocks = (a, b) => blockedEither(a.toLowerCase(), b.toLowerCase());

  return { handle, snapshot, presenceChanged, serveUpload, blocks };
}
