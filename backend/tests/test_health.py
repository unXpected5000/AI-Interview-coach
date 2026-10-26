from app.api.routes.health import health_check
from app.main import app, log_bad_request_route
from starlette.responses import Response


def test_health_route_is_mounted_and_returns_ok() -> None:
    route = next(
        route
        for included in app.routes
        if hasattr(included, "original_router")
        for route in included.original_router.routes
        if f"{included.include_context.prefix}{route.path}" == "/api/health"
    )
    assert "GET" in route.methods
    result = health_check()
    try:
        result.send(None)
    except StopIteration as completed:
        assert completed.value == {"status": "ok"}
    else:
        raise AssertionError("Health check unexpectedly performed asynchronous I/O")


def test_http_400_logging_identifies_route_without_logging_request_data(caplog) -> None:
    class RequestStub:
        method = "POST"
        scope = {"route": type("Route", (), {"path": "/api/resumes/upload"})()}

    async def call_next(_request):
        return Response(status_code=400)

    result = log_bad_request_route(RequestStub(), call_next)
    try:
        result.send(None)
    except StopIteration as completed:
        assert completed.value.status_code == 400
    else:
        raise AssertionError("Middleware unexpectedly performed asynchronous I/O")

    assert "API client error status=400 method=POST route=/api/resumes/upload" in caplog.text
    assert "Authorization" not in caplog.text

