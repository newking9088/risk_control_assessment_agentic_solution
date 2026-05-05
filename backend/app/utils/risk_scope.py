_EXTERNAL_KW = ("external", "first-party", "first party", "third-party", "third party")
_INSIDER_KW  = ("insider", "internal")


def classify_fraud_nature(l1: str, category: str, source: str) -> str:
    """Classify a taxonomy risk as 'external', 'insider', or 'unknown'.

    Checks l1 then category for keywords; falls back to source field ('EXT'/'INT').
    """
    for text in (l1 or "", category or ""):
        if not text:
            continue
        t = text.lower()
        if any(kw in t for kw in _EXTERNAL_KW):
            return "external"
        if any(kw in t for kw in _INSIDER_KW):
            return "insider"
    s = (source or "").strip().upper()
    if s == "EXT":
        return "external"
    if s == "INT":
        return "insider"
    return "unknown"


def risk_matches_scope(risk: dict, taxonomy_scope: str | None) -> bool:
    """Return True if a taxonomy risk should be included for the given assessment scope.

    Unknown risks pass through all scopes so data is never silently dropped.
    """
    if not taxonomy_scope or taxonomy_scope == "both":
        return True
    nature = classify_fraud_nature(
        risk.get("l1", "") or "",
        risk.get("category", "") or "",
        risk.get("source", "") or "",
    )
    if taxonomy_scope == "external":
        return nature in ("external", "unknown")
    if taxonomy_scope == "internal":
        return nature in ("insider", "unknown")
    return True
