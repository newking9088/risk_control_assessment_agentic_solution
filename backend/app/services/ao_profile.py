"""
Phase 2a – Operational Profile Extraction.

Extracts a 10-field structured profile from the AU document text.
For large documents (> LARGE_DOC_THRESHOLD chars) uses a windowed
fact-extraction pass before final profile synthesis.
"""

import logging

from app.llm_client import respond_json

logger = logging.getLogger(__name__)

LARGE_DOC_THRESHOLD  = 8_000   # chars
FACT_WINDOW_SIZE     = 3_000
FACT_WINDOW_OVERLAP  = 500

_PROFILE_KEYS = [
    "operations_performed",
    "operations_not_performed",
    "systems",
    "channels",
    "employee_capabilities",
    "populations_served",
    "products_handled",
    "data_types_processed",
    "third_party_involvement",
    "regulatory_environment",
]

_PROFILE_SYSTEM = """\
You are an expert fraud-risk analyst. Given an Assessment Unit (AU) description, extract a \
structured operational profile.
Return STRICT JSON with exactly these keys — each value is a list of short phrases (≤ 13 words):
{
  "operations_performed":      [],
  "operations_not_performed":  [],
  "systems":                   [],
  "channels":                  [],
  "employee_capabilities":     [],
  "populations_served":        [],
  "products_handled":          [],
  "data_types_processed":      [],
  "third_party_involvement":   [],
  "regulatory_environment":    []
}
Rules:
- Extract only facts explicitly stated or clearly implied.
- "operations_not_performed" must cite explicit negations or out-of-scope statements.
- Return empty lists for fields not mentioned in the source.
- Each phrase must be ≤ 13 words.\
"""

_FACT_SYSTEM = """\
You are a fact-extraction agent. Extract facts about an Assessment Unit from the passage below.
Return STRICT JSON with these 10 keys (each a list of short phrases ≤ 13 words):
operations_performed, operations_not_performed, systems, channels, employee_capabilities,
populations_served, products_handled, data_types_processed, third_party_involvement,
regulatory_environment.
Only include facts EXPLICITLY stated in this passage.\
"""


def extract_ao_profile(text: str) -> dict:
    """Return the 10-field operational profile dict."""
    if len(text) > LARGE_DOC_THRESHOLD:
        text = _windowed_condense(text)

    result = respond_json(system=_PROFILE_SYSTEM, user_content=text)
    return _normalise(result)


# ── helpers ──────────────────────────────────────────────────────────────────

def _windowed_condense(text: str) -> str:
    """Split into windows, extract facts from each, return merged fact sheet."""
    windows = _make_windows(text)
    merged: dict[str, list[str]] = {k: [] for k in _PROFILE_KEYS}

    for window in windows:
        facts = respond_json(system=_FACT_SYSTEM, user_content=window)
        if isinstance(facts, dict):
            for key in _PROFILE_KEYS:
                vals = facts.get(key, [])
                if isinstance(vals, list):
                    merged[key].extend(str(v) for v in vals)

    # Deduplicate preserving order
    for key in _PROFILE_KEYS:
        seen: set[str] = set()
        unique: list[str] = []
        for v in merged[key]:
            norm = v.strip().lower()
            if norm not in seen:
                seen.add(norm)
                unique.append(v.strip())
        merged[key] = unique

    return _format_facts(merged)


def _make_windows(text: str) -> list[str]:
    windows: list[str] = []
    start = 0
    while start < len(text):
        end = min(start + FACT_WINDOW_SIZE, len(text))
        windows.append(text[start:end])
        if end == len(text):
            break
        start += FACT_WINDOW_SIZE - FACT_WINDOW_OVERLAP
    return windows


def _format_facts(facts: dict[str, list[str]]) -> str:
    lines: list[str] = []
    for key in _PROFILE_KEYS:
        vals = facts.get(key, [])
        if vals:
            lines.append(f"{key.upper().replace('_', ' ')}:")
            for v in vals:
                lines.append(f"  - {v}")
    return "\n".join(lines)


def _normalise(raw: object) -> dict:
    base = {k: [] for k in _PROFILE_KEYS}
    if not isinstance(raw, dict):
        return base
    for key in _PROFILE_KEYS:
        val = raw.get(key, [])
        if isinstance(val, list):
            base[key] = [str(v) for v in val]
    return base
