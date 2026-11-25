# Settings from the environment (TDD 8). On Vercel they are set in the project settings. On a developer machine they
# may also come from backend/.env (copy .env.example, which holds placeholders only); .env is ignored by git.
#
# load_local_env() runs from app/__init__.py, before any module reads a variable (database.py reads DATABASE_URL
# when it is imported).
import os
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
ENV_FILE = BACKEND_DIR / ".env"

# The Vite dev server, allowed when FRONTEND_ORIGIN is not set on a developer machine.
LOCAL_FRONTEND_ORIGIN = "http://localhost:5173"
# The deployed frontend. Always allowed on Vercel, so a missing or mistyped FRONTEND_ORIGIN cannot lock it out.
DEPLOYED_FRONTEND_ORIGIN = "https://2321648gymbuddy.vercel.app"


def load_local_env() -> None:
    """Read backend/.env if there is one. Never on Vercel, and never over a variable that is already set, so the
    real environment (and the test suite's settings) always win."""
    if os.getenv("VERCEL") or not ENV_FILE.is_file():
        return
    try:
        from dotenv import load_dotenv  # installed with fastapi[standard]
    except ImportError:
        return
    load_dotenv(ENV_FILE, override=False)


def frontend_origins() -> list[str]:
    """The browser origins allowed to call the API from another origin (CORS, NFR-15): the deployed frontend on Vercel,
    the Vite dev server on a developer machine without FRONTEND_ORIGIN, and what FRONTEND_ORIGIN lists (one exact
    origin, or several separated by commas)."""
    raw = os.getenv("FRONTEND_ORIGIN") or ""
    origins = [origin.strip().rstrip("/") for origin in raw.split(",") if origin.strip()]
    for origin in origins:
        # A wildcard with credentials would let any site call the API as the logged-in user.
        if "*" in origin:
            raise RuntimeError("FRONTEND_ORIGIN must list exact origins; * is not allowed")
        if not origin.startswith(("https://", "http://")):
            raise RuntimeError(f"FRONTEND_ORIGIN: {origin!r} is not an origin like https://example.com")
    if os.getenv("VERCEL"):
        return list(dict.fromkeys([DEPLOYED_FRONTEND_ORIGIN, *origins]))
    return origins or [LOCAL_FRONTEND_ORIGIN]
