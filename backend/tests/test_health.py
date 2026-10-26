from app.api.routes.health import health_check
from app.main import app


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

