// QA bot: logs in as qa_buddy, joins the hub, stands near the player, befriends qa_tester1, sends a DM + image.
// Usage: node tools/social-bot.mjs [port]
import { WebSocket } from 'ws';
import fs from 'node:fs';
const acc = JSON.parse(fs.readFileSync(new URL('./qa-accounts.json', import.meta.url))).bot;
const port = process.argv[2] ?? 8081, target = 'qa_tester1';
const ws = new WebSocket(`ws://localhost:${port}/ws`);
const send = m => ws.send(JSON.stringify(m));
let friends = false, said = false, pos = null;
ws.on('open', () => send({ t: 'register', name: acc.name, pass: acc.pass }));
ws.on('message', d => {
  const m = JSON.parse(d);
  if (m.t === 'auth' && !m.ok && /taken/.test(m.err)) return send({ t: 'login', name: acc.name, pass: acc.pass });
  if (m.t === 'auth' && m.ok) { console.log('bot in'); send({ t: 'join', id: 'hub' }); }
  if (m.t === 'joined') console.log('bot joined', m.room.name, m.players.map(p => p.name));
  if (m.t === 'state' && !pos) pos = m.s.p;           // follow the first player we see
  if (m.t === 'social') {
    friends = m.friends.some(f => f.name.toLowerCase() === target);
    if (m.reqIn.some(n => n.toLowerCase() === target)) send({ t: 'friendAccept', name: target });
    console.log('social', JSON.stringify({ f: m.friends.map(f => f.name), in: m.reqIn, out: m.reqOut, bl: m.blocked, mu: m.muted }));
    if (friends && !said) { said = true; setTimeout(() => send({ t: 'dm', to: target, text: 'Hey! Want to swing over to the bridge?' }), 1500); }
  }
  if (m.t === 'dm') console.log('dm', m.msg.f, m.msg.x, m.msg.img ?? '');
  if (m.t === 'socialErr' || m.t === 'error') console.log('err', m.text ?? m.err);
});
setInterval(() => {
  if (!pos) return;
  send({ t: 'state', s: { p: [pos[0] + 3, pos[1], pos[2]], r: Math.PI, sp: 0, vy: 0, g: 1 } });
}, 100);
process.stdin.on('data', d => { const t = String(d).trim(); if (t === 'req') send({ t: 'friendReq', name: target }); else if (t) send({ t: 'dm', to: target, text: t }); });
