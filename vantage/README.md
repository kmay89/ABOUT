# Vantage — a year over one site, in one scroll

The room for [Vantage](https://github.com/kmay89/timelapse_drone), an
engine I built for people who watch one piece of ground change for a year.
Fly the same route over a site every few weeks; Vantage finds the same view
in every flight, locks them all to one camera, and builds a page you scroll
on a phone — the months going by under your thumb, a curtain to drag
between before and after, notes pinned to the ground, the real dates down
the side. The same command cuts the time-lapse films (16:9 and 9:16) and
makes a single-file copy and an offline zip.

Live at [kmay89.com/vantage](https://kmay89.com/vantage/). On the desk it's
the little drone parked on the shelf beside the tapes, with its controller
propped against the wall; flip the desk to 1999 and the same spot holds an
envelope from the photo lab, a fan of aerial prints with the date burned
into the corner, and a loupe — which is how you watched a site from the air
then.

## What's in here

| path | what it is | who writes it |
| --- | --- | --- |
| `index.html` | the front door: what Vantage is, the curtain, how it works, how to get it | by hand |
| `stills/before.jpg`, `stills/after.jpg` | the first and last flight the curtain compares | `sync-demo.sh` |
| `demo/` | the demo story, exactly as the engine built it | `sync-demo.sh` — **never edit** |
| `film/` | the 16:9 film and its poster, once a build makes one under 12 MB | `sync-demo.sh` |
| `og.png` | the 1200 × 630 card a link to this page unfurls into | `node vantage/make-og.js` |
| `make-og.js` | draws `og.png` from nothing, the way `tools/make-game-icons.js` draws the game icons | by hand |
| `sync-demo.sh` | rebuilds the demo and copies it in | by hand |

There is no film in the room yet: the current build doesn't make one, so the
front door's film block is a comment in `index.html`, under the curtain,
ready to paste back in when `film/` has something in it.

## The demo is simulated

Everything in the demo story is made up — the town, the lake, the
organisations and the people quoted — and the drone is a couple of
thousand lines of Python pretending to be a camera. That's deliberate: it
means the demo can be rebuilt from nothing, by anybody, whenever the
engine changes, and it never shows a real client's site before they've
chosen to. The front door says so twice (the note under the button, and
*About the pictures*), the desk's dossier says so, and so does the demo
itself, on its title screen and in its credits.

## Refreshing the demo

`demo/` is the engine's own build output, copied in whole, so the only way
to change it is to build it again:

```
vantage/sync-demo.sh            # CI-sized footage, a minute or two
vantage/sync-demo.sh --full     # full-quality footage, a few minutes more
vantage/sync-demo.sh --dry-run  # build it, list what would change, touch nothing
```

It wants a checkout of the engine next to this repo (`../timelapse_drone`,
or set `VANTAGE_ENGINE`), plus uv, Python 3.11+ and ffmpeg. It copies the
engine's demo project into a scratch folder, sets its `output.base_url` to
`https://kmay89.com/vantage/demo/` so the demo's share card has an absolute
address, builds it there (nothing in the engine checkout changes), and then
mirrors the site into `demo/` with `rsync --delete` — into that one folder
and nowhere else. It refreshes `stills/` from the first and last overview
stills, and `film/` if the build made a film small enough to keep.

Unlike the other rooms, there is no `VERSION` to bump: the demo's `sw.js`
lists every file with a hash of its bytes, so after a new build a returning
visitor's worker fetches only the files that changed (and a copy someone
saved for offline keeps the rest). `netlify.toml` keeps that `sw.js` from
being cached, like every other room's.

## Why it's here and not only on GitHub

Because the demo is the argument. A README can say "scroll-scrubbed
time-lapse locked to one camera"; the link lets somebody feel it on the
phone in their hand, which is the only screen it was designed for.
