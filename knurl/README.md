# Knurl — Surface Texture Studio

Any STL in, a textured part with a two-colour first layer out. Live at
<https://kmay89.com/knurl/>, reached from the workshop at
<https://kmay89.com/workshop/>.

It is a buildless static page: plain ES modules, Three.js vendored for the
3D view, a web worker for the geometry, no server, no upload, nothing
fetched at run time. MIT licensed, like the rest of the site.

## Why texture a part at all

A flat printed wall shows every layer line, every seam, every small wobble
of the extruder. A textured wall hides all of it: the eye reads the pattern,
not the layers, and a knurled or fluted or scaled surface looks like it was
made that way on purpose. Textures also make a part nicer to hold and easier
to grip. The trick is making a texture that prints: every bump is an
overhang, and a texture that is deep and sharp needs supports a wall never
did. Knurl keeps the relief shallow, cuts it *into* the surface rather than
building out from it, fades it to nothing at the edges, keeps it clear of
the plate, and tells you the steepest overhang it made before you slice.

The first layer is the other face everyone sees, and a second colour there
costs almost nothing: two layers of filament and one swap, with no purge
tower worth the name. So the same tool paints a pattern, a border, text or
a logo into the bottom face as a second part on filament 2.

## The pipeline

1. **Load.** Binary or ASCII STL, or OBJ. Triangles are welded by
   quantised position (0.001 mm) into an indexed mesh, the part is centred
   and stood on the plate, and its closedness is checked (boundary,
   non-manifold and inconsistently wound edges are counted).
2. **Classify.** Every original triangle is a bottom (looks down and
   touches the plate), a wall (normal within 30° of horizontal), a top or
   an underside. Walls whose normal points toward the part's axis are
   inside walls (the inside of a cup) and stay smooth unless asked. The
   bottom is never textured.
3. **Subdivide.** The mesh is split uniformly to a target edge length
   (half a millimetre, or a fifth of the texture's repeat, whichever is
   smaller) with per-edge segment counts snapped to the same fractions on
   both sides, so the result is still watertight, within a triangle budget
   that coarsens the target when a part is large.
4. **Displace.** Each texture is a height field *h(u, v)* in [0, 1] with
   1 the original surface, parameterised in millimetres on the part: flat
   (the dominant axis of each face) or around the axis (cylindrical, with
   the repeat snapped to a whole number of times around the circumference
   so the seam closes). Vertices move along the normal of their textured
   faces, inward by (1 − h) × depth or outward by h × depth. Vertices on the
   boundary of the textured region stay put, and the displacement fades in
   over a chosen distance (a breadth-first hop count from the boundary), so
   the texture never produces a knife edge where it meets a top or the
   plate clearance band.
5. **Read.** The steepest real overhang: for every down-facing triangle of
   at least 0.01 mm² the angle asin(−n_z), with 0° a vertical wall and 90°
   a flat ceiling, and the area beyond 50°. Under 45° prints without
   supports on any sensible printer; 45–60° is marginal.
6. **Inlay.** The bottom face is rasterised at 0.25 mm, eroded by the edge
   margin, and the chosen pattern sampled per cell (or the page's raster of
   text or an image, centred and mirrored in X because the first layer is
   seen from below). Corner-only touches are filled so the solid is
   manifold. A height-field mesher makes a closed solid two layers tall,
   starting 0.02 mm below the body's bottom so it never floats.
7. **Export.** A binary STL per part, and one 3MF with one object of two
   parts: the body on extruder 1 and the inlay on extruder 2. Bambu Studio
   clips a later part out of earlier ones where they overlap, so the inlay
   simply replaces the body's first two layers where it lies. For a Bambu
   printer the sparse project config names the printer's own system presets
   with two filaments and the two colours, so the file opens as a project
   with no warning and nothing to fix; the plate type is set on the plate.

## Textures

Knurl (crossed diamonds), hexagons, flutes, ripples, scales, leather
(cellular noise), peel (orange skin), wood grain, brick and dots. Each has
a repeat and a depth, and one or two knobs of its own (sharpness, groove
width, mortar width, roughness). Defaults are tuned to print clean on a
0.4 mm nozzle at 0.2 mm layers: repeats of 2.4–8 mm, depths of 0.4–0.5 mm.

## Checks

`npm run check:knurl` runs three suites with `node --test`:

- `tests/geometry.test.mjs` — the samples are closed right-handed solids;
  binary STL, ASCII STL and OBJ round-trip; watertight counts open and
  flipped edges; subdivision keeps a solid closed with its volume, hits the
  target edge length and respects the budget; the classifier never textures
  the bottom and tells walls from tops; every texture keeps the box closed,
  inside its envelope when cut in, with overhangs under 60°; raising out
  adds material; the clearance bands are untouched; a cup wraps around with
  a period near the one asked and its inside wall is left alone; the
  overhang readout sees a 45° chamfer rising from the plate; height fields
  stay in [0, 1].
- `tests/inlay.test.mjs` — the footprint area is exact to a percent; erode
  and unpinch behave; every pattern's solid is closed, manifold and has
  exactly area × height volume; the margin is respected and the border
  hugs the outline; a page raster is centred and mirrored; the pattern
  functions agree with their names.
- `tests/export.test.mjs` — the ZIP is sound (`unzip -t` when available),
  the STL has one record per triangle; the 3MF carries two part objects and
  one assembly with components, the inlay on extruder 2, the build item
  centred on the plate, the bed type on the plate, and a project config
  naming the P2S presets with two filaments and two colours and nothing
  differing from system; colours and object settings come through; a
  non-Bambu printer gets no project config.

## Files

- `index.html`, `styles.css`, `app.js` — the page.
- `mesh.js` — weld, parsers, bounds, volume, area, normals, watertight,
  binary STL.
- `textures.js` — the height fields and the inlay patterns.
- `subdivide.js` — watertight uniform subdivision with a source map.
- `texture.js` — classify, roundness, applyTexture, stats.
- `inlay.js` — footprint, erode, unpinch, inlayRaster, rasterSolid,
  buildInlay.
- `samples.js` — the box, cup and knob samples (revolve, roundedBox,
  prism).
- `export.js` — zipStore, PRINTERS, projectSettings, threeMF.
- `worker.js` — runs texture and inlay off the main thread.
- `preview.js` — the Three.js view.
- `vendor/` — Three.js r170 and OrbitControls (MIT, see
  `third-party-notices.txt`).
