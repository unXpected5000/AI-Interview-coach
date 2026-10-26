from starlette.middleware.cors import CORSMiddleware
from starlette.responses import Response

from app.core.config import Settings


def _run_preflight(origin: str, allowed_origins: list[str]) -> list[dict]:
    messages = []

    async def app(scope, receive, send):
        await Response("ok")(scope, receive, send)

    middleware = CORSMiddleware(
        app,
        allow_origins=allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    scope = {
        "type": "http",
        "asgi": {"version": "3.0", "spec_version": "2.3"},
        "http_version": "1.1",
        "method": "OPTIONS",
        "scheme": "http",
        "path": "/api/auth/register",
        "raw_path": b"/api/auth/register",
        "query_string": b"",
        "headers": [
            (b"origin", origin.encode()),
            (b"access-control-request-method", b"POST"),
            (b"access-control-request-headers", b"content-type"),
        ],
        "server": ("localhost", 8000),
        "client": ("127.0.0.1", 50000),
    }

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message):
        messages.append(message)

    request = middleware(scope, receive, send)
    try:
        request.send(None)
    except StopIteration:
        pass
    else:
        raise AssertionError("CORS preflight unexpectedly performed asynchronous I/O")
    return messages


def test_local_default_allows_both_localhost_and_loopback_origins() -> None:
    allowed_origins = Settings(_env_file=None).cors_origins

    for origin in ("http://localhost:5173", "http://127.0.0.1:5173"):
        messages = _run_preflight(origin, allowed_origins)
        response_start = next(message for message in messages if message["type"] == "http.response.start")
        headers = dict(response_start["headers"])

        assert response_start["status"] == 200
        assert headers[b"access-control-allow-origin"].decode() == origin


def test_local_cors_default_does_not_allow_unlisted_origins() -> None:
    allowed_origins = Settings(_env_file=None).cors_origins
    messages = _run_preflight("https://untrusted.example", allowed_origins)
    response_start = next(message for message in messages if message["type"] == "http.response.start")

    assert response_start["status"] == 400
