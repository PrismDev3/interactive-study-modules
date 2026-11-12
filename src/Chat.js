/**
 * Chat.js — top-right chat log + input, typing indicator, and emoji turned into pixel art.
 */
import { isTypingTarget, overlayOpen, restoreGameFocus } from './Input.js?v=2';
import { appendRoleBadge } from './RoleBadge.js?v=1';
const EMOJI_RE = /(\p{Regional_Indicator}{2}|\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}️?|\p{Emoji_Modifier})*)/u;
const SPLIT_RE = new RegExp(EMOJI_RE.source, 'gu');
const emojiCache = new Map();

/** Render an emoji at 12px and keep it tiny, so scaling it up gives chunky pixels. */
export function pixelEmoji(e) {
  if (!emojiCache.has(e)) {
    const c = document.createElement('canvas');
    c.width = c.height = 14;
    const g = c.getContext('2d');
    g.font = '12px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(e, 7, 8);
    // Snap alpha so edges are hard pixels, not smooth antialiasing
    const d = g.getImageData(0, 0, 14, 14);
    for (let i = 3; i < d.data.length; i += 4) d.data[i] = d.data[i] > 90 ? 255 : 0;
    g.putImageData(d, 0, 0);
    emojiCache.set(e, c);
  }
  return emojiCache.get(e);
}

/** Split text into plain strings and emoji tokens. */
export function tokenize(text) {
  return text.split(SPLIT_RE).filter(Boolean).map(s => (EMOJI_RE.test(s) && s.length <= 16 ? { emoji: s } : s));
}

function appendRich(el, text) {
  for (const tok of tokenize(text)) {
    if (typeof tok === 'string') { el.append(tok); continue; }
    const img = document.createElement('img');
    img.src = pixelEmoji(tok.emoji).toDataURL();
    img.alt = tok.emoji;
    img.className = 'px emoji';
    el.append(img);
  }
}

export class Chat {
  constructor(net) {
    this.net = net;
    this.box = document.getElementById('chat');
    this.log = document.getElementById('chat-log');
    this.input = document.getElementById('chat-input');
    this.onMessage = null;   // (id, name, text) for chat bubbles
    this.onTyping = null;    // (id, on)
    this.myId = null;
    this.who = () => ({});   // id -> { color, face } provided by Multiplayer
    this.unread = 0;
    this.box.classList.add('show');
    try { if (localStorage.getItem('chatCollapsed') === '1') this.box.classList.add('collapsed'); } catch {}
    document.getElementById('chat-toggle').onclick = () => this.setCollapsed(!this.box.classList.contains('collapsed'));

    document.addEventListener('keydown', e => {
      if (e.target === this.input || document.body.classList.contains('cinematic')) return;
      // Don't open chat over the pause menu, Friends, the Bugle board or a text field
      if (isTypingTarget(e) || overlayOpen(['#chat.typing'])) return;
      if (e.code === 'KeyT' || e.code === 'Enter') {
        e.preventDefault();
        this.open();
      }
    });
    // A panel opening (pause, Friends, emotes) takes the keyboard away from chat
    document.addEventListener('close-overlays', () => this.close());
    // Keys typed into chat must not reach the game's document listeners
    this.input.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.code === 'Enter') this.sendInput();
      if (e.code === 'Escape') this.close();
    });
    this.input.addEventListener('input', () => this._typing(this.input.value.length > 0));
    this.input.addEventListener('blur', () => this.close());

    net.on('chat', m => this.receive(m.id, m.name, m.text, m.rank));
    net.on('typing', m => this.onTyping?.(m.id, m.on));
  }

  setCollapsed(on) {
    this.box.classList.toggle('collapsed', on);
    if (!on) { this.unread = 0; document.getElementById('chat-unread').textContent = ''; }
    try { localStorage.setItem('chatCollapsed', on ? '1' : '0'); } catch {}
  }

  open() {
    if (this.box.classList.contains('collapsed')) this.setCollapsed(false);
    this.box.classList.add('typing');
    if (document.pointerLockElement) document.exitPointerLock();
    this.input.focus();
  }

  close() {
    if (!this.box.classList.contains('typing') && document.activeElement !== this.input) return;
    const hadFocus = document.activeElement === this.input;
    this.box.classList.remove('typing');
    this.input.value = '';
    this._typing(false);
    this.input.blur();
    if (hadFocus) restoreGameFocus();
  }

  _typing(on) {
    if (on === this._isTyping) return;
    this._isTyping = on;
    this.net.send({ t: 'typing', on });
    this.onTyping?.(this.myId, on);
  }

  sendInput() {
    const text = this.input.value.trim().slice(0, 140);
    if (text) {
      this.net.send({ t: 'chat', text });
      this.receive(this.myId, this.myName, text, this.myRank);
    }
    this.close();
  }

  isMuted(name) { return this._muted().includes(String(name).toLowerCase()); }
  setMuted(name, on) {
    const set = new Set(this._muted());
    if (on) set.add(String(name).toLowerCase()); else set.delete(String(name).toLowerCase());
    try { localStorage.setItem('muted', JSON.stringify([...set])); } catch {}
  }
  _muted() { try { return JSON.parse(localStorage.getItem('muted') ?? '[]'); } catch { return []; } }

  receive(id, name, text, rank = 0) {
    if (id !== this.myId && this.isMuted(name)) return;   // muted players' chat never shows
    const info = this.who(id) ?? {};
    const line = document.createElement('div');
    line.className = 'chat-line';
    const face = document.createElement('span');
    face.className = 'chat-face';
    // Faces are rendered in the background; fill the circle in as soon as it's ready
    const setFace = url => { if (url) face.style.backgroundImage = `url(${url})`; };
    if (typeof info.face === 'string') setFace(info.face);
    else info.face?.then(setFace);
    const body = document.createElement('span');
    body.className = 'chat-body';
    const who = document.createElement('span');
    who.className = 'chat-name';
    who.style.color = info.color ?? '';
    who.textContent = name;
    appendRoleBadge(who, info.rank ?? rank, 'chat-role-badge');
    who.append(document.createTextNode(': '));
    body.append(who);
    appendRich(body, text);
    line.append(face, body);
    if (this.box.classList.contains('collapsed') && id !== this.myId) {
      this.unread++;
      document.getElementById('chat-unread').textContent = `(${this.unread})`;
    }
    this.log.append(line);
    while (this.log.children.length > 9) this.log.firstChild.remove();
    setTimeout(() => line.classList.add('old'), 12000);
    this.onMessage?.(id, name, text);
  }

  system(text) {
    const line = document.createElement('div');
    line.className = 'chat-line sys';
    line.textContent = text;
    this.log.append(line);
    while (this.log.children.length > 9) this.log.firstChild.remove();
    setTimeout(() => line.classList.add('old'), 8000);
  }
}
