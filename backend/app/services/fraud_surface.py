"""
Phase 2b – Fraud Surface Extraction (runs in parallel with overview).

Identifies insider/internal exposure vectors, enablers, authorities,
and sensitive data assets from AU document text.
"""

from app.llm_client import respond_json

_FRAUD_SYSTEM = """\
You are a fraud-risk expert analysing an Assessment Unit for insider/internal fraud exposure.
Return STRICT JSON with exactly these keys — each value is a list of short descriptive phrases:
{
  "exposure_vectors": [],
  "enablers":         [],
  "authorities":      [],
  "data_assets":      []
}
Definitions:
- exposure_vectors : specific ways fraud could occur (e.g. "employee diverts inbound wire")
- enablers         : capabilities that make fraud possible (e.g. "unrestricted PII access")
- authorities      : permissions granted to staff (e.g. "initiate transfers without dual approval")
- data_assets      : sensitive data accessible (e.g. "customer SSNs and account balances")
Return empty lists for any dimension not supported by the text.\
"""

_DEFAULTS = {
    "exposure_vectors": [],
    "enablers": [],
    "authorities": [],
    "data_assets": [],
}


def extract_fraud_surface(text: str) -> dict:
    """Return fraud surface dict; empty lists on LLM failure."""
    result = respond_json(system=_FRAUD_SYSTEM, user_content=text)
    if not isinstance(result, dict):
        return dict(_DEFAULTS)
    return {**_DEFAULTS, **{k: (result.get(k) or []) for k in _DEFAULTS}}
