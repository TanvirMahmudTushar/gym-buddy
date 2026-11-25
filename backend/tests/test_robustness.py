# Bad input never becomes a 500, errors all look the same, and what people delete is written to the activity log.
from datetime import datetime, timedelta, timezone

import pytest

from app import models
from app.models import gym_today, start_of_day

HUGE_ID = 99_999_999_999


@pytest.fixture
def admin(account):
    return account("ada", role="admin")


@pytest.fixture
def trainer(account):
    return account("karim", role="trainer")


def tomorrow() -> str:
    return (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()


# --- Input validation and error responses ---


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("get", "/api/v1/members/{id}"),
        ("patch", "/api/v1/admin/users/{id}/role"),
        ("post", "/api/v1/admin/users/{id}/ban"),
        ("get", "/api/v1/classes/{id}"),
        ("post", "/api/v1/payments/{id}/void"),
        ("delete", "/api/v1/announcements/{id}"),
        ("delete", "/api/v1/users/me/sessions/{id}"),
    ],
)
def test_an_id_no_column_can_hold_is_refused(admin, method, path):
    assert admin.client.request(method, path.format(id=HUGE_ID)).status_code == 422


def test_an_offset_no_column_can_hold_is_refused(admin):
    assert admin.client.get("/api/v1/admin/users", params={"offset": 10**30}).status_code == 422


@pytest.mark.parametrize(
    ("path", "params"),
    [
        ("/api/v1/admin/activity", {"date_to": "9999-12-31"}),
        ("/api/v1/payments", {"date_to": "9999-12-31"}),
        ("/api/v1/admin/groups", {"date_to": "9999-12-31"}),
        ("/api/v1/check-ins", {"day": "9999-12-31"}),
    ],
)
def test_the_last_day_of_the_calendar_is_refused(admin, path, params):
    assert admin.client.get(path, params=params).status_code == 422


def test_a_membership_cannot_run_past_the_calendar(admin, account):
    rafi = account("rafi")
    body = {"email": rafi.email, "plan": "monthly", "joined_on": "9999-12-01"}
    assert admin.client.post("/api/v1/members", json=body).status_code == 422


def test_a_validation_error_is_one_sentence_and_never_repeats_the_password(anon):
    response = anon.post("/api/v1/auth/signup", json={"email": "not-an-email", "name": "Ana", "password": "short7!"})
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert isinstance(detail, str) and "email:" in detail and "password:" in detail
    assert "short7!" not in response.text


def test_a_class_cannot_start_in_the_past(admin):
    body = {"name": "Yoga", "duration_minutes": 60, "capacity": 5}
    assert admin.client.post("/api/v1/classes", json={**body, "starts_at": "2020-01-01T10:00:00Z"}).status_code == 422
    assert admin.client.post("/api/v1/classes", json={**body, "starts_at": "0001-01-01T00:00:00Z"}).status_code == 422
    created = admin.client.post("/api/v1/classes", json={**body, "starts_at": tomorrow()}).json()
    path = f"/api/v1/classes/{created['id']}"
    assert admin.client.patch(path, json={"starts_at": "2020-01-01T10:00:00Z"}).status_code == 422
    # Sending the same time with another change is not a new time.
    assert admin.client.patch(path, json={"starts_at": created["starts_at"], "capacity": 8}).status_code == 200


# --- The gym's day ---


def test_a_day_is_the_gyms_day_not_the_utc_day(monkeypatch):
    # 20:30 UTC on the 25th is 02:30 on the 26th in Dhaka.
    monkeypatch.setattr(models, "utc_now", lambda: datetime(2026, 11, 25, 20, 30, tzinfo=timezone.utc))
    assert gym_today().isoformat() == "2026-11-26"
    assert start_of_day(gym_today()) == datetime(2026, 11, 25, 18, 0, tzinfo=timezone.utc)


# --- Deletes in the activity log ---


def test_staff_deletes_and_voids_are_logged(admin, account):
    c = admin.client
    rafi = account("rafi")
    c.post("/api/v1/members", json={"email": rafi.email, "plan": "monthly", "payment_method": "cash"})
    payment = c.get("/api/v1/payments").json()["items"][0]
    assert c.post(f"/api/v1/payments/{payment['id']}/void", json={"reason": "Typed twice"}).status_code == 200
    # Voiding again changes nothing, so it is not logged again.
    c.post(f"/api/v1/payments/{payment['id']}/void", json={"reason": "Again"})

    body = {"name": "Yoga", "duration_minutes": 60, "capacity": 5, "starts_at": tomorrow()}
    c.delete(f"/api/v1/classes/{c.post('/api/v1/classes', json=body).json()['id']}")
    c.delete(f"/api/v1/equipment/{c.post('/api/v1/equipment', json={'name': 'Bike', 'category': 'cardio'}).json()['id']}")
    note = c.post("/api/v1/announcements", json={"title": "Closed", "message": "Friday"}).json()
    c.delete(f"/api/v1/announcements/{note['id']}")
    plan = c.post("/api/v1/plans", json={"name": "Daily", "price": 100, "duration_days": 1}).json()
    c.delete(f"/api/v1/plans/{plan['plan']}")

    for event in ("payment_void", "class_delete", "equipment_delete", "announcement_delete", "plan_delete"):
        log = c.get("/api/v1/admin/activity", params={"event": event}).json()
        assert log["total"] == 1, event
        assert log["items"][0]["actor_email"] == admin.email


def test_deletes_inside_a_group_are_logged(admin, trainer):
    group = trainer.client.post("/api/v1/groups", json={"name": "Lifters"}).json()
    body = {"title": "Squats", "workout_date": gym_today().isoformat(), "group_id": group["id"]}
    workout = trainer.client.post("/api/v1/workouts", json=body).json()
    trainer.client.delete(f"/api/v1/workouts/{workout['id']}")
    trainer.client.delete(f"/api/v1/groups/{group['id']}")
    for event, text in (("workout_delete", "Squats"), ("group_delete", "Lifters")):
        rows = admin.client.get("/api/v1/admin/activity", params={"event": event}).json()["items"]
        assert len(rows) == 1 and text in rows[0]["details"] and rows[0]["actor_email"] == trainer.email


# --- Admin: records and moderation filters ---


def test_user_details_list_the_users_records(admin, trainer, account):
    rafi = account("rafi")
    admin.client.post("/api/v1/members", json={"email": rafi.email, "plan": "monthly", "payment_method": "cash"})
    admin.client.post(f"/api/v1/members/{rafi.id}/check-ins")
    body = {"name": "Yoga", "duration_minutes": 60, "capacity": 5, "starts_at": tomorrow()}
    class_id = admin.client.post("/api/v1/classes", json=body).json()["id"]
    rafi.client.post(f"/api/v1/classes/{class_id}/bookings")
    group = trainer.client.post("/api/v1/groups", json={"name": "Lifters"}).json()
    trainer.client.post(f"/api/v1/groups/{group['id']}/members", json={"email": rafi.email})
    workout = {"title": "Squats", "workout_date": gym_today().isoformat(), "group_id": group["id"]}
    trainer.client.post("/api/v1/workouts", json={**workout, "assigned_to": rafi.id})

    records = admin.client.get(f"/api/v1/admin/users/{rafi.id}").json()["recent_records"]
    assert [w["title"] for w in records["workouts"]] == ["Squats"]
    assert [b["class_name"] for b in records["bookings"]] == ["Yoga"]
    assert len(records["visits"]) == len(records["payments"]) == 1


def test_moderation_filters_workouts_by_status_and_group(admin, trainer, account):
    rafi = account("rafi")
    group = trainer.client.post("/api/v1/groups", json={"name": "Lifters"}).json()
    trainer.client.post(f"/api/v1/groups/{group['id']}/members", json={"email": rafi.email})
    workout = {"workout_date": gym_today().isoformat(), "group_id": group["id"]}
    trainer.client.post("/api/v1/workouts", json={**workout, "title": "Nobody"})
    trainer.client.post("/api/v1/workouts", json={**workout, "title": "Waiting", "assigned_to": rafi.id})
    done = trainer.client.post("/api/v1/workouts", json={**workout, "title": "Finished", "assigned_to": rafi.id}).json()
    rafi.client.put(f"/api/v1/workouts/{done['id']}/completion", json={"done": True})

    def titles(**params):
        items = admin.client.get("/api/v1/admin/workouts", params=params).json()["items"]
        return [w["title"] for w in items]

    assert titles(status="unassigned") == ["Nobody"]
    assert titles(status="to_do") == ["Waiting"]
    assert titles(status="done") == ["Finished"]
    assert len(titles(group_id=group["id"])) == 3 and titles(group_id=group["id"] + 1) == []
    csv = admin.client.get("/api/v1/admin/workouts/export.csv", params={"status": "done"}).text
    assert "Finished" in csv and "Waiting" not in csv


# --- Sessions and trainers ---


def test_logout_with_a_token_another_tab_just_replaced_still_ends_the_session(account):
    rafi = account("rafi")
    old = rafi.client.cookies["refresh_token"]
    rafi.client.post("/api/v1/auth/refresh")
    rafi.client.cookies.clear()
    rafi.client.post("/api/v1/auth/logout", headers={"Cookie": f"refresh_token={old}"})
    assert rafi.client.get("/api/v1/users/me").status_code == 401


def test_a_banned_trainer_cannot_be_picked(admin, trainer):
    assert len(admin.client.get("/api/v1/trainers").json()) == 1
    admin.client.post(f"/api/v1/admin/users/{trainer.id}/ban", json={"reason": "Test"})
    assert admin.client.get("/api/v1/trainers").json() == []


# --- Timestamps and exports ---


def test_every_timestamp_on_a_user_is_sent_as_utc_with_a_z():
    """A time with no zone would be read as the browser's own time, which is wrong for everyone outside UTC. Columns
    added to an older database later have no time zone, so the value can come back naive."""
    naive = datetime(2026, 11, 25, 10, 30, 0)
    user = {"id": 1, "email": "a@test.example", "name": "A", "role": "user", "must_change_password": False}
    assert models.UserRead(**user, created_at=naive).model_dump(mode="json")["created_at"] == "2026-11-25T10:30:00Z"
    admin_view = models.AdminUserRead(
        **user, created_at=naive, is_banned=True, banned_at=naive, ban_reason=None, plan=None, expires_on=None, is_frozen=False
    )
    assert admin_view.model_dump(mode="json")["banned_at"] == "2026-11-25T10:30:00Z"


def test_every_csv_export_is_limited_to_the_newest_rows(admin, account, monkeypatch):
    from app.services import csv_export, expense_service, payment_service, user_service

    for service in (user_service, expense_service, payment_service):
        monkeypatch.setattr(service, "EXPORT_LIMIT", 2)
    assert csv_export.EXPORT_LIMIT == 10_000

    for key in ("rafi", "sara", "omar"):
        member = account(key)
        admin.client.post("/api/v1/members", json={"email": member.email, "plan": "monthly", "payment_method": "cash"})
        admin.client.post(
            "/api/v1/expenses", json={"category": "other", "amount": 100, "spent_on": gym_today().isoformat(), "description": key}
        )

    def data_rows(path: str) -> int:
        response = admin.client.get(path)
        assert response.status_code == 200
        return len(response.text.strip().splitlines()) - 1  # without the header

    assert data_rows("/api/v1/admin/users/export.csv") == 2
    assert data_rows("/api/v1/expenses/export.csv") == 2
    assert data_rows("/api/v1/payments/export.csv") == 2
    # The list is not limited: only the download is.
    assert admin.client.get("/api/v1/payments").json()["total"] == 3
