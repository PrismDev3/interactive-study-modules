/**
 * Race.js — online web-swing races. A mod/admin/owner starts one from the K menu: everyone in
 * the room gets a 3-2-1, then a finish marker 150-260 m away. First to touch it wins; the server
 * decides the winner (and pays out studs to their account), so nobody can fake a win.
 */
export class Race {
  constructor({ net, story, hud, ui, controller, life, mp, chat, me, hub = false }) {
    Object.assign(this, { net, story, hud, ui, controller, life, mp, chat, me, hub });
    this.active = null;
    net.on('race', m => this._begin(m));
    net.on('raceWin', m => this._end(m));
    net.on('raceOff', () => this._end(null));
    // START RACE button inside the K panel, for mods and up
    const admin = document.getElementById('admin');
    if (admin && !document.getElementById('admin-race')) {
      const b = Object.assign(document.createElement('button'), { id: 'admin-race', className: 'brick small wide', textContent: 'START RACE' });
      b.onclick = () => this.start();
      admin.insertBefore(b, admin.firstChild);
    }
    setInterval(() => {
      const b = document.getElementById('admin-race');
      if (b) b.hidden = ((this.mp?.myRank ?? 0) < 1 && !this.hub) || document.body.classList.contains('dorm');
    }, 1000);
    this._tick = setInterval(() => this._check(), 150);
  }

  /** Pick a finish line on a street some way off and ask the server to start the race. */
  start() {
    if (this.active) { this.chat?.system('A race is already running'); return; }
    const kinds = new Set(['asphalt', 'paint', 'sidewalk', 'path']);
    const spot = this.life?._findSpot(kinds, 150, 260);
    if (!spot) { this.chat?.system('No good finish line nearby, try again'); return; }
    this.net.send({ t: 'race', x: spot.x, y: spot.y, z: spot.z });
  }

  _begin(m) {
    const at = { x: m.x, y: m.y, z: m.z };
    this.active = { at, open: false, t0: 0 };
    let n = 3;
    const count = () => {
      if (!this.active) return;
      if (n > 0) { window.gameSfx?.play('countdown'); this.hud.toast(String(n)); n--; setTimeout(count, 1000); return; }
      this.hud.toast('GO!'); window.gameSfx?.play('go');
      this.active.open = true;
      this.active.t0 = performance.now();
      this._showMarker(at);
      this.ui.setObjective?.('RACE: first to the marker wins');
    };
    this.chat?.system(`${m.by} started a race!`);
    count();
  }

  _showMarker(at) {
    const s = this.story;
    if (!s?._marker) return;
    const v = s._marker.position.clone().set(at.x, at.y, at.z);
    s.markerPos = v;
    s._marker.position.copy(v);
    s._marker.visible = true;
  }

  _check() {
    const a = this.active;
    if (!a?.open || a.sent) return;
    const p = this.controller.root.position;
    if (Math.hypot(p.x - a.at.x, p.z - a.at.z) < 6 && Math.abs(p.y - 0.5 - a.at.y) < 8) {
      a.sent = true;
      this.net.send({ t: 'raceDone' });
    }
  }

  _end(m) {
    if (this.story?._marker) { this.story._marker.visible = false; this.story.markerPos = null; }
    this.ui.setObjective?.(null);
    if (m) {
      this.hud.toast(m.winnerId === this.me?.id ? 'YOU WIN!' : `${m.name.toUpperCase()} WINS`);
      window.gameSfx?.play(m.winnerId === this.me?.id ? 'complete' : 'leave');
      this.chat?.system(`${m.name} won the race in ${m.secs}s (${m.wins} win${m.wins === 1 ? '' : 's'})`);
    }
    this.active = null;
  }
}
