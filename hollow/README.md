# Hollow — Mold Studio

Drop in an STL and get back the hollow of it: a 3D printable mold for
concrete, plaster, resin, wax or soap, with everything a caster wishes a
mold already had. Live at <https://kmay89.com/hollow/>, reached from the
workshop at <https://kmay89.com/workshop/>.

It is a buildless static app: plain ES modules, Three.js vendored locally,
no CDN, no server, no upload. Serve the folder over HTTP(S) — module workers
do not run from `file://`. MIT licensed; see [LICENSE](LICENSE).

## What it makes

- **Two-part mold** — a block split on a horizontal parting plane into a
  lower half A and an upper half B. Three tapered alignment pegs on an L
  (never a square, so the halves cannot go together turned round) with
  printed clearance you set, or a locating rail plus one orientation peg. A
  pour spout on the parting line, half in each part, where the cavity
  reaches furthest in the pouring direction. Air vents, 2.5 mm, from every
  pocket where the pour would trap a bubble to the top face. Grooves for
  rubber bands or four M5 bolt holes. Two pry slots on the parting line.
- **Open mold** — one block with the cavity open at the top, for anything
  with a flat back: coasters, tiles, trays. An overfill rim above the back
  lets you strike the piece flat. A hollow model (a planter, a cup) comes out
  as a body and a core with a collar that rests on the rim at the right depth.
- **Silicone master** — the model standing in its own printed tray with a
  silicone-thick gap all round, printed as one piece; pour silicone to the
  top edge, cure, cut open. The page says how much silicone that is.

Every part is a closed, consistently wound solid in millimetres, and arrives
in its printing position: flat side on the plate, cavity facing up, so a mold
that releases is a mold that prints without supports. Export is one STL per
part, or one 3MF with every part named and already laid out on the plate,
which opens in Bambu Studio as a ready project.

## What it checks

- **Release map.** For every face of the model a point just outside it, in
  the mold, is checked for model material above or below it in its column —
  above for a part that lifts up, below for one that drops away. Trapped
  surface is red in the preview, surface with less draft than two degrees is
  amber. The parting plane is chosen automatically as the height that traps
  the least surface (every height is tried), with a preference for the widest
  section among ties; drag the slider to overrule it and watch what turns red.
- **Air traps.** The model's occupancy is swept from the top of the pour
  downwards; every pocket of cavity that begins before joining the rest is a
  place air would collect. The first is where the spout goes; the others get
  vents, deepest first, up to six.
- **Fit.** Each part, and the whole set laid out together, against the
  printer's plate (Bambu Lab P2S, X1/P1/A1, H2D, A1 mini; Prusa MK4S, CORE
  One, MINI+; Creality K1; a generic 300 mm). The choice is the one thing the
  page remembers.
- **Amounts.** Cast volume including the spout, turned into grams of concrete
  or plaster, millilitres of resin, grams of wax or soap; plastic per part at
  15 % infill; silicone to fill a master's tray.
- **The model itself.** Open edges and inconsistent winding are reported; a
  model with a few holes still fills, because inside and outside are decided
  by a vote of three ray directions.

## How it works

Everything is a signed distance field on a grid a few tenths of a millimetre
apart (`sdf.js`): the model's field is measured exactly from its triangles in
a narrow band (closest point on a triangle, Ericson) and signed by ray parity
along all three axes with a majority vote. The block, the keys, the spout,
the vents, the grooves, the bolt holes, the pry slots and the core's collar are
analytic shapes, and shapes combine with min (union), max (intersection) and
max(a, −b) (difference). Each part's field is traced with marching tetrahedra
(`mc.js`) — six tetrahedra per cell around the main diagonal, whose face
diagonals agree between neighbours, so the surface is always one closed,
consistently wound mesh with no look-up table to get wrong — and then
simplified by area-weighted quadric error metrics run as threshold passes
(`decimate.js`), so a flat face is a handful of triangles while curves stay
within a fiftieth of a millimetre. The recipe that puts it together is
`mold.js`; `samples.js` draws the four sample models from formulas.

The whole build runs in a worker (`mold-worker.js`) with progress messages.
The preview rebuilds at draft detail (about 2.5 million nodes, a few
seconds) whenever a setting changes; "Build for export" runs at standard
(9 million) or fine (22 million) and enables the downloads.

Detail is limited by the grid: a feature smaller than the spacing softens,
and a sharp edge becomes a chamfer about one cell wide. At standard detail
on a 100 mm piece that is about 0.3 mm, which is also about what a 0.4 mm
nozzle resolves. Fine detail is for small resin pieces.

## Files

- `index.html`, `styles.css` — the interface.
- `app.js` — state, model import, orientation, settings, the worker, the
  numbers, downloads, projects, the guide.
- `viewer.js` — the Three.js stage: model with release map, mold assembled
  or exploded, a clipping-plane section, parts on the plate with overhang
  shading, and the mold standing to be poured.
- `mesh.js` — STL (binary and ASCII) and OBJ readers, welding, measurement,
  transforms, components, the closed-surface check, the binary STL writer.
- `sdf.js`, `mc.js`, `decimate.js`, `mold.js` — the geometry, as above.
- `threemf.js` — a 3MF writer with its own ZIP (CRC-32, local headers,
  central directory; deflated through the browser's `CompressionStream` when
  it has one, stored otherwise).
- `samples.js` — a river pebble, a drawer knob, a star tile and a faceted
  planter, drawn by lathe and extrusion.
- `mold-worker.js` — the build, off the main thread.
- `sw.js`, `manifest.webmanifest`, `icons/` — offline and installable;
  `tools/make-icons.js` draws the icons from formulas.
- `vendor/` — Three.js r170 with its MIT licence.
- `tests/` — the checks below.

## Checks

```sh
npm run check:hollow     # from the repo root
```

`mesh.test.mjs` covers the readers, the writer, welding, components, the
closed-surface check and the samples. `sdf.test.mjs` compares the measured
field of a tilted box with the analytic one (exact to a thousandth in the
band), fills a torn shell by vote, and checks every analytic shape.
`surface.test.mjs` proves marching tetrahedra gives a closed solid with the
right volume, that decimation keeps it closed and within tolerance, and that
a flat box collapses to a few dozen triangles tilted or not. `mold.test.mjs`
builds every kind of mold: pegs that rise from A into sockets in B with the
fourth corner empty, a spout that leaves on the chosen face, a vent that
appears for a second peak and not for a flat edge, a bad parting plane that
shows trapped surface and an automatic one that does not, an open mold with
nothing above the opening, a vessel that becomes body and core, a master with
the model fused to its floor, and print placements that put every part flat
on the plate. `threemf.test.mjs` reads the ZIP back, inflates it, checks the
CRCs and the model XML.

None of this replaces a test pour. Print the mold, cast one, and look at it.

## Privacy

Models are read in browser memory and never sent anywhere — the page has no
endpoint to send them to. "Save project" downloads a JSON file holding the
model (as binary STL) and every setting; "Open project" restores it. The page
keeps nothing after you close it, apart from which printer and material you
chose.

Third-party notices are in `third-party-notices.txt`.
