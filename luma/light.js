/**
 * The light calculator: from the light behind a lithophane and the room it
 * lives in, the thickness range that will look right.
 *
 * Three numbers decide how a lithophane looks:
 *   - how much light reaches the back of it (illuminance, lux), from the
 *     light's brightness and how far away it is;
 *   - how much comes through t mm of plastic, T(t) — the same absorption
 *     model the preview uses, scaled so 0.8 mm of white PLA passes about a
 *     third of the light;
 *   - how much room light falls on the front, which greys the shadows.
 *
 * The thinnest areas are chosen so the highlights glow at a comfortable
 * brightness for the room (not a glare, not a smudge). The thickest are
 * chosen so the shadows are about 1/15th of the highlights — a rich picture
 * — but never so dark the eye loses them in black, and never thicker than
 * the room light lets them read. The numbers are estimates from typical
 * figures; the test strip settles them for a real filament and a real light.
 *
 * No DOM. All lengths in mm.
 */
import { transmissionRGB } from './image-processing.js';

/** Typical figures from manufacturers' listings. `lux` sources light the back directly. */
export const LIGHT_SOURCES = Object.freeze({
  tealight:  { name:'LED tea light',      lumens:4,    distance:'radius', point:true,
               hint:'About 2–10 lm. Flickering ones average dimmer.' },
  nightlight:{ name:'Plug-in nightlight', lumens:10,   distance:40, point:true,
               hint:'Usually 5–30 lm; a few reach 100. It’s printed on the box.' },
  puck:      { name:'LED puck light',     lumens:45,   distance:40, point:true,
               hint:'Usually 30–65 lm.' },
  strip:     { name:'LED strip (box)',    lumens:150,  distance:'depth', box:true,
               hint:'Roughly the strip’s lumens per metre × the length you use.' },
  bulb:      { name:'LED bulb lamp',      lumens:800,  distance:150, point:true,
               hint:'A “60 W equivalent” bulb is about 800 lm.' },
  pad:       { name:'LED light pad',      lux:5000,
               hint:'A4 tracing pads are rated about 4,500–8,000 lux.' },
  window:    { name:'Window light',       lux:5000,
               hint:'Indirect daylight through a window; direct sun is far brighter.' },
});

export const ROOMS = Object.freeze({
  dark:   { name:'Dark · night',     lux:1,     target:120 },
  dim:    { name:'Dim · evening',    lux:30,   target:400 },
  bright: { name:'Bright · daytime', lux:300, target:900 },
});

const T_AT_REFERENCE = 0.35;    // 0.8 mm of white PLA lets through about a third
const CONTRAST = 15;            // highlights 15× the shadows: a rich picture (0.8–3.2 mm on a light pad)
const SHADOW_FLOOR = 3;         // cd/m²: dimmer than this and shadow detail is lost to black
const FRONT_REFLECTANCE = 0.6;  // room light the front of white plastic sends back
const MIN_CHOICES = [0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2];
const MAX_LIMIT = 4.0;

/** Light through t mm, as a fraction, luminance-weighted. */
function through(t, k) {
  const [r, g, b] = transmissionRGB(t, k, [1, 1, 1], 1);
  return T_AT_REFERENCE * (0.2126 * r + 0.7152 * g + 0.0722 * b) / 0.97;
}

/** Thickness at which `through` falls to a fraction (bisection; through() only falls). */
function thicknessFor(fraction, k) {
  let lo = 0.2, hi = 12;
  for (let i = 0; i < 50; i++) { const mid = (lo + hi) / 2; if (through(mid, k) > fraction) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

/** Lux reaching the back of the picture. */
export function illuminance({ source, lumens, lux, distance, width, height }) {
  const s = LIGHT_SOURCES[source];
  if (!s) throw new RangeError('Choose a light.');
  if (s.lux !== undefined) return lux ?? s.lux;
  const lm = lumens ?? s.lumens;
  if (s.box) {
    // A light box: walls bounce the light round, about half of it reaches the picture.
    const area = Math.max(1e-4, (width / 1000) * (height / 1000));
    return 0.5 * lm / area;
  }
  const d = Math.max(10, distance) / 1000;
  return (lm / (4 * Math.PI)) / (d * d);          // a small light shining every way
}

/**
 * @param {object} o source, lumens?, lux?, distance (mm), room, k (absorption per channel),
 *   shape, width, height (mm, the picture).
 */
export function recommendThickness(o) {
  const room = ROOMS[o.room] || ROOMS.dim, E = illuminance(o);
  const glow = t => E * through(t, o.k) / Math.PI;                // cd/m² out of the front
  const ambient = room.lux * FRONT_REFLECTANCE / Math.PI;
  // Thinnest: 0.8 mm, the well-tried default, unless the highlights would land far
  // from the room's comfortable brightness — then whichever choice comes closest.
  const off = t => Math.abs(Math.log(glow(t) / room.target));
  const min = off(0.8) < Math.log(2.5) ? 0.8 : MIN_CHOICES.reduce((best, t) => off(t) < off(best) ? t : best);
  const high = glow(min);
  // Thickest: shadows a twentieth of the highlights, seen through the room light on the front.
  let shadow = (high + ambient) / CONTRAST - ambient, washed = false;
  if (shadow < ambient * 0.25) { shadow = ambient * 0.25; washed = true; }   // the room sets the limit
  shadow = Math.max(shadow, SHADOW_FLOOR);
  let max = thicknessFor(shadow * Math.PI / E, o.k);
  const clamped = max > MAX_LIMIT;
  max = Math.min(MAX_LIMIT, Math.max(min + 1.0, max));
  const round = v => Math.round(v * 10) / 10;
  const result = { min: round(min), max: round(max), illuminance: E, highlight: high,
    shadow: glow(max), ambient, contrast: (high + ambient) / (glow(max) + ambient), washed };

  // What it will look like, in words.
  result.look = high < 12 ? 'faint' : result.contrast < 2.5 ? 'washed' : high < room.target * 0.4 ? 'soft'
    : high < room.target * 2.5 ? 'good' : 'glaring';
  result.headline = {
    faint: 'Too dim to show well',
    washed: 'Washed out in this room',
    soft: 'A soft glow',
    good: 'Bright and clear',
    glaring: 'Very bright',
  }[result.look];
  const tips = [];
  if (result.look === 'faint') tips.push(o.room === 'dark'
    ? 'This light is very weak. Use a brighter one (look for 20+ lumens) or move it closer.'
    : 'Not enough light for this room. It’ll look better in the dark, or with a brighter light.');
  if (result.look === 'soft') tips.push('It’ll glow gently — lovely in the dark. For more sparkle, use a brighter light or move it closer.');
  if (result.look === 'glaring') tips.push(`This light is stronger than the picture needs, even at ${result.min} mm. Dim it, move it back, or put a sheet of paper behind the picture.`);
  if (result.look === 'washed') tips.push('The room is brighter than the picture, so it will barely show. Keep this light for a dark room, or use a much brighter one.');
  else if (washed) tips.push(o.room === 'bright'
    ? 'Daylight on the front will grey the shadows. Lithophanes look their best in the evening or a dim room.'
    : 'Room light on the front limits how dark the shadows can look.');
  if (clamped) tips.push('Its shadows would need more than 4 mm of plastic, so Luma stops at 4 mm. Dimming the light gives a richer picture.');
  const s = LIGHT_SOURCES[o.source];
  if (s.point && o.shape === 'flat') {
    const even = Math.round(Math.min(o.width, o.height) * 0.4 / 5) * 5;
    if (o.distance < even) tips.push(`A small light this close makes a bright spot. Set it at least ${even} mm behind the picture, or put a sheet of paper between them to spread it.`);
  }
  if (s.box) tips.push('Run the strip round the inside edge of the box rather than straight behind the picture — the light spreads more evenly.');
  if (o.source === 'tealight') tips.push('Stand the tea light in the middle so every side glows the same.');
  result.tips = tips;
  // The preview's backlight that shows this brightness (1 = the reference glow).
  result.previewPower = Math.max(0.5, Math.min(1.5, high / room.target));
  return result;
}
