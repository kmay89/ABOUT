/**
 * Swatch — the catalogue: which Bambu Studio settings a coupon may carry,
 * how each is written into a project file, and the tests built from them.
 *
 * Every key here lives in Bambu Studio's per-object config (its
 * PrintObjectConfig or PrintRegionConfig), so a value set on an object in
 * Metadata/model_settings.config overrides the process profile for that
 * object alone — the same mechanism as right-clicking a part and adding a
 * setting. Names, units and allowed values follow the slicer's own
 * PrintConfig; values are serialized the way it serializes them.
 */

const num = v => { const s = String(Math.round(v * 1e6) / 1e6); return s === '-0' ? '0' : s; };

/** kind → how a value becomes the string in the project file. */
const SERIALIZE = {
  float: v => num(v),
  floats: v => num(v),             // a per-extruder vector; one nozzle here
  int: v => String(Math.round(v)),
  percent: v => `${num(v)}%`,
  enum: v => String(v),
  bool: v => (v ? '1' : '0'),
  floatOrPercent: v => (typeof v === 'string' ? v : num(v)),
};

/**
 * The settings a coupon may carry. `short` is how a value prints on the
 * coupon (room is scarce: 4–5 characters), `fmt` how it reads on the page.
 */
export const SETTINGS = Object.freeze({
  ironing_type: { label: 'Ironing', kind: 'enum', options: { 'no ironing': 'Off', top: 'Top surfaces', topmost: 'Topmost surface', solid: 'All solid layers' } },
  ironing_pattern: { label: 'Ironing pattern', kind: 'enum', options: { 'zig-zag': 'Rectilinear', concentric: 'Concentric', ironingarchimedeanspiral: 'Archimedean chords' }, short: { 'zig-zag': 'ZIG', concentric: 'CONC', ironingarchimedeanspiral: 'ARCH' } },
  ironing_flow: { label: 'Ironing flow', kind: 'percent', unit: '%', min: 0, max: 100, step: 1 },
  ironing_speed: { label: 'Ironing speed', kind: 'float', unit: 'mm/s', min: 1, max: 300, step: 1 },
  ironing_spacing: { label: 'Ironing line spacing', kind: 'float', unit: 'mm', min: 0.02, max: 1, step: 0.01 , decimals: 2 },
  ironing_inset: { label: 'Ironing inset', kind: 'float', unit: 'mm', min: 0, max: 5, step: 0.05 },
  ironing_direction: { label: 'Ironing angle', kind: 'float', unit: '°', min: 0, max: 360, step: 5 },
  top_surface_pattern: { label: 'Top surface pattern', kind: 'enum', options: { monotonicline: 'Monotonic line', monotonic: 'Monotonic', globalmonotonicline: 'Global monotonic line', alignedrectilinear: 'Aligned rectilinear', 'zig-zag': 'Rectilinear', concentric: 'Concentric', hilbertcurve: 'Hilbert curve', archimedeanchords: 'Archimedean chords', octagramspiral: 'Octagram spiral' }, short: { monotonicline: 'MLINE', monotonic: 'MONO', globalmonotonicline: 'GLOB', alignedrectilinear: 'ALIGN', 'zig-zag': 'ZIG', concentric: 'CONC', hilbertcurve: 'HILB', archimedeanchords: 'ARCH', octagramspiral: 'OCTA' } },
  top_surface_speed: { label: 'Top surface speed', kind: 'floats', unit: 'mm/s', min: 5, max: 500, step: 5 },
  top_surface_line_width: { label: 'Top surface line width', kind: 'float', unit: 'mm', min: 0.2, max: 1, step: 0.01 , decimals: 2 },
  top_solid_infill_flow_ratio: { label: 'Top surface flow ratio', kind: 'floats', unit: '×', min: 0.5, max: 1.5, step: 0.01 , decimals: 2 },
  top_shell_layers: { label: 'Top shell layers', kind: 'int', unit: 'layers', min: 0, max: 20, step: 1 },
  initial_layer_flow_ratio: { label: 'Initial layer flow ratio', kind: 'float', unit: '×', min: 0.5, max: 1.5, step: 0.01 , decimals: 2 },
  elefant_foot_compensation: { label: 'Elephant foot compensation', kind: 'float', unit: 'mm', min: 0, max: 1, step: 0.01 , decimals: 2 },
  print_flow_ratio: { label: 'Object flow ratio', kind: 'float', unit: '×', min: 0.5, max: 1.5, step: 0.01 , decimals: 2 },
  outer_wall_speed: { label: 'Outer wall speed', kind: 'floats', unit: 'mm/s', min: 5, max: 600, step: 5 },
  outer_wall_line_width: { label: 'Outer wall line width', kind: 'float', unit: 'mm', min: 0.2, max: 1, step: 0.01 , decimals: 2 },
  wall_loops: { label: 'Wall loops', kind: 'int', unit: '', min: 1, max: 10, step: 1 },
  precise_outer_wall: { label: 'Precise wall', kind: 'bool' },
  seam_position: { label: 'Seam position', kind: 'enum', options: { aligned: 'Aligned', back: 'Back', nearest: 'Nearest', random: 'Random' }, short: { aligned: 'ALIGN', back: 'BACK', nearest: 'NEAR', random: 'RAND' } },
  seam_gap: { label: 'Seam gap', kind: 'percent', unit: '%', min: 0, max: 100, step: 1 },
  override_filament_scarf_seam_setting: { label: 'Override the filament’s scarf seam', kind: 'bool' },
  seam_slope_type: { label: 'Scarf seam', kind: 'enum', options: { none: 'None', external: 'Contour', all: 'Contour and hole' }, short: { none: 'NONE', external: 'SCARF', all: 'SCARF' } },
  seam_slope_conditional: { label: 'Smart scarf (smooth walls only)', kind: 'bool' },
  seam_slope_start_height: { label: 'Scarf start height', kind: 'floatOrPercent', unit: 'mm or %' },
  seam_slope_gap: { label: 'Scarf slope gap', kind: 'floatOrPercent', unit: 'mm or %' },
  seam_slope_min_length: { label: 'Scarf length', kind: 'float', unit: 'mm', min: 0, max: 60, step: 1 },
  seam_slope_steps: { label: 'Scarf steps', kind: 'int', unit: '', min: 1, max: 100, step: 1 },
  seam_slope_inner_walls: { label: 'Scarf on inner walls', kind: 'bool' },
});

export const SETTING_KEYS = Object.freeze(Object.keys(SETTINGS));

/** The string a value takes in model_settings.config. */
export function serialize(key, value) {
  const def = SETTINGS[key];
  if (!def) throw new Error(`Swatch does not know the setting "${key}".`);
  if (def.kind === 'enum' && !(value in def.options)) throw new Error(`"${value}" is not a value of ${key}.`);
  return SERIALIZE[def.kind](value);
}

/** How a value reads on the page. */
export function format(key, value) {
  const def = SETTINGS[key];
  if (!def) return String(value);
  if (def.kind === 'enum') return def.options[value] || String(value);
  if (def.kind === 'bool') return value ? 'on' : 'off';
  if (def.kind === 'percent') return `${num(value)} %`;
  if (def.kind === 'floatOrPercent') return String(value);
  return def.unit ? `${num(value)} ${def.unit}` : num(value);
}

/** How a value reads on the coupon: a few characters. */
export function short(key, value) {
  const def = SETTINGS[key];
  if (!def) return String(value);
  if (def.short) return def.short[value] || String(value).slice(0, 5).toUpperCase();
  if (def.kind === 'enum') return String(value).slice(0, 5).toUpperCase();
  if (def.kind === 'bool') return value ? 'ON' : 'OFF';
  if (value === 0) return '0';
  let s = def.decimals ? Number(value).toFixed(def.decimals) : num(value);
  if (s.startsWith('0.')) s = s.slice(1); // .42 rather than 0.42
  return s;
}

/**
 * Parse a list of values typed on the page: "15, 25, 40" for numbers,
 * "monotonicline, concentric" for enums. Numbers are de-duplicated and
 * kept in the order typed. Returns { values, errors }.
 */
export function parseValues(key, text) {
  const def = SETTINGS[key];
  // Enum labels can have spaces ("Monotonic line"), so those split on commas only.
  const raw = String(text).split(def.kind === 'enum' ? /[,;]+/ : /[,\s;]+/).map(s => s.trim()).filter(Boolean);
  const values = [], errors = [];
  for (const item of raw) {
    if (def.kind === 'enum') {
      const found = Object.keys(def.options).find(k => k === item.toLowerCase() || def.options[k].toLowerCase() === item.toLowerCase());
      if (found) { if (!values.includes(found)) values.push(found); } else errors.push(`"${item}" is not a ${def.label.toLowerCase()}.`);
    } else if (def.kind === 'bool') {
      const v = /^(1|on|true|yes)$/i.test(item) ? 1 : /^(0|off|false|no)$/i.test(item) ? 0 : null;
      if (v === null) errors.push(`"${item}" is not on or off.`); else if (!values.includes(v)) values.push(v);
    } else if (def.kind === 'floatOrPercent') {
      if (/^\d+(\.\d+)?%?$/.test(item)) { if (!values.includes(item)) values.push(item); } else errors.push(`"${item}" is not a length or a percentage.`);
    } else {
      const v = Number(item.replace('%', ''));
      if (!Number.isFinite(v)) { errors.push(`"${item}" is not a number.`); continue; }
      if (def.min !== undefined && v < def.min) { errors.push(`${num(v)} is below the slicer's minimum of ${def.min} for ${def.label.toLowerCase()}.`); continue; }
      if (def.max !== undefined && v > def.max) { errors.push(`${num(v)} is above the slicer's maximum of ${def.max} for ${def.label.toLowerCase()}.`); continue; }
      const r = def.kind === 'int' ? Math.round(v) : Math.round(v * 1000) / 1000;
      if (!values.includes(r)) values.push(r);
    }
  }
  return { values, errors };
}

/**
 * An axis of a test: one setting with a list of values — or a "composite"
 * whose values each set several keys at once (the scarf seam needs four).
 * Composite values are { label, short, set: {key: value} }.
 */
export const COMPOSITES = Object.freeze({
  scarf: {
    label: 'Scarf seam',
    options: [
      { id: 'none', label: 'No scarf (a plain seam)', short: 'NONE', set: { override_filament_scarf_seam_setting: 1, seam_slope_type: 'none' } },
      { id: 'scarf5', label: 'Scarf, 5 mm long', short: 'SC5', set: { override_filament_scarf_seam_setting: 1, seam_slope_type: 'external', seam_slope_conditional: 0, seam_slope_min_length: 5, seam_slope_start_height: '10%', seam_slope_gap: '0', seam_slope_steps: 10, seam_slope_inner_walls: 1 } },
      { id: 'scarf10', label: 'Scarf, 10 mm long', short: 'SC10', set: { override_filament_scarf_seam_setting: 1, seam_slope_type: 'external', seam_slope_conditional: 0, seam_slope_min_length: 10, seam_slope_start_height: '10%', seam_slope_gap: '0', seam_slope_steps: 10, seam_slope_inner_walls: 1 } },
      { id: 'scarf20', label: 'Scarf, 20 mm long', short: 'SC20', set: { override_filament_scarf_seam_setting: 1, seam_slope_type: 'external', seam_slope_conditional: 0, seam_slope_min_length: 20, seam_slope_start_height: '10%', seam_slope_gap: '0', seam_slope_steps: 10, seam_slope_inner_walls: 1 } },
      { id: 'scarf10low', label: 'Scarf, 10 mm, starting at 0 % height', short: 'SC10L', set: { override_filament_scarf_seam_setting: 1, seam_slope_type: 'external', seam_slope_conditional: 0, seam_slope_min_length: 10, seam_slope_start_height: '0%', seam_slope_gap: '0', seam_slope_steps: 10, seam_slope_inner_walls: 1 } },
      { id: 'scarf10gap', label: 'Scarf, 10 mm, with a 25 % slope gap', short: 'SC10G', set: { override_filament_scarf_seam_setting: 1, seam_slope_type: 'external', seam_slope_conditional: 0, seam_slope_min_length: 10, seam_slope_start_height: '10%', seam_slope_gap: '25%', seam_slope_steps: 10, seam_slope_inner_walls: 1 } },
    ],
  },
});

/**
 * The tests. Each is a grid: `x` across the plate (left to right), `y`
 * front to back; `fixed` is what every coupon carries besides; `coupon`
 * the solid; `look` what to judge and `pick` how to choose a winner.
 * Values are starting points for a 0.4 mm nozzle at 0.2 mm layers; the
 * page lets them be changed.
 */
export const TESTS = Object.freeze([
  {
    id: 'ironing', name: 'Ironing: speed × flow', tag: 'Top surface',
    blurb: 'The glass-flat top. Ironing passes the hot nozzle back over the finished top surface with a trickle of plastic; the speed and the trickle decide between a mirror and a mess.',
    coupon: { type: 'tile', w: 26, d: 22, h: 2.4 },
    x: { key: 'ironing_speed', values: [15, 25, 40, 60, 90] },
    y: { key: 'ironing_flow', values: [8, 10, 12, 15, 18] },
    fixed: { ironing_type: 'topmost', ironing_pattern: 'zig-zag', ironing_spacing: 0.1, ironing_inset: 0, top_shell_layers: 5, top_surface_pattern: 'monotonicline' },
    look: 'Hold each tile to a window. Too little flow leaves the top infill lines showing through a thin wash; too much piles ridges at the edges and a shiny crust that is actually a skin of extra plastic. Too fast and the pass skips and chatters; too slow and the tile browns or the surface goes matte from too much heat.',
    pick: 'The winner is the flattest, most even tile with no ridge at the perimeter. Put its speed and flow in your process profile under Quality › Ironing, then run the spacing × pattern test to finish the job.',
  },
  {
    id: 'ironing-pattern', name: 'Ironing: spacing × pattern', tag: 'Top surface',
    blurb: 'With speed and flow chosen, the line spacing sets how much the passes overlap and the pattern sets the direction of the faint lines that remain.',
    coupon: { type: 'tile', w: 26, d: 22, h: 2.4 },
    x: { key: 'ironing_spacing', values: [0.08, 0.1, 0.12, 0.15, 0.2] },
    y: { key: 'ironing_pattern', values: ['zig-zag', 'concentric', 'ironingarchimedeanspiral'] },
    fixed: { ironing_type: 'topmost', ironing_speed: 30, ironing_flow: 10, ironing_inset: 0, top_shell_layers: 5, top_surface_pattern: 'monotonicline' },
    look: 'Closer spacing takes longer and can over-fill; wider leaves visible lines between passes. Concentric and Archimedean hide the direction on round tops; rectilinear is fastest and best on square ones.',
    pick: 'Choose the tightest spacing that stays flat without a raised rim. Then set Ironing flow a notch lower if the rim appears at that spacing.',
  },
  {
    id: 'first-layer', name: 'First layer: flow × elephant foot', tag: 'Bottom surface',
    blurb: 'The face that touches the plate is the one people turn over to look at. Flow decides whether the lines fuse into one sheet; elephant foot compensation trims the squashed first layer so the edge is crisp.',
    coupon: { type: 'stencil', w: 26, d: 30, h: 1.2 },
    x: { key: 'initial_layer_flow_ratio', values: [0.9, 0.95, 1, 1.05, 1.1] },
    y: { key: 'elefant_foot_compensation', values: [0, 0.1, 0.15, 0.2, 0.25] },
    fixed: {},
    look: 'Judge the bottom, where the label reads the right way round. Low flow shows gaps between lines and a see-through look against the light; high flow shows ridges, a rough feel and a lip that curls at the edge. Elephant foot shows as a flare at the bottom edge; too much compensation shows as the bottom layer being smaller than the layers above it.',
    pick: 'Pick the flow whose lines just vanish into one surface, then the smallest compensation whose edge is straight when the tile stands on end. Set both under Quality in the process profile. The holes of the label print tiny — do not read anything into their edges.',
  },
  {
    id: 'top-flow', name: 'Top surface: flow × speed', tag: 'Top surface',
    blurb: 'Before ironing, the last layer itself. A whisker less plastic on the top solid infill lays the lines flat; too little and they pull apart. Speed changes how much the nozzle drags the lines it just laid.',
    coupon: { type: 'tile', w: 26, d: 22, h: 2.4 },
    x: { key: 'top_solid_infill_flow_ratio', values: [0.9, 0.94, 0.97, 1, 1.03, 1.06] },
    y: { key: 'top_surface_speed', values: [60, 100, 150, 200] },
    fixed: { ironing_type: 'no ironing', top_shell_layers: 5, top_surface_pattern: 'monotonicline' },
    look: 'At a low angle to a lamp, under-flow shows as dark lines or pinholes between passes, over-flow as a raised, waxy look with the lines standing proud and a lip at the walls. The faster rows show more drag at the turns.',
    pick: 'The winner is the tile with an even sheen and no pinholes. Enter it as Top surface flow ratio (Quality › Advanced, visible in Developer mode) and Top surface speed. Do this before tuning ironing; ironing covers for a poor top but cannot fix pinholes.',
  },
  {
    id: 'top-pattern', name: 'Top surface: pattern × line width', tag: 'Top surface',
    blurb: 'The pattern decides the direction of the lines you will see; the line width decides how many there are and how they fill in at the walls.',
    coupon: { type: 'tile', w: 26, d: 22, h: 2.4 },
    x: { key: 'top_surface_pattern', values: ['monotonicline', 'monotonic', 'alignedrectilinear', 'concentric', 'hilbertcurve'] },
    y: { key: 'top_surface_line_width', values: [0.38, 0.42, 0.45, 0.5] },
    fixed: { ironing_type: 'no ironing', top_shell_layers: 5 },
    look: 'Monotonic patterns lay every line in the same direction so there is no visible join; concentric follows the outline and hides on round tops; the Hilbert curve has no direction at all but is slow and textured. Wider lines fill small gaps at the perimeter; narrower lines show finer grain.',
    pick: 'There is no single right answer — pick what you like on the shape you print most, and note the width that leaves no gap next to the wall.',
  },
  {
    id: 'walls', name: 'Outer wall: speed × line width', tag: 'Side surfaces',
    blurb: 'The sides are what the print looks like from across the room. Speed shows up as ringing after corners and as faint vertical banding; line width changes the glossiness of the wall and how the layers nest.',
    coupon: { type: 'pillar', w: 20, d: 20, h: 30 },
    x: { key: 'outer_wall_speed', values: [60, 100, 150, 200, 250] },
    y: { key: 'outer_wall_line_width', values: [0.38, 0.42, 0.45, 0.5] },
    fixed: { wall_loops: 3, precise_outer_wall: 1 },
    look: 'Look along each pillar at a light. Faster columns show ghosting after the corners and vertical fine-artefact lines; wider lines look glossier but can bulge at the corners. The label is on top so the four faces stay clean.',
    pick: 'Pick the fastest column that still looks like the slowest, then the width you like the look of. Enter them under Speed › Outer wall and Quality › Line width.',
  },
  {
    id: 'seam', name: 'Seam: scarf × position', tag: 'Side surfaces',
    blurb: 'Every layer of a wall starts and ends somewhere, and that somewhere makes a line. A scarf seam ramps the wall’s start and end over a few millimetres so the line disappears; where the seam sits decides whether it is on the face you look at.',
    coupon: { type: 'cylinder', r: 10, h: 25 },
    x: { composite: 'scarf', values: ['none', 'scarf5', 'scarf10', 'scarf20'] },
    y: { key: 'seam_position', values: ['aligned', 'back', 'nearest'] },
    fixed: { wall_loops: 3 },
    look: 'Turn each cylinder in the light. A plain seam is a vertical zip or a line of dots; a scarf is a faint smear over its length. Too long a scarf on a small circle wraps around the whole wall and shows as banding; too short leaves a bump.',
    pick: 'Choose the column where you cannot find the seam, and the row where it lands on the face you least care about. Scarf settings live under Quality › Seam; tick “Override filament scarf seam setting” or the filament profile’s own choice wins.',
  },
]);

/** Resolve one axis value to the settings it sets and the words for it. */
export function axisValue(axis, value) {
  if (axis.composite) {
    const opt = COMPOSITES[axis.composite].options.find(o => o.id === value);
    if (!opt) throw new Error(`"${value}" is not a ${COMPOSITES[axis.composite].label.toLowerCase()} option.`);
    return { set: { ...opt.set }, label: opt.label, short: opt.short };
  }
  return { set: { [axis.key]: value }, label: format(axis.key, value), short: short(axis.key, value) };
}

/** The title of an axis. */
export function axisLabel(axis) { return axis.composite ? COMPOSITES[axis.composite].label : SETTINGS[axis.key].label; }

/**
 * The coupons of a test: one per (x, y), each with its settings merged
 * (fixed first, then the axes, so an axis always wins), its label lines,
 * and its grid position. A test without a y axis is one row.
 */
export function coupons(test) {
  const xs = test.x.values, ys = test.y ? test.y.values : [null];
  const list = [];
  ys.forEach((yv, row) => xs.forEach((xv, col) => {
    const x = axisValue(test.x, xv), y = yv === null ? null : axisValue(test.y, yv);
    const settings = { ...test.fixed, ...x.set, ...(y ? y.set : {}) };
    const serialized = Object.fromEntries(Object.entries(settings).map(([k, v]) => [k, serialize(k, v)]));
    list.push({
      col, row, label: y ? [x.short, y.short] : [x.short],
      name: y ? `${axisLabel(test.x)} ${x.label} · ${axisLabel(test.y)} ${y.label}` : `${axisLabel(test.x)} ${x.label}`,
      settings, serialized,
    });
  }));
  return list;
}
