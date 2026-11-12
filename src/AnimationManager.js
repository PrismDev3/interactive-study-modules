/**
 * AnimationManager.js
 * Finite-state machine for character animations with cross-fade blending.
 *
 * States:    IDLE → SPRINT → CROUCH → WEB_SWING → WEB_SHOOT → LAND
 * Each transition cross-fades over a configurable duration so there
 * is never a "pop" between clips.
 *
 * Usage:
 *   const anim = new AnimationManager(gltf.animations, mixer);
 *   anim.transitionTo(AnimState.SPRINT, 0.2);
 *   // in loop:
 *   anim.update(dt);
 */
import * as THREE from 'three';

export const AnimState = Object.freeze({
  IDLE:      'idle',
  SPRINT:    'sprint',
  CROUCH:    'crouch',
  WEB_SWING: 'web_swing',
  WEB_SHOOT: 'web_shoot',
  LAND:      'land',
  FALL:      'fall',
});

/** Map animation clip names as exported from your DCC / FBX bake */
const CLIP_NAMES = {
  [AnimState.IDLE]:      ['Idle', 'idle', 'Armature|Idle'],
  [AnimState.SPRINT]:    ['Run', 'Sprint', 'sprint', 'Armature|Run'],
  [AnimState.CROUCH]:    ['Crouch', 'crouch', 'Armature|Crouch'],
  [AnimState.WEB_SWING]: ['Swing', 'WebSwing', 'web_swing', 'Armature|Swing'],
  [AnimState.WEB_SHOOT]: ['Shoot', 'WebShoot', 'web_shoot', 'Armature|Shoot'],
  [AnimState.LAND]:      ['Land', 'land', 'Armature|Land'],
  [AnimState.FALL]:      ['Fall', 'fall', 'Armature|Fall'],
};

export class AnimationManager {
  constructor(clips, mixer) {
    this.mixer   = mixer;
    this.actions = {};
    this.current = null;
    this.state   = null;

    // ── Register all clips ──────────────────────────────────────────────
    for (const [state, nameList] of Object.entries(CLIP_NAMES)) {
      const clip = findClip(clips, nameList);
      if (clip) {
        const action = mixer.clipAction(clip);
        // All clips loop by default; LAND/SHOOT play once
        if (state === AnimState.LAND || state === AnimState.WEB_SHOOT) {
          action.setLoop(THREE.LoopOnce, 1);
          action.clampWhenFinished = true;
        }
        this.actions[state] = action;
      } else {
        console.warn(`[AnimationManager] No clip found for state "${state}"`);
      }
    }

    // ── Idle breathing: subtle additive layer ──────────────────────────
    // If the model ships a "BreathingAdditive" clip, blend it in permanently
    const breathClip = findClip(clips, ['BreathingAdditive', 'Breathing_add']);
    if (breathClip) {
      THREE.AnimationUtils.makeClipAdditive(breathClip);
      this.breathAction = mixer.clipAction(breathClip);
      this.breathAction.blendMode = THREE.AdditiveAnimationBlendMode;
      this.breathAction.setEffectiveWeight(0.4);
      this.breathAction.play();
    }

    // Listen for once-shots finishing so we can auto-transition
    this.mixer.addEventListener('finished', (e) => this._onClipFinished(e));

    // ── Start in IDLE ───────────────────────────────────────────────────
    this.transitionTo(AnimState.IDLE, 0);
  }

  /**
   * Cross-fade to a new state over `duration` seconds.
   * If duration === 0, the switch is instantaneous.
   */
  transitionTo(newState, duration = 0.25) {
    if (newState === this.state) return;

    const incoming = this.actions[newState];
    if (!incoming) {
      console.warn(`[AnimationManager] No action for state "${newState}"`);
      return;
    }

    const outgoing = this.current;
    this.state   = newState;
    this.current = incoming;

    if (!outgoing || duration === 0) {
      // Instant switch
      if (outgoing) outgoing.stop();
      incoming.reset().setEffectiveWeight(1).play();
    } else {
      // Cross-fade: outgoing fades out, incoming fades in
      incoming.reset().setEffectiveWeight(1);
      incoming.crossFadeFrom(outgoing, duration, true);
      incoming.play();
    }

    this._emitStateChange(newState);
  }

  /** Additive weight for the sprint lean (0–1 based on speed) */
  setSprintWeight(w) {
    if (this.actions[AnimState.SPRINT]) {
      // Not an additive blend here; handled via transitionTo.
      // This is for a separate lean/tilt additive clip if you have one.
    }
  }

  update(dt) {
    this.mixer.update(dt);
  }

  _onClipFinished(event) {
    const finishedAction = event.action;
    if (finishedAction === this.actions[AnimState.LAND]) {
      this.transitionTo(AnimState.IDLE, 0.3);
    } else if (finishedAction === this.actions[AnimState.WEB_SHOOT]) {
      // After firing, go back to whatever movement state is appropriate
      this._emitStateChange('web_shoot_done');
    }
  }

  _emitStateChange(state) {
    document.dispatchEvent(new CustomEvent('animstate', { detail: state }));
  }
}

/** Find the first clip whose name matches any entry in nameList (case-insensitive) */
function findClip(clips, nameList) {
  if (!clips?.length) return null;
  for (const name of nameList) {
    const c = clips.find(c => c.name.toLowerCase() === name.toLowerCase());
    if (c) return c;
  }
  return null;
}
