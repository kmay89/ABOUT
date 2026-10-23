# Cameo — Photo Figurine Studio

A photo in, a relief figurine on a pedestal out. Live at
<https://kmay89.com/cameo/>, reached from the workshop at
<https://kmay89.com/workshop/>.

It is a buildless static page: plain ES modules, Three.js vendored for the
3D view, no server, no upload. The one thing it fetches is the AI stack —
transformers.js from jsDelivr and two models from the Hugging Face hub —
the first time the AI buttons are pressed; the browser keeps them, and the
page works without them. MIT licensed, like the rest of the site; the models
are their authors' (Depth Anything V2 is Apache-2.0; BRIA RMBG-1.4 is under
a non-commercial licence, see its model card).

## What it makes, and what it does not

A **relief**, not a sculpture in the round. From the front it reads as the
figure in the photo; from the side it is a thick plaque with a rounded
edge, like a carved cameo. A true all-round figure from a single photo
needs image-to-3D models (TripoSR, Hunyuan3D, TRELLIS) that are gigabytes
and want a GPU server; none of that runs in a static page. A relief does,
and it prints beautifully lying flat on its back with no supports.

The pipeline:

1. **Cut-out.** BRIA RMBG-1.4 (about 45 MB) removes the background in the
   browser, through transformers.js on WebGPU or WASM. Where it is wrong, a
   magic wand (flood fill by colour, 8-way, with a tolerance) and a paint
   and erase brush fix it; the same tools make the cut-out from scratch
   when the model cannot load. The cut-out is tidied for printing: a
   morphological close then open (radius 2) drops specks and hairs, the
   largest 4-connected component is kept, holes up to a chosen area are
   filled, and anything in the bottom tenth is joined straight down to the
   tab so paws and feet stand on it.
2. **Depth.** Depth Anything V2 small (about 25 MB) estimates relative
   depth. Inside the cut-out it is normalised, then split into a broad
   part (a box blur, three passes) that lifts the nearer body, and the
   fine remainder for fur and folds.
3. **The height field.** An exact Euclidean distance transform
   (Felzenszwalb–Huttenlocher) gives every cell its distance to the
   outline; the edge rolls over with a quarter-circle profile of the
   chosen radius, `z = back + round · √(1 − (1 − d/round)²)`, then the
   broad depth adds `relief · depth · roundness` and the fine part adds
   `detail · fine · roundness²`, both fading to nothing at the edge so the
   outline stays crisp. The tab is a flat 3 mm bar under the feet.
4. **The solids.** One mesher turns a height field over a mask into a
   closed shell: a top sheet whose corners average the cells around them,
   walls wherever a set cell meets an unset one, a flat bottom. The figure
   is built lying on its back; the pedestal (an oval or a rounded block)
   is the same mesher with a pocket for the tab, the tab plus a clearance,
   5 mm deep. Cells are 0.4 mm, never more than 420 on the figure's tall
   side.
5. **The files.** A binary STL per part, and a 3MF with the figure flat on
   its back and the pedestal standing beside it, placed on the plate, with
   per-object settings that suit a relief (six top layers, no ironing on
   the face; the pedestal's top ironed) and, for a Bambu printer, the
   sparse project config that names the printer's own presets so Bambu
   Studio opens it with no warning (the reasoning is in
   `swatch/export.js`).

## Checks

`npm run check:cameo` runs three suites:

- `tests/mask.test.mjs` — components, largest piece, holes by area; the
  distance transform is exact on a disc and treats the image edge as
  outside; open removes hairs and close fills nicks; the wand stops at a
  colour change; the brush paints and erases; resampling and the blur
  keep their values.
- `tests/relief.test.mjs` — the mesher makes closed, outward solids of
  the right volume, centred, holes and all; a figure stands the height
  asked, rounds to `back + round` at its highest, has a flat tab of the
  right thickness; depth raises the middle within bounds and never thins
  the back; the grid respects the cell cap; a pedestal is closed with a
  pocket of the tab plus the clearance, oval or rounded.
- `tests/export.test.mjs` — the ZIP and STL are sound; the parts lie side
  by side clear of the purge corner and a small plate warns; the 3MF
  carries both parts with their settings, the plate type and the sparse
  project config, and none for a non-Bambu printer.

The model loading cannot run in Node; it is written to reject cleanly, and
the page's AI buttons report the reason and fall back to the hand tools.

## Files

- `index.html`, `styles.css`, `app.js` — the page.
- `mask.js` — the cut-out: components, holes, morphology, the distance
  transform, the wand and brush, resampling and blur.
- `relief.js` — the height-field mesher, the figure, the pedestal, checks.
- `ai.js` — the two models through transformers.js.
- `export.js` — the ZIP, STL and 3MF writers, the printers.
- `preview.js` — the figurine standing in its pedestal, in Three.js.
- `sample.jpg` — a dog on a trail at dusk, the sample photo.
