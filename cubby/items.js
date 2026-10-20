/**
 * Common things that live in drawers, with typical sizes, so a bin can be
 * sized for what goes in it and the plan can show whether it fits. Sizes
 * are length × width × height in millimetres, the way the thing lies flat,
 * rounded to the nearest sensible figure; real ones vary, which is why the
 * fit check leaves a little room. No DOM.
 */

const mm = (id, name, l, w, h, spaces, note) => ({ id, name, l, w, h, spaces, note });

export const ITEMS = Object.freeze([
  // desk
  mm('pen', 'Ballpoint pen', 145, 10, 10, ['desk'], 'lies flat; a lane fits a dozen'),
  mm('pencil', 'Pencil', 190, 7, 7, ['desk'], 'new and unsharpened'),
  mm('marker', 'Marker (Sharpie)', 140, 15, 15, ['desk', 'garage']),
  mm('highlighter', 'Highlighter', 135, 22, 15, ['desk']),
  mm('fountain', 'Fountain pen', 140, 14, 14, ['desk']),
  mm('scissors', 'Scissors', 205, 75, 12, ['desk', 'kitchen']),
  mm('stapler', 'Stapler', 150, 38, 60, ['desk']),
  mm('tape', 'Tape in a dispenser', 125, 45, 40, ['desk']),
  mm('stickies', 'Sticky notes', 76, 76, 20, ['desk'], 'a 3 × 3 in pad'),
  mm('clips', 'Paper clips, a box', 60, 45, 25, ['desk']),
  mm('binderclips', 'Binder clips', 32, 25, 20, ['desk'], 'medium, each'),
  mm('eraser', 'Eraser', 60, 22, 12, ['desk']),
  mm('gluestick', 'Glue stick', 90, 22, 22, ['desk']),
  mm('ruler', 'Ruler, 12 in', 310, 30, 3, ['desk'], 'the long one'),
  mm('ruler15', 'Ruler, 15 cm', 155, 30, 3, ['desk']),
  mm('calculator', 'Calculator', 150, 80, 15, ['desk']),
  mm('phone', 'Phone', 150, 72, 9, ['desk', 'bath']),
  mm('earbuds', 'Earbuds case', 60, 45, 25, ['desk', 'bath']),
  mm('cable', 'USB cable, coiled', 70, 70, 20, ['desk', 'garage'], 'a 1 m cable in a loose coil'),
  mm('charger', 'Phone charger', 50, 45, 30, ['desk']),
  mm('usb', 'USB stick', 60, 20, 10, ['desk']),
  mm('sdcard', 'SD cards', 32, 24, 3, ['desk']),
  mm('glasses', 'Glasses, folded', 145, 55, 35, ['desk', 'bath']),
  mm('aa', 'AA battery', 51, 15, 15, ['desk', 'garage'], 'Ø 14.5 × 50.5'),
  mm('aaa', 'AAA battery', 45, 11, 11, ['desk', 'garage'], 'Ø 10.5 × 44.5'),
  mm('9v', '9 V battery', 49, 27, 18, ['desk', 'garage']),
  mm('coincell', 'Coin cells', 20, 20, 4, ['desk', 'garage'], 'CR2032'),
  mm('keys', 'Keys on a ring', 90, 60, 20, ['desk']),
  mm('notebook', 'Pocket notebook', 140, 90, 10, ['desk'], 'A6'),
  // kitchen
  mm('fork', 'Dinner fork', 200, 25, 15, ['kitchen']),
  mm('knife', 'Dinner knife', 230, 20, 10, ['kitchen']),
  mm('spoon', 'Tablespoon', 200, 42, 22, ['kitchen']),
  mm('teaspoon', 'Teaspoon', 145, 32, 15, ['kitchen']),
  mm('steakknife', 'Steak knife', 230, 20, 12, ['kitchen']),
  mm('chefknife', "Chef's knife", 330, 50, 20, ['kitchen'], 'an 8 in blade'),
  mm('paring', 'Paring knife', 190, 22, 15, ['kitchen']),
  mm('chopsticks', 'Chopsticks', 230, 8, 8, ['kitchen']),
  mm('spatula', 'Spatula', 280, 75, 25, ['kitchen'], 'silicone'),
  mm('woodspoon', 'Wooden spoon', 300, 60, 20, ['kitchen']),
  mm('ladle', 'Ladle', 300, 90, 70, ['kitchen']),
  mm('whisk', 'Whisk', 280, 65, 65, ['kitchen']),
  mm('tongs', 'Tongs', 300, 45, 35, ['kitchen']),
  mm('peeler', 'Peeler', 170, 35, 20, ['kitchen']),
  mm('canopener', 'Can opener', 190, 50, 45, ['kitchen']),
  mm('bottleopener', 'Bottle opener', 120, 40, 10, ['kitchen']),
  mm('corkscrew', 'Corkscrew', 120, 30, 20, ['kitchen'], "a waiter's"),
  mm('measurespoons', 'Measuring spoons', 150, 50, 30, ['kitchen'], 'the set on a ring'),
  mm('measurecups', 'Measuring cups', 200, 100, 80, ['kitchen'], 'the set, nested'),
  mm('spicejar', 'Spice jar', 100, 45, 45, ['kitchen'], 'Ø 45, lying down'),
  mm('teabags', 'Tea bags, a box', 90, 70, 60, ['kitchen']),
  mm('kcup', 'Coffee pods', 50, 50, 45, ['kitchen'], 'K-Cup; Nespresso is 37 × 37 × 30'),
  mm('rubberbands', 'Rubber bands', 60, 60, 20, ['kitchen', 'desk'], 'a handful'),
  mm('matches', 'Matches, a box', 55, 35, 15, ['kitchen']),
  mm('candles', 'Birthday candles', 90, 55, 10, ['kitchen'], 'the box'),
  mm('bagclips', 'Bag clips', 90, 25, 20, ['kitchen'], 'each'),
  // garage
  mm('screwdriver', 'Screwdriver', 230, 30, 30, ['garage'], 'a No. 2 with a 100 mm shank'),
  mm('precision', 'Precision screwdriver', 150, 12, 12, ['garage']),
  mm('pliers', 'Pliers', 175, 60, 25, ['garage']),
  mm('needlenose', 'Needle-nose pliers', 200, 60, 25, ['garage']),
  mm('adjustable', 'Adjustable wrench, 8 in', 205, 55, 12, ['garage']),
  mm('wrench', 'Combination wrench', 140, 22, 6, ['garage'], '10 mm; a 19 mm is 240 × 40'),
  mm('hexkeys', 'Hex key set', 100, 60, 20, ['garage'], 'folded, or loose in a fan'),
  mm('socket', 'Socket, 3/8 in', 30, 22, 22, ['garage'], 'a 13 mm'),
  mm('bit', 'Driver bits', 25, 7, 7, ['garage'], '25 mm hex bits; a 1×1 cup takes dozens'),
  mm('drillbits', 'Drill bits', 120, 10, 10, ['garage'], 'the longest of a set'),
  mm('tapemeasure', 'Tape measure', 75, 75, 38, ['garage'], '5 m / 16 ft'),
  mm('utility', 'Utility knife', 160, 35, 20, ['garage']),
  mm('torpedo', 'Torpedo level', 230, 55, 25, ['garage']),
  mm('zipties', 'Zip ties', 200, 100, 20, ['garage'], 'the bag'),
  mm('screwbox', 'Screws, a small box', 100, 60, 30, ['garage']),
  mm('multimeter', 'Multimeter', 140, 70, 35, ['garage']),
  mm('flashlight', 'Flashlight', 130, 30, 30, ['garage', 'kitchen']),
  mm('etape', 'Electrical tape', 70, 70, 19, ['garage']),
  mm('superglue', 'Super glue', 100, 25, 15, ['garage']),
  mm('gloves', 'Work gloves', 250, 120, 30, ['garage'], 'a pair, flat'),
  mm('safetyglasses', 'Safety glasses', 160, 60, 50, ['garage']),
  mm('sandpaper', 'Sandpaper, folded', 140, 115, 10, ['garage'], 'a sheet in quarters'),
  // bathroom
  mm('toothbrush', 'Toothbrush', 190, 18, 18, ['bath']),
  mm('etoothbrush', 'Electric toothbrush', 230, 35, 35, ['bath']),
  mm('razor', 'Razor', 140, 40, 25, ['bath']),
  mm('lipstick', 'Lipstick', 75, 20, 20, ['bath']),
  mm('mascara', 'Mascara', 120, 18, 18, ['bath']),
  mm('lipbalm', 'Lip balm', 67, 16, 16, ['bath']),
  mm('polish', 'Nail polish', 75, 33, 33, ['bath'], 'lying down; stands in a 75 mm deep bin'),
  mm('clippers', 'Nail clippers', 60, 15, 12, ['bath']),
  mm('tweezers', 'Tweezers', 95, 10, 8, ['bath']),
  mm('brush', 'Makeup brush', 180, 18, 18, ['bath']),
  mm('compact', 'Compact', 72, 72, 15, ['bath']),
  mm('palette', 'Eyeshadow palette', 150, 85, 15, ['bath']),
  mm('hairties', 'Hair ties', 50, 50, 15, ['bath'], 'a handful'),
  mm('hairclip', 'Hair clip', 90, 40, 25, ['bath']),
  mm('comb', 'Comb', 180, 35, 8, ['bath']),
  mm('hairbrush', 'Hairbrush', 230, 75, 40, ['bath']),
  mm('floss', 'Floss', 70, 20, 60, ['bath'], 'the box'),
  mm('travelbottle', 'Travel bottle', 100, 40, 40, ['bath']),
  mm('deodorant', 'Deodorant', 130, 60, 35, ['bath']),
  mm('contacts', 'Contact lens case', 75, 30, 15, ['bath']),
  mm('handcream', 'Hand cream', 150, 50, 30, ['bath'], 'a tube'),
  mm('cottonswabs', 'Cotton swabs, a box', 85, 85, 60, ['bath']),
]);

export const ITEM_BY_ID = Object.freeze(Object.fromEntries(ITEMS.map(i => [i.id, i])));

/** Room left around a thing so it drops in and comes out easily. */
export const EASE = 2;

/**
 * Does a thing fit a space w × d (mm, the inside of a bin or a compartment)
 * with an inside height h and `rim` more above the bin before the drawer's
 * top? Flat first, then turned a quarter, then on the diagonal. Returns
 * null when it does not, else { how, angle, tall } where tall says it
 * stands above the bin's rim (it still fits the drawer unless it is taller
 * than bin plus rim, which is a miss).
 */
export function fit(space, item, rim = 0) {
  const l = item.l + EASE, w = item.w + EASE;
  if (item.h > space.h + rim + 0.5) return null;
  const tall = item.h > space.h + 0.5;
  if (l <= space.w && w <= space.d) return { how: 'flat', angle: 0, tall };
  if (l <= space.d && w <= space.w) return { how: 'flat', angle: 90, tall };
  // On the diagonal: the rectangle's shadow on each axis must fit.
  for (let deg = 1; deg < 90; deg++) {
    const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    if (l * c + w * s <= space.w && l * s + w * c <= space.d) return { how: 'diagonal', angle: deg, tall };
  }
  return null;
}

/**
 * The fewest cells, as columns × rows, whose bin (or compartment) takes the
 * thing flat. Prefers fewer cells, then the squarer shape. `inside` turns a
 * number of cells into the inside size of the bin it would make.
 */
export function cellsFor(item, cols, rows, inside, rim = 0) {
  let best = null;
  for (let w = 1; w <= cols; w++) for (let h = 1; h <= rows; h++) {
    const space = inside(w, h);
    const f = fit(space, item, rim);
    if (!f || f.how !== 'flat') continue;
    const score = w * h * 1000 + Math.abs(w - h);
    if (!best || score < best.score) best = { w, h, score, fit: f };
  }
  return best ? { w: best.w, h: best.h } : null;
}

/**
 * Where things would lie in a space, for drawing: left to right, front to
 * back, each in the orientation that fits, as many as fit in one layer.
 * Returns [{ item, x, y, l, w, angle }] in the space's own coordinates.
 */
export function arrange(space, ids, rim = 0) {
  const out = [];
  let x = EASE / 2, y = EASE / 2, rowDepth = 0;
  for (const id of ids) {
    const item = ITEM_BY_ID[id];
    if (!item) continue;
    const f = fit(space, item, rim);
    if (!f || f.how !== 'flat') { if (f) out.push({ item, x: EASE / 2, y: EASE / 2, l: item.l, w: item.w, angle: f.angle, loose: true }); continue; }
    const l = f.angle === 0 ? item.l : item.w, w = f.angle === 0 ? item.w : item.l;
    if (x + l > space.w - EASE / 2 + 1e-9) { x = EASE / 2; y += rowDepth + EASE; rowDepth = 0; }
    if (y + w > space.d - EASE / 2 + 1e-9) break;
    out.push({ item, x, y, l, w, angle: f.angle });
    x += l + EASE; rowDepth = Math.max(rowDepth, w);
  }
  return out;
}
