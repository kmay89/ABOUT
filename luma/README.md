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
