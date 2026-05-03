# Risk & Control Assessment — User Guide

This application guides fraud risk and control assessment teams through a structured, AI-assisted workflow to evaluate business units for inherent risk, control effectiveness, and residual risk. The output is an executive-ready summary report that can be completed in a fraction of the time of a traditional manual assessment.

---

## Overview

The workflow has two phases:

1. **Step 0 — One-time setup**: Upload the shared controls library and risk taxonomy. Done once; applies to every assessment in your tenant.
2. **Steps 1–7 — Per-assessment wizard**: Create an assessment and work through 7 guided steps. The AI pre-populates answers, ratings, and mappings at every step; you review, override where needed, and move forward.

---

## Step 0 — One-Time Setup: Upload Reference Data

Before creating any assessment, upload the two reference datasets from the **dashboard**. Look for the **"Upload"** or **"Reference Data"** panel on the main dashboard page.

> Upload controls first, then taxonomy.

### 1. Upload Controls Library

Upload your controls file. This defines every control available for mapping — Control ID, Type, Name, Description, and whether it is a Key Control.

> **Default:** The app ships with the **NGC Fraud Risk Framework** controls (EFC / EDC / IFC series). If your organization has its own controls library — e.g., "XYZ Corp Controls" — upload that file instead and select it as your source when creating an assessment.

**Sample file for testing:** [`docs/ngc_controls.xlsx`](ngc_controls.xlsx)

### 2. Upload Risk Taxonomy

Upload your taxonomy file. This defines the L1 → L2 → L3 → L4 risk hierarchy used to identify and classify applicable risks.

> **Default:** The app uses the **NGC Fraud Risk Framework** taxonomy. Future versions will support organization-specific taxonomies selected per assessment.

**Sample file for testing:** [`docs/ngc_taxonomy.xlsx`](ngc_taxonomy.xlsx)

Once both files are uploaded they are available to every assessment in your tenant — you do not need to re-upload them for each new assessment.

---

## Creating an Assessment

From the main dashboard, click **"Create Assessment"**. Give the assessment a name and click **"Create"**. You will enter the 7-step wizard.

---

## Step 1 — Assessment Preparation

This is a single page. Fill in all sections, then click **"Next"** to proceed to Step 2.

### Basic Details (required)

| Field | Example |
|---|---|
| Assessment Unit Name | `Consumer Contact Center` |
| AU ID | `Consumer Contact Center #127` |
| Business Unit | `Retail` |
| Assessment Date | `2026-05-01` |
| Assessment Owner | `Jane Smith` |

---

### AU Business Details (mandatory document)

Upload a document describing the business unit in detail. This is the single most important input — the AI uses it across all 7 steps to identify risks, suggest questionnaire answers, and map controls.

A good business details document includes:
- **Business Process Overview** — what the unit does and who it serves
- **Individual process descriptions** — e.g., *Process #101: Customer Inquiry Handling*, *Process #102: Complaint Resolution*, *Process #103: Account Services & Transaction Support*
- **Systems used** — CRM, core banking, authentication platforms, etc.
- **Business Volume & Activity Metrics** — daily call volume, transaction counts, escalation rates, etc.
- **Assessment Unit Summary** — a brief narrative of the unit's risk environment

**Sample file for testing:** [`docs/business_process_details.docx`](business_process_details.docx) — a pre-filled example for the *Consumer Contact Center #127* assessment unit, ready to upload as-is.

The richer and more specific this document, the more accurate the AI's risk identification, questionnaire answers, and control mappings will be throughout the wizard.

---

### Additional Supporting Documents (optional)

Upload any supplementary materials that give the AI more context:

- Previous audit or risk assessment reports
- Process flow diagrams
- System architecture documents
- Compliance or regulatory correspondence

---

### Risk Assessment Focus

Choose the scope of the assessment:

| Option | Description |
|---|---|
| **External Fraud Assessment** | Threats originating outside the organization — identity theft, account takeover, synthetic identity, first-party fraud, etc. |
| **Insider Threat / Internal Fraud Assessment** | Threats from employees, contractors, or privileged insiders |
| **Both** | A comprehensive assessment covering all fraud vectors |

---

### Source Selection

If more than one controls library or taxonomy has been uploaded, select which sources to use for this assessment. For organizations using the NGC defaults this is pre-selected automatically.

---

Click **"Next"** to proceed to Step 2.

---

## Step 2 — Questionnaire (96 Questions)

The AI presents **96 questions** about the assessment unit. The answers determine which attack vector surfaces are plausible for this business process, which drives two things in Step 3:

1. Which risks are flagged as applicable
2. *Why* each risk is applicable — enabling SME-grade risk statement generation

**How it works:**
- The AI pre-suggests an answer (Yes / No / N/A) for every question, based on the AU Business Details and supporting documents uploaded in Step 1.
- Review each answer. If the AI's suggestion is incorrect, click the toggle to change it.
- All responses are **auto-saved** as you go — you can close the browser and return at any time without losing progress.

**AI Chat (available on every page)**

Click the **AI chat icon** in the bottom-right corner of the screen to open the chat panel. You can drag any question or AI-suggested answer into the chat to ask clarifying questions, for example:

> *"Why did you suggest Yes for this question given that interactions are outbound-only?"*
> *"What evidence in the AU details led you to this answer?"*
> *"What would change if I answered No here?"*

Once you have reviewed all questions, click **"Next"** to proceed to Step 3.

---

## Step 3 — Identify Relevant Risks

Based on the questionnaire responses and AU details, the AI evaluates every risk in the taxonomy and marks applicable ones, generating a written rationale for each.

**Assessment is done at the L3 risk level.** Each row in the table represents one L3 risk. The taxonomy also contains L4 detail (specific sub-scenarios and attack pattern descriptions), but L4 entries are not assessed individually — the AI uses them internally as extra context when deciding L3 applicability and writing risk statements. You will never need to review or act on L4 entries directly.

---

**The risk table shows:**

| Column | Description |
|---|---|
| L1 Risk | Top-level category (External Fraud / Internal Fraud) |
| L2 Risk | Sub-category (e.g., Account Takeover, Identity Fraud) |
| L3 Risk | Specific risk name — **the level at which applicability is decided** |
| Applicable | Toggle — AI pre-set; flip to override |
| Risk Statement | AI-generated SME-grade statement explaining *why* this risk applies to this business unit |

Use the **Search** box and **L1 / L2 filter dropdowns** at the top to focus on a subset of risks.

---

**Overriding the AI:**

- If the AI marked a risk **applicable** but you disagree → flip the toggle to **No**, then type your reasoning in the **rationale field** that appears below the row.
- If the AI marked a risk **not applicable** but you believe it is relevant → flip the toggle to **Yes** and enter your rationale.

Rationale is required for any override. It creates an auditable record of assessor judgement alongside the AI's original recommendation.

---

**Refining Risk Statements:**

If you are not satisfied with an AI-generated risk statement, click the **AI sparkle icon (✦)** that appears beneath the risk statement text. This opens the chat panel pre-loaded with that risk's context. Ask the AI to rewrite the statement, adjust the tone, add specific operational detail, or make it more concise.

All changes are **auto-saved**.

Once all risks have been reviewed, click **"Next"** to proceed to Step 4.

---

## Step 4 — Inherent Risk Rating

For every applicable risk from Step 3, the AI evaluates the likelihood of occurrence and scores **five dimensions of impact**:

1. Financial Impact
2. Reputational Impact
3. Regulatory / Compliance Impact
4. Operational Impact
5. Customer Impact

From these scores the AI derives an overall **Inherent Risk Rating** (Low / Medium / High / Very High) for each risk, along with a written rationale.

**All ratings and rationales are fully editable:**

- Change a rating using the dropdown → the rationale **automatically regenerates** to reflect the updated rating level.
- You can also edit the rationale text directly if you want further refinement.

Once you are satisfied with the ratings, click **"Next"** to proceed to Step 5.

---

## Step 5 — Evaluate Controls

For each applicable risk, the AI reviews the controls library and maps the controls most likely to mitigate that risk given the business unit's context.

**What you can do:**

| Action | When to use |
|---|---|
| **Review mapped controls** | Verify the AI's selections make sense for this business process |
| **Add a control manually** | The AI missed a relevant control — search the library and add it |
| **Remove a mapped control** | A control was mapped that does not apply to this business unit's context |

The strength and coverage of the mapped controls feeds directly into the **Controls Effectiveness Rating** shown in Step 6.

Once you have reviewed all control mappings, click **"Next"** to proceed to Step 6.

---

## Step 6 — Risk Ratings Summary

A consolidated view of every applicable risk showing three ratings side by side:

| Column | Description |
|---|---|
| Inherent Risk Rating | Pre-control risk level (from Step 4) |
| Controls Effectiveness Rating | Strength of the mapped controls (from Step 5) |
| Residual Risk Rating | Risk remaining after controls are applied |

Review the summary to confirm the overall risk posture is accurate. If any rating looks off, click the **back arrow** to return to Step 4 or Step 5 and make corrections.

When the summary looks correct, click **"Next"** to generate the executive report.

---

## Step 7 — Assessment Summary (Executive Report)

The final step produces a **downloadable, executive-ready summary** designed to be reviewed in 30 seconds.

**The report includes:**

- **Business Unit Risk Rating Summary** — overall inherent, controls effectiveness, and residual risk ratings at the assessment unit level
- **Risk Heatmap** — visual distribution of risks by severity
- **Observations** — key findings from the assessment; what the AI and assessor determined about the risk environment of this business unit
- **Recommendations** — prioritized action items for executives and risk owners to address identified control gaps and high-residual risks

Click **"Download Report"** to save the summary as a PDF or document. The report is suitable for executive briefings, audit committees, and regulatory submissions.

---

## Key Principles

**Override with rationale.**
Every AI override is logged alongside the AI's original recommendation. This creates a defensible, auditable record for regulators, internal audit, and future reassessments.

**Auto-save is always on.**
Every answer, toggle, rating edit, and rationale change is saved immediately. You can close the browser and return to any in-progress assessment at any time without losing work.

**Use the AI chat liberally.**
The AI has full context of the assessment unit, the taxonomy, and the questionnaire responses. It can explain its reasoning at any step, suggest alternatives, and help draft or refine any text in the wizard.

**AU Business Details quality drives everything.**
A generic one-paragraph description produces generic AI outputs. A detailed, process-level document produces highly specific risk statements, accurate applicability decisions, and well-targeted control mappings.
