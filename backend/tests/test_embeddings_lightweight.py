from app.ai.embeddings import cosine_similarity_score, embed_texts


def test_text_similarity_does_not_require_model_runtime() -> None:
    vectors = embed_texts(["FastAPI routes", "FastAPI routes"])
    assert len(vectors) == 2
    assert cosine_similarity_score("FastAPI routes", "FastAPI routes") == 1.0


def test_text_similarity_is_bounded_and_handles_empty_input() -> None:
    score = cosine_similarity_score("database connection pool", "database index")
    assert 0 <= score <= 1
    assert cosine_similarity_score("", "answer") == 0.0
