# Where a request came from: shown in the session list.
import os

from fastapi import Request


def client_ip(request: Request) -> str | None:
    # On Vercel the platform sets X-Forwarded-For to the real client address and drops any value the client sent.
    # Anywhere else that header could be made up, so the address of the connection is used instead.
    if os.getenv("VERCEL"):
        forwarded = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        if forwarded:
            return forwarded[:45]
    return request.client.host if request.client else None


def user_agent(request: Request) -> str | None:
    """The browser's User-Agent text, cut to the length the session table keeps."""
    return request.headers.get("user-agent", "").strip()[:300] or None
