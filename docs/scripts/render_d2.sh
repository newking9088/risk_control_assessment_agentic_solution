#!/usr/bin/env bash
# render_d2.sh — render all D2 source files to SVG and PNG
#
# Usage:
#   bash docs/scripts/render_d2.sh           # render to SVG + PNG
#   bash docs/scripts/render_d2.sh --svg     # SVG only
#
# Prerequisites:
#   d2 CLI — https://d2lang.com/tour/install
#     Windows:  winget install terrastruct.d2
#     macOS:    brew install d2
#     Linux:    curl -fsSL https://d2lang.com/install.sh | sh
#
# Output:
#   docs/diagrams/svg/*.svg   — for web / GitHub preview
#   docs/diagrams/png/*.png   — for PDF pipeline (pandoc + xelatex)

set -euo pipefail

DIAGRAMS_DIR="docs/diagrams"
SVG_DIR="${DIAGRAMS_DIR}/svg"
PNG_DIR="${DIAGRAMS_DIR}/png"
SVG_ONLY="${1:-}"

if ! command -v d2 &>/dev/null; then
  echo "ERROR: d2 not found."
  echo "  Windows: winget install terrastruct.d2"
  echo "  macOS:   brew install d2"
  echo "  Linux:   curl -fsSL https://d2lang.com/install.sh | sh"
  exit 1
fi

mkdir -p "$SVG_DIR"
[[ "$SVG_ONLY" != "--svg" ]] && mkdir -p "$PNG_DIR"

D2_FILES=("${DIAGRAMS_DIR}"/*.d2)
if [[ ! -e "${D2_FILES[0]}" ]]; then
  echo "No .d2 files found in ${DIAGRAMS_DIR}/"
  exit 0
fi

RENDERED=0
for d2_file in "${DIAGRAMS_DIR}"/*.d2; do
  base=$(basename "$d2_file" .d2)
  svg_out="${SVG_DIR}/${base}.svg"
  png_out="${PNG_DIR}/${base}.png"

  echo "  [SVG] $base"
  d2 --theme=0 --layout=elk --pad=25 "$d2_file" "$svg_out"

  if [[ "$SVG_ONLY" != "--svg" ]]; then
    echo "  [PNG] $base"
    # scale=2 → retina-quality for PDF; elk handles dense graphs without overlap
    d2 --theme=0 --layout=elk --pad=25 --scale=2 "$d2_file" "$png_out"
  fi

  RENDERED=$((RENDERED + 1))
done

echo ""
echo "Done — rendered ${RENDERED} diagrams"
echo "  SVG → ${SVG_DIR}/"
[[ "$SVG_ONLY" != "--svg" ]] && echo "  PNG → ${PNG_DIR}/"
