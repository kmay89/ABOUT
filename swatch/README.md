# Swatch — Surface Test Lab

A grid of small test coupons, each carrying its own slicer settings, in
one Bambu Studio file. Print the plate once, hold it to the light, keep
the best square, put its values in your profile. Live at
<https://kmay89.com/swatch/>, reached from the workshop at
<https://kmay89.com/workshop/>.

It is a buildless static page: plain ES modules, no dependencies, no
server, no upload. Serve the folder over HTTP(S) and it runs. MIT
licensed, like the rest of the site.

## What it makes

Nine tests, each a grid of two things, and four **sessions** that put two
or three of them on one plate in the order that pays best. Columns run
left to right across the plate, rows front to back; every pair becomes a
coupon with the two values printed on it (in a 3 × 5 pixel font, raised
on a tab a step below the test surface so the label never touches what is
judged, or — on the first-layer tiles — cut through as holes and mirrored
so they read from underneath). **Quick** is three values an axis, the
span that matters; **thorough** is five, for one test to a plate.

| Test | Across | Front to back | Coupon |
| --- | --- | --- | --- |
| Dimensions: contour × hole | `xy_contour_compensation` | `xy_hole_compensation` | 30 × 24 × 4 mm gauge with a Ø10 hole, for calipers |
| Fit: clearance | hole minus peg (geometry, not a setting) | — | 18 mm block with a hole and a Ø8 peg beside it |
| First layer: flow × elephant foot | `initial_layer_flow_ratio` | `elefant_foot_compensation` | 26 × 30 × 1.2 mm tile, read from below |
| Top surface: flow × speed | `top_solid_infill_flow_ratio` | `top_surface_speed` | 26 × 30 × 2.4 mm tile |
| Ironing: speed × flow | `ironing_speed` | `ironing_flow` | tile |
| Outer wall: speed × line width | `outer_wall_speed` | `outer_wall_line_width` | 20 × 20 × 30 mm pillar |
| Seam: scarf × position | scarf (a composite: type, length, start height, gap, override) | `seam_position` | ⌀ 20 × 25 mm cylinder |
| Ironing: spacing × pattern | `ironing_spacing` | `ironing_pattern` | tile |
| Top surface: pattern × line width | `top_surface_pattern` | `top_surface_line_width` | tile |

The sessions: **1 · Accuracy** (dimensions, fit, first layer), **2 · Top
surfaces** (top flow, ironing), **3 · Walls and seams**, **4 · Finishing
touches** (ironing pattern, top pattern). Accuracy comes first because
every later coupon is a part whose size should already be right; the top
layer is judged before ironing because a pinholed top cannot be ironed
flat. A plate can also be built by hand from any tests.

The values on each axis are editable (type a list), the second axis can
be left empty for a single row, and the settings a test holds constant
on every coupon are editable too. The page shows the plate as it will
print — each test a block, the first at the front — with a rough weight
and time, warns when a plate will not fit the chosen printer or reaches
the front-left corner Bambu Studio keeps for the purge line, and for the
dimensions test turns caliper readings into the two compensations.

Downloads: the **3MF**, a **sheet** (`.txt`, every coupon's settings and
what to look for) and a **legend** (`.svg`, the plate map).

## How the settings travel

A Bambu Studio 3MF carries, next to the geometry,
`Metadata/model_settings.config`: for each object a list of
`<metadata key="…" value="…"/>` entries that the slicer reads straight
into that object's per-object config — the same file it writes when you
right-click a part and add a setting. Swatch writes that file by hand,
one `<object>` per coupon, plus a `<plate>` section listing the
instances.

Every key Swatch uses lives in the slicer's `PrintObjectConfig` or
`PrintRegionConfig` (read from Bambu Studio's `PrintConfig.hpp`), so a
per-object value overrides the process profile for that coupon alone.
Values are serialized the way the slicer serializes them: percents as
`10%`, the per-extruder vectors (`top_surface_speed`,
`outer_wall_speed`, `top_solid_infill_flow_ratio`) as one number,
enums by their internal name (`topmost`, `monotonicline`, `zig-zag`),
booleans as `1`/`0`. The scarf-seam options also set
`override_filament_scarf_seam_setting`, without which the filament
profile's scarf choice wins.

For a Bambu printer the file also carries `Metadata/project_settings.config`,
but a sparse one. Bambu Studio's own project files hold the whole config
plus `different_settings_to_system`, the list of keys that differ from the
system presets; on load, `PresetCollection::load_external_preset` copies
every key *not* in that list from the installed system preset and, if the
result equals it, selects the system preset rather than creating a new one.
So Swatch names the printer's own presets (`printer_settings_id`,
`print_settings_id`, `filament_settings_id`, `printer_model`), lists
nothing as different, and gives one filament colour so the loader counts
one filament; the slicer then opens the file as a project with no warning,
with its own copies of the 0.20 mm Standard process, Bambu PLA Basic and the
0.4 mm nozzle machine selected and the plate type set. Nothing of the user's
is overwritten — their own filament and process are a dropdown away, and
the coupons keep their per-object differences. Without that file the slicer
raised "not from Bambu Lab" or "invalid config, load geometry data only"
(the latter since 2.8.2), which was alarming even though the per-object
settings were kept. Printers without known Bambu presets get no project
config, and the `Application` metadata honestly says Swatch.

The mesh of a coupon is a union of closed shells — a slab, a tab, pixel
boxes sunk a little into the tab — rather than a booleaned solid: a
slicer unions each layer's outlines with a non-zero fill rule, so
overlapping closed shells slice exactly as the single solid would.

## Checks

`npm run check:swatch` from the repository root runs three suites:

- `tests/geometry.test.mjs` — the font covers every character a label
  uses; mirrored labels are mirrored; boxes, prisms, holed blocks and all
  six coupon kinds are closed, outward-wound solids that stand on z = 0
  and are the size they report; a tile's label stays below its test
  surface; a stencil's label is holes through the whole tile; a socket's
  hole is the peg plus the clearance; label layout picks one line or two
  and never drops below the minimum pixel.
- `tests/catalogue.test.mjs` — every test uses only known settings with
  values the slicer accepts, quick lists included; serialization matches
  Bambu Studio's; typed values parse and complain; a grid is every pair
  with the axes winning over the fixed settings; sessions name real tests
  and start with accuracy.
- `tests/export.test.mjs` — the ZIP is sound (the system `unzip` agrees);
  every test, quick and thorough, fits the P2S plate clear of the purge
  corner; every quick session fits with its tests in order and no two
  coupons overlapping; the 3MF holds the coupons, their places and their
  settings as the slicer reads them; the project config names only the
  system presets and lists nothing as different; a session's coupons are
  named by their test; the sheet and the legend name every coupon.

## Files

- `index.html`, `styles.css`, `app.js` — the page.
- `tests.js` — the catalogue: the settings and geometry parameters, how
  each is written, the tests with their quick and thorough values, the
  sessions, parsing of typed values.
- `geometry.js` — the pixel font, boxes, prisms and holed blocks, the six
  coupons, closedness and volume checks, a binary STL writer.
- `plate.js` — the printers and their Bambu presets, the plate types, the
  grids and the packing of several tests on one plate, the estimate.
- `export.js` — the ZIP writer, the 3MF with its sparse project config,
  the sheet, the legend.
