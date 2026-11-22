# Where a request came from: shown in the session list and written to the activity log.
import os
from typing import Annotated, NamedTuple

from fastapi import Depends, Request


class Client(NamedTuple):
    """The address and browser a request came from. Services take this instead of the request itself."""

    ip: str | None
    user_agent: str | None


def client_ip(request: Request) -> str | None:
    # On Vercel the platform sets X-Forwarded-For to the real client address and drops any value the client sent.
    # Anywhere else that header could be made up, so the address of the connection is used instead.
    if os.getenv("VERCEL"):
        forwarded = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        if forwarded:
            return forwarded[:45]
    return request.client.host if request.client else None


def user_agent(request: Request) -> str | None:
    """The browser's User-Agent text, cut to the length the session and activity tables keep."""
    return request.headers.get("user-agent", "").strip()[:300] or None


def get_client(request: Request) -> Client:
    return Client(client_ip(request), user_agent(request))


ClientDep = Annotated[Client, Depends(get_client)]
