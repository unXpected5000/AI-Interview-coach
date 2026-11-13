"""Small, dependency-free text similarity for the constrained API runtime.

This is lexical similarity, not a language model embedding. It deliberately avoids
loading PyTorch/SentenceTransformers into the 512 MB Render free instance, where
the first evaluated answer could otherwise exhaust memory and terminate the API.
"""

from __future__ import annotations

import math
import re
from collections import Counter


def embed_texts(texts: list[str]) -> list[Counter[str]]:
    """Return normalized token and adjacent-token vectors for small text inputs."""
    vectors: list[Counter[str]] = []
    for text in texts:
        tokens = re.findall(r"[a-z0-9+#.-]+", str(text).lower())
        features = Counter(tokens)
        features.update(f"{left} {right}" for left, right in zip(tokens, tokens[1:]))
        norm = math.sqrt(sum(value * value for value in features.values()))
        vectors.append(Counter({key: value / norm for key, value in features.items()}) if norm else Counter())
    return vectors


def cosine_similarity_score(reference_text: str, candidate_text: str) -> float:
    """Return bounded lexical cosine similarity without loading a model/runtime."""
    if not reference_text.strip() or not candidate_text.strip():
        return 0.0
    reference, candidate = embed_texts([reference_text, candidate_text])
    similarity = sum(value * candidate.get(token, 0.0) for token, value in reference.items())
    return max(0.0, min(1.0, similarity))
