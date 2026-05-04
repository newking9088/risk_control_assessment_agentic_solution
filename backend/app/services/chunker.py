"""
Sliding-window text chunker.
"""

CHUNK_SIZE    = 1_500   # characters per chunk
CHUNK_OVERLAP = 200     # overlap between consecutive chunks


def chunk_text(
    text: str,
    chunk_size: int = CHUNK_SIZE,
    overlap: int = CHUNK_OVERLAP,
) -> list[str]:
    """Split *text* into overlapping windows. Returns [] for empty/whitespace input."""
    text = text.strip()
    if not text:
        return []

    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = min(start + chunk_size, len(text))
        chunks.append(text[start:end])
        if end == len(text):
            break
        start += chunk_size - overlap

    return chunks
