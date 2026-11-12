/**
 * TouchControls.js — the phone/tablet control scheme.
 *
 * Left thumb: a stick appears under your thumb and moves the hero.
 * Right thumb: drag anywhere on the right half to look.
 * Three actions only: jump, web (hold to swing), punch.
 * The hero's ability tiles double as buttons, and a small pause key sits top right.
 *
 * Movement goes through CharacterController.setTouchMove (the same flags WASD writes), and
 * one-shot actions are sent as synthetic keys, so touch obeys binds, story input locks and
 * every gameplay rule without a second code path.
 */

const STICK_R = 56;        // px the knob travels from centre
const LIVE = 0.22;         // dead zone before the stick counts as pushed

const isTouch = () => document.documentElement.classList.contains('touch');

function sendKey(type, code) {
  const ev = new KeyboardEvent(type, { code, key: code, bubbles: true, cancelable: true });
  ev.__remapped = true;    // Binds.js leaves it alone; touch always sends the default action
  document.dispatchEvent(ev);
}

const ICONS = {
  jump: '<svg viewBox="0 0 24 24"><path d="M12 19V6"/><path d="M6 12l6-6 6 6"/><path d="M5 21h14"/></svg>',
  web: '<svg viewBox="0 0 24 24"><path d="M12 3v18M4.8 7.6l14.4 8.8M19.2 7.6L4.8 16.4"/><circle cx="12" cy="3.4" r="1.1"/></svg>',
  hit: '<svg viewBox="0 0 24 24"><path d="M12 3.4l2 5.2 5.6 1.2-4.2 3.4 1.3 5.4L12 15.6l-4.7 3 1.3-5.4L4.4 9.8l5.6-1.2z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M9 6v12M15 6v12"/></svg>',
};

export class TouchControls {
  constructor(controller) {
    if (!isTouch()) return;
    this.controller = controller;
    this.moveId = null;
    this.lookId = null;
    this.stickAt = { x: 0, y: 0 };
    this.lookAt = { x: 0, y: 0 };
    this._build();
    this._bind();
  }

  _build() {
    const ui = document.createElement('div');
    ui.id = 'touch-ui';
    ui.innerHTML = `
      <div class="tc-zone tc-look" aria-hidden="true"></div>
      <div class="tc-zone tc-move" aria-hidden="true"></div>
      <div class="tc-stick" aria-hidden="true"><i class="tc-knob"></i></div>
      <div class="tc-actions">
        <button type="button" class="tc-btn tc-web" aria-label="Web: hold to swing">${ICONS.web}</button>
        <button type="button" class="tc-btn tc-jump" aria-label="Jump">${ICONS.jump}</button>
        <button type="button" class="tc-btn tc-hit" aria-label="Punch">${ICONS.hit}</button>
      </div>
      <button type="button" class="tc-pause" aria-label="Pause">${ICONS.pause}</button>
      <div class="tc-hint">Left thumb moves &middot; drag the right side to look</div>`;
    document.body.appendChild(ui);
    this.ui = ui;
    this.stick = ui.querySelector('.tc-stick');
    this.knob = ui.querySelector('.tc-knob');
  }

  _bind() {
    const move = this.ui.querySelector('.tc-move');
    const look = this.ui.querySelector('.tc-look');

    const endMove = e => {
      if (e && e.pointerId !== this.moveId) return;
      this.moveId = null;
      this.stick.classList.remove('on');
      this.knob.style.transform = '';
      this.controller.setTouchMove?.(0, 0, false);
    };

    move.addEventListener('pointerdown', e => {
      if (this.moveId !== null) return;
      e.preventDefault();
      this.moveId = e.pointerId;
      try { move.setPointerCapture(e.pointerId); } catch (err) {}
      // A floating stick: it starts where the thumb lands, kept clear of the screen edge.
      const pad = 66;
      this.stickAt.x = Math.max(pad, Math.min(innerWidth - pad, e.clientX));
      this.stickAt.y = Math.max(pad, Math.min(innerHeight - pad, e.clientY));
      this.stick.style.left = `${this.stickAt.x}px`;
      this.stick.style.top = `${this.stickAt.y}px`;
      this.stick.classList.add('on');
      this._moveTo(e.clientX, e.clientY);
    });
    move.addEventListener('pointermove', e => {
      if (e.pointerId === this.moveId) this._moveTo(e.clientX, e.clientY);
    });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) move.addEventListener(ev, endMove);

    look.addEventListener('pointerdown', e => {
      if (this.lookId !== null) return;
      e.preventDefault();
      this.lookId = e.pointerId;
      try { look.setPointerCapture(e.pointerId); } catch (err) {}
      this.lookAt.x = e.clientX;
      this.lookAt.y = e.clientY;
    });
    look.addEventListener('pointermove', e => {
      if (e.pointerId !== this.lookId) return;
      this.controller.lookBy?.(e.clientX - this.lookAt.x, e.clientY - this.lookAt.y);
      this.lookAt.x = e.clientX;
      this.lookAt.y = e.clientY;
    });
    const endLook = e => { if (!e || e.pointerId === this.lookId) this.lookId = null; };
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) look.addEventListener(ev, endLook);

    const bindHold = (btn, code) => {
      let upTimer = null;
      const release = () => {
        clearTimeout(upTimer);
        // A jump tap can be shorter than one frame; hold the key just long enough to land.
        upTimer = setTimeout(() => sendKey('keyup', code), code === 'Space' ? 130 : 0);
      };
      btn.addEventListener('pointerdown', e => {
        e.preventDefault();
        clearTimeout(upTimer);
        try { btn.setPointerCapture(e.pointerId); } catch (err) {}
        btn.classList.add('down');
        sendKey('keydown', code);
      });
      btn.addEventListener('pointerup', e => { e.preventDefault(); btn.classList.remove('down'); release(); });
      btn.addEventListener('pointercancel', () => { btn.classList.remove('down'); release(); });
      btn.addEventListener('lostpointercapture', () => { btn.classList.remove('down'); release(); });
    };
    bindHold(this.ui.querySelector('.tc-web'), 'KeyE');
    bindHold(this.ui.querySelector('.tc-jump'), 'Space');
    bindHold(this.ui.querySelector('.tc-hit'), 'KeyF');

    const pause = this.ui.querySelector('.tc-pause');
    pause.addEventListener('pointerdown', e => {
      e.preventDefault();
      sendKey('keydown', 'Escape');
      sendKey('keyup', 'Escape');
    });

    // Hero ability tiles are the only extra buttons: a tap casts that ability.
    window.addEventListener('pointerdown', e => {
      if (!isTouch() || !document.body.classList.contains('in-game')) return;
      const tile = e.target instanceof Element ? e.target.closest('#ability-bar .ab-tile') : null;
      const code = tile?.closest('.ab-slot')?.dataset.code;
      if (!code) return;
      e.preventDefault();
      e.stopPropagation();
      sendKey('keydown', code);
      sendKey('keyup', code);
    }, true);

    this.ui.addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { endMove(); endLook(); }
    });
  }

  _moveTo(x, y) {
    let dx = x - this.stickAt.x, dy = y - this.stickAt.y;
    const len = Math.hypot(dx, dy);
    if (len > STICK_R) { dx = (dx * STICK_R) / len; dy = (dy * STICK_R) / len; }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const nx = dx / STICK_R, ny = dy / STICK_R, mag = Math.hypot(nx, ny);
    if (mag < LIVE) { this.controller.setTouchMove?.(0, 0, false); return; }
    this.controller.setTouchMove?.(nx, ny, mag > 0.86);   // full push sprints
  }
}
