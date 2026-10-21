# Cubby — Drawer Organizer Studio

Design a 3D printed organizer for any drawer, in the browser, and download
a file the printer is ready for. Live at <https://kmay89.com/cubby/>,
reached from the desk by the drawer pulled open under its near-right
corner.

It is a buildless static app: plain ES modules, Three.js and earcut
vendored locally, no CDN, no server, no upload. Serve the folder over
HTTP(S) — ES modules do not run from `file://`.

## The workflow

1. **Measure the drawer** — inside width, depth and height, in millimetres
   or inches. Pick what the drawer is for (kitchen, desk, garage, bathroom,
   anywhere) and a starting layout.
2. **Arrange the bins** — a grid of columns and rows fills the drawer
   exactly; the pitch comes from the drawer, so there is never a gap to
   shim. Drag across cells to join them into one bin; click a bin to split
   it into compartments, make it low, or give it a finger scoop. The same
   solids that will print turn in 3D beside the plan.
3. **Print** — download one 3MF per plate with every part placed, named
   and oriented (Bambu Studio, OrcaSlicer and PrusaSlicer all open it), or a
   ZIP with the plates, an STL per part, a print sheet and the design.
   Identical bins are one part with a quantity. Parts are packed for the
   chosen printer's plate; anything too big is reported with the fix.

A design is saved in the browser as you work, can be saved and opened as a
small JSON file, and fits in a link (**Copy a link to this design**).

**What goes in it.** `items.js` holds a hundred common things with typical
sizes — cutlery, utensils, pens, batteries, cables, tools, bits, makeup,
brushes — each marked for the spaces it belongs to. With nothing selected,
*Size a bin for…* names the smallest bin on the grid that takes a thing flat
and adds one in the first free spot. With a bin selected, the same list is
coloured by fit: green lies flat, amber only on the diagonal or standing
above the rim, red not at all (hover for the numbers and the cells it would
need). Press a thing to note it as the bin's contents: the plan draws it to
size in the bin, names the bin for it, and the print sheet says what each
part is for. The fit keeps 2 mm of ease and checks height against the bin
plus the room under the drawer's top, so a stapler that stands above the
rim still counts if the drawer will close over it.

**Plates.** Parts are packed for the chosen printer's plate: 4 mm from the
edge, 6 mm apart, and clear of the 18 × 28 mm front-left corner Bambu
Studio reserves for its purge line (its profiles' `bed_exclude_area`), so
the 3MF slices exactly as laid out. A part too long to lie square goes on
the diagonal, alone on its plate, pointing from the front-right corner to
the back-left so it misses that corner (a 256 mm plate takes about 320 mm
that way). Longer than that, the starting layouts split lanes into pieces
joined by a clip, and the warning under the parts offers to split a bin you
drew yourself. The *Plates* panel draws every plate as the slicer will open
it, with its weight and time.

## The system

- **Bins** are open boxes with rounded corners, a wall that is a whole
  number of nozzle lines (1.6 mm = four lines of 0.4) and a floor that is a
  whole number of layers (1.2 mm = six of 0.2), so they print solid, fast
  and light. Compartments are equal cells behind 1.2 mm dividers. A low bin
  is half height. A finger scoop is a cosine dip in the front wall, never
  deeper than three-tenths of the bin.
- **The joint** is a vertical dovetail channel on every outside wall at the
  centre of each grid cell the bin covers: 1.4 mm deep, 3 mm at the mouth,
  4.6 mm at the back. Behind it the wall thickens inward just there, so
  there is always 1.6 mm of solid plastic behind the joint and the rest of
  the wall stays thin. The channel is blind — it ends at the floor — so a
  clip can never drop through.
- **The clip** is a bowtie: two dovetail keys back to back with a neck as
  long as the gap between bins. It drops in from the top and holds two
  neighbours as one. Three fits (snug, normal, loose; 0.10 / 0.18 / 0.28 mm
  a side) change only the clip, never the bins. Clips are optional: a drawer
  filled edge to edge holds itself, and turning them off removes the
  channels too.
- **Clearances**: 0.5 mm between the bins and each side of the drawer,
  0.4 mm between neighbours, 3 mm below the drawer's top edge. All of it is
  in **Fine settings**, each with a line on what it does and why.

## Sound and motion

Small sounds are made on the spot by `sound.js` (WebAudio, no files): a
wooden tock when a bin lands, a tick when one is picked, a two-note slide
when one goes, a chime when a file is ready, a quick settle when a whole
layout lands. The switch in the header turns them off and is remembered.
In 3D, new bins drop into the drawer and the picked one lifts a little;
on the plan a new bin pops in and the drag outline marches. Everything
honours `prefers-reduced-motion`.

## Files

- `index.html`, `styles.css` — the interface, the print guide.
- `app.js` — state, the plan editor (SVG, drag to draw), the panels,
  downloads, undo, save/open, links.
- `geometry.js` — the bin and the clip as closed solids, the STL writer.
  No DOM; runs in a page, a worker or Node.
- `layout.js` — the drawer, the grid, bins on it, starting layouts, the
  parts list with quantities and clips, plate fit and packing, estimates.
  No DOM.
- `items.js` — the common things, their sizes, and the fit, sizing and
  arranging maths. No DOM.
- `export.js` — a stored ZIP writer, the 3MF writer, file names, the print
  sheet, the all-in-one bundle. No DOM.
- `preview.js` — the Three.js orbit preview: the drawer, the bins, click
  to select, bins dropping in and lifting.
- `sound.js` — the sounds, synthesised.
- `vendor/` — Three.js r170 with OrbitControls (MIT) and earcut 3.0.1 (ISC).
- `tests/` — the checks below.

## How the geometry is built

Every solid is made from rings: closed outlines walked counter-clockwise,
lifted to a height and joined by walls. A bin is a bottom ring, a plain ring
at floor height, the same ring with the channels notched into it (the
ledges between the two are the channels' ends), and a top ring whose points
carry the scoop's height; inside, one ring per compartment with the ribs
behind the channels pushed into it. A compartment's corners against the
outside wall are concentric with it (one wall thickness all the way round,
so they always sit inside it); against a divider they take a 1 mm fillet,
or go sharp where a rib runs into the divider so the wall behind a channel
is solid through to it. earcut triangulates the caps and the ring between
the outer wall and the compartments; it leaves out points on a straight
line (the scoop's samples, rib ends) and can return zero-area triangles
where rings share a line, so `triangulateRings` splits every triangle edge
at each ring point lying on it and drops the zero-area ones, and the
surface meets every wall edge. The clip is a section extruded along X.

## Checks

```sh
npm run check:cubby    # from the repo root
```

`geometry.test.mjs` proves every bin and clip is one closed solid — every
edge shared by exactly two faces in opposite directions, positive volume,
Euler characteristic 2 — across plain, channelled, scooped, divided, thick
and thin-walled bins, checks sizes, volumes (walls plus floor less what the
corners round off; ribs minus channels), that the channel ends at the floor,
that the scoop dips only the front, that the clip fits its channel with its
clearance, and that bad sizes are refused with a reason.
`layout.test.mjs` covers the grid filling the drawer exactly, the minimum
cell, every starting layout tiling without overlap, placing and trimming
bins, channel positions, clip counts and lengths, plate packing inside the
bed without overlap and clear of the reserved corner, diagonal placement,
splitting to fit the plate, and reading damaged saved designs safely.
`items.test.mjs` checks the library, the fit (flat, turned, diagonal, too
tall), the smallest-bin search, the drawn arrangement, and a bin's inside
against its walls, dividers and floor.
`fuzz.test.mjs` builds sixty random drawers — any size, every setting at
a random value within its limits, every starting layout, bins of every
shape with random compartments, low, scoops and contents — and proves
every part is a closed solid, every plate packs inside the bed with
nothing overlapping or in the reserved corner, every file writes, and
every design survives a save. It found the two bugs above, which is what
it is for.
`export.test.mjs` reads the ZIP writer's output back (and has the system's
`unzip` test it where present), checks the 3MF's parts, objects, items and
rotations, STL sizes and names, and the print sheet.

None of this replaces a test print. The time figure is a rough one for a
0.2 mm profile; the slicer knows better, and the first clip tells you which
fit your printer likes. Third-party notices are in `third-party-notices.txt`.
