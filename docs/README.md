# Architecture document — generation guide

This directory contains the prompts, scripts, and output folder for generating the enterprise Architecture Document for the AI-Driven Risk & Control Assessment (RCA) Platform.

---

## Directory structure

```
docs/
  prompts/
    GLOBAL_RULES.md              — Shared authoring rules (every section prompt references this)
    00_title_and_toc.md          — Section 0: Title page & Table of Contents
    01_executive_summary.md      — Section 1: Executive summary
    02_architecture_diagrams.md  — Section 2: Architecture diagrams (7 sub-diagrams)
    03_technical_specifications.md — Section 3: Technical specs (UI, backend, data, AI, RAG)
    04_nonfunctional_requirements.md — Section 4: NFRs (security, HITL, observability, scale, cost)
    05_implementation_approach.md — Section 5: Phased roadmap & CI/CD
    06_appendix_adrs.md          — Section 6: 10 ADRs + risk register + tech selection tables
    07_appendix_traceability.md  — Section 7: Requirements traceability + gap analysis + glossary
  scripts/
    assemble.sh                  — Concatenates all section outputs into final .md + optional PDF
  output/                        — AI-generated section files land here (git-ignored)
    00_title_and_toc.md
    01_executive_summary.md
    ...
    07_appendix_traceability.md
    RCA_Architecture_YYYYMMDD.md  ← final assembled document
    RCA_Architecture_YYYYMMDD.pdf ← final PDF (if pandoc available)
```

---

## How to generate the document

### Step 1 — Run each section prompt independently

Open an AI agent (Claude, Cursor, ChatGPT with code context, etc.) and for each section:

1. Load the repository into the agent's context
2. Paste the contents of `docs/prompts/GLOBAL_RULES.md` as a system/context message
3. Paste the contents of the section prompt (e.g., `docs/prompts/01_executive_summary.md`)
4. Save the agent's output to `docs/output/01_executive_summary.md`

**Recommended order** (each section is independent but references prior sections for cross-links):

| Order | Prompt file | Why first |
|---|---|---|
| 1 | `00_title_and_toc.md` | Anchor for heading links |
| 2 | `01_executive_summary.md` | Sets framing for all sections |
| 3 | `02_architecture_diagrams.md` | Diagrams referenced by §3 and §4 |
| 4 | `03_technical_specifications.md` | Detail behind diagrams |
| 5 | `04_nonfunctional_requirements.md` | Builds on §3 components |
| 6 | `05_implementation_approach.md` | References §3 routes and CI/CD |
| 7 | `06_appendix_adrs.md` | References all prior sections |
| 8 | `07_appendix_traceability.md` | Must run last — traces all REQs to sections 1–6 |

### Step 2 — Assemble into a single document

```bash
bash docs/scripts/assemble.sh
```

Output: `docs/output/RCA_Architecture_<YYYYMMDD>.md`

### Step 3 — Convert to PDF (optional)

Install prerequisites:
```bash
# macOS
brew install pandoc
npm install -g mermaid-filter

# Ubuntu / Debian
sudo apt-get install pandoc texlive-xetex
npm install -g mermaid-filter

# Windows (WSL or Git Bash)
choco install pandoc miktex
npm install -g mermaid-filter
```

Then:
```bash
bash docs/scripts/assemble.sh --pdf
```

Output: `docs/output/RCA_Architecture_<YYYYMMDD>.pdf`

---

## Two-pass quality pattern (recommended)

For each section, run two passes in the agent:

**Pass 1 — grounding only:**
> "Read the repository. List every file path, table name, service, and route you will cite in Section N. Do not write the section yet."

Review the list. Remove any fabricated paths. Approve the list.

**Pass 2 — authoring:**
> "Using only the files and tables approved above, write Section N exactly as specified in `docs/prompts/0N_*.md`."

This eliminates hallucinated file paths and keeps all citations to real code.

---

## Quality checklist before final assembly

- [ ] Every `inline code` reference is a real file/table/route in the repo
- [ ] Every diagram renders in a Mermaid preview (e.g., GitHub markdown, mermaid.live)
- [ ] All forward-looking KPIs marked `target`
- [ ] Every ADR has all 6 fields: Status, Context, Options, Decision, Rationale, Consequences
- [ ] Requirements traceability matrix covers all 26 REQ-IDs
- [ ] Glossary covers all abbreviations used in the document
- [ ] Section 6 "What this is not" list is present
- [ ] Sign-off block is present in Section 7

---

## Updating the document

The section prompts are designed to be re-run independently. When code changes:

1. Identify which section(s) are affected
2. Re-run only those section prompts
3. Replace the corresponding output file(s) in `docs/output/`
4. Re-run `assemble.sh` to regenerate the final document

No need to regenerate all 8 sections unless a global architectural change occurs.
