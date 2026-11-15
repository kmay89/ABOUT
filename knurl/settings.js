/**
 * Knurl — settings as a URL fragment, so a look can be shared or kept.
 * Only plain values travel: no rasters, no picked faces. Unknown keys are
 * ignored; numbers are clamped to sane ranges on the way in.
 */
const FIELDS = {
  t: ['texture', 's'], p: ['period', 'n', 0.5, 300], d: ['depth', 'n', 0, 3], a: ['angle', 'n', 0, 180], dir: ['direction', 's'],
  w: ['where', 's'], bc: ['bottomClear', 'n', 0, 20], ef: ['edgeFade', 'n', 0, 5], map: ['mapping', 's'], iw: ['insideWalls', 'b'],
  bf: ['bandFrom', 'n', 0, 1000], bt: ['bandTo', 'n', 0, 1000], r: ['ramp', 's'], tile: ['tile', 'b'], text: ['stampText', 's'],
  ip: ['inlayPattern', 's'], ipp: ['inlayPeriod', 'n', 0.5, 100], iw2: ['inlayWeight', 'n', 0.05, 0.95], ia: ['inlayAngle', 'n', 0, 180],
  il: ['inlayLayers', 'n', 1, 4], im: ['inlayMargin', 'n', 0, 20], it: ['inlayText', 's'], ic: ['inlayColour', 's'], bcol: ['bodyColour', 's'],
  pr: ['printerId', 's'], bed: ['bed', 's'],
};
const byName = Object.fromEntries(Object.entries(FIELDS).map(([k, v]) => [v[0], k]));

export function encodeSettings(s) {
  const q = new URLSearchParams();
  for (const [name, value] of Object.entries(s)) {
    const key = byName[name];
    if (!key || value == null || value === '') continue;
    const [, kind] = FIELDS[key];
    if (kind === 'b') { if (value) q.set(key, '1'); continue; }
    if (kind === 'n') { if (!Number.isFinite(value)) continue; q.set(key, String(Math.round(value * 1000) / 1000)); continue; }
    q.set(key, String(value));
  }
  for (const [name, value] of Object.entries(s.knobs || {})) if (Number.isFinite(value)) q.set('k.' + name, String(Math.round(value * 1000) / 1000));
  return q.toString();
}

export function decodeSettings(fragment) {
  const text = String(fragment || '').replace(/^#/, '');
  if (!text) return null;
  const q = new URLSearchParams(text), out = {}, knobs = {};
  let any = false;
  for (const [key, raw] of q) {
    if (key.startsWith('k.')) { const v = Number(raw); if (Number.isFinite(v) && /^[a-z]+$/.test(key.slice(2))) { knobs[key.slice(2)] = v; any = true; } continue; }
    const f = FIELDS[key]; if (!f) continue;
    const [name, kind, lo, hi] = f;
    if (kind === 'b') out[name] = raw === '1' || raw === 'true';
    else if (kind === 'n') { const v = Number(raw); if (!Number.isFinite(v)) continue; out[name] = Math.min(hi, Math.max(lo, v)); }
    else out[name] = raw.slice(0, 80);
    any = true;
  }
  if (!any) return null;
  if (Object.keys(knobs).length) out.knobs = knobs;
  return out;
}
