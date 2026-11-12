/**
 * Voice.js — spoken dialogue.
 *
 * 1. Recorded/generated lines: assets/voice/<id>.mp3|.wav|.ogg, listed in assets/voice/manifest.json.
 *    Generate them with VoiceStudio (github.com/debpalash/VoiceStudio): run `node tools/voice-lines.mjs`
 *    to get assets/voice/lines.csv (id, speaker, voice brief, text), render each row in VoiceStudio with
 *    that character's cloned/designed voice, save as <id>.wav, then run `node tools/voice-lines.mjs --index`.
 * 2. Fallback: the browser's speech synthesizer, with a per-character pitch/rate/voice so everyone sounds distinct.
 *
 * The id is FNV-1a of "speaker|text", so it stays stable unless the line is rewritten.
 */
import { settings } from './Settings.js?v=62';

export function lineId(speaker, text) {
  let h = 0x811c9dc5;
  for (const ch of `${speaker}|${text}`) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  const slug = String(speaker).toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 10);
  return `${slug}_${h.toString(16).padStart(8, '0')}`;
}

// Casting sheet: synth fallback settings + the brief handed to VoiceStudio (exported in lines.csv).
export const CAST = {
  'Peter':            { g: 'm', pitch: 1.15, rate: 1.08, brief: 'Young man, late teens. Quick, warm, nervous humour; cracks under grief.' },
  'Spider-Man':       { g: 'm', pitch: 1.12, rate: 1.1,  brief: 'Same actor as Peter, a little more confident and quippy behind the mask.' },
  'Aunt May':         { g: 'f', pitch: 1.05, rate: 0.92, brief: 'Woman in her 60s, gentle and steady, a dry sense of humour.' },
  'Uncle Ben':        { g: 'm', pitch: 0.8,  rate: 0.9,  brief: 'Man in his 60s, calm, low and kind; every word chosen carefully.' },
  'Gwen':             { g: 'f', pitch: 1.2,  rate: 1.08, brief: 'Young woman, sharp and bright, teasing but caring.' },
  'Mary Jane':        { g: 'f', pitch: 1.1,  rate: 1.02, brief: 'Young woman, playful and confident, perceptive, never fooled.' },
  'Harry':            { g: 'm', pitch: 1.0,  rate: 1.0,  brief: 'Young man, rich-kid charm with a crack of insecurity; turns bitter, then raw.' },
  'Norman Osborn':    { g: 'm', pitch: 0.85, rate: 0.9,  brief: 'Man in his 50s, smooth, cold, condescending.' },
  'Green Goblin':     { g: 'm', pitch: 1.3,  rate: 1.15, brief: 'Manic, cackling, theatrical; the same man as Norman, unhinged.' },
  'Adrian Toomes':    { g: 'm', pitch: 0.75, rate: 0.92, brief: 'Blue-collar man in his 50s, gravelly, resentful.' },
  'The Vulture':      { g: 'm', pitch: 0.7,  rate: 0.95, brief: 'Toomes through a helmet: gravelly, menacing.' },
  'Otto':             { g: 'm', pitch: 0.9,  rate: 0.95, brief: 'Middle-aged scientist, warm mentor, precise diction.' },
  'Doctor Octopus':   { g: 'm', pitch: 0.75, rate: 0.85, brief: 'Otto, colder and detached, as if the machine speaks through him.' },
  'Dr. Connors':      { g: 'm', pitch: 0.95, rate: 0.98, brief: 'Kind professor, strained and desperate.' },
  'The Lizard':       { g: 'm', pitch: 0.5,  rate: 0.8,  brief: 'Hissing, guttural, reptilian.' },
  'Sandman':          { g: 'm', pitch: 0.6,  rate: 0.85, brief: 'Big tired man, rough voice, sorrowful more than evil.' },
  'Venom':            { g: 'm', pitch: 0.3,  rate: 0.8,  brief: 'Deep, doubled, wet growl; speaks as "we".' },
  'Quentin Beck':     { g: 'm', pitch: 0.95, rate: 1.0,  brief: 'Showman, polished and charming, quietly vain.' },
  'Mysterio':         { g: 'm', pitch: 0.85, rate: 0.9,  brief: 'Beck with stage reverb, grand and mocking.' },
  'J. Jonah Jameson': { g: 'm', pitch: 0.9,  rate: 1.3,  brief: 'Loud, fast, blustering newspaper editor.' },
  'Stan Lee':         { g: 'm', pitch: 1.0,  rate: 1.0,  brief: 'Cheerful older New Yorker narrator, big enthusiasm.' },
  'Oscorp Scientist': { g: 'm', pitch: 1.0,  rate: 1.0,  brief: 'Nervous lab tech.' },
};

class VoiceDirector {
  constructor() {
    this.files = null;          // id -> url, from manifest.json
    this.current = null;
    this._load = fetch('assets/voice/manifest.json').then(r => (r.ok ? r.json() : {})).catch(() => ({}))
      .then(m => { this.files = m.files ?? {}; });
    this.synth = window.speechSynthesis ?? null;
    this.voices = [];
    const grab = () => { this.voices = this.synth?.getVoices() ?? []; };
    grab();
    this.synth?.addEventListener?.('voiceschanged', grab);
  }

  get enabled() { return settings.get('voice') !== false && settings.get('sfxVol') > 0; }

  _pick(g, name) {
    const en = this.voices.filter(v => /^en/i.test(v.lang));
    const pool = en.length ? en : this.voices;
    const F = /zira|female|samantha|aria|jenny|susan|hazel|libby|sonia|karen|moira|tessa|victoria|fiona|michelle/i;
    const want = pool.filter(v => (g === 'f' ? F.test(v.name) : !F.test(v.name)));
    const list = want.length ? want : pool;
    if (!list.length) return null;
    let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return list[h % list.length];
  }

  /**
   * Speak a line. Resolves when it finishes (or is stopped). Resolves `false` straight away when nothing
   * can speak it, so the caller can fall back to the mumble.
   */
  async speak(speaker, text) {
    this.stop();
    if (!this.enabled) return false;
    await this._load;
    const vol = Math.min(1, settings.get('sfxVol') * 1.1);
    const url = this.files?.[lineId(speaker, text)];
    if (url) {
      const a = new Audio(url);
      a.volume = vol;
      return new Promise(res => {
        this.current = { stop: () => { a.pause(); res(true); } };
        a.onended = () => res(true);
        a.onerror = () => res(false);
        a.play().catch(() => res(false));
      });
    }
    if (!this.synth || !window.SpeechSynthesisUtterance) return false;
    const c = CAST[speaker] ?? { g: /may|gwen|mary|jane/i.test(speaker) ? 'f' : 'm', pitch: 1, rate: 1 };
    const u = new SpeechSynthesisUtterance(text.replace(/\.\.\./g, ', '));
    u.voice = this._pick(c.g, speaker);
    u.pitch = c.pitch; u.rate = c.rate; u.volume = vol;
    return new Promise(res => {
      const t = setTimeout(() => res(true), 2000 + text.length * 120);   // some engines never fire onend
      u.onend = u.onerror = () => { clearTimeout(t); res(true); };
      this.current = { stop: () => { this.synth.cancel(); clearTimeout(t); res(true); } };
      this.synth.speak(u);
    });
  }

  stop() { const c = this.current; this.current = null; c?.stop(); }
}

export const voice = new VoiceDirector();
window.voice = voice;
