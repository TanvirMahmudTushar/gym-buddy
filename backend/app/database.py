# Database engine and the per-request Session: Supabase PostgreSQL in production, SQLite locally.
import hashlib
import os
from collections.abc import Iterator
from pathlib import Path
from typing import Annotated
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from fastapi import Depends
from sqlalchemy import inspect, text
from sqlalchemy.exc import DBAPIError, IntegrityError
from sqlmodel import Session, SQLModel, create_engine, select

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
    # Connections are kept and reused: opening one to Supabase takes many round trips, so doing it for every request
    # was most of the waiting time. The pool is small because each serverless instance has its own, and Supabase's
    # transaction pooler shares the real connections between them (it rejects prepared statements).
    engine = create_engine(
        DATABASE_URL,
        pool_size=3,
        max_overflow=7,
        # An instance can be paused between requests and wake up with a connection Supabase has closed meanwhile:
        # each one is checked before use and replaced when it is old. The last used one is taken first.
        pool_pre_ping=True,
        pool_recycle=240,
        pool_use_lifo=True,
        connect_args={"prepare_threshold": None},
    )


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
    # Contact and safety details.
    ("app_user", "date_of_birth", "DATE"),
    ("app_user", "emergency_contact_name", "VARCHAR(100)"),
    ("app_user", "emergency_contact_phone", "VARCHAR(20)"),
    # Voiding a mistaken payment.
    ("payment", "voided_at", "TIMESTAMP"),
    ("payment", "void_reason", "VARCHAR(200)"),
    ("payment", "voided_by", "INTEGER REFERENCES app_user (id)"),
    # A class's trainer is an account with the Trainer role.
    ("gym_class", "trainer_id", "INTEGER REFERENCES app_user (id) ON DELETE SET NULL"),
    # A member's personal trainer.
    ("app_user", "trainer_id", "INTEGER REFERENCES app_user (id) ON DELETE SET NULL"),
    # Plans an admin can add, rename and retire.
    ("plan_price", "name", "VARCHAR(60) NOT NULL DEFAULT ''"),
    ("plan_price", "description", "VARCHAR(300)"),
    ("plan_price", "is_active", "BOOLEAN NOT NULL DEFAULT TRUE"),
    # Checking out, class attendance, and workouts marked done.
    ("check_in", "checked_out_at", "TIMESTAMP"),
    ("class_booking", "attended", "BOOLEAN"),
    ("workout", "completed_at", "TIMESTAMP"),
]

# Indexes on the columns above, which create_all() also leaves out on an existing table (names as SQLModel gives them).
_ADDED_INDEXES = [
    ("ix_gym_class_trainer_id", "gym_class", "trainer_id"),
    ("ix_app_user_trainer_id", "app_user", "trainer_id"),
]

# Plan codes were at most 10 characters ("quarterly"); a code made from a plan's name can be longer.
_PLAN_COLUMNS = [("plan_price", "plan"), ("app_user", "plan"), ("payment", "plan")]


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


def _widen_plan_columns() -> None:
    """PostgreSQL only, and only once: SQLite does not enforce a VARCHAR's length."""
    from app.models import PLAN_CODE_LENGTH

    if engine.dialect.name != "postgresql":
        return
    with engine.begin() as conn:
        found = inspect(conn)
        for table, column in _PLAN_COLUMNS:
            length = next(c["type"].length for c in found.get_columns(table) if c["name"] == column)
            if length is not None and length < PLAN_CODE_LENGTH:
                conn.execute(text(f"ALTER TABLE {table} ALTER COLUMN {column} TYPE VARCHAR({PLAN_CODE_LENGTH})"))


def _seed_plans() -> None:
    """Give a new database the default plans, and plans from before they had names their name. A plan an admin
    changed, retired or deleted stays that way."""
    from app.models import DEFAULT_PLANS, MembershipPlan

    with Session(engine) as session:
        plans = session.exec(select(MembershipPlan)).all()
        if not plans:
            for code, (name, price, days) in DEFAULT_PLANS.items():
                session.add(MembershipPlan(plan=code, name=name, price=price, duration_days=days))
        for plan in plans:
            if not plan.name:
                plan.name = plan.plan.replace("-", " ").capitalize()
                session.add(plan)
        try:
            session.commit()
        except IntegrityError:
            session.rollback()  # another serverless instance seeded at the same moment


def _schema_version() -> str:
    """A fingerprint of every table, column and index this code expects. It changes only when the schema does."""
    parts = [f"{t.name}.{c.name} {c.type}" for t in SQLModel.metadata.sorted_tables for c in t.columns]
    parts += [str(row) for row in (*_ADDED_COLUMNS, *_ADDED_INDEXES, *_PLAN_COLUMNS)]
    return hashlib.sha256("\n".join(parts).encode()).hexdigest()


def _is_up_to_date(version: str) -> bool:
    """One query. The table does not exist yet on a new database, or on one from before it was added."""
    from app.models import SchemaState

    try:
        with Session(engine) as session:
            state = session.get(SchemaState, 1)
            return state is not None and state.version == version
    except DBAPIError:
        return False


def _save_version(version: str) -> None:
    from app.models import SchemaState

    with Session(engine) as session:
        session.merge(SchemaState(id=1, version=version))
        try:
            session.commit()
        except IntegrityError:
            session.rollback()  # another serverless instance saved it at the same moment


def create_db_and_tables() -> None:
    """Create missing tables and columns; existing data is always kept. Every cold start runs this, so when the saved
    version says the schema is already right, the checks are skipped. After dropping a table by hand, delete the row in
    schema_state to have it made again."""
    from app import models  # noqa: F401  (registers the tables on SQLModel.metadata)

    version = _schema_version()
    if _is_up_to_date(version):
        return
    SQLModel.metadata.create_all(engine)
    _add_missing_columns()
    _widen_plan_columns()
    _seed_plans()
    _save_version(version)


def get_session() -> Iterator[Session]:
    with Session(engine) as session:
        yield session


SessionDep = Annotated[Session, Depends(get_session)]
