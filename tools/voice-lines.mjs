#!/usr/bin/env node
/**
 * voice-lines.mjs — script export / import for voice acting with VoiceStudio (github.com/debpalash/VoiceStudio).
 *
 *   node tools/voice-lines.mjs           → assets/voice/lines.csv  (one row per spoken line: id, speaker, brief, text)
 *                                          + assets/voice/cast.csv (one row per character: voice brief to design/clone)
 *   node tools/voice-lines.mjs --index   → assets/voice/manifest.json from the audio files in assets/voice/
 *
 * Workflow: design or clone one voice per row of cast.csv in VoiceStudio, batch-render lines.csv with each row's
 * speaker voice, save every clip as <id>.wav (or .mp3/.ogg) into assets/voice/, then run --index. Lines without a
 * file fall back to the browser's synthesized voice, so you can record a few at a time.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'assets', 'voice');
fs.mkdirSync(OUT, { recursive: true });

// Must match lineId() in src/Voice.js
function lineId(speaker, text) {
  let h = 0x811c9dc5;
  for (const ch of `${speaker}|${text}`) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  const slug = String(speaker).toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 10);
  return `${slug}_${h.toString(16).padStart(8, '0')}`;
}

if (process.argv.includes('--index')) {
  const files = {};
  for (const f of fs.readdirSync(OUT)) {
    const m = f.match(/^(.+)\.(wav|mp3|ogg|m4a)$/i);
    if (m) files[m[1]] = `assets/voice/${f}`;
  }
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ files }, null, 1));
  console.log(`manifest.json: ${Object.keys(files).length} voiced lines`);
  process.exit(0);
}

const src = fs.readFileSync(path.join(ROOT, 'src', 'Story.js'), 'utf8');
const voiceSrc = fs.readFileSync(path.join(ROOT, 'src', 'Voice.js'), 'utf8');
const names = {};
for (const m of src.matchAll(/(\w+) = \['([^']+)'/g)) names[m[1]] = m[2];
const briefs = {};
for (const m of voiceSrc.matchAll(/'([^']+)':\s*\{[^}]*brief: '((?:[^'\\]|\\.)*)'/g)) briefs[m[1]] = m[2];

const STR = '"((?:[^"\\\\]|\\\\.)*)"';
const rows = new Map();
const add = (who, text) => {
  const speaker = names[who] ?? who;
  text = text.replace(/\\(.)/g, '$1');
  const id = lineId(speaker, text);
  if (!rows.has(id)) rows.set(id, { id, speaker, text });
};
for (const m of src.matchAll(new RegExp(`who: (\\w+), text: ${STR}`, 'g'))) add(m[1], m[2]);
for (const m of src.matchAll(new RegExp(`who: \\['([^']+)'[^\\]]*\\], text: ${STR}`, 'g'))) add(m[1], m[2]);
for (const m of src.matchAll(new RegExp(`\\[(\\w+), ${STR}\\]`, 'g'))) add(m[1], m[2]);

const q = v => `"${String(v).replace(/"/g, '""')}"`;
const list = [...rows.values()];
fs.writeFileSync(path.join(OUT, 'lines.csv'), 'id,speaker,brief,text\n'
  + list.map(r => [r.id, r.speaker, briefs[r.speaker] ?? '', r.text].map(q).join(',')).join('\n') + '\n');
const cast = [...new Set(list.map(r => r.speaker))];
fs.writeFileSync(path.join(OUT, 'cast.csv'), 'speaker,lines,brief\n'
  + cast.map(c => [c, list.filter(r => r.speaker === c).length, briefs[c] ?? ''].map(q).join(',')).join('\n') + '\n');
console.log(`lines.csv: ${list.length} lines, ${cast.length} characters → ${path.relative(ROOT, OUT)}`);
