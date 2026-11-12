import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ACTIVITIES, ActivityReporter, activityFor } from '../src/Activity.js';
import { createSocial } from '../server/social.js';

assert.equal(activityFor({ mode: 'online', racing: true, fighting: true }), 'Racing');
assert.equal(activityFor({ mode: 'online', fighting: true, swinging: true }), 'Fighting');
assert.equal(activityFor({ mode: 'online', swinging: true }), 'Web-swinging');
assert.equal(activityFor({ mode: 'single', sub: 'story' }), 'Story mission');
assert.equal(activityFor({ mode: 'single', sub: 'gauntlet' }), 'Gauntlet');
assert.equal(activityFor({ mode: 'online', villains: true }), 'Villain waves');
assert.equal(activityFor({ mode: 'single', sub: 'freeplay' }), 'Exploring');
assert.ok(ACTIVITIES.every(label => label.length <= 40));

const sent = [];
const reporter = new ActivityReporter({ connected: true, send: message => sent.push(message) });
reporter.update('Exploring', 0.016);
reporter.update('Exploring', 0.016);
assert.deepEqual(sent, [{ t: 'activity', text: 'Exploring' }]);
reporter.update('Web-swinging', 0.05);
for (let i = 0; i < 24; i++) reporter.update('Web-swinging', 0.1);
assert.equal(sent.at(-1).text, 'Web-swinging');
assert.equal(sent.length, 2);
reporter.update('Fighting', 0.05);
reporter.update('Exploring', 0.05);
for (let i = 0; i < 24; i++) reporter.update('Exploring', 0.1);
assert.equal(sent.at(-1).text, 'Exploring');
assert.equal(sent.length, 3);

const disconnected = new ActivityReporter({ connected: false, send: message => sent.push(message) });
disconnected.update('Exploring', 1);
assert.equal(sent.length, 3);

const data = fs.mkdtempSync(path.join(os.tmpdir(), 'web-of-bricks-activity-'));
try {
  const users = {
    alice: { name: 'Alice', friends: ['bob'] },
    bob: { name: 'Bob', friends: ['alice'] },
  };
  const sender = { name: 'Alice', user: users.alice, room: { id: 'city', name: 'Daily Bugle', players: new Map() } };
  const friend = { name: 'Bob', user: users.bob, room: null };
  const online = new Map([['alice', sender], ['bob', friend]]);
  const updates = [];
  const social = createSocial({
    DATA: data, users, saveUsers() {}, online, rooms: new Map(),
    send: (client, message) => updates.push({ client, message }),
    joinRoom() {}, ownerBans: () => [],
  });

  const realNow = Date.now;
  let now = 100_000;
  Date.now = () => now;
  try {
    social.handle(sender, { t: 'activity', text: 'Web-swinging' });
    assert.equal(social.snapshot('bob').friends[0].activity, 'Web-swinging');
    assert.equal(updates.length, 1);
    now += 2_000;
    social.handle(sender, { t: 'activity', text: '<img src=x onerror=alert(1)>' });
    assert.equal(sender.activity, 'Web-swinging');
    assert.equal(updates.length, 1);
    now += 2_000;
    social.handle(sender, { t: 'activity', text: 'Racing' });
    assert.equal(social.snapshot('bob').friends[0].activity, 'Racing');
    assert.equal(updates.length, 2);
    now += 2_000;
    social.handle(sender, { t: 'activity', text: 'custom activity' });
    assert.equal(sender.activity, 'Racing');
    assert.equal(updates.length, 2);
  } finally {
    Date.now = realNow;
  }
} finally {
  fs.rmSync(data, { recursive: true, force: true });
}

console.log('PASS  gameplay modes map to concise friend activity labels');
console.log('PASS  activity transitions settle before sending and do not repeat');
console.log('PASS  disconnected and invalid states do not send activity');
console.log('PASS  server fans out allowlisted presence and rejects spam/custom labels');
