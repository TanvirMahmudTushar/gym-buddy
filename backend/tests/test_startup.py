# Start-up and the login check, which run on every cold start and every request: they must stay cheap and correct.
import pytest
from sqlalchemy import event, text
from sqlmodel import Session

from app.database import create_db_and_tables, engine
from app.models import MembershipPlan, SchemaState


@pytest.fixture
def statements():
    """Every SQL statement run while the test lasts."""
    seen: list[str] = []

    def note(conn, cursor, statement, *rest):
        seen.append(statement)

    event.listen(engine, "before_cursor_execute", note)
    yield seen
    event.remove(engine, "before_cursor_execute", note)


def test_a_start_with_nothing_to_change_runs_one_query(statements):
    create_db_and_tables()  # the fixture has already brought the database up to date
    assert len(statements) == 1


def test_an_older_schema_version_is_checked_and_filled_in_again():
    with engine.begin() as conn:
        conn.execute(text("DROP TABLE equipment"))
        conn.execute(text("UPDATE schema_state SET version = 'older'"))
    create_db_and_tables()
    with engine.connect() as conn:
        assert conn.execute(text("SELECT count(*) FROM equipment")).scalar() == 0
    with Session(engine) as session:
        assert session.get(SchemaState, 1).version != "older"


def test_a_start_does_not_bring_back_a_deleted_plan():
    with Session(engine) as session:
        session.delete(session.get(MembershipPlan, "yearly"))
        session.commit()
    create_db_and_tables()
    with Session(engine) as session:
        assert session.get(MembershipPlan, "yearly") is None


def test_the_login_check_is_one_query(account, statements):
    user = account("rafi")
    statements.clear()
    assert user.client.get("/api/v1/users/me").status_code == 200
    assert len(statements) == 1


def test_a_token_does_not_open_another_accounts_session(account):
    rafi, sara = account("rafi"), account("sara")
    with Session(engine) as session:
        session.execute(text(f"UPDATE auth_session SET user_id = {sara.id} WHERE user_id = {rafi.id}"))
        session.commit()
    # The token names Rafi and a session that is not Rafi's any more.
    assert rafi.client.get("/api/v1/users/me").status_code == 401
