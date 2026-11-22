# Test setup: a throwaway SQLite database and fixed test secrets, set before the app is imported (the database URL
# is read when app.database is imported). Real environment variables and backend/.env never reach the tests:
# these are set first, and the app's .env loader never overrides a variable that is already set.
import os
import tempfile
from collections.abc import Callable
from pathlib import Path
from typing import NamedTuple

_DB_DIR = Path(tempfile.mkdtemp(prefix="gym-buddy-tests-"))
os.environ["DATABASE_URL"] = f"sqlite:///{(_DB_DIR / 'test.db').as_posix()}"
os.environ["JWT_SECRET"] = "test-only-jwt-secret-" + "j" * 32
os.environ["PASSWORD_PEPPER"] = "test-only-password-pepper-" + "p" * 32
os.environ["FRONTEND_ORIGIN"] = "https://frontend.test"
os.environ.pop("VERCEL", None)

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlmodel import Session, SQLModel  # noqa: E402

import main  # noqa: E402
from app.database import create_db_and_tables, engine  # noqa: E402
from app.models import User  # noqa: E402

PASSWORD = "correct-horse-battery"
ALLOWED_ORIGIN = os.environ["FRONTEND_ORIGIN"]


class Account(NamedTuple):
    """A signed-up account and a client logged in as it (Bearer token set, refresh cookie in its jar)."""

    id: int
    email: str
    client: TestClient


@pytest.fixture(autouse=True)
def fresh_database():
    """Every test starts from empty tables (plan prices seeded again)."""
    SQLModel.metadata.drop_all(engine)
    create_db_and_tables()
    yield


def new_client() -> TestClient:
    # https, so the browser-like cookie jar sends the Secure refresh cookie back.
    return TestClient(main.app, base_url="https://testserver")


@pytest.fixture
def anon() -> TestClient:
    return new_client()


def login(email: str, password: str = PASSWORD) -> TestClient:
    client = new_client()
    response = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    client.headers["Authorization"] = f"Bearer {response.json()['access_token']}"
    return client


@pytest.fixture
def account() -> Callable[..., Account]:
    """account("ana", role="admin"): sign up ana@test.example, give the role, and log in."""

    def make(key: str, role: str = "user") -> Account:
        email = f"{key}@test.example"
        response = new_client().post(
            "/api/v1/auth/signup", json={"email": email, "name": key.title(), "password": PASSWORD}
        )
        assert response.status_code == 201, response.text
        user_id = response.json()["id"]
        if role != "user":
            with Session(engine) as session:
                user = session.get(User, user_id)
                user.role = role
                session.add(user)
                session.commit()
        return Account(user_id, email, login(email))

    return make
