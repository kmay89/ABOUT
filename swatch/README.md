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

Seven tests, each a grid of two settings. Columns run left to right
across the plate, rows front to back; every pair becomes a coupon with
the two values printed on it (in a 3 × 5 pixel font, raised on a tab a
step below the test surface so the label never touches what is being
judged, or — on the first-layer tiles — cut through as holes and mirrored
so they read from underneath).

| Test | Across | Front to back | Coupon |
| --- | --- | --- | --- |
| Ironing: speed × flow | `ironing_speed` | `ironing_flow` | 26 × 30 × 2.4 mm tile |
| Ironing: spacing × pattern | `ironing_spacing` | `ironing_pattern` | tile |
| First layer: flow × elephant foot | `initial_layer_flow_ratio` | `elefant_foot_compensation` | 26 × 30 × 1.2 mm tile, read from below |
| Top surface: flow × speed | `top_solid_infill_flow_ratio` | `top_surface_speed` | tile |
| Top surface: pattern × line width | `top_surface_pattern` | `top_surface_line_width` | tile |
| Outer wall: speed × line width | `outer_wall_speed` | `outer_wall_line_width` | 20 × 20 × 30 mm pillar |
| Seam: scarf × position | scarf (a composite: type, length, start height, gap, override) | `seam_position` | ⌀ 20 × 25 mm cylinder |

The values on each axis are editable (type a list), the second axis can
be left empty for a single row, and the settings a test holds constant
on every coupon (ironing type, top shell layers, wall loops…) are
editable too. The page shows the plate as it will print, with a rough
weight and time, and warns when a grid will not fit the chosen printer
or reaches into the front-left corner Bambu Studio keeps for the purge
line.

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

On purpose the file embeds **no** `project_settings.config`: a project
config would replace the user's printer, filament and process profiles
with ones built from the slicer's defaults. Without it Bambu Studio
reports that it loaded "geometry data only" and keeps the user's own
profiles selected, while the per-object settings from
`model_settings.config` stay on the objects (the slicer clears them only
on File › Import, which the page and the guide both say not to use). The
`Application` metadata honestly says Swatch, not Bambu Studio.

The mesh of a coupon is a union of closed shells — a slab, a tab, pixel
boxes sunk a little into the tab — rather than a booleaned solid: a
slicer unions each layer's outlines with a non-zero fill rule, so
overlapping closed shells slice exactly as the single solid would.

## Checks

`npm run check:swatch` from the repository root runs three suites:

- `tests/geometry.test.mjs` — the font covers every character a label
  uses; mirrored labels are mirrored; boxes, prisms and all four coupon
  kinds are closed, outward-wound solids that stand on z = 0 and are the
  size they report; a tile's label stays below its test surface; a
  stencil's label is holes through the whole tile; label layout picks one
  line or two and never drops below the minimum pixel.
- `tests/catalogue.test.mjs` — every test uses only known settings with
  values the slicer accepts; serialization matches Bambu Studio's;
  typed values parse and complain; a grid is every pair with the axes
  winning over the fixed settings.
- `tests/export.test.mjs` — the ZIP is sound (the system `unzip` agrees);
  every test's grid fits the P2S plate clear of the purge corner with one
  label layout and one coupon size; the 3MF holds the coupons, their
  places and their settings as the slicer reads them, with no profile
  embedded and no claim to come from Bambu Studio; the sheet and the
  legend name every coupon.

## Files

- `index.html`, `styles.css`, `app.js` — the page.
- `tests.js` — the catalogue: the settings, how each is written, the
  tests and their defaults, parsing of typed values.
- `geometry.js` — the pixel font, boxes and prisms, the four coupons,
  closedness and volume checks, a binary STL writer.
- `plate.js` — the printers, the grid layout on the plate, the estimate.
- `export.js` — the ZIP writer, the 3MF, the sheet, the legend.
