/**
 * Outfit.js — the player's saved look (suit + gear), its network code, and the stud wallet.
 * Outfit code: "suitKey|gear1,gear2" e.g. "miles|hood_red,catpack" or "custom-c8202a-5a0a10-1f3fa8|cape".
 */
import { VARIANTS } from './Variants.js?v=67';
import { GEAR } from './Gear.js?v=65';

const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};

export function parseOutfit(code = 'classic') {
  const [suit, gear = ''] = String(code).split('|');
  return { suit: suit || 'classic', gear: gear.split(',').filter(id => GEAR[id]) };
}

export const outfitCode = o => `${o.suit}${o.gear.length ? `|${o.gear.join(',')}` : ''}`;

/** Saved outfit codes from earlier builds. Iron Spider is a Spider-Man suit now, not a
 *  standalone hero, so old saves (and the server's stored variant) move to the suit. */
const SAVE_MAP = { 'hero-ironspider': 'iron' };
const migrateSuit = s => SAVE_MAP[s] ?? s;

export function loadOutfit() {
  const saved = ls.get('outfit');
  if (saved) {
    const o = parseOutfit(saved);
    const suit = migrateSuit(o.suit);
    if (suit !== o.suit) saveOutfit({ ...o, suit });
    return { ...o, suit };
  }
  const legacy = ls.get('variant'); // older saves only had a suit
  return { suit: VARIANTS[migrateSuit(legacy)] ? migrateSuit(legacy) : 'classic', gear: [] };
}

export function saveOutfit(o) { ls.set('outfit', outfitCode(o)); }

/** Equip `id`, replacing anything else in the same slot. Equipping it again takes it off. */
export function toggleGear(o, id) {
  if (o.gear.includes(id)) return { ...o, gear: o.gear.filter(g => g !== id) };
  const slot = GEAR[id].slot;
  return { ...o, gear: [...o.gear.filter(g => GEAR[g].slot !== slot), id] };
}

/**
 * Studs + unlocked items. Offline it is saved in this browser (story-mode studs);
 * once logged in it is the account's wallet on the server.
 */
export const wallet = {
  account: null, // { studs, owned, infinite } while logged in
  net: null,

  useAccount(w, net) {
    this.account = w;
    this.net = net;
    net.on('wallet', m => { this.account = m.wallet; this.onChange?.(); });
  },

  get infinite() { return !!this.account?.infinite; },
  get studs() { return this.account ? (this.account.infinite ? Infinity : this.account.studs) : Number(ls.get('studs')) || 0; },
  set studs(v) { if (!this.account) ls.set('studs', String(Math.max(0, Math.floor(v)))); },
  get owned() {
    if (this.account) return this.account.owned;
    try { return JSON.parse(ls.get('owned') ?? '[]'); } catch { return []; }
  },
  owns(id) { return this.owned.includes(id); },
  buy(id, price) {
    if (this.owns(id)) return true;
    if (this.studs < price) return false;
    window.gameSfx?.play('unlock');
    if (this.account) {
      // Optimistic; the server checks and answers with the real wallet
      if (!this.account.infinite) this.account.studs -= price;
      this.account.owned = [...this.account.owned, id];
      this.net.send({ t: 'buy', id });
      return true;
    }
    this.studs -= price;
    ls.set('owned', JSON.stringify([...this.owned, id]));
    return true;
  },
};
