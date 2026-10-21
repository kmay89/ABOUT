# Luma — Lithophane Studio

Turn a photo into a 3D printable lithophane: a panel whose thickness *is*
the picture. Thin plastic lets light through, thick plastic holds the
shadow, and with a light behind it the photo appears. Live at
<https://kmay89.com/luma/>, reached from the desk by the glowing picture
on the wall above the bike.

It is a buildless static app: plain ES modules, Three.js vendored
locally, no CDN, no server, no upload. Serve the folder over HTTP(S) —
module workers do not run from `file://`.

## What it makes

- **Flat picture** — an insert for a lighted frame: custom size, 4 × 6 in,
  5 × 7 in or square, with an integral border.
- **Curved shade** — an open panel that wraps 30–180° round a nightlight,
  sized by its inside diameter.
- **Lamp** — the curve taken all the way round: a closed ring that stands
  over an LED tea light or puck light. The photo wraps once; only the top
  and bottom carry a border. Presets: tea-light lamp (Ø 80 × 100 mm) and
  tall lantern (Ø 100 × 150 mm).

Every export is one closed, consistently wound indexed solid in
millimetres, upright with Z as height and the bottom at Z = 0, written as
binary STL in a worker (or on the page if workers are blocked).

## What makes the prints look good

- **Auto-enhance** (on by default) measures the photo's own black and white
  points — the luminance below which its darkest 0.5% fall and above which
  its brightest 0.5% do — once per photo, and stretches them to the ends of
  the thickness range. Most photos never reach true black or white, and a
  lithophane only shows the tones it is given, so this is the single
  biggest improvement for most photos. Measured once, not per crop, so
  panning never shifts the exposure.
- **Detail** is an unsharp mask (two passes of a separable box blur) whose
  radius is a physical 1.2 mm, converted to pixels at whatever resolution
  is being built — so the preview and the export sharpen the same thing.
  Light spreads a little inside plastic; this wins the edges back.
- Brightness and contrast, crop by dragging or pinching the photo, rotate,
  mirror (to view from the smooth side), and a seven-step **thickness test
  strip** generated from your own bright/dark settings.

## Orientation and how it prints

- 4 × 6 and 5 × 7 follow the photo: a wide photo gets 6 × 4, a tall one
  4 × 6, and the Portrait / Landscape buttons swap it either way.
- Every model prints **standing up**: the picture is the plastic's
  thickness, and standing up the nozzle draws that thickness with its fine
  X/Y motion. Printed flat, each 0.12 mm layer becomes a visible tone step.
- A tall flat panel arrives **lying on its long edge** (a proper quarter
  turn about Y, `turn` in `mesh.js`): shorter, steadier, fewer layers. The
  preview still shows it as it hangs. "Its bottom edge" in More print
  options keeps it upright as it hangs.

## Filament, thickness and the test strip

- Pick **PLA or PETG** and a **colour**. The preview models plastic as an
  absorber, `exp(-k·t)` per colour channel, relative to white PLA at
  0.8 mm: PETG is a little more translucent (k 1.0 vs 1.18), a coloured
  filament absorbs the colours it isn't (pink starves green and blue),
  black blocks nearly everything, clear absorbs about half as much. Each
  choice explains itself and sets a starting range that keeps white's
  light-to-dark ratio (white PLA 0.8–3.0, white PETG 0.8–3.2, light
  colours thinner, clear 1.0–4.0). The light can be warm, neutral or cool.
- A contrast word (Flat / Soft / Rich / Very deep) under the thickness
  inputs says what the range will look like, and "What these two numbers
  do" explains them in three lines.
- The **test strip** is always 0.6 → 3.6 mm in seven 0.5 mm steps, so its
  key never changes. "Read your strip" shows what each step should look
  like with the chosen filament and light, and two pickers — the thinnest
  step that's solid and bright, the first that looks almost black — set
  the range from the real print.

## Matching the light

"Match your light" (`light.js`) turns a light and a room into a thickness
range. Seven lights carry typical figures from manufacturers' listings
(LED tea light ~4 lm, plug-in nightlight ~10 lm, puck light ~45 lm, LED
strip in a light box, LED bulb ~800 lm, light pad and window ~5,000 lux),
all editable. From brightness and distance it estimates the light on the
back of the picture (inverse square for small lights; for a light box,
half the strip's light over the picture's area), runs it through the same
absorption model as the preview, and picks:

- the **thinnest** areas: 0.8 mm unless the highlights would land far from
  a comfortable brightness for the room (dark ~120, dim ~400, bright ~900
  cd/m²), then whichever of 0.6–1.2 mm comes closest;
- the **thickest**: shadows about 1/15th of the highlights, as seen through
  the room light reflected off the front, never below the point where the
  eye loses them in black, capped at 4 mm.

Calibrated so a light pad in a dim room gives the well-tried 0.8–3.2 mm.
It says when a light is too faint, too strong, or the room too bright,
adds placement tips (bright spots from a small light too close), and
"Use these thicknesses" also sets the preview's backlight to match.
`light.test.mjs` checks the calibration, the inverse square, that more
light never thins the shadows, and the warnings.

## Frames, a showcase, and a lantern

"Frame it, light it" makes printable extras sized from the picture's own
settings, shown in the 3D preview beside it (in walnut, black, white, oak,
sage or gold) and downloaded as their own STLs, in their print orientation,
needing no supports (`frames.js`, `accessories.js`, listed in `extras.js`):

- **Gallery frame** (flat): the picture, and the light behind it, slide
  down into grooves on the left, right and bottom; a lid presses on top
  and closes it. Nothing flexes or snaps, so nothing wears out, and the
  picture changes in seconds. The border is the same width on every side,
  measured from the photo's edge, whatever the picture and board sizes —
  Slim, Gallery (+6 mm) or Wide (+14 mm) — and the window has a 45° bevel
  like a cut mat (or a square edge). The light is either a 156 × 120 mm
  USB-C backlight board (Bambu Lab's CMYK board and the boards that copy
  its size), held 6–30 mm behind the picture so its LEDs blend, or your own
  LED strip or puck in a 15–60 mm hollow, with a slide-in back cover.
- **Showcase frame** (flat): the gallery frame with 1–6 more slots behind
  the light, so a year of pictures lives in the frame — lift the lid and
  swap the one on show with the seasons.
- **Lantern** (flat pictures): four pictures round a light, standing in the
  slots of four corner posts on a grooved base, with a ring on top. The
  base has an opening for a cable or a tea light's switch. The other sides
  can be more photos or patterns (below).
- **Desk stand** (flat): a slotted foot the picture stands in.
- **Tea-light base** (lamp) and **nightlight stand** (curved shade).

One **fit** setting — snug, standard, loose — sets every clearance, so a
printer that runs tight or loose is fixed in one place; the lid is the
quick test piece.

### How they print

The frames are swept cross-sections, like everything else here: a U (left,
bottom, right) whose section can sit at a different offset on the sides
than on the bottom (`axisSweep`), plus a front lip across the top. They
print face down, which decides the shape as much as looks do: going up the
print, the inside edge may step outward freely but inward by no more than
2.5 mm before it needs a 45° slope. So the LED board, wider than the
picture, sits in a wider hollow and its slot is only a millimetre deep;
anything behind it steps back in on a slope. The top behind the front lip
is open, and the lid's fins fill it between the slots — printed standing
up, so there is no bridge anywhere. `frames.test.mjs` walks every
cross-section and fails on any unsupported step, and checks that every
part is closed, sits on the plate, and fits what goes in it.

## Patterns and words

- **Patterns** (`decor.js`) are pictures drawn rather than photographed, for
  the other sides of a lantern, a showcase's spare slots, or a pane of their
  own: starry night, moonlit pines, snowfall, vines and blossoms, waves,
  falling leaves, hearts, an art deco sunburst, honeycomb, a soft glow and a
  bordered card for words. Every shape is bold enough to survive becoming
  plastic, they are seeded so the same choice is always the same picture,
  and they are redrawn whenever the picture changes shape, so they are
  never stretched.
- **Words** go on top of any picture — a first line and a smaller second
  line, glowing or dark letters, top, middle or bottom, with an optional
  soft band behind them — in seven open-licence fonts bundled in `fonts/`
  (Cormorant Garamond, Playfair Display, Great Vibes, Dancing Script,
  Cinzel, Josefin Sans, Montserrat, at bold weights; see `fonts/OFL.txt`).
  They are drawn in millimetres onto the picture before it becomes
  thickness, so they glow like the rest of it, and they mirror with the
  picture when it is mirrored to be read from the smooth side.

## Making sure it prints

- The printer picker holds published build volumes (Bambu Lab P2S, X1 /
  P1 / A1, A1 mini; Prusa MK4S, CORE One, MINI+; Creality K1 / Ender-3 V3;
  a generic 300 mm). The fit check allows the footprint to be turned a
  quarter on the plate and checks an 8 mm brim separately. The choice is
  the only thing the page remembers (`localStorage`).
- The panel shows finished size, photo area, PLA weight (volume × 1.24
  g/cm³) and STL size before you export. Very large models automatically
  coarsen their sample spacing to stay under 1.2 M vertices.
- The print guide covers slicer settings, which side faces out, light
  safety (LEDs only) and tips for choosing a photo.

## Share before you print

The camera button saves the lit preview as a PNG, for whoever the
lithophane is for.

## Privacy

Photos are decoded in browser memory and never sent anywhere — the page has
no endpoint to send them to. JPG, PNG, WebP and pasted images work
directly; iPhone HEIC is decoded locally by a vendored heic2any, loaded only
when needed. Images are normalised to at most 2200 px on the long side.
"Save project" downloads a JSON file holding the photo and every setting;
projects from before Auto-enhance and Detail existed open exactly as they
were saved.

## Files

- `index.html`, `styles.css` — the interface.
- `app.js` — editor state, photo import, presets, printers, projects,
  export, the guide.
- `image-processing.js` — crop placement, tone, levels, detail, bounds,
  printer fit, sampling limits. No DOM.
- `mesh.js` — the geometry and the STL writer. No DOM; runs in a page, a
  worker or Node.
- `preview.js` — the Three.js orbit preview, lit and material modes, with
  a 2D fallback when WebGL is missing.
- `export-worker.js` — builds the STL off the main thread.
- `light.js` — the light calculator.
- `accessories.js`, `frames.js`, `extras.js` — the stands, bases, frames
  and lantern, and the list the picker shows.
- `decor.js` — patterns and words.
- `fonts/` — seven OFL fonts (Latin subsets) and their licence.
- `vendor/` — Three.js r170 and heic2any, with their MIT licences.
- `tests/` — the checks below.

## Checks

```sh
npm run check:luma     # from the repo root: geometry, image maths, the worker
```

`mesh.test.mjs` proves every shape is a closed solid — every edge shared
by exactly two faces in opposite directions, positive volume, the expected
Euler characteristic (2 for a panel, 0 for a lamp, which is a ring) — and
checks dimensions, radii, orientation (white thin, black thick, upright,
unmirrored from outside), the border rail, and that the grid estimator
agrees with the mesh. `image-processing.test.mjs` covers crop placement,
tone, levels, detail and printer fit.

`app-smoke.test.mjs` drives the real page in a simulated DOM — upload,
presets, crop, projects, flat/curved/test-strip exports — and needs two
development packages that the site itself never loads:

```sh
npm install --no-save linkedom@0.18.12 @napi-rs/canvas@0.1.100
node --test luma/tests/app-smoke.test.mjs
```

None of this replaces a real print. The backlit preview uses an
illustrative exponential attenuation curve; your filament and your light
decide the result, which is what the test strip is for.

Originally built as a portable offline edition for ERRERLabs; this copy is
the hosted one. Third-party notices are in `third-party-notices.txt`.
