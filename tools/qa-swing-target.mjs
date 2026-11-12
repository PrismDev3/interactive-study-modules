import assert from 'node:assert/strict';
import { makeSkyAnchor } from '../src/SwingTarget.js';

const slow = makeSkyAnchor({ x: 0, y: 2, z: 0 }, { x: 0, z: -1 }, { x: 0, y: -20, z: 0 });
assert.deepEqual(slow, { x: 0, y: 26, z: -28 });

const fast = makeSkyAnchor({ x: 1, y: 2, z: 3 }, { x: 1, z: 0 }, { x: 200, y: 40, z: 0 });
assert.deepEqual(fast, { x: 43, y: 32, z: 3 });

const reverse = makeSkyAnchor({ x: 10, y: 0, z: 5 }, { x: -1, z: 0 }, { x: 16, y: 0, z: 0 });
assert.equal(reverse.x < 10, true);
assert.equal(reverse.z, 5);

console.log('PASS  open-sky anchor remains forward of the player');
console.log('PASS  reach and height stay within the designed bounds at rest and high speed');
console.log('PASS  fallback follows the travel direction');
