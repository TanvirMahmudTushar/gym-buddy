import logging
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.database import create_db_and_tables
from app.routers import admin, auth, check_ins, classes, members, plans, users
from app.services.auth_service import (
    ACCOUNT_BANNED_MESSAGE,
    AccountBannedError,
    EmailTakenError,
    InvalidCredentialsError,
    WrongPasswordError,
)
from app.services.checkin_service import MembershipNotValidError
from app.services.class_service import (
    AlreadyBookedError,
    BookingNotFoundError,
    CapacityBelowBookingsError,
    ClassFullError,
    ClassNotFoundError,
    ClassStartedError,
)
from app.services.member_service import (
    AccountAlreadyLinkedError,
    AccountNotFoundError,
    InvalidExpiryError,
    MemberNotFoundError,
    NoMembershipLinkedError,
)
from app.services.user_service import CannotBanError, CannotChangeOwnRoleError, UserNotFoundError

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
app.include_router(check_ins.router)
app.include_router(classes.router)
app.include_router(plans.router)

# Run at import (not in a lifespan hook) so it also works on Vercel's serverless functions.
create_db_and_tables()


# The service layer raises these; they become the same 404 / 422 responses the routes used to send.
@app.exception_handler(MemberNotFoundError)
async def member_not_found(request: Request, exc: MemberNotFoundError) -> JSONResponse:
    return JSONResponse(status_code=404, content={"detail": "Member not found"})


@app.exception_handler(InvalidExpiryError)
async def invalid_expiry(request: Request, exc: InvalidExpiryError) -> JSONResponse:
    return JSONResponse(status_code=422, content={"detail": str(exc)})


@app.exception_handler(MembershipNotValidError)
async def membership_not_valid(request: Request, exc: MembershipNotValidError) -> JSONResponse:
    return JSONResponse(status_code=400, content={"detail": str(exc)})


@app.exception_handler(ClassNotFoundError)
async def class_not_found(request: Request, exc: ClassNotFoundError) -> JSONResponse:
    return JSONResponse(status_code=404, content={"detail": "Class not found"})


@app.exception_handler(CapacityBelowBookingsError)
async def capacity_below_bookings(request: Request, exc: CapacityBelowBookingsError) -> JSONResponse:
    return JSONResponse(status_code=422, content={"detail": str(exc)})


def _plain_error(exc_type: type[Exception], status_code: int, detail: str) -> None:
    """Register a handler that answers with a fixed status and message."""

    async def handler(request: Request, exc: Exception) -> JSONResponse:
        return JSONResponse(status_code=status_code, content={"detail": detail})

    app.add_exception_handler(exc_type, handler)


_plain_error(AccountNotFoundError, 422, "No account has that ID")
_plain_error(AccountAlreadyLinkedError, 409, "That account is already linked to another member")
_plain_error(NoMembershipLinkedError, 404, "No membership is linked to your account")
_plain_error(WrongPasswordError, 400, "Current password is wrong")
_plain_error(ClassStartedError, 400, "This class has already started")
_plain_error(ClassFullError, 409, "This class is full")
_plain_error(AlreadyBookedError, 409, "You have already booked this class")
_plain_error(BookingNotFoundError, 404, "You have not booked this class")


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


@app.exception_handler(AccountBannedError)
async def account_banned(request: Request, exc: AccountBannedError) -> JSONResponse:
    return JSONResponse(status_code=403, content={"detail": ACCOUNT_BANNED_MESSAGE})


@app.exception_handler(CannotBanError)
async def cannot_ban(request: Request, exc: CannotBanError) -> JSONResponse:
    return JSONResponse(status_code=400, content={"detail": str(exc)})


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
