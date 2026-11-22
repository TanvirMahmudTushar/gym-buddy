# CORS limited to the frontend's origin (NFR-15, TDD 11).
from starlette.datastructures import Headers
from starlette.middleware.cors import CORSMiddleware
from starlette.types import Receive, Scope, Send


class AllowlistCORSMiddleware(CORSMiddleware):
    """Starlette's CORS middleware, except that a request from an origin that is not on the list passes through
    untouched. Starlette would still add Access-Control-Allow-Credentials (and answer a preflight with its allowed
    methods); here such a request gets no CORS headers at all, so the browser refuses to let that site read the
    response. A request with no Origin header (same-origin GET, curl, the tests) is not a CORS request either way."""

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http":
            origin = Headers(scope=scope).get("origin")
            if origin is not None and not self.is_allowed_origin(origin=origin):
                await self.app(scope, receive, send)
                return
        await super().__call__(scope, receive, send)
