# Section prompt 00 — Title page & Table of Contents
# Part 1 of 8 | Output file: docs/output/00_title_and_toc.md

> Apply all rules in `docs/prompts/GLOBAL_RULES.md` before writing a word.

## Context

You are generating **Part 0 of 8** of the RCA Architecture Document. This section is the cover page and auto-generated Table of Contents. It will be the first thing assembled into the final `RCA_Architecture_<YYYYMMDD>.md`.

## Repos to read

- `project_setup_prompt.md` — for version / authors context
- `docs/prompts/GLOBAL_RULES.md` — numbering scheme

## What to produce

### Title block

```
# AI-Driven Risk & Control Assessment — Technical Design and Architecture

| Field    | Value                                      |
|----------|--------------------------------------------|
| Version  | 1.0                                        |
| Date     | <today ISO date>                           |
| Authors  | [Solution Architect], [Technical Lead]     |
| Status   | Draft                                      |
| Repos    | risk_control_assessment_agentic_solution   |
|          | <iac-repo-name>                            |
```

### Document purpose (2–3 sentences)

State what this document is, who the audience is (risk-practice leadership, internal audit, compliance, engineering steering committee), and what decisions it supports.

### Table of Contents

Auto-generate a linked Table of Contents that matches the **exact** heading and numbering scheme from `GLOBAL_RULES.md` — down to H3. Use markdown anchor links.

Include a **Document revision history** table at the bottom of this section:

| Version | Date | Author | Change summary |
|---|---|---|---|
| 1.0 | <today> | | Initial draft |

## Output requirements

- Output file: `docs/output/00_title_and_toc.md`
- No H1 other than the document title
- ToC links must match headings exactly as they will appear in the assembled document
- End with a horizontal rule (`---`) so the assembler can splice sections cleanly
