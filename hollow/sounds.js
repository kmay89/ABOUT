/**
 * Hollow — a handful of small sounds, all synthesised, nothing downloaded.
 * A tick when a setting changes, a soft click for a view, a short rising
 * note when a preview is ready, a two-note chime when an export is built,
 * a low thunk for a problem, and a pouring hush for the pour animation.
 * Quiet by design; a mute button remembers its choice. Nothing plays until
 * the page has had a tap or a click, as browsers require.
 */

export class Sounds {
  constructor() {
    this.enabled = true;
    try { this.enabled = localStorage.getItem('hollow-sound') !== 'off'; } catch { /* private mode */ }
    this.ctx = null;
    this.master = null;
    this.lastTick = 0;
    this.unlocked = false; // browsers only let audio start after a tap or a click
  }
  /** Call from a user gesture: from then on sounds may play. */
  unlock() { this.unlocked = true; this.ready(); }
  setEnabled(on) {
    this.enabled = on;
    try { localStorage.setItem('hollow-sound', on ? 'on' : 'off'); } catch { /* ignore */ }
    if (on) this.click();
  }
  /** Create the context lazily, on a user gesture. */
  ready() {
    if (!this.enabled || !this.unlocked) return null;
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.35;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return this.ctx.state === 'running' ? this.ctx : null;
    } catch { return null; }
  }
  /** One note: type, frequency sweep, gain envelope. */
  note(type, f0, f1, gain, attack, decay, delay = 0) {
    const ctx = this.ready(); if (!ctx) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator(), env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, t + attack + decay);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    osc.connect(env).connect(this.master);
    osc.start(t); osc.stop(t + attack + decay + 0.05);
  }
  /** Filtered noise, for whooshes and pours. */
  hush(duration, gain, f0, f1, delay = 0) {
    const ctx = this.ready(); if (!ctx) return;
    const t = ctx.currentTime + delay;
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buffer;
    const filter = ctx.createBiquadFilter(); filter.type = 'bandpass'; filter.Q.value = 0.8;
    filter.frequency.setValueAtTime(f0, t); filter.frequency.exponentialRampToValueAtTime(f1, t + duration);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + duration * 0.3);
    env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(filter).connect(env).connect(this.master);
    src.start(t); src.stop(t + duration + 0.05);
  }
  tick() {
    const now = performance.now();
    if (now - this.lastTick < 80) return; // a slider sends many
    this.lastTick = now;
    this.note('triangle', 1400, 1100, 0.08, 0.004, 0.05);
  }
  click() { this.note('sine', 520, 400, 0.12, 0.004, 0.07); }
  preview() { this.note('sine', 440, 660, 0.12, 0.01, 0.18); }
  built() { this.note('sine', 523, 523, 0.14, 0.01, 0.25); this.note('sine', 784, 784, 0.14, 0.01, 0.4, 0.12); }
  error() { this.note('triangle', 220, 140, 0.16, 0.01, 0.22); }
  pour(duration = 2.2) { this.hush(duration, 0.09, 300, 900); }
  snap() { this.note('square', 1800, 900, 0.05, 0.002, 0.03); }
}
