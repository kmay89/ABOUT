/**
 * Small sounds, made on the spot: no files, nothing to load. A wooden tock
 * when a bin lands, a tick when one is picked, a two-note slide when one
 * goes, a soft chime when a file is ready. Everything runs through one
 * quiet master gain, starts only after a gesture (browsers insist), and
 * stays off when the switch is off. Nothing here is needed for the page
 * to work; a browser without WebAudio gets silence.
 */

const STORAGE = 'cubby.sound';
let context = null, master = null, enabled = true;

try { enabled = localStorage.getItem(STORAGE) !== 'off'; } catch { /* default on */ }

function ensure() {
  if (context) return context;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  context = new AC();
  master = context.createGain();
  master.gain.value = 0.22;
  master.connect(context.destination);
  return context;
}

/** Call on the first gesture so later sounds are not blocked. */
export function wake() {
  const c = ensure();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
}

export function isOn() { return enabled; }
export function setOn(on) {
  enabled = !!on;
  try { localStorage.setItem(STORAGE, enabled ? 'on' : 'off'); } catch { /* fine */ }
  if (enabled) { wake(); tick(); }
}

/** One voice: an oscillator with a pitch glide and a quick envelope. */
function voice({ type = 'sine', from = 440, to = from, at = 0, attack = 0.004, hold = 0, release = 0.12, gain = 1, filter = null }) {
  const c = ensure();
  if (!c || !enabled) return;
  const t0 = c.currentTime + at;
  const osc = c.createOscillator(), env = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t0);
  if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, t0 + attack + hold + release);
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(gain, t0 + attack);
  if (hold) env.gain.setValueAtTime(gain, t0 + attack + hold);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + hold + release);
  let node = osc;
  if (filter) { const f = c.createBiquadFilter(); f.type = filter.type; f.frequency.value = filter.frequency; f.Q.value = filter.q ?? 1; osc.connect(f); node = f; }
  node.connect(env); env.connect(master);
  osc.start(t0); osc.stop(t0 + attack + hold + release + 0.02);
}

/** A short puff of filtered noise: the knock in a wooden sound. */
function knock({ at = 0, length = 0.05, gain = 0.5, frequency = 900 }) {
  const c = ensure();
  if (!c || !enabled) return;
  const t0 = c.currentTime + at, n = Math.floor(c.sampleRate * length);
  const buffer = c.createBuffer(1, n, c.sampleRate), data = buffer.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 2;
  const src = c.createBufferSource(), f = c.createBiquadFilter(), env = c.createGain();
  src.buffer = buffer; f.type = 'bandpass'; f.frequency.value = frequency; f.Q.value = 0.8;
  env.gain.setValueAtTime(gain, t0); env.gain.exponentialRampToValueAtTime(0.0001, t0 + length);
  src.connect(f); f.connect(env); env.connect(master);
  src.start(t0); src.stop(t0 + length + 0.01);
}

/** A bin set down in the drawer. */
export function place() {
  knock({ gain: 0.5, frequency: 1100, length: 0.04 });
  voice({ type: 'triangle', from: 260, to: 150, release: 0.11, gain: 0.7 });
}
/** A bin picked up for a look. */
export function tick() {
  voice({ type: 'sine', from: 1046, to: 980, release: 0.05, gain: 0.35 });
}
/** A bin taken away. */
export function remove() {
  voice({ type: 'triangle', from: 440, to: 300, release: 0.09, gain: 0.5 });
  voice({ type: 'triangle', from: 330, to: 200, at: 0.07, release: 0.12, gain: 0.4 });
}
/** A switch or a step. */
export function toggle() {
  voice({ type: 'sine', from: 720, to: 720, release: 0.04, gain: 0.3 });
}
/** A file handed over. */
export function chime() {
  for (const [i, f] of [523.25, 659.25, 783.99].entries()) {
    voice({ type: 'sine', from: f, release: 0.35, at: i * 0.09, gain: 0.45 });
    voice({ type: 'sine', from: f * 2, release: 0.2, at: i * 0.09, gain: 0.1 });
  }
}
/** Something that cannot be done. */
export function nope() {
  voice({ type: 'square', from: 180, to: 160, release: 0.11, gain: 0.18, filter: { type: 'lowpass', frequency: 600 } });
}
/** Several bins landing one after another, for a whole layout. */
export function settle(count = 3) {
  for (let i = 0; i < Math.min(count, 6); i++) {
    knock({ at: i * 0.06, gain: 0.35, frequency: 1000 + i * 60, length: 0.035 });
    voice({ type: 'triangle', from: 240 + i * 12, to: 150, at: i * 0.06, release: 0.09, gain: 0.45 });
  }
}
