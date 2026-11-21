# Sign up, log in, refresh and log out under /api/v1/auth (TDD 6.2, 10.1).
from typing import Any

from fastapi import APIRouter, Request, Response
from fastapi.responses import JSONResponse

from app.database import SessionDep
from app.models import AuthSession, LoginRequest, SignupRequest, TokenResponse, User, UserRead
from app.request_info import client_ip, user_agent
from app.security import ACCESS_TOKEN_LIFETIME, create_access_token
from app.services import auth_service, session_service

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

REFRESH_COOKIE = "refresh_token"
# The browser sends the cookie only to /api/v1/auth/*, never with the other API calls (NFR-14).
COOKIE_PATH = "/api/v1/auth"


def _set_refresh_cookie(response: Response, token: str) -> None:
    # HttpOnly: page scripts cannot read it (XSS cannot steal it). SameSite=Strict: other sites cannot make the
    # browser send it. Secure: HTTPS only (browsers also allow it on http://localhost for development).
    response.set_cookie(
        REFRESH_COOKIE,
        token,
        max_age=int(session_service.REFRESH_LIFETIME.total_seconds()),
        path=COOKIE_PATH,
        secure=True,
        httponly=True,
        samesite="strict",
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(REFRESH_COOKIE, path=COOKIE_PATH, secure=True, httponly=True, samesite="strict")


def _tokens(user: User, auth_session: AuthSession) -> dict:
    return {
        "access_token": create_access_token(user.id, user.role, auth_session.id),
        "token_type": "bearer",
        "expires_in": int(ACCESS_TOKEN_LIFETIME.total_seconds()),
        "user": user,
    }


@router.post("/signup", status_code=201, response_model=UserRead)
def signup(body: SignupRequest, session: SessionDep) -> User:
    """Creates an account with the role user. A duplicate email returns 409."""
    return auth_service.signup(session, body)


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, request: Request, response: Response, session: SessionDep) -> dict:
    """Starts a session: a 15-minute access token in the body and a 7-day refresh token in an HttpOnly cookie.
    A wrong email and a wrong password give the same 401."""
    user = auth_service.authenticate(session, body)
    auth_session, refresh_token = session_service.start_session(session, user, client_ip(request), user_agent(request))
    _set_refresh_cookie(response, refresh_token)
    return _tokens(user, auth_session)


@router.post(
    "/refresh",
    response_model=TokenResponse,
    responses={204: {"description": "No refresh cookie: nobody is logged in on this browser"}},
)
def refresh(request: Request, response: Response, session: SessionDep) -> Any:
    """Swaps the refresh cookie for a new one (rotation) and returns a new access token (FR-14). 401 and the
    cookie is cleared if it is expired, revoked or reused. With no cookie at all the answer is 204, so a visitor
    who is not logged in does not see an error when the app starts."""
    token = request.cookies.get(REFRESH_COOKIE)
    if not token:
        return Response(status_code=204)
    try:
        auth_session, user, new_token = session_service.rotate(session, token)
    except session_service.InvalidRefreshTokenError:
        # Returned (not raised) so the response can clear the cookie it rejects.
        error = JSONResponse(status_code=401, content={"detail": "Please log in"})
        _clear_refresh_cookie(error)
        return error
    if new_token is not None:
        _set_refresh_cookie(response, new_token)
    return _tokens(user, auth_session)


@router.post("/logout", status_code=204)
def logout(request: Request, session: SessionDep) -> Response:
    """Revokes this browser's session and clears the cookie (FR-15). The access token stops working at once,
    because every request checks that its session is still active. Always 204."""
    token = request.cookies.get(REFRESH_COOKIE)
    if token:
        session_service.logout(session, token)
    response = Response(status_code=204)
    _clear_refresh_cookie(response)
    return response
