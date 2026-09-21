#!/usr/bin/env bash
#
# Regenerates docs/images/*.png from the demo harness.
#
#   ./tools/screenshots.sh
#
# The harness in tools/demo/ imports the real multi-button-card.js, so the
# images always show the current code rather than a copy of it. Run this
# whenever anything visible changes.
#
# The window sizes below are not arbitrary: each is the scene's measured body
# height at that width, so the image has the same 24px margin all round. If you
# add a button to a scene, re-measure and update the size here - a cropped
# screenshot is a wrong screenshot. To measure, open the scene at the target
# width and read:
#
#   Math.ceil(document.body.getBoundingClientRect().height)
#
# Requires: Google Chrome, python3.

set -euo pipefail

cd "$(dirname "$0")/.."

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PORT=8199
OUT=docs/images
SCALE=2   # retina-quality PNGs

[ -x "$CHROME" ] || { echo "Google Chrome not found at $CHROME" >&2; exit 1; }

mkdir -p "$OUT"

python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null || true' EXIT

# Wait for the server rather than sleeping a guessed amount.
for _ in $(seq 1 50); do
  curl -sf "http://127.0.0.1:$PORT/tools/demo/index.html" >/dev/null && break
  sleep 0.1
done

shoot() {
  local scene=$1 size=$2 name=$3 scale=${4:-$SCALE}
  "$CHROME" \
    --headless \
    --disable-gpu \
    --hide-scrollbars \
    --force-device-scale-factor=$scale \
    --window-size="$size" \
    --screenshot="$OUT/$name.png" \
    --virtual-time-budget=1500 \
    "http://127.0.0.1:$PORT/tools/demo/index.html?scene=$scene" >/dev/null 2>&1
  echo "  $OUT/$name.png  (${size}, scene=$scene)"
}

echo "Rendering screenshots:"
shoot overview  "528,350"   overview
# The counts strip is wide by nature, so it renders at scale 1.
shoot counts    "1840,612"  layout-counts 1
shoot portrait  "408,622"   portrait
shoot landscape "948,354"   landscape
# Documents that the card honours the height a sections grid cell gives it.
shoot constrained "1560,420" constrained

# Both layout modes side by side, with the measured widths printed.
shoot colspan "1200,640" layout-modes 1

# Visibility conditions reshaping the layout, with the measured result.
shoot visibility "1400,500" visibility 1

# No editor screenshot: tools/demo/ renders it against a stub, not against
# Home Assistant's real ha-form, so an image would show a form that does not
# exist anywhere. The scene stays for development (?scene=editor).
echo "Done."
