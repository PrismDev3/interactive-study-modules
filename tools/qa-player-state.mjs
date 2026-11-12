/** End-to-end QA for player-state validation. Uses an isolated temporary account store. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { normalizePlayerState } from '../src/PlayerState.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PASS = 'qa-player-state-pass';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let failures = 0;
const check = (ok, label) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failures++;
};

function client(url, name) {
  const ws = new WebSocket(url), inbox = [], waiters = [];
  ws.on('message', raw => {
    let message;
    try { message = JSON.parse(raw); } catch { return; }
    for (const waiter of [...waiters]) {
      if (!waiter.test(message)) continue;
      waiters.splice(waiters.indexOf(waiter), 1);
      clearTimeout(waiter.timer);
      waiter.resolve(message);
      return;
    }
    inbox.push(message);
  });
  const opened = new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  return {
    ws, inbox, name,
    opened,
    send: message => ws.send(JSON.stringify(message)),
    wait(test, ms = 2500) {
      const i = inbox.findIndex(test);
      if (i >= 0) return Promise.resolve(inbox.splice(i, 1)[0]);
      return new Promise(resolve => {
        const waiter = { test, resolve, timer: null };
        waiter.timer = setTimeout(() => {
          const at = waiters.indexOf(waiter);
          if (at >= 0) waiters.splice(at, 1);
          resolve(null);
        }, ms);
        waiters.push(waiter);
      });
    },
  };
}

async function sparePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', resolve).once('error', reject));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

const currentState = {
  p: [1, 2, 3], r: 0.2, sp: 12, vy: -1, g: 0, c: 0, cr: 0, sw: 1,
  wa: -1, wg: 0, a: [12, 22, 32], at: 0.2, aa: 1, hide: 0, em: null,
  tk: ['backflip', 0.4], rp: [0.3, -0.6],
};

async function main() {
  const legacy = normalizePlayerState({ p: [3, 4, 5], r: 0, sp: 0, vy: 0, g: 1 });
  assert.ok(legacy, 'legacy player state should stay compatible');
  assert.equal(legacy.sw, 0);
  assert.deepEqual(legacy.a, null);
  assert.deepEqual(normalizePlayerState(currentState), currentState);
  for (const malformed of [
    null,
    [],
    {},
    { p: [0, 0, 0] },
    { p: [0, null, 0], r: 0 },
    { p: [100001, 0, 0], r: 0 },
    { p: [0, 0, 0], r: 0, a: { x: 1 } },
    { p: [0, 0, 0], r: 0, rp: [0, 0, 0] },
    { p: [0, 0, 0], r: 0, sp: 1e9 },
  ]) assert.equal(normalizePlayerState(malformed), null);
  check(true, 'state schema accepts current and legacy packets, rejects malformed values');

  const tempData = fs.mkdtempSync(path.join(os.tmpdir(), 'web-of-bricks-state-'));
  const port = await sparePort();
  const output = { out: '', err: '' };
  let serverProcess;
  const clients = [];
  try {
    serverProcess = spawn(process.execPath, ['server/server.js'], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(port), GAME_DATA_DIR: tempData },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    serverProcess.stdout.setEncoding('utf8').on('data', chunk => { output.out += chunk; });
    serverProcess.stderr.setEncoding('utf8').on('data', chunk => { output.err += chunk; });
    const started = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`server startup timeout\n${output.err}`)), 5000);
      serverProcess.stdout.on('data', chunk => {
        if (!String(chunk).includes('server on http://')) return;
        clearTimeout(timer);
        resolve();
      });
      serverProcess.once('error', err => { clearTimeout(timer); reject(err); });
      serverProcess.once('exit', code => {
        clearTimeout(timer);
        reject(new Error(`server exited (${code})\n${output.err}`));
      });
    });
    await started;

    const url = `ws://127.0.0.1:${port}/ws`;
    const suffix = Math.random().toString(36).slice(2, 8);
    const owner = client(url, `qa${suffix}a`), guest = client(url, `qa${suffix}b`);
    clients.push(owner, guest);
    await Promise.all([owner.opened, guest.opened]);
    for (const c of clients) {
      c.send({ t: 'register', name: c.name, pass: PASS });
      const auth = await c.wait(m => m.t === 'auth');
      assert.equal(auth?.ok, true, `test account registration failed: ${auth?.err}`);
    }

    owner.send({ t: 'create', name: 'State QA', max: 4 });
    const joinedOwner = await owner.wait(m => m.t === 'joined');
    assert.ok(joinedOwner, 'owner should create a room');
    guest.send({ t: 'join', id: joinedOwner.room.id });
    const joinedGuest = await guest.wait(m => m.t === 'joined');
    assert.ok(joinedGuest, 'guest should join the room');

    const malformed = [
      null,
      {},
      { p: [0, 0, 0] },
      { p: [0, null, 0], r: 0 },
      { p: [0, 0, 0], r: 0, a: { x: 1 } },
      { p: [0, 0, 0], r: 0, rp: [0, 0, 0] },
    ];
    let rejected = true;
    for (const s of malformed) {
      guest.inbox.length = 0;
      owner.send({ t: 'state', s });
      await delay(80);
      if (guest.inbox.some(m => m.t === 'state' && m.id === joinedOwner.you)) rejected = false;
    }
    check(rejected, 'malformed packets are not broadcast to room members');

    guest.inbox.length = 0;
    owner.send({ t: 'state', s: { p: [7, 8, 9], r: 0, sp: 0, vy: 0, g: 1 } });
    const legacyPacket = await guest.wait(m => m.t === 'state' && m.id === joinedOwner.you);
    check(legacyPacket?.s?.sw === 0 && legacyPacket?.s?.p?.[1] === 8,
      'valid legacy state is normalized before broadcast');

    await delay(30);
    owner.send({ t: 'state', s: currentState });
    const currentPacket = await guest.wait(m => m.t === 'state' && m.id === joinedOwner.you);
    check(currentPacket?.s?.a?.[2] === 32 && currentPacket?.s?.tk?.[0] === 'backflip',
      'valid swing and trick fields still reach room members');

    await delay(30);
    guest.inbox.length = 0;
    for (let i = 0; i < 20; i++) owner.send({ t: 'state', s: { ...currentState, p: [i, 2, 3] } });
    await delay(120);
    const burstCount = guest.inbox.filter(m => m.t === 'state' && m.id === joinedOwner.you).length;
    check(burstCount >= 1 && burstCount <= 2,
      'state bursts are rate-limited while valid 15 Hz gameplay updates remain supported');

    guest.inbox.length = 0;
    owner.send({ t: 'emote', e: '<script>' });
    await delay(80);
    const invalidEmoteRejected = !guest.inbox.some(m => m.t === 'emote');
    owner.send({ t: 'emote', e: 'highfive' });
    const emote = await guest.wait(m => m.t === 'emote' && m.id === joinedOwner.you);
    owner.send({ t: 'emote', e: 'wave' });
    await delay(80);
    const emoteBurstCount = guest.inbox.filter(m => m.t === 'emote' && m.id === joinedOwner.you).length;
    check(invalidEmoteRejected && emote?.e === 'highfive' && emoteBurstCount === 0,
      'room emotes accept known gestures and reject custom or burst messages');
  } finally {
    for (const c of clients) c.ws.close();
    if (serverProcess && serverProcess.exitCode === null) {
      const exited = once(serverProcess, 'exit');
      serverProcess.kill();
      await Promise.race([exited, delay(2500)]);
    }
    const relative = path.relative(path.resolve(os.tmpdir()), path.resolve(tempData));
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)
      || !path.basename(tempData).startsWith('web-of-bricks-state-')) {
      throw new Error(`Refusing to remove unexpected temporary data directory: ${tempData}`);
    }
    fs.rmSync(tempData, { recursive: true, force: true });
  }
  if (failures) process.exitCode = 1;
  else console.log('\nall player-state checks passed');
}

main().catch(err => { console.error('QA failed:', err.message); process.exitCode = 1; });
