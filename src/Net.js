/** Net.js — thin WebSocket client for the game server (JSON messages with a `t` type). */
export class Net {
  constructor() {
    this.handlers = new Map();
    this.ws = null;
  }

  connect() {
    if (this.ws && this.ws.readyState <= 1) return this._open;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    this.ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws.onmessage = e => {
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      for (const fn of this.handlers.get(m.t) ?? []) fn(m);
    };
    this.ws.onclose = () => { for (const fn of this.handlers.get('close') ?? []) fn({}); };
    this._open = new Promise((res, rej) => {
      this.ws.onopen = res;
      this.ws.onerror = () => rej(new Error('Could not reach the game server'));
    });
    return this._open;
  }

  get connected() { return this.ws?.readyState === 1; }

  send(msg) { if (this.connected) this.ws.send(JSON.stringify(msg)); }

  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(fn);
    return () => this.handlers.get(type).delete(fn);
  }

  /** Send `msg` and resolve with the first reply whose type is in `types`. */
  request(msg, types) {
    return new Promise(resolve => {
      const offs = types.map(t => this.on(t, m => { offs.forEach(off => off()); resolve(m); }));
      this.send(msg);
    });
  }
}
