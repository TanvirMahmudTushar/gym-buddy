import logging
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.database import create_db_and_tables
from app.routers import admin, auth, members, users
from app.services.auth_service import EmailTakenError, InvalidCredentialsError
from app.services.member_service import InvalidExpiryError, MemberNotFoundError
from app.services.user_service import CannotChangeOwnRoleError, UserNotFoundError

logger = logging.getLogger("gym_buddy")

# Docs live under /api because vercel.json only sends /api/* to the backend.
app = FastAPI(
    title="Gym Buddy API",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
    redoc_url=None,
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(admin.router)
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


@app.exception_handler(EmailTakenError)
async def email_taken(request: Request, exc: EmailTakenError) -> JSONResponse:
    return JSONResponse(status_code=409, content={"detail": "An account with this email already exists"})


@app.exception_handler(InvalidCredentialsError)
async def invalid_credentials(request: Request, exc: InvalidCredentialsError) -> JSONResponse:
    return JSONResponse(
        status_code=401,
        content={"detail": "Wrong email or password"},
        headers={"WWW-Authenticate": "Bearer"},
    )


@app.exception_handler(UserNotFoundError)
async def user_not_found(request: Request, exc: UserNotFoundError) -> JSONResponse:
    return JSONResponse(status_code=404, content={"detail": "User not found"})


@app.exception_handler(CannotChangeOwnRoleError)
async def cannot_change_own_role(request: Request, exc: CannotChangeOwnRoleError) -> JSONResponse:
    return JSONResponse(status_code=400, content={"detail": "You cannot change your own role"})


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
