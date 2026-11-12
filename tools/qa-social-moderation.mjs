import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createSocial } from '../server/social.js';

const data = fs.mkdtempSync(path.join(os.tmpdir(), 'web-of-bricks-social-'));
const messages = [];
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  const users = {
    alice: { name: 'Alice', friends: ['bob'], blocked: [], muted: [], unread: {} },
    bob: { name: 'Bob', friends: ['alice'], blocked: [], muted: [], unread: {} },
    jexel: { name: 'Jexel', friends: [], blocked: [], muted: [], unread: {} },
  };
  const alice = { name: 'Alice', user: users.alice };
  const bob = { name: 'Bob', user: users.bob };
  const owner = { name: 'Jexel', user: users.jexel };
  const online = new Map([['alice', alice], ['bob', bob], ['jexel', owner]]);
  const social = createSocial({
    DATA: data, users, saveUsers() {}, online, rooms: new Map(),
    send: (client, message) => messages.push({ client, message }),
    joinRoom() {}, ownerBans: () => [], isPlatformOwner: name => name === 'jexel',
  });
  const latest = (client, type) => messages.filter(x => x.client === client && x.message.t === type).at(-1)?.message;

  // The server checks PNG magic bytes; image rendering is not needed for this moderation test.
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
  social.handle(bob, { t: 'dmImg', to: 'alice', data: png.toString('base64'), text: 'review this' });
  for (let i = 0; i < 30 && !latest(alice, 'dm')?.msg?.img; i++) await delay(25);
  const delivered = latest(alice, 'dm')?.msg;
  assert.ok(delivered?.img, 'valid DM image should be delivered');

  social.handle(alice, { t: 'reportImage', name: 'bob', id: delivered.id, img: delivered.img });
  const ownerQueue = latest(owner, 'imageReports');
  assert.equal(latest(alice, 'reportImageAck')?.duplicate, false);
  assert.equal(ownerQueue?.reports?.length, 1);
  assert.equal(ownerQueue.reports[0].img, delivered.img);
  const realNow = Date.now;
  Date.now = () => realNow() + 3_000;
  try { social.handle(alice, { t: 'reportImage', name: 'bob', id: 'forged-id', img: delivered.img }); }
  finally { Date.now = realNow; }
  assert.equal(latest(alice, 'socialErr')?.text, 'That image is not available to report');
  assert.equal(latest(owner, 'imageReports')?.reports?.length, 1);
  Date.now = () => realNow() + 6_000;
  try { social.handle(alice, { t: 'reportImage', name: 'bob', id: delivered.id, img: delivered.img }); }
  finally { Date.now = realNow; }
  assert.equal(latest(alice, 'reportImageAck')?.duplicate, true);
  assert.equal(latest(owner, 'imageReports')?.reports?.length, 1);
  await delay(450);
  assert.equal(JSON.parse(fs.readFileSync(path.join(data, 'image-reports.json'), 'utf8')).length, 1,
    'image report should persist across server restarts');
  console.log('PASS  reports are bound to DM images, de-duplicated, and persisted');

  social.handle(alice, { t: 'purgeImage', id: ownerQueue.reports[0].id });
  assert.equal(latest(alice, 'socialErr')?.text, 'Owner access required');
  social.handle(alice, { t: 'imageReports' });
  assert.equal(latest(alice, 'socialErr')?.text, 'Owner access required');
  social.handle(owner, { t: 'imageReports' });
  assert.equal(latest(owner, 'imageReports')?.reports?.length, 1);
  console.log('PASS  non-owners cannot read or purge the owner review queue');

  social.handle(owner, { t: 'purgeImage', id: ownerQueue.reports[0].id });
  const purged = latest(owner, 'imagePurged');
  assert.equal(purged?.img, delivered.img);
  assert.equal(purged?.removed, 1);
  assert.ok(messages.some(x => x.client === alice && x.message.t === 'imageRemoved' && x.message.img === delivered.img));
  assert.ok(messages.some(x => x.client === bob && x.message.t === 'imageRemoved' && x.message.img === delivered.img));
  const fileName = delivered.img.match(/^\/u\/([0-9a-f]{32})\.(png|jpg|gif|webp)$/);
  assert.ok(fileName);
  assert.equal(fs.existsSync(path.join(data, 'uploads', `${fileName[1]}.${fileName[2]}`)), false);
  social.handle(alice, { t: 'dmHistory', name: 'bob' });
  assert.equal(latest(alice, 'dmHistory')?.msgs?.some(m => m.img === delivered.img), false);
  await delay(450);
  assert.equal(JSON.parse(fs.readFileSync(path.join(data, 'image-reports.json'), 'utf8')).length, 0);
  assert.equal(JSON.parse(fs.readFileSync(path.join(data, 'dms.json'), 'utf8'))['alice|bob'].length, 0);
  console.log('PASS  owner purge deletes the upload, removes DM references, and refreshes both participants');
} finally {
  const relative = path.relative(path.resolve(os.tmpdir()), path.resolve(data));
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)
    || !path.basename(data).startsWith('web-of-bricks-social-')) {
    throw new Error(`Refusing to remove unexpected temporary data directory: ${data}`);
  }
  fs.rmSync(data, { recursive: true, force: true });
}
