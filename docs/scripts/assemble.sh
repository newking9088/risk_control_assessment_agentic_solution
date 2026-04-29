#!/usr/bin/env bash
# assemble.sh — concatenate all section outputs into a single architecture.md
# and optionally convert to PDF via pandoc + xelatex.
#
# Usage:
#   bash docs/scripts/assemble.sh            # assemble markdown only
#   bash docs/scripts/assemble.sh --pdf      # assemble + render D2 + convert to PDF
#
# Prerequisites:
#   All section output files present in docs/output/
#   For --pdf:
#     d2 CLI   — https://d2lang.com/tour/install
#     pandoc   — https://pandoc.org/installing.html
#     xelatex  — TeX Live / MiKTeX
#     (D2 diagrams are pre-rendered to PNG; no mermaid-filter required)

set -euo pipefail

DATE=$(date +%Y%m%d)
OUTPUT_DIR="docs/output"
FINAL_MD="${OUTPUT_DIR}/RCA_Architecture_${DATE}.md"

SECTIONS=(
  "${OUTPUT_DIR}/00_title_and_toc.md"
  "${OUTPUT_DIR}/01_executive_summary.md"
  "${OUTPUT_DIR}/02_architecture_diagrams.md"
  "${OUTPUT_DIR}/03_technical_specifications.md"
  "${OUTPUT_DIR}/04_nonfunctional_requirements.md"
  "${OUTPUT_DIR}/05_implementation_approach.md"
  "${OUTPUT_DIR}/06_appendix_adrs.md"
  "${OUTPUT_DIR}/07_appendix_traceability.md"
)

echo "Assembling architecture document..."

MISSING=0
for f in "${SECTIONS[@]}"; do
  if [[ ! -f "$f" ]]; then
    echo "  MISSING: $f"
    MISSING=1
  fi
done

if [[ $MISSING -eq 1 ]]; then
  echo ""
  echo "ERROR: One or more section files are missing."
  exit 1
fi

> "$FINAL_MD"
for f in "${SECTIONS[@]}"; do
  echo "  Adding: $f"
  cat "$f" >> "$FINAL_MD"
  echo "" >> "$FINAL_MD"
done

echo ""
echo "Assembly complete: ${FINAL_MD}"
wc -l "$FINAL_MD" | awk '{print "  Lines: " $1}'
WC=$(wc -w < "$FINAL_MD")
PAGES=$(( WC / 300 ))
echo "  Words: ${WC} (~${PAGES} pages)"

if [[ "${1:-}" == "--pdf" ]]; then
  echo ""
  echo "Step 1 — Rendering D2 diagrams to PNG..."
  bash docs/scripts/render_d2.sh

  echo ""
  echo "Step 2 — Converting to PDF..."
  FINAL_PDF="${OUTPUT_DIR}/RCA_Architecture_${DATE}.pdf"

  if ! command -v pandoc &>/dev/null; then
    echo "ERROR: pandoc not found. Install: https://pandoc.org/installing.html"
    exit 1
  fi

  # Swap SVG → PNG and fix paths to be relative to project root (pandoc CWD)
  PDF_MD="${OUTPUT_DIR}/_pdf_tmp_${DATE}.md"
  sed 's|\.\./diagrams/svg/\([^)]*\)\.svg|docs/diagrams/png/\1.png|g' "$FINAL_MD" > "$PDF_MD"

  pandoc "$PDF_MD" \
    --from markdown+pipe_tables+fenced_code_blocks \
    --pdf-engine=xelatex \
    --resource-path=docs/output \
    --include-in-header=docs/scripts/pdf-header.tex \
    --toc \
    --toc-depth=3 \
    --number-sections \
    -V geometry:"landscape,a4paper,margin=1.5cm" \
    -V fontsize=11pt \
    -V mainfont="Segoe UI" \
    -V monofont="Consolas" \
    -V colorlinks=true \
    -V linkcolor=blue \
    --highlight-style=tango \
    -o "$FINAL_PDF"

  rm -f "$PDF_MD"
  echo "PDF complete: ${FINAL_PDF}"
  du -sh "$FINAL_PDF" | awk '{print "  Size: " $1}'
fi

echo ""
echo "Done."
