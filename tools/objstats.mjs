// Audit city_map.obj: bytes per object/group and per material, so we can see
// how much payload the client downloads and then discards at load time.
import fs from 'node:fs';

const FILE = 'assets/models/city_map.obj';
const fd = fs.openSync(FILE, 'r');
const CHUNK = 8 << 20;
const buf = Buffer.allocUnsafe(CHUNK);

const objBytes = new Map();
const matBytes = new Map();
const counts = { v: 0, f: 0, vt: 0, vn: 0, usemtl: 0, o: 0 };
let obj = '(header)', mat = '(none)', carry = '', total = 0;

function handle(line) {
  const n = line.length + 1;
  total += n;
  objBytes.set(obj, (objBytes.get(obj) ?? 0) + n);
  matBytes.set(mat, (matBytes.get(mat) ?? 0) + n);
  const c = line.charCodeAt(0);
  if (c === 111 /* o */ && line[1] === ' ') { obj = line.slice(2).trim(); counts.o++; }
  else if (c === 103 /* g */ && line[1] === ' ') { obj = line.slice(2).trim(); }
  else if (c === 118 /* v */) {
    if (line[1] === ' ') counts.v++;
    else if (line[1] === 't') counts.vt++;
    else if (line[1] === 'n') counts.vn++;
  } else if (c === 102 /* f */ && line[1] === ' ') counts.f++;
  else if (line.startsWith('usemtl ')) { mat = line.slice(7).trim(); counts.usemtl++; }
}

for (;;) {
  const read = fs.readSync(fd, buf, 0, CHUNK, null);
  if (!read) break;
  const text = carry + buf.toString('utf8', 0, read);
  let start = 0, nl;
  while ((nl = text.indexOf('\n', start)) !== -1) { handle(text.slice(start, nl)); start = nl + 1; }
  carry = text.slice(start);
}
if (carry) handle(carry);
fs.closeSync(fd);

const SKIP = /^(Traffic|Street_Props|Studs)/;
const rows = [...objBytes].sort((a, b) => b[1] - a[1]);
const mb = n => (n / 1048576).toFixed(1) + ' MB';
const skippedBytes = rows.filter(([k]) => SKIP.test(k)).reduce((s, [, v]) => s + v, 0);
const spawnBytes = matBytes.get('spawn') ?? 0;

console.log('total', mb(total), '| objects', counts.o, '| v', counts.v, 'f', counts.f, 'vn', counts.vn, 'usemtl', counts.usemtl);
console.log('\ntop objects:');
for (const [k, v] of rows.slice(0, 15)) console.log('  ' + mb(v).padStart(9) + '  ' + k);
console.log('\nskippable by name (Traffic|Street_Props|Studs):', mb(skippedBytes));
console.log('dropped material "spawn":', mb(spawnBytes));
console.log('\ntop materials:');
for (const [k, v] of [...matBytes].sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log('  ' + mb(v).padStart(9) + '  ' + k);
