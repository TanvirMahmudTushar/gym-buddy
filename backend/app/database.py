# Database engine and the per-request Session: Supabase PostgreSQL in production, SQLite locally.
import os
from collections.abc import Iterator
from pathlib import Path
from typing import Annotated
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from fastapi import Depends
from sqlalchemy.pool import NullPool
from sqlmodel import Session, SQLModel, create_engine

BACKEND_DIR = Path(__file__).resolve().parent.parent

# Query parameters that Supabase and Vercel add but libpq (psycopg) rejects.
_UNSUPPORTED_QUERY_KEYS = {"supa", "pgbouncer"}


def _to_sqlalchemy_url(url: str) -> str:
    """Turn a postgres:// URL into one SQLAlchemy can use with psycopg; other URLs are kept."""
    if not url.startswith(("postgres://", "postgresql://", "postgresql+psycopg://")):
        return url
    url = "postgresql+psycopg://" + url.split("://", 1)[1]
    parts = urlsplit(url)
    query = [(k, v) for k, v in parse_qsl(parts.query) if k not in _UNSUPPORTED_QUERY_KEYS]
    return urlunsplit(parts._replace(query=urlencode(query)))


def _database_url() -> str:
    # DATABASE_URL is set by hand; POSTGRES_URL is set by the Supabase integration on Vercel.
    url = os.getenv("DATABASE_URL") or os.getenv("POSTGRES_URL")
    if url:
        return _to_sqlalchemy_url(url)
    # Vercel's filesystem is read-only except /tmp, which is wiped between invocations.
    db_dir = Path("/tmp") if os.getenv("VERCEL") else BACKEND_DIR
    return f"sqlite:///{(db_dir / 'gym_buddy.db').as_posix()}"


DATABASE_URL = _database_url()

if DATABASE_URL.startswith("sqlite"):
    # check_same_thread=False: FastAPI runs sync routes in a thread pool.
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
else:
    # Supabase's transaction pooler does the pooling and rejects prepared statements.
    engine = create_engine(DATABASE_URL, poolclass=NullPool, connect_args={"prepare_threshold": None})


def create_db_and_tables() -> None:
    """Create missing tables; existing data is kept."""
    from app import models  # noqa: F401  (registers the tables on SQLModel.metadata)

    SQLModel.metadata.create_all(engine)


def get_session() -> Iterator[Session]:
    with Session(engine) as session:
        yield session


SessionDep = Annotated[Session, Depends(get_session)]
