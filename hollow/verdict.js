/**
 * Hollow — the verdict. Turns a build's numbers into plain words for someone
 * who has never made a mold: will this work, will the cast look good, and
 * what to change if not. No DOM; tested on its own.
 *
 * Levels: 'ok' (fine), 'warn' (will work with care), 'bad' (fix this first).
 * The overall grade is the worst item: 'good' · 'care' · 'no'.
 */

import { MATERIALS } from './mold.js';

/** What each casting material forgives. */
const MATERIAL_RULES = {
  concrete: { thinMm: 5, thinWord: 'thinner than about 5 mm', spoutMin: 12, detail: 'soft', exothermMl: Infinity, draft: 'wants' },
  plaster: { thinMm: 3, thinWord: 'thinner than about 3 mm', spoutMin: 10, detail: 'crisp', exothermMl: Infinity, draft: 'wants' },
  resin: { thinMm: 1.5, thinWord: 'thinner than about 1.5 mm', spoutMin: 6, detail: 'crisp', exothermMl: 250, draft: 'likes' },
  wax: { thinMm: 3, thinWord: 'thinner than about 3 mm', spoutMin: 8, detail: 'crisp', exothermMl: Infinity, draft: 'forgives' },
  soap: { thinMm: 5, thinWord: 'thinner than about 5 mm', spoutMin: 10, detail: 'soft', exothermMl: Infinity, draft: 'forgives' },
};

const pct = (f) => `${Math.round(f * 100)} %`;

/**
 * @param result a buildMold result
 * @param options { material: 'concrete'|…, bed: {x,y,z}, printerName, fitsTogether }
 */
export function verdict(result, { material = 'concrete', bed = { x: 256, y: 256, z: 256 }, printerName = 'your printer', fitsTogether = true, exportH = null } = {}) {
  const rules = MATERIAL_RULES[material] || MATERIAL_RULES.concrete;
  const mat = MATERIALS[material] || MATERIALS.concrete;
  const items = [];
  const add = (level, title, detail, fix) => items.push({ level, title, detail, fix });
  const s = result.settings, a = result.analysis || {}, f = result.features || {};
  const type = s.type;

  // --- the model itself
  if (result.model.closed) add('ok', 'The model is a closed solid', 'Inside and outside are unambiguous, so the cavity is exactly the model.');
  else add('warn', 'The model has gaps or inside-out faces', 'Hollow filled it by majority vote, which is usually right. Look at the cavity in the Section view before printing.', 'Run the model through your slicer\'s repair first if the cavity looks wrong.');

  // --- does it fit the printer
  const fits = (size) => (size[0] <= bed.x && size[1] <= bed.y || size[0] <= bed.y && size[1] <= bed.x) && size[2] <= bed.z;
  const tooBig = result.parts.filter(p => !fits(p.print.size));
  if (tooBig.length) add('bad', `Too big for ${printerName}`, `${tooBig.map(p => p.name).join(' and ')} would not fit the ${bed.x} × ${bed.y} × ${bed.z} mm plate.`, 'Thin the wall, scale the model down, or pick a bigger printer.');
  else add('ok', `Fits ${printerName}`, result.parts.length > 1 ? (fitsTogether ? 'Every part fits, and they all fit on one plate together.' : 'Every part fits; print them one plate at a time.') : 'Prints in one go, flat side down.');

  // --- release
  if (a.mode === 'release') {
    const trapped = a.trappedFraction || 0, steep = a.steepFraction || 0;
    if (trapped === 0) add('ok', 'Everything will come out of the mold', `Nothing is hooked under the mold. ${steep > 0.3 ? `About ${pct(steep)} of the surface is nearly vertical, so use a release agent and expect to tap it out.` : 'The surfaces slope the right way.'}`);
    else if (trapped < 0.02) add('warn', `A little of the surface is trapped (${(trapped * 100).toFixed(1)} %)`, 'Shown red on the model. Small undercuts usually pull free with a tap and a release agent, and the cast may lose a little edge there.', type === 'two-part' ? 'Drag the parting plane or turn the model; if the red stays, print the mold in TPU.' : 'Turn the model, or switch to a two-part mold.');
    else add('bad', `${pct(trapped)} of the surface is trapped`, 'The red areas are hooked under the mold: a rigid print will not let the cast out without breaking one or the other.', type === 'two-part' ? 'Move the parting plane (uncheck Automatic and drag), turn the model so the widest part is level, print the mold in TPU, or make a silicone master instead.' : 'Flip or turn the model so it is widest at the open top, use a two-part mold, or make a silicone master.');
    if (type === 'two-part' && Number.isFinite(a.partingZ) && Number.isFinite(a.autoPartingZ) && Math.abs(a.partingZ - a.autoPartingZ) > result.h * 2 && s.partingZ !== 'auto') {
      add('warn', 'The parting plane is not where Hollow would put it', 'That is fine if you want the seam somewhere particular; the automatic height traps the least surface.', 'Tick Automatic to compare.');
    }
  } else if (a.mode === 'print') {
    if ((a.trappedFraction || 0) > 0.03) add('warn', 'The master needs supports to print', 'Red faces overhang more than 45°. Supports leave small marks that would print into every cast.', 'Use tree supports with a small top gap and sand the marks smooth before pouring silicone.');
    else add('ok', 'The master prints without supports', 'Nothing overhangs more than 45°.');
  }

  // --- thin parts of the cast
  const th = result.model.thickness;
  if (th) {
    const thin = rules.thinMm >= 5 ? th.under5mm : rules.thinMm >= 3 ? th.under3mm : th.under1_5mm;
    if (thin > 0.6) add('bad', `Most of the piece is ${rules.thinWord}`, `About ${pct(thin)} of it. ${mat.name} breaks easily that thin — it will crack coming out of the mold or soon after.`, material === 'concrete' || material === 'soap' ? 'Scale the model up, thicken it in your modelling program, or cast it in resin instead.' : 'Scale the model up or thicken it.');
    else if (thin > 0.3) add('warn', `Some of the piece is ${rules.thinWord}`, `About ${pct(thin)} of it. Those parts will be the fragile ones in ${mat.name.toLowerCase()}; handle it gently when unmolding.`, material === 'concrete' ? 'A fibre-reinforced or polymer-modified mix helps; so does a day longer in the mold.' : undefined);
    else add('ok', 'The piece is sturdy enough for ' + mat.name.toLowerCase(), `Only ${pct(thin)} of it is ${rules.thinWord}.`);
  }

  // --- detail: judged on what the export will be built at, not the draft preview
  const detail = exportH || result.h;
  const previewNote = exportH && exportH < result.h - 0.01 ? ` The preview you are looking at is coarser (${result.h.toFixed(2)} mm); the export is finer.` : '';
  if (rules.detail === 'soft') add('ok', 'Detail will be a little soft, which suits this material', `${mat.name} does not hold features much finer than a millimetre anyway; the mold is built at ${detail.toFixed(2)} mm.${previewNote}`);
  else if (detail > 0.45) add('warn', `Fine detail will soften at ${detail.toFixed(2)} mm`, `A big piece spreads the grid thin. Edges sharper than that come out gently rounded.${previewNote}`, 'Choose Fine detail for the export, or cast a smaller piece.');
  else add('ok', `Detail is kept to about ${detail.toFixed(2)} mm`, `About what a 0.4 mm nozzle resolves. Layer lines in the mold will still show on the cast unless you smooth the cavity.${previewNote}`);

  // --- printing each part
  const needsSupport = result.parts.filter(p => (p.supportFraction || 0) > 0.02);
  if (!needsSupport.length) add('ok', result.parts.length > 1 ? 'Every part prints without supports' : 'It prints without supports', 'Flat side on the plate, cavity facing up; nothing overhangs more than 45°.');
  else add('warn', `${needsSupport.map(p => p.name).join(' and ')} ${needsSupport.length > 1 ? 'have' : 'has'} overhangs to print`, `${needsSupport.map(p => `${pct(p.supportFraction)} of ${p.name}`).join(', ')} overhangs more than 45° (red in the Print view) — usually a trapped part of the cavity.`, type === 'two-part' ? 'Move the parting plane so the red goes, or print with tree supports and sand the marks.' : 'Turn the model so it is widest at the top, or print with tree supports and sand the marks.');

  // --- pouring
  if (type === 'two-part') {
    if (!f.spout) add('bad', 'There is no spout to pour through', 'A closed two-part mold needs a way in.', 'Tick Pour spout, or check that the parting plane passes through the model.');
    else if (s.spout.diameter < rules.spoutMin) add('warn', `The spout is narrow for ${mat.name.toLowerCase()}`, `${s.spout.diameter} mm at the cavity. Thick mixes bridge a small hole and leave the cavity half full.`, `Set the spout to ${rules.spoutMin} mm or more. The mark it leaves files off in a minute.`);
    else add('ok', 'The spout is wide enough to pour', `${s.spout.diameter} mm at the cavity, opening to ${s.spout.mouth} mm — pour down one side so air leaves up the other.`);
    const vents = f.vents ? f.vents.length : 0, traps = f.airTraps || 0;
    if (traps > vents) add('warn', `${traps} places could trap air; ${vents} got a vent`, 'The rest are small pockets. Tap the mold while pouring and they usually clear.');
    else if (vents) add('ok', `${vents} air vent${vents > 1 ? 's' : ''} where bubbles would collect`, 'Air escapes through them as the mold fills; snip the little pins off the cast.');
    else add('ok', 'No air pockets found', 'The cavity fills from the bottom up with nowhere for a bubble to hide.');
    if (f.keys) add('ok', f.keys.style === 'rail' ? 'A rail locates the halves' : 'Three pegs locate the halves one way only', `${s.keys.clearance} mm clearance. If the first print binds, add 0.05 mm; if it rattles, take it away.`);
    else add('warn', 'The halves have nothing to locate them', 'They can slide a little against each other and leave a step on the cast.', 'Choose pegs or a rail, or make the wall thicker so pegs fit.');
    if (material === 'concrete' && s.wall < 8) add('warn', 'The wall is thin for concrete', `${s.wall} mm. A big concrete pour pushes outwards and can bow a thin wall.`, 'Use 10 mm or more.');
  } else if (type === 'open') {
    if (result.warnings.some(w => /wider at the bottom/.test(w))) add('bad', 'The model is upside down for an open mold', 'The opening at the top is smaller than the piece below it, so the cast would be locked in.', 'Press Flip so the flat back faces up.');
    else if (a.openingMm2) add('ok', 'The open face is the flat back', 'Pour in from the top, tap, and strike it flat.');
    if (f.cores) add('ok', 'Hollow found the inside of a vessel', `The mold comes as a body and a core. The core's collar drops into a recess in the rim so it cannot slide, ${f.coreHoles && f.coreHoles.length ? `and ${f.coreHoles.length} overflow hole${f.coreHoles.length > 1 ? 's' : ''} in the collar let the extra mix rise out as you press it in` : 'so pour only two thirds full and press it in slowly'}. Weigh the core down: wet mix floats it.`);
    if (f.pushHole) add('ok', `${f.pushHole.diameter === 8 ? 'An' : 'A'} ${f.pushHole.diameter} mm push-out hole in the floor`, 'A dowel through it frees a stubborn cast. It leaves a small mark on the face against the floor; fill or sand it, or turn the hole off if that face shows.');
    if (s.lip === 0) add('warn', 'There is no rim above the back', 'Without a few millimetres to overfill, the back is hard to get flat.', 'Set the rim to 2–3 mm.');
  } else if (type === 'box') {
    const sil = f.silicone;
    if (sil) add('ok', `About ${Math.round(sil.volumeMm3 / 1000)} mL of silicone fills the tray`, `${sil.gap} mm around and over the model. A 20–30 Shore A silicone pulls off undercuts that a rigid mold cannot.`);
  }

  // --- resin exotherm
  const castMl = result.cast.volumeMm3 / 1000;
  if (material === 'resin' && castMl > rules.exothermMl) add('warn', `A ${Math.round(castMl)} mL resin pour runs hot`, 'Thick resin pours heat up as they cure and can warp a PLA mold or crack the cast.', 'Pour in layers, use a slow deep-pour resin, or print the mold in PETG.');

  const worst = items.some(i => i.level === 'bad') ? 'no' : items.some(i => i.level === 'warn') ? 'care' : 'good';
  const headline = worst === 'good' ? `Good to go: this will cast well in ${mat.name.toLowerCase()}.`
    : worst === 'care' ? `This should work — read the amber notes before you print.`
    : `Not yet — fix the red items, or the cast will not come out right.`;
  const outlook = worst === 'no' ? '' : rules.detail === 'crisp'
    ? 'Expect a crisp copy of the model with the mold\'s layer lines faintly on its surface; smooth the cavity if that matters.'
    : 'Expect a faithful copy with softly rounded fine detail and a slightly textured surface, which suits the material.';
  return { grade: worst, headline, outlook, items };
}
