// Cache-bust helper: node tools/bump.mjs src/A.js [src/B.css ...]
// Bumps `?v=N` for every import of the given files, then cascades to every module that imports a
// bumped module, up to index.html. Prints what changed.
import fs from 'node:fs';
import path from 'node:path';

import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const files = [...fs.readdirSync(SRC).filter(f => f.endsWith('.js')).map(f => path.join(SRC, f)), path.join(ROOT, 'index.html')];
const queue = process.argv.slice(2).map(f => path.basename(f));
const done = new Set();
while (queue.length) {
  const name = queue.shift();
  if (done.has(name)) continue;
  done.add(name);
  const re = new RegExp(`(${name.replace(/[.]/g, '\\.')}\\?v=)(\\d+)`, 'g');
  for (const f of files) {
    const s = fs.readFileSync(f, 'utf8');
    if (!re.test(s)) continue;
    re.lastIndex = 0;
    fs.writeFileSync(f, s.replace(re, (_, a, n) => a + (Number(n) + 1)));
    console.log(`${path.basename(f)}: ${name} bumped`);
    if (f.endsWith('.js')) queue.push(path.basename(f));
  }
}
