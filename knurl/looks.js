/**
 * Knurl — the Looks. One-tap recipes: a texture with its settings, where
 * it goes, and a first-layer inlay that suits it. Each is a plain object
 * the page applies to its controls; nothing here touches the DOM.
 */
export const LOOKS = Object.freeze([
  { id: 'grip', name: 'Machinist grip', blurb: 'Fine knurl on the walls, a hex-line first layer.',
    texture: 'knurl', period: 2.0, depth: 0.35, knobs: { sharp: 0.6 }, where: 'walls', direction: 'in', angle: 0, ramp: 'none',
    inlay: { pattern: 'hexgrid', period: 6, weight: 0.3 } },
  { id: 'shell', name: 'Honeycomb shell', blurb: 'Hex cells over walls and top, honeycomb lines underneath.',
    texture: 'hex', period: 5, depth: 0.4, knobs: { groove: 0.3 }, where: 'walls-top', direction: 'in', angle: 0, ramp: 'none',
    inlay: { pattern: 'hexgrid', period: 5, weight: 0.25 } },
  { id: 'deco', name: 'Art deco', blurb: 'Tall flutes, cut deep. Rings on the bottom.',
    texture: 'flutes', period: 3.5, depth: 0.7, knobs: { round: 0.9 }, where: 'walls', direction: 'in', angle: 0, ramp: 'none',
    inlay: { pattern: 'rings', period: 5, weight: 0.3 } },
  { id: 'scales', name: 'Dragon scale', blurb: 'Fish scales that grow deeper toward the top. Diamonds below.',
    texture: 'scales', period: 5, depth: 0.4, knobs: { dome: 0.6 }, where: 'walls', direction: 'in', angle: 0, ramp: 'up',
    inlay: { pattern: 'diamonds', period: 8, weight: 0.35 } },
  { id: 'leather', name: 'Saddle leather', blurb: 'Pebbled grain everywhere but the plate; a plain border.',
    texture: 'leather', period: 2.5, depth: 0.3, knobs: { crease: 0.25 }, where: 'all', direction: 'in', angle: 0, ramp: 'none',
    inlay: { pattern: 'border', period: 3 } },
  { id: 'driftwood', name: 'Driftwood', blurb: 'Wandering grain up the walls, stripes along the base.',
    texture: 'wood', period: 2, depth: 0.3, knobs: { wander: 0.5 }, where: 'walls', direction: 'in', angle: 0, ramp: 'none',
    inlay: { pattern: 'stripes', period: 4, weight: 0.4 } },
  { id: 'brick', name: 'Brickwork', blurb: 'Running bond on the walls, a checkerboard underneath.',
    texture: 'brick', period: 9, depth: 0.45, knobs: { mortar: 0.16 }, where: 'walls', direction: 'in', angle: 0, ramp: 'none',
    inlay: { pattern: 'checker', period: 6 } },
  { id: 'soft', name: 'Soft touch', blurb: 'Fine orange peel on every face: hides layer lines, feels like powder coat.',
    texture: 'peel', period: 1.6, depth: 0.2, knobs: { grain: 3 }, where: 'walls-top', direction: 'in', angle: 0, ramp: 'none',
    inlay: { pattern: 'none' } },
  { id: 'golf', name: 'Golf ball', blurb: 'Dimples on walls and top, fading out toward the plate. Polka dots below.',
    texture: 'dots', period: 3.2, depth: 0.4, knobs: { size: 0.8 }, where: 'walls-top', direction: 'in', angle: 0, ramp: 'up',
    inlay: { pattern: 'dots', period: 6, weight: 0.5 } },
  { id: 'ripple', name: 'Ripple glass', blurb: 'Horizontal waves that drift sideways, raised out of the surface.',
    texture: 'ripples', period: 3.5, depth: 0.35, knobs: { drift: 0.4 }, where: 'walls', direction: 'out', angle: 0, ramp: 'none',
    inlay: { pattern: 'waves', period: 6, weight: 0.4 } },
]);

export const lookById = id => LOOKS.find(l => l.id === id) || null;
