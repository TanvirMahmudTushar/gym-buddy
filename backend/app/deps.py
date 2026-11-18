# Who is calling: read the Bearer token and check the caller's role.
from collections.abc import Callable
from typing import Annotated

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.database import SessionDep
from app.models import Role, User
from app.security import InvalidTokenError, read_access_token
from app.services.auth_service import ACCOUNT_BANNED_MESSAGE

# auto_error is off so a missing token gives our own 401 (HTTPBearer alone would answer 403).
_bearer = HTTPBearer(auto_error=False)


def _unauthorized() -> HTTPException:
    return HTTPException(status_code=401, detail="Please log in", headers={"WWW-Authenticate": "Bearer"})


def get_current_user(
    session: SessionDep,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> User:
    if credentials is None:
        raise _unauthorized()
    try:
        user_id = read_access_token(credentials.credentials)
    except InvalidTokenError:
        raise _unauthorized() from None
    # Looked up on every request, so a deleted user or a changed role takes effect straight away.
    user = session.get(User, user_id)
    if user is None:
        raise _unauthorized()
    # Even a token that has not expired yet stops working the moment an admin bans the account.
    if user.is_banned:
        raise HTTPException(status_code=403, detail=ACCOUNT_BANNED_MESSAGE)
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_roles(*allowed: Role) -> Callable[[User], User]:
    """A dependency that lets only users with one of the given roles through (403 for the rest)."""

    def check(user: CurrentUser) -> User:
        if user.role not in allowed:
            raise HTTPException(status_code=403, detail="You do not have permission to do this")
        return user

    return check
