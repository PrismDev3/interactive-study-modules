// Generate hundreds of uniquely-named, educational-looking SVG launchers.
// Each file is identical in behaviour (it reads the live base URL from endpoint.json
// on jsDelivr and launches the interactive module), but has a distinct filename, so
// every one gets its own working cdn.jsdelivr.net link pointing at the source file.
//
// Usage:  node tools/generate-cdn-svgs.mjs [count]
// Output: cdn/<name>.svg  +  cdn/index.json  +  LINKS.md
//
// Config via env (optional): GH_USER, GH_REPO, GH_BRANCH
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GH_USER   = process.env.GH_USER   || 'PrismDev3';
const GH_REPO   = process.env.GH_REPO   || 'interactive-study-modules';
const GH_BRANCH = process.env.GH_BRANCH || 'main';
const COUNT     = Math.max(1, Number(process.argv[2]) || 300);

const CDN_ROOT = `https://cdn.jsdelivr.net/gh/${GH_USER}/${GH_REPO}@${GH_BRANCH}`;
const ENDPOINT = `${CDN_ROOT}/endpoint.json`;

const endpoint = JSON.parse(fs.readFileSync(path.join(ROOT, 'endpoint.json'), 'utf8'));
const FALLBACK = endpoint.base;
const template = fs.readFileSync(path.join(ROOT, 'cdn', '_template.svg'), 'utf8');

// ── Educational name vocabulary ────────────────────────────────────────────
const SUBJECTS = ['biology','chemistry','physics','algebra','geometry','calculus','statistics',
  'world-history','us-history','geography','economics','astronomy','ecology','grammar',
  'literature','civics','anatomy','geology','botany','zoology','psychology','trigonometry',
  'earth-science','environmental-science','government','spanish','french','music-theory'];
const TOPICS = ['cell-structure','photosynthesis','periodic-table','newtons-laws','quadratic-equations',
  'french-revolution','plate-tectonics','supply-and-demand','solar-system','food-webs',
  'parts-of-speech','the-water-cycle','bill-of-rights','probability','derivatives',
  'skeletal-system','rock-cycle','plant-life','vertebrates','human-memory','mitosis',
  'chemical-bonds','kinematics','linear-functions','the-cold-war','climate-zones',
  'market-structures','star-life-cycle','ecosystems','sentence-structure'];
const FORMATS = ['study-guide','diagram','notes','worksheet','review','flashcards',
  'module','lesson','summary','chart','overview','lab','unit-test-prep','key-terms'];

const titleCase = s => s.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Deterministic, varied, de-duplicated name/title pairs.
function* names() {
  for (const t of TOPICS) for (const f of FORMATS) {
    yield { slug: `${t}-${f}`, title: `${titleCase(t)} — ${titleCase(f)}` };
  }
  for (const s of SUBJECTS) for (const f of FORMATS) {
    yield { slug: `${s}-${f}`, title: `${titleCase(s)}: ${titleCase(f)}` };
  }
  for (const s of SUBJECTS) for (const t of TOPICS) {
    yield { slug: `${s}-${t}`, title: `${titleCase(s)} — ${titleCase(t)}` };
  }
}

const outDir = path.join(ROOT, 'cdn');
fs.mkdirSync(outDir, { recursive: true });
// Clear previously generated launchers (keep the template).
for (const f of fs.readdirSync(outDir)) {
  if (f.endsWith('.svg') && f !== '_template.svg') fs.unlinkSync(path.join(outDir, f));
}

const seen = new Set();
const made = [];
for (const { slug, title } of names()) {
  if (made.length >= COUNT) break;
  if (seen.has(slug)) continue;
  seen.add(slug);
  const svg = template
    .replaceAll('{{TITLE}}', esc(title))
    .replaceAll('{{ENDPOINT}}', ENDPOINT)
    .replaceAll('{{FALLBACK}}', FALLBACK);
  fs.writeFileSync(path.join(outDir, `${slug}.svg`), svg);
  made.push({ slug, title, url: `${CDN_ROOT}/cdn/${slug}.svg` });
}

fs.writeFileSync(path.join(outDir, 'index.json'),
  JSON.stringify({ repo: `${GH_USER}/${GH_REPO}`, branch: GH_BRANCH, base: FALLBACK, count: made.length, files: made }, null, 2));

const md = [
  `# Interactive module links (${made.length})`,
  '',
  `All links below serve the **same** source file under a different name. Each is a direct`,
  `\`cdn.jsdelivr.net/gh\` link to the SVG **source** in \`${GH_USER}/${GH_REPO}\` — opening one`,
  `launches the live interactive module. The live destination is read from \`endpoint.json\`,`,
  `so if it moves, update that one file and purge jsDelivr.`,
  '',
  ...made.map((m, i) => `${i + 1}. [${m.title}](${m.url})`),
  '',
].join('\n');
fs.writeFileSync(path.join(ROOT, 'LINKS.md'), md);

console.log(`Generated ${made.length} SVG launchers in cdn/`);
console.log(`Endpoint : ${ENDPOINT}`);
console.log(`Fallback : ${FALLBACK}`);
console.log(`Example  : ${made[0].url}`);
