import assert from 'node:assert/strict';
import { roomPolicy } from '../src/RoomPolicy.js';

assert.deepEqual(roomPolicy({ pvp: true, health: true, emotes: true }), {
  pvp: true, noDamage: false, emotes: true,
});
assert.deepEqual(roomPolicy({ pvp: false, health: false, emotes: false }), {
  pvp: false, noDamage: true, emotes: false,
});
assert.deepEqual(roomPolicy({}), { pvp: false, noDamage: false, emotes: true });
assert.deepEqual(roomPolicy(null), { pvp: false, noDamage: false, emotes: true });

console.log('PASS  PvP, health, and emote room flags normalize consistently');
console.log('PASS  missing room flags use the safe non-PvP defaults');
