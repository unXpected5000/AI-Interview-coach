from app.ai.llm_client import LLMClient
from app.core.config import settings


def test_gemini_request_uses_api_key_header_not_url_query(monkeypatch) -> None:
    captured = {}

    class MockResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {"candidates": [{"content": {"parts": [{"text": "{\"ok\":true}"}]}}]}

    class MockAsyncClient:
        def __init__(self, timeout):
            captured["timeout"] = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, traceback):
            return False

        async def post(self, url, *, headers, json):
            captured.update({"url": url, "headers": headers, "json": json})
            return MockResponse()

    monkeypatch.setattr(settings, "gemini_api_key", "test-only-key")
    monkeypatch.setattr(settings, "gemini_model", "gemini-3.1-flash-lite")
    monkeypatch.setattr("app.ai.llm_client.httpx.AsyncClient", MockAsyncClient)

    request = LLMClient()._generate_gemini("test prompt")
    try:
        request.send(None)
    except StopIteration as completed:
        result = completed.value
    else:
        raise AssertionError("Mock Gemini request unexpectedly yielded pending I/O")

    assert result == '{"ok":true}'
    assert captured["url"] == (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        "gemini-3.1-flash-lite:generateContent"
    )
    assert "?key=" not in captured["url"]
    assert captured["headers"] == {"x-goog-api-key": "test-only-key"}
    assert captured["json"]["contents"][0]["parts"][0]["text"] == "test prompt"
