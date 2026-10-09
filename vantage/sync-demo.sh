#!/usr/bin/env bash
# sync-demo.sh — rebuild Vantage's demo story and copy it into this room.
#
#   vantage/sync-demo.sh                 # CI-sized synthetic footage (fast)
#   vantage/sync-demo.sh --full          # full-quality footage (a few minutes)
#   vantage/sync-demo.sh --dry-run       # build it, show what would change, touch nothing
#
# It needs a checkout of the engine (github.com/kmay89/timelapse_drone) with
# uv, Python 3.11+ and ffmpeg. By default it looks for one next to this repo
# (../timelapse_drone); set VANTAGE_ENGINE to point somewhere else.
#
# What it does, in order:
#   1. copies the engine's demo project into a scratch folder (never the
#      footage, the cache or the masters: those are rebuilt), and sets its
#      output.base_url to https://kmay89.com/vantage/demo/ so the share card
#      the demo carries points at an absolute address;
#   2. runs `vantage demo` against that copy, with the output in the same
#      scratch folder, so nothing in the engine checkout changes;
#   3. mirrors the built site into vantage/demo/ (rsync --delete, and only
#      ever into that one folder), then refreshes vantage/stills/ from the
#      first and last overview stills and, when the build made one under
#      12 MB, vantage/film/ from the 16:9 film and its poster.
#
# vantage/demo/ is a generated build: never edit it by hand, rerun this.
set -euo pipefail

ROOM="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ABOUT="$(dirname "$ROOM")"
ENGINE="${VANTAGE_ENGINE:-$(dirname "$ABOUT")/timelapse_drone}"
BASE_URL="https://kmay89.com/vantage/demo/"
SLUG="demo-lakeside"
FILM_MAX_BYTES=$((12 * 1024 * 1024))

FAST="--fast"; DRY=0
for arg in "$@"; do
  case "$arg" in
    --full) FAST="" ;;
    --dry-run) DRY=1 ;;
    -h|--help) sed -n '2,25p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $arg (try --help)" >&2; exit 2 ;;
  esac
done

say() { printf '  %s\n' "$*"; }
die() { printf '  ✗ %s\n' "$*" >&2; exit 1; }

# ---- guard rails: the only folders this script writes into ----
[ "$(basename "$ROOM")" = "vantage" ] || die "this script must live in the vantage/ room (found $ROOM)"
[ -f "$ABOUT/index.html" ] || die "$ABOUT doesn't look like the desk (no index.html)"
[ -f "$ENGINE/pyproject.toml" ] && [ -d "$ENGINE/projects/$SLUG" ] \
  || die "no engine at $ENGINE — clone github.com/kmay89/timelapse_drone there or set VANTAGE_ENGINE"
command -v uv >/dev/null || die "uv is not installed (https://docs.astral.sh/uv/)"

WORK="$(mktemp -d "${TMPDIR:-/tmp}/vantage-sync.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

# ---- 1. a scratch copy of the demo project, with the hosted address set ----
SRC="$ENGINE/projects/$SLUG"
PROJ="$WORK/projects/$SLUG"
mkdir -p "$PROJ"
for item in "$SRC"/* "$SRC"/.[!.]*; do
  [ -e "$item" ] || continue
  case "$(basename "$item")" in footage|work|masters) continue ;; esac
  cp -R "$item" "$PROJ/"
done
if grep -q '^output:' "$PROJ/project.yaml"; then
  awk -v url="$BASE_URL" '
    /^output:/ { print; print "  base_url: " url; skip = 1; next }
    skip && /^  base_url:/ { next }
    /^[^ #]/ { skip = 0 }
    { print }' "$PROJ/project.yaml" > "$PROJ/project.yaml.new"
  mv "$PROJ/project.yaml.new" "$PROJ/project.yaml"
else
  printf '\noutput:\n  base_url: %s\n' "$BASE_URL" >> "$PROJ/project.yaml"
fi
say "building the demo from $ENGINE (${FAST:-full quality}) with base_url $BASE_URL"

# ---- 2. build it, entirely inside the scratch folder ----
( cd "$ENGINE" && uv run vantage --projects-dir "$WORK/projects" --dist-dir "$WORK/dist" demo $FAST )
SITE="$WORK/dist/$SLUG/site"
[ -f "$SITE/index.html" ] && [ -f "$SITE/sw.js" ] || die "the build finished without a site at $SITE"

# ---- 3. into the room ----
DEST="$ROOM/demo"
case "$DEST" in */vantage/demo) ;; *) die "refusing to sync into $DEST" ;; esac
if [ "$DRY" = 1 ]; then
  say "dry run — what would change in vantage/demo/:"
  if command -v rsync >/dev/null; then rsync -a --delete --itemize-changes --dry-run "$SITE/" "$DEST/" | sed 's/^/    /'
  else diff -rq "$SITE" "$DEST" | sed 's/^/    /' || true; fi
  exit 0
fi
mkdir -p "$DEST"
if command -v rsync >/dev/null; then
  rsync -a --delete "$SITE/" "$DEST/"
else
  rm -rf "$DEST" && cp -R "$SITE" "$DEST"
fi
say "✓ vantage/demo/ ← $(find "$DEST" -type f | wc -l | tr -d ' ') files, $(du -sh "$DEST" | cut -f1)"

# the two stills the front door's curtain uses: the first flight and the last
STILLS=$(ls "$SITE"/assets/img/overview/*-960.jpg 2>/dev/null | sort || true)
if [ -n "$STILLS" ]; then
  mkdir -p "$ROOM/stills"
  cp "$(printf '%s\n' "$STILLS" | head -n 1)" "$ROOM/stills/before.jpg"
  cp "$(printf '%s\n' "$STILLS" | tail -n 1)" "$ROOM/stills/after.jpg"
  say "✓ vantage/stills/ ← $(basename "$(printf '%s\n' "$STILLS" | head -n 1)") and $(basename "$(printf '%s\n' "$STILLS" | tail -n 1)")"
else
  say "! no overview/*-960.jpg in this build — vantage/stills/ left as it was"
fi

# the film, if the build made one small enough to keep in a repo
FILM="$WORK/dist/$SLUG/film/$SLUG-16x9.mp4"
if [ -f "$FILM" ]; then
  BYTES=$(wc -c < "$FILM" | tr -d ' ')
  if [ "$BYTES" -le "$FILM_MAX_BYTES" ]; then
    mkdir -p "$ROOM/film"
    cp "$FILM" "$ROOM/film/"
    [ -f "${FILM%.mp4}.jpg" ] && cp "${FILM%.mp4}.jpg" "$ROOM/film/"
    say "✓ vantage/film/ ← $(basename "$FILM") ($((BYTES / 1024)) KB) — the front door's film block is"
    say "  commented out in vantage/index.html; uncomment it to show the film"
  else
    say "! the film is $((BYTES / 1048576)) MB, over the 12 MB a repo should carry — skipped"
  fi
fi

say "done. The demo's sw.js names its own cache after the build, so returning visitors get the new one."
