from __future__ import annotations

from functools import lru_cache
from typing import TYPE_CHECKING

import numpy as np

from app.core.config import settings

if TYPE_CHECKING:
    from sentence_transformers import SentenceTransformer


@lru_cache
def get_embedding_model() -> SentenceTransformer:
    # Keep API startup and non-scoring routes independent of Torch's native DLLs.
    from sentence_transformers import SentenceTransformer

    return SentenceTransformer(settings.sentence_transformers_model)


def embed_texts(texts: list[str]) -> np.ndarray:
    model = get_embedding_model()
    return np.asarray(model.encode(texts, normalize_embeddings=True))


def cosine_similarity_score(reference_text: str, candidate_text: str) -> float:
    if not reference_text.strip() or not candidate_text.strip():
        return 0.0

    vectors = embed_texts([reference_text, candidate_text])
    similarity = float(np.dot(vectors[0], vectors[1]))
    return max(0.0, min(1.0, similarity))

