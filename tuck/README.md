# Tuck — Fold-up Box Studio

A box printed flat, in one piece, folded by hand, with a name on it. Live
at <https://kmay89.com/tuck/>, reached from the workshop at
<https://kmay89.com/workshop/>.

Buildless static page: plain ES modules, Three.js vendored for the 3D
view, a worker for the geometry, no server, no upload. It borrows the
first-layer mesher, the 3MF writer and the silent-open Bambu project
config from Knurl, and the ring triangulator (earcut, with left-out
points stitched back) from Cubby. MIT licensed, like the rest of the
site.

## The box

Inside width × depth × height, a sheet thickness (1.2 mm by default: six
layers), rounded corners, an optional lid window (circle, heart, star,
rounded square), a tuck lid or an open tray, a thumb notch.

The flat layout, hinge grooves facing up:

```
                 [ tuck flap ]
              [      lid       ]
   [tongue][flap][ back wall ][flap][tongue]
  [   left wall  ][   base   ][  right wall  ]
   [tongue][flap][ front wall][flap][tongue]
               (thumb notch)
```

- The four walls hinge on the base's edges and fold up toward the top of
  the print, so the first layer becomes the outside.
- The front and back walls carry a corner flap at each end that folds
  inward against the inside of the side wall. Each flap ends in a tongue
  hinged by a groove cut from *below*, so it folds the other way: out
  through a slot in the side wall. Four tongues lock four corners.
- The side walls carry the slots: as wide as the sheet plus the lock fit
  on each side, as tall as the tongue plus the fit, centred at the
  tongue's height, at the distance from the wall's hinge where the folded
  tongue's plane lands (the flap width, the hinge groove, half the sheet).
- The lid hinges on the back wall, is two sheet thicknesses wider than
  the inside so it covers the walls, and ends in a tuck flap narrower by
  the corner flaps that drops inside the front wall. A half-moon notch in
  the front wall's top edge lifts it.

## Hinges

A living hinge is what is left under the groove. The presets set the
groove width and the residual: PLA 2.0 / 0.6 mm (a handful of folds),
PETG 1.6 / 0.5 (hundreds), TPU 1.2 / 0.8 (forever). The readout shows the
residual in layers; two to four is the good range.

## The name

Set in the browser's font (bold sans, italic serif, heavy, playful),
rasterised at the first layer's quarter-millimetre cells, and placed in
the lid turned 180°: once the lid is folded over the back and closed it
reads left to right from the front. On the front wall it stands upright.
It is clipped to the sheet's footprint, meshed as a closed solid two
layers tall (Knurl's mesher), and exported as a second part of the same
object on filament 2, so Bambu Studio clips it into the sheet. A pattern
from Knurl's first-layer library can cover the whole footprint, inset a
little from every edge.

## The sheet as a solid

The sheet is a set of regions of the plane, each with a bottom and a top
height: panels 0 to t, top grooves 0 to the residual, the tongue grooves
t − residual to t. Regions tile the sheet with matching edges (every ring
is split at every other ring's vertex lying on it). Each region gets a
cap at both heights; a wall is raised along every ring edge where the
region's height interval sticks out beyond its neighbour's, or beyond
nothing at the outline and around holes; walls are banded at the sheet's
height levels so vertical edges coincide at corners. The triangle soup
welds into one closed solid whose volume equals the sum of area × height
over the regions, which the tests check for every variant.

## The die-line

The same outline as an SVG in millimetres: cut lines solid, valley folds
dashed red, mountain folds (the tongues) dotted blue. It cuts the same
box from card, slots and all.

## Checks

`npm run check:tuck` runs two suites with `node --test`:

- `tests/plan.test.mjs` — the default box is one closed sheet with the
  summed volume, fits a 256 mm plate, has fifteen panels and fourteen
  hinges, four of them from below; every lid, window, hinge and size
  variant stays closed with no repeated points; the slots are where the
  tongues land and the right size; the fold hierarchy is a tree rooted at
  the base with each hinge line inside its groove; the lid covers the
  walls and the tuck flap clears the corner flaps; the die-line has one
  outer loop plus a loop per hole and a fold per hinge; the footprint
  matches the sheet's area, a name is placed in the lid turned the right
  way, and the inlay and a pattern are closed solids.
- `tests/export.test.mjs` — the 3MF names Tuck, carries the sheet on
  filament 1 and the name on filament 2, and opens silently on a P2S;
  Knurl's own files still say Knurl.

## Files

- `index.html`, `styles.css`, `app.js` — the page.
- `plan.js` — the layout: regions, panels with their fold hierarchy,
  slots, the notch, the window, the name's place.
- `geometry.js` — outlines (rect with radii, circle, heart, star, notch),
  edge splitting, the ring triangulator, the region sheet mesher.
- `inlay.js` — the footprint raster, placing a name or a pattern, the
  inlay solid.
- `dieline.js` — the SVG.
- `export.js` — Tuck's name for the 3MF; the writer is Knurl's.
- `worker.js`, `preview.js` — off-thread building; the folding model and
  the flat sheet in Three.js.
- `vendor/` — Three.js r170, OrbitControls, earcut 3.0.1.
