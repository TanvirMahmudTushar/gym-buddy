# Who is calling: read the Bearer token, check its session, and check the caller's role.
from collections.abc import Callable
from typing import Annotated, NamedTuple

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.database import SessionDep
from app.models import Role, User
from app.security import InvalidTokenError, read_access_token
from app.services import session_service
from app.services.auth_service import ACCOUNT_BANNED_MESSAGE, MUST_CHANGE_PASSWORD_MESSAGE

# auto_error is off so a missing token gives our own 401 (HTTPBearer alone would answer 403).
_bearer = HTTPBearer(auto_error=False)


def _unauthorized() -> HTTPException:
    return HTTPException(status_code=401, detail="Please log in", headers={"WWW-Authenticate": "Bearer"})


class Auth(NamedTuple):
    """The caller and the login session their access token belongs to."""

    user: User
    session_id: int


def get_auth(
    session: SessionDep,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> Auth:
    if credentials is None:
        raise _unauthorized()
    # A missing, tampered or expired token, or one without a session id, is refused here.
    try:
        user_id, session_id = read_access_token(credentials.credentials)
    except InvalidTokenError:
        raise _unauthorized() from None
    # Looked up on every request, so a deleted user or a changed role takes effect straight away.
    user = session.get(User, user_id)
    if user is None:
        raise _unauthorized()
    # Checked before the session (which a ban also revokes) so the app can say why the login ended.
    if user.is_banned:
        raise HTTPException(status_code=403, detail=ACCOUNT_BANNED_MESSAGE)
    # Logout, a revoked session, a password change or reset end the session, and every access token that names it.
    if session_service.get_active_session(session, session_id, user_id) is None:
        raise _unauthorized()
    return Auth(user, session_id)


# FastAPI runs get_auth once per request, however many dependencies below use it.
AuthDep = Annotated[Auth, Depends(get_auth)]


def get_logged_in_user(auth: AuthDep) -> User:
    return auth.user


# Any valid login, even one that must choose a new password first: only GET /users/me and
# POST /users/me/password use this, so a reset account can see who it is and set its password.
LoggedInUser = Annotated[User, Depends(get_logged_in_user)]


def get_current_user(user: LoggedInUser) -> User:
    """Every other route: an account whose password an admin reset can do nothing until it chooses a new one."""
    if user.must_change_password:
        raise HTTPException(status_code=403, detail=MUST_CHANGE_PASSWORD_MESSAGE)
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_roles(*allowed: Role) -> Callable[[User], User]:
    """A dependency that lets only users with one of the given roles through (403 for the rest)."""

    def check(user: CurrentUser) -> User:
        if user.role not in allowed:
            raise HTTPException(status_code=403, detail="You do not have permission to do this")
        return user

    return check
