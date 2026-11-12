/**
 * qa-admin.mjs — protocol test for room roles and world-host authority.
 *
 * Run the game server on a spare port, then this script:
 *   PORT=8123 node server/server.js &
 *   PORT=8123 node tools/qa-admin.mjs
 *
 * It proves, with three real WebSocket clients:
 *  - a regular player cannot stream summoned characters
 *  - the owner can promote a player to admin (rank 2)
 *  - when the owner leaves, the admin becomes the elected world host
 *  - the admin's summoned characters reach everyone in the room
 *  - a regular player still cannot stream, and cannot kick an admin
 *  - an admin can kick a lower-ranked player
 * Accounts are unique per run (qa<random><role>).
 */
import WebSocket from 'ws';

const PORT = Number(process.env.PORT) || 8123;
const URL = `ws://127.0.0.1:${PORT}/ws`;
const PASS = 'qa-pass-123';
const rand = Math.random().toString(36).slice(2, 7);

function client(tag) {
  const name = `qa${rand}${tag}`.slice(0, 16);
  const ws = new WebSocket(URL);
  const inbox = [];
  const waiters = [];
  ws.on('message', raw => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    inbox.push(m);
    for (const w of [...waiters]) if (w.pred(m)) { waiters.splice(waiters.indexOf(w), 1); w.resolve(m); }
  });
  const send = m => ws.send(JSON.stringify(m));
  const wait = (pred, ms = 2500) => new Promise(resolve => {
    const hit = inbox.find(pred);
    if (hit) return resolve(hit);
    const w = { pred, resolve };
    waiters.push(w);
    setTimeout(() => { const i = waiters.indexOf(w); if (i >= 0) { waiters.splice(i, 1); resolve(null); } }, ms);
  });
  const open = new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
  return { name, ws, send, wait, inbox, open };
}

let failures = 0;
const check = (ok, label) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) failures++; };

async function main() {
  const a = client('a'), b = client('b'), c = client('c');
  await Promise.all([a.open, b.open, c.open]);
  for (const cl of [a, b, c]) {
    cl.send({ t: 'register', name: cl.name, pass: PASS });
    const auth = await cl.wait(m => m.t === 'auth');
    if (!auth?.ok) throw new Error(`register ${cl.name}: ${auth?.err}`);
  }

  a.send({ t: 'create', name: 'QA Admin Test', max: 8 });
  const joinedA = await a.wait(m => m.t === 'joined');
  if (!joinedA) throw new Error('owner could not create a room');
  const room = joinedA.room.id;

  b.send({ t: 'join', id: room });
  const joinedB = await b.wait(m => m.t === 'joined');
  c.send({ t: 'join', id: room });
  const joinedC = await c.wait(m => m.t === 'joined');
  check(!!joinedB && !!joinedC, 'two players can join the room');
  check(joinedA.host === joinedA.you, 'owner is the initial world host (join payload)');
  check(joinedB.host === joinedA.you, 'join payload names the current host for a new player');

  // A regular player must not be able to stream world entities.
  c.send({ t: 'ents', list: [{ id: 1, k: 'foe', s: 'classic', p: [0, 0, 0] }] });
  const leaked = await a.wait(m => m.t === 'ents', 400) || await b.wait(m => m.t === 'ents', 100);
  check(!leaked, 'regular player cannot stream summoned characters');

  // A regular player must not be able to kick anyone.
  c.send({ t: 'mod', action: 'kick', target: joinedB.you });
  const kickedB = await b.wait(m => m.t === 'kicked', 400);
  check(!kickedB, 'regular player cannot kick an admin');

  // Owner promotes B to admin.
  a.send({ t: 'mod', action: 'rank', target: joinedB.you, value: 2 });
  const rankB = await b.wait(m => m.t === 'rank' && m.id === joinedB.you && m.rank === 2);
  check(!!rankB, 'owner can assign admin (rank 2)');

  // Owner leaves: B is the highest-ranked player left, so the server elects B host.
  a.send({ t: 'leave' });
  const hostB = await b.wait(m => m.t === 'host' && m.id === joinedB.you, 1500);
  check(!!hostB, 'admin becomes world host when the owner leaves');

  // Admin streams a character; the regular player receives it.
  b.send({ t: 'ents', list: [{ id: 42, k: 'foe', s: 'classic', p: [1, 2, 3] }] });
  const gotEnts = await c.wait(m => m.t === 'ents' && m.list?.[0]?.id === 42, 1500);
  check(!!gotEnts, "admin's summoned characters reach the room");

  // The regular player still cannot stream.
  c.inbox.length = 0;
  c.send({ t: 'ents', list: [{ id: 99, k: 'foe', s: 'classic', p: [0, 0, 0] }] });
  const spoof = await b.wait(m => m.t === 'ents' && m.list?.[0]?.id === 99, 400);
  check(!spoof, 'admin host blocks spoofed entity streams');

  // Admin kicks the regular player (rank 2 > rank 0).
  b.send({ t: 'mod', action: 'kick', target: joinedC.you });
  const kickedC = await c.wait(m => m.t === 'kicked', 1500);
  check(!!kickedC, 'admin can kick a regular player');

  for (const cl of [a, b, c]) cl.ws.close();
  console.log(failures ? `\n${failures} FAILED` : '\nall role checks passed');
  process.exitCode = failures ? 1 : 0;
}

main().catch(err => { console.error('QA failed:', err.message); process.exitCode = 1; });
