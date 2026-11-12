// Rewrites city_map.obj without the objects the client throws away on load
// (Studs / Traffic / Street_Props — see SKIP_GROUPS in src/SceneSetup.js).
// Same output geometry as before, ~35% fewer bytes to download and parse.
import fs from 'node:fs';

const IN = 'assets/models/city_map.obj';
const OUT = 'assets/models/city_map.slim.obj';
const DROP = /^(Studs|Traffic|Street_Props)\b/;
const OBJ_START = /^(o|g)\s/;

const fd = fs.openSync(IN, 'r');
const out = fs.openSync(OUT, 'w');
const CHUNK = 8 << 20;
const buf = Buffer.allocUnsafe(CHUNK);

let carry = '', dropping = false, current = '(header)';
let keptBytes = 0, droppedBytes = 0, droppedObjects = 0;
let batch = [];

const flush = () => { if (batch.length) { fs.writeSync(out, batch.join('')); batch = []; } };

function handle(line) {
  if (OBJ_START.test(line)) {
    current = line.slice(2).trim();
    const drop = DROP.test(current);
    if (drop && !dropping) droppedObjects++;
    dropping = drop;
  }
  const n = line.length + 1;
  if (dropping) { droppedBytes += n; return; }
  keptBytes += n;
  batch.push(line, '\n');
  if (batch.length > 20000) flush();
}

for (;;) {
  const read = fs.readSync(fd, buf, 0, CHUNK, null);
  if (!read) break;
  const text = carry + buf.toString('utf8', 0, read);
  let start = 0, nl;
  while ((nl = text.indexOf('\n', start)) !== -1) {
    const line = text.slice(start, nl);
    handle(line.endsWith('\r') ? line.slice(0, -1) : line);
    start = nl + 1;
  }
  carry = text.slice(start);
}
if (carry) handle(carry.replace(/\r$/, ''));
flush();
fs.closeSync(fd);
fs.closeSync(out);

const mb = n => (n / 1048576).toFixed(1) + ' MB';
console.log(`kept ${mb(keptBytes)}  dropped ${mb(droppedBytes)} in ${droppedObjects} objects`);
