"""
Phase 1 – AI Overview Generation.

Sends document evidence to the LLM and returns a structured JSON summary
of what the Assessment Unit does.
"""

from app.llm_client import respond_json

_SYSTEM = """\
You are an audit-ready business analyst. Summarise ONLY what the Assessment Unit (AU) does \
from the provided AU materials. Use facts only; no invention. Return STRICT JSON.\
"""

_USER = """\
QUESTION:
What does this business unit do?

AU MATERIALS (single source of truth):
{evidence_text}

RESPONSE FORMAT (JSON object only; no extra fields):
{{
  "summary": "<2-4 sentence plain-language description>",
  "in_scope_activities":       ["<phrase>"],
  "out_of_scope_activities":   ["<phrase>"],
  "channels":                  ["<phrase>"],
  "systems_or_tools":          ["<phrase>"],
  "populations_served":        ["<phrase>"],
  "products_handled":          ["<phrase>"],
  "org_partners":              ["<phrase>"],
  "regulatory_environment":    ["<phrase>"]
}}\
"""


def generate_ao_overview(evidence_text: str) -> dict:
    """Return overview dict; fields default to [] / '' on LLM failure."""
    result = respond_json(
        system=_SYSTEM,
        user_content=_USER.format(evidence_text=evidence_text),
    )
    _defaults = {
        "summary": "",
        "in_scope_activities": [],
        "out_of_scope_activities": [],
        "channels": [],
        "systems_or_tools": [],
        "populations_served": [],
        "products_handled": [],
        "org_partners": [],
        "regulatory_environment": [],
    }
    if not isinstance(result, dict):
        return _defaults
    return {**_defaults, **result}
