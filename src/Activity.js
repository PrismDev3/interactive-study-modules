/** Stable, allowlisted activity labels for friend presence. */
export const ACTIVITIES = Object.freeze([
  'Racing',
  'Fighting',
  'Web-swinging',
  'Story mission',
  'Gauntlet',
  'Villain waves',
  'Exploring',
]);

export function activityFor({ mode, sub, villains, racing, swinging, fighting } = {}) {
  if (racing) return 'Racing';
  if (fighting) return 'Fighting';
  if (swinging) return 'Web-swinging';
  if (mode === 'single' && sub === 'gauntlet') return 'Gauntlet';
  if (mode === 'single' && sub !== 'freeplay') return 'Story mission';
  if (villains) return 'Villain waves';
  return 'Exploring';
}

/** Report transitions only after they settle, avoiding presence spam from quick state changes. */
export class ActivityReporter {
  constructor(net, settleSeconds = 2.25) {
    this.net = net;
    this.settleSeconds = settleSeconds;
    this.sent = null;
    this.pending = null;
    this.pendingFor = 0;
  }

  update(label, dt) {
    if (!ACTIVITIES.includes(label) || !this.net?.connected) {
      this.sent = null;
      this.pending = null;
      this.pendingFor = 0;
      return;
    }
    if (label === this.sent) {
      this.pending = null;
      this.pendingFor = 0;
      return;
    }
    if (label !== this.pending) {
      this.pending = label;
      this.pendingFor = 0;
    } else {
      this.pendingFor += Math.max(0, Math.min(0.1, Number(dt) || 0));
    }
    if (this.sent === null || this.pendingFor >= this.settleSeconds) {
      this.net.send({ t: 'activity', text: label });
      this.sent = label;
      this.pending = null;
      this.pendingFor = 0;
    }
  }
}
