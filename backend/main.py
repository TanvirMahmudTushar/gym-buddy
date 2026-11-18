import logging
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.database import create_db_and_tables
from app.routers import members
from app.services.member_service import InvalidExpiryError, MemberNotFoundError

logger = logging.getLogger("gym_buddy")

# Docs live under /api because vercel.json only sends /api/* to the backend.
app = FastAPI(
    title="Gym Buddy API",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
    redoc_url=None,
)

app.include_router(members.router)

# Run at import (not in a lifespan hook) so it also works on Vercel's serverless functions.
create_db_and_tables()


# The service layer raises these; they become the same 404 / 422 responses the routes used to send.
@app.exception_handler(MemberNotFoundError)
async def member_not_found(request: Request, exc: MemberNotFoundError) -> JSONResponse:
    return JSONResponse(status_code=404, content={"detail": "Member not found"})


@app.exception_handler(InvalidExpiryError)
async def invalid_expiry(request: Request, exc: InvalidExpiryError) -> JSONResponse:
    return JSONResponse(status_code=422, content={"detail": str(exc)})


# Log the real error, but never send stack traces or database details to the client (NFR-07).
@app.exception_handler(Exception)
async def unhandled_error(request: Request, exc: Exception) -> JSONResponse:
    logger.error("Unhandled error on %s %s", request.method, request.url.path, exc_info=exc)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend" / "dist"

# dist/ only exists after `npm run build`; in dev the Vite server serves the UI.
if FRONTEND_DIR.is_dir():
    app.frontend("/", directory=FRONTEND_DIR)
