# Knurl — Surface Texture Studio

Any STL in, a textured part with a two-colour first layer out. Live at
<https://kmay89.com/knurl/>, reached from the workshop at
<https://kmay89.com/workshop/>.

It is a buildless static page: plain ES modules, Three.js vendored for the
3D view, a web worker for the geometry, no server, no upload, nothing
fetched at run time. MIT licensed, like the rest of the site.

## What makes it quick

- **Looks.** Twenty-two one-tap recipes, from Machinist grip and
  Honeycomb shell to Quilted bag, Wicker, Parquet, Topo map, Hammered
  copper, Low poly, Kyoto, Seigaiha, Alhambra, Chevron, Dunes and Linen:
  a texture with its settings, where it goes, an ombré where it suits,
  and a first-layer inlay that matches. Every chip carries a shaded
  thumbnail of its texture, in your body colour. Tap one, then tune.
- **A live swatch.** A shaded tile of the texture at the current repeat,
  depth and knobs, redrawn on every keystroke, so the feel is visible
  before the mesh is rebuilt.
- **Tap to pick.** Choose "Tap to pick" and tap faces in the 3D view: a
  flat face picks as one region, a finely faceted cylinder (facets under
  8° apart) as one too; picked faces glow amber. Tap again to remove.
- **Bands and ombré.** Keep the texture between two heights above the
  plate, and fade its depth up or down across the band.
- **Stamps.** Your text, or any picture as a height map (dark is deep),
  placed once at the centre of the textured faces or tiled with one tile
  per repeat, with a softness knob that blurs the edges. It reads the
  right way round on every wall.
- **The heat view.** A flame button colours each face by its overhang:
  green under 45°, amber to 60°, red beyond.
- **Make it print.** When the steepest slope passes 45°, one button
  scales the depth by the ratio of the tangents (slope on a wall is
  proportional to depth) and rebuilds until it is under.
- **Fast preview, full export.** A lighter mesh while you tune; the
  full-detail one is built the moment you download.
- **Compare and share.** An eye button shows the part without its
  texture; a link carries every setting (not the part), and the page
  remembers them in its address as you work.

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
   bottom is never textured. For tap-to-pick, triangles are first joined
   into smooth regions (a flood fill across edges whose normals agree
   within 8°), and the picked regions are the textured set.
3. **Subdivide.** The mesh is split uniformly to a target edge length
   (half a millimetre, or a fifth of the texture's repeat, whichever is
   smaller) with per-edge segment counts snapped to the same fractions on
   both sides, so the result is still watertight, within a triangle budget
   that coarsens the target when a part is large.
4. **Displace.** Each texture is a height field *h(u, v)* in [0, 1] with
   1 the original surface, parameterised in millimetres on the part: flat
   (the dominant axis of each face, with u running to the right as the
   face is seen from outside) or around the axis (cylindrical, with the
   repeat snapped to a whole number of times around the circumference so
   the seam closes). Vertices move along the normal of their textured
   faces, inward by (1 − h) × depth or outward by h × depth, the depth
   scaled along the band for an ombré. Vertices on the boundary of the
   textured region stay put, and the displacement fades in over a chosen
   distance (a breadth-first hop count from the boundary) and at the band
   edges, so the texture never produces a knife edge where it meets a top
   or the plate clearance band. A stamp placed once is centred on the
   (u, v) box of the textured vertices.
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

Twenty-three height fields and the stamp, each with a repeat, a depth and
a knob or two of its own, with defaults tuned to print clean on a 0.4 mm
nozzle at 0.2 mm layers:

- **Machined and technical:** knurl (crossed diamonds), honeycomb, flutes,
  ripples, dimples, chevron, low poly (a triangular lattice of flat
  facets at three heights).
- **Woven and stitched:** basket weave (strands over and under, dipping
  where they cross), quilted (diamond tufting with a seam), linen (a fine
  cloth with slub), herringbone (2 × 1 blocks in 45° courses, bevelled).
- **Organic:** leather (cellular grain), orange peel, wood grain, dunes
  (wind ripples that wander), hammered (overlapping round dents), topo
  lines (contours of a noise landscape, engraved at a constant width in
  mm by dividing the level distance by the field's gradient).
- **Ornament:** brick, fish scales, seigaiha (staggered scallops, each a
  shallow bowl with concentric ridges rising to its rim, so every step
  faces up on a wall), asanoha (the hemp-leaf star: a triangular lattice
  plus spokes from each triangle's centroid to its corners), arabesque
  (the octagon-and-square lattice of a mashrabiya), trellis (overlapping
  circles, the quatrefoil lattice).

The engraved-line patterns use one smooth groove profile, so a line's
flank slope is depth over the groove's half width. A sharp crease between
textured faces (the top edge of a box) counts as a texture boundary: its
vertices stay put and the relief fades in from it, so the edge stays
crisp and no triangle there leans past the pattern's own slope.

The first-layer patterns match: honeycomb lines, dots, stripes, checker,
diamonds, rings, waves, chevron, herringbone, basket weave, seigaiha,
asanoha, arabesque, trellis, topo lines, quilted, concentric squares,
sunburst, halftone (dots that grow across 60 mm), a border, text and a
picture; each chip shows its pattern in the two filament colours.

## Checks

`npm run check:knurl` runs four suites with `node --test`:

- `tests/geometry.test.mjs` — the samples are closed right-handed solids;
  binary STL, ASCII STL and OBJ round-trip; watertight counts open and
  flipped edges; subdivision keeps a solid closed with its volume, hits the
  target edge length and respects the budget; the classifier never textures
  the bottom and tells walls from tops; every texture keeps the box closed,
  inside its envelope when cut in, with overhangs under 60°; raising out
  adds material; the clearance bands are untouched; a cup wraps around with
  a period near the one asked and its inside wall is left alone; the
  overhang readout sees a 45° chamfer rising from the plate; height fields
  stay in [0, 1]; regions join flat faces and a fine cylinder but stop at
  creases, and picked regions texture only themselves; a band leaves the
  rest flat and the ombré deepens the right way; the stamp samples
  bilinearly, tiles or places once, centres on the picked wall and reads
  the right way round on all four walls; tuneDepth scales by the tangents.
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
- `tests/settings.test.mjs` — settings round-trip through the link,
  unknown keys are dropped and numbers clamped; every look names a real
  texture, knobs, place and inlay; the shared swatch shades every
  texture's tile with relief and keeps the colour.

## Files

- `index.html`, `styles.css`, `app.js` — the page.
- `mesh.js` — weld, parsers, bounds, volume, area, normals, watertight,
  binary STL.
- `textures.js` — the height fields, the stamp and the inlay patterns.
- `swatch.js` — the shaded tile and the two-colour pattern tile, shared
  by the live swatch, the chip thumbnails and the tests.
- `looks.js` — the one-tap recipes.
- `settings.js` — settings to and from the link.
- `subdivide.js` — watertight uniform subdivision with a source map.
- `texture.js` — classify, regions, roundness, applyTexture (bands,
  ombré, picks, stamps), stats, tuneDepth.
- `inlay.js` — footprint, erode, unpinch, inlayRaster, rasterSolid,
  buildInlay.
- `samples.js` — the box, cup and knob samples (revolve, roundedBox,
  prism).
- `export.js` — zipStore, PRINTERS, projectSettings, threeMF.
- `worker.js` — runs texture and inlay off the main thread.
- `preview.js` — the Three.js view, with the pick highlight, the heat
  colouring and the raycast.
- `vendor/` — Three.js r170 and OrbitControls (MIT, see
  `third-party-notices.txt`).
