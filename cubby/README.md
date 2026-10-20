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

## Files

- `index.html`, `styles.css` — the interface, the print guide.
- `app.js` — state, the plan editor (SVG, drag to draw), the panels,
  downloads, undo, save/open, links.
- `geometry.js` — the bin and the clip as closed solids, the STL writer.
  No DOM; runs in a page, a worker or Node.
- `layout.js` — the drawer, the grid, bins on it, starting layouts, the
  parts list with quantities and clips, plate packing, estimates. No DOM.
- `export.js` — a stored ZIP writer, the 3MF writer, file names, the print
  sheet, the all-in-one bundle. No DOM.
- `preview.js` — the Three.js orbit preview: the drawer, the bins, click
  to select.
- `vendor/` — Three.js r170 with OrbitControls (MIT) and earcut 3.0.1 (ISC).
- `tests/` — the checks below.

## How the geometry is built

Every solid is made from rings: closed outlines walked counter-clockwise,
lifted to a height and joined by walls. A bin is a bottom ring, a plain ring
at floor height, the same ring with the channels notched into it (the
ledges between the two are the channels' ends), and a top ring whose points
carry the scoop's height; inside, one ring per compartment with the ribs
behind the channels pushed into it. earcut triangulates the caps and the
ring between the outer wall and the compartments; it drops points that sit
exactly on a straight line (the scoop's samples), so `triangulateRings`
fans every triangle edge that skipped such points back over them, and the
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
bed without overlap, and reading damaged saved designs safely.
`export.test.mjs` reads the ZIP writer's output back (and has the system's
`unzip` test it where present), checks the 3MF's parts, objects, items and
rotations, STL sizes and names, and the print sheet.

None of this replaces a test print. The time figure is a rough one for a
0.2 mm profile; the slicer knows better, and the first clip tells you which
fit your printer likes. Third-party notices are in `third-party-notices.txt`.
