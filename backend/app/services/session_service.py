# Login sessions and refresh tokens (FR-14, FR-15, NFR-13, TDD 10.1). One session per login on one browser.
# The cookie holds the refresh token; the database keeps only its hash, and every refresh replaces it (rotation).
from datetime import timedelta

from sqlmodel import Session, col, select, update

from app.models import ActivityEvent, AuthSession, User, as_utc, utc_now
from app.request_info import Client
from app.security import hash_refresh_token, new_refresh_token
from app.services import activity_service

# A refresh token is valid for 7 days. Each refresh gives a new one with a fresh 7 days.
REFRESH_LIFETIME = timedelta(days=7)
# Two tabs, or a retried request, can refresh with the same token at the same moment. The request that loses the race
# still gets an access token if it comes within this time; after it, the old token is treated as stolen.
ROTATION_GRACE = timedelta(seconds=30)


class InvalidRefreshTokenError(Exception):
    """The refresh token is unknown, expired, revoked or reused: the person has to log in again."""


class SessionNotFoundError(Exception):
    """No active session of this user has the given id."""


def _is_active(auth_session: AuthSession) -> bool:
    return auth_session.revoked_at is None and as_utc(auth_session.expires_at) > utc_now()


def start_session(session: Session, user: User, client: Client) -> tuple[AuthSession, str]:
    """A new session for a login, saved together with the login's activity row. Returns it with the refresh token
    for the cookie (never stored as it is)."""
    token = new_refresh_token()
    now = utc_now()
    auth_session = AuthSession(
        user_id=user.id,
        token_hash=hash_refresh_token(token),
        created_at=now,
        last_used_at=now,
        expires_at=now + REFRESH_LIFETIME,
        ip=client.ip,
        user_agent=client.user_agent,
    )
    session.add(auth_session)
    activity_service.record(session, ActivityEvent.LOGIN, client, actor=user)
    session.commit()
    session.refresh(auth_session)
    return auth_session, token


def rotate(session: Session, token: str, client: Client) -> tuple[AuthSession, User, str | None]:
    """Swap a refresh token for a new one. Returns the session, its user and the new token for the cookie. The new
    token is None when another request rotated this token a moment earlier: the cookie that request set stays."""
    token_hash = hash_refresh_token(token)
    current = session.exec(select(AuthSession).where(col(AuthSession.token_hash) == token_hash)).first()
    replaced = None
    if current is None:
        replaced = session.exec(select(AuthSession).where(col(AuthSession.previous_token_hash) == token_hash)).first()
    auth_session = current or replaced
    if auth_session is None or not _is_active(auth_session):
        raise InvalidRefreshTokenError
    user = session.get(User, auth_session.user_id)
    # A ban revokes the sessions anyway; this also covers a ban that came another way.
    if user is None or user.is_banned:
        raise InvalidRefreshTokenError

    if replaced is not None:
        if replaced.rotated_at is not None and utc_now() - as_utc(replaced.rotated_at) <= ROTATION_GRACE:
            return replaced, user, None
        # A token that was already replaced came back: two parties hold this session. End it for both. The address
        # logged is the one that sent the old token, which may be whoever copied it.
        activity_service.record(
            session,
            ActivityEvent.SESSION_REVOKE,
            client,
            target=user,
            details=f"Session {replaced.id} ended: a refresh token was used again after it had been replaced",
        )
        revoke(session, replaced)
        raise InvalidRefreshTokenError

    new_token = new_refresh_token()
    now = utc_now()
    # Only swap if the hash is still the one we read, so two refreshes at the same moment cannot both rotate.
    swapped = session.exec(
        update(AuthSession)
        .where(col(AuthSession.id) == current.id, col(AuthSession.token_hash) == token_hash)
        .values(
            token_hash=hash_refresh_token(new_token),
            previous_token_hash=token_hash,
            rotated_at=now,
            last_used_at=now,
            expires_at=now + REFRESH_LIFETIME,
        )
    ).rowcount
    session.commit()
    session.refresh(current)
    return current, user, new_token if swapped else None


def get_login(session: Session, user_id: int, session_id: int) -> tuple[User | None, AuthSession | None]:
    """The account an access token names, and the token's login session if it belongs to that account and is still
    active. One query, because every request makes this check."""
    row = session.exec(
        select(User, AuthSession)
        .outerjoin(AuthSession, (col(AuthSession.id) == session_id) & (col(AuthSession.user_id) == col(User.id)))
        .where(col(User.id) == user_id)
    ).first()
    if row is None:
        return None, None
    user, auth_session = row
    return user, auth_session if auth_session is not None and _is_active(auth_session) else None


def get_active_session(session: Session, session_id: int, user_id: int) -> AuthSession | None:
    """The session an access token names, if it is still active and belongs to that user."""
    auth_session = session.get(AuthSession, session_id)
    if auth_session is None or auth_session.user_id != user_id or not _is_active(auth_session):
        return None
    return auth_session


def list_active_sessions(session: Session, user_id: int) -> list[AuthSession]:
    """The user's sessions that are not revoked or expired, most recently used first."""
    query = (
        select(AuthSession)
        .where(
            col(AuthSession.user_id) == user_id,
            col(AuthSession.revoked_at).is_(None),
            col(AuthSession.expires_at) > utc_now(),
        )
        .order_by(col(AuthSession.last_used_at).desc(), col(AuthSession.id).desc())
    )
    return list(session.exec(query).all())


def revoke(session: Session, auth_session: AuthSession) -> None:
    if auth_session.revoked_at is None:
        auth_session.revoked_at = utc_now()
        session.add(auth_session)
        session.commit()


def revoke_own_session(session: Session, user: User, session_id: int, client: Client) -> None:
    """Another user's session gives the same error as one that does not exist, so ids cannot be probed."""
    auth_session = get_active_session(session, session_id, user.id)
    if auth_session is None:
        raise SessionNotFoundError(session_id)
    where = auth_session.ip or "an unknown address"
    activity_service.record(
        session, ActivityEvent.SESSION_REVOKE, client, actor=user, details=f"Session {session_id} (from {where})"
    )
    revoke(session, auth_session)


def revoke_all(session: Session, user_id: int, keep: int | None = None) -> int:
    """End every active session of the user except `keep`. The caller commits, so this happens in the same
    transaction as the password change, reset or ban that calls it."""
    filters = [col(AuthSession.user_id) == user_id, col(AuthSession.revoked_at).is_(None)]
    if keep is not None:
        filters.append(col(AuthSession.id) != keep)
    return session.exec(update(AuthSession).where(*filters).values(revoked_at=utc_now())).rowcount


def logout(session: Session, token: str, client: Client) -> None:
    """Revoke the session whose current refresh token this is. An unknown token is ignored: logout always succeeds.
    Only a session that was still open is logged, so a second logout adds nothing."""
    auth_session = session.exec(
        select(AuthSession).where(col(AuthSession.token_hash) == hash_refresh_token(token))
    ).first()
    if auth_session is not None and auth_session.revoked_at is None:
        user = session.get(User, auth_session.user_id)
        activity_service.record(session, ActivityEvent.LOGOUT, client, actor=user)
        revoke(session, auth_session)
