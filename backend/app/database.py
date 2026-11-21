# Database engine and the per-request Session: Supabase PostgreSQL in production, SQLite locally.
import os
from collections.abc import Iterator
from pathlib import Path
from typing import Annotated
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from fastapi import Depends
from sqlalchemy import inspect, text
from sqlalchemy.exc import IntegrityError
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


# create_all() never changes a table that already exists, so columns added later are listed here.
# Table and column names and the definitions are fixed text, never user input.
_ADDED_COLUMNS = [
    ("app_user", "is_banned", "BOOLEAN NOT NULL DEFAULT FALSE"),
    ("app_user", "banned_at", "TIMESTAMP"),
    ("app_user", "ban_reason", "VARCHAR(500)"),
    ("app_user", "password_changed_at", "TIMESTAMP"),
    ("app_user", "must_change_password", "BOOLEAN NOT NULL DEFAULT FALSE"),
    ("app_user", "failed_login_count", "INTEGER NOT NULL DEFAULT 0"),
    ("app_user", "locked_until", "TIMESTAMP"),
    # The membership now lives on the account (there is no member table any more).
    ("app_user", "plan", "VARCHAR(10)"),
    ("app_user", "joined_on", "DATE"),
    ("app_user", "expires_on", "DATE"),
    ("app_user", "is_frozen", "BOOLEAN NOT NULL DEFAULT FALSE"),
    ("app_user", "phone", "VARCHAR(20)"),
    ("app_user", "notes", "VARCHAR(500)"),
    # Voiding a mistaken payment.
    ("payment", "voided_at", "TIMESTAMP"),
    ("payment", "void_reason", "VARCHAR(200)"),
    ("payment", "voided_by", "INTEGER REFERENCES app_user (id)"),
    # A class's trainer is an account with the Trainer role.
    ("gym_class", "trainer_id", "INTEGER REFERENCES app_user (id) ON DELETE SET NULL"),
]

# Indexes on the columns above, which create_all() also leaves out on an existing table (names as SQLModel gives them).
_ADDED_INDEXES = [("ix_gym_class_trainer_id", "gym_class", "trainer_id")]

# Before members became users, these tables pointed at member.id. They are dropped (data and all) and
# create_all() makes them again pointing at app_user.id. Dependent tables first, member last.
_OLD_MEMBER_TABLES = ["check_in", "class_booking", "payment", "member"]


def _drop_old_member_tables() -> None:
    """Runs only on a database that still has the old member table; a no-op from then on."""
    with engine.begin() as conn:
        if not inspect(conn).has_table("member"):
            return
        # CASCADE also drops foreign keys other tables still hold on these (PostgreSQL only; SQLite has no CASCADE).
        cascade = " CASCADE" if engine.dialect.name == "postgresql" else ""
        for table in _OLD_MEMBER_TABLES:
            conn.execute(text(f"DROP TABLE IF EXISTS {table}{cascade}"))


def _add_missing_columns() -> None:
    with engine.begin() as conn:
        found = inspect(conn)
        existing = {table: {c["name"] for c in found.get_columns(table)} for table in {t for t, _, _ in _ADDED_COLUMNS}}
        # IF NOT EXISTS: two serverless instances may start at the same moment.
        guard = "IF NOT EXISTS " if engine.dialect.name == "postgresql" else ""
        for table, column, definition in _ADDED_COLUMNS:
            if column not in existing[table]:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {guard}{column} {definition}"))
        # PostgreSQL and SQLite both accept IF NOT EXISTS here.
        for index, table, column in _ADDED_INDEXES:
            conn.execute(text(f"CREATE INDEX IF NOT EXISTS {index} ON {table} ({column})"))


def _seed_plan_prices() -> None:
    """Give a new database the default plan prices. Existing prices are never changed."""
    from app.models import DEFAULT_PLAN_PRICES, PlanPrice

    with Session(engine) as session:
        for plan, (price, days) in DEFAULT_PLAN_PRICES.items():
            if session.get(PlanPrice, plan) is None:
                session.add(PlanPrice(plan=plan, price=price, duration_days=days))
        try:
            session.commit()
        except IntegrityError:
            session.rollback()  # another serverless instance seeded at the same moment


def create_db_and_tables() -> None:
    """Create missing tables and columns; existing data is kept, except the old member data (see above)."""
    from app import models  # noqa: F401  (registers the tables on SQLModel.metadata)

    _drop_old_member_tables()
    SQLModel.metadata.create_all(engine)
    _add_missing_columns()
    _seed_plan_prices()


def get_session() -> Iterator[Session]:
    with Session(engine) as session:
        yield session


SessionDep = Annotated[Session, Depends(get_session)]
