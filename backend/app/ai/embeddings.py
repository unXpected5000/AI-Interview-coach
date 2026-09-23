from functools import lru_cache

import numpy as np
from sentence_transformers import SentenceTransformer

from app.core.config import settings


@lru_cache
def get_embedding_model() -> SentenceTransformer:
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

