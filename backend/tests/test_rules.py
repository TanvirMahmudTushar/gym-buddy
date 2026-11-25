# The final spec's rules, checked on every endpoint at once where possible, so a new endpoint cannot slip past them.
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from conftest import PASSWORD, new_client

import main
from app import config
from app.models import gym_today

OPERATIONS = [(method, path) for path, ops in main.app.openapi()["paths"].items() for method in ops]
# What a visitor may call: signing in and out, and the health check.
PUBLIC = {
    ("post", "/api/v1/auth/signup"),
    ("post", "/api/v1/auth/login"),
    ("post", "/api/v1/auth/refresh"),
    ("post", "/api/v1/auth/logout"),
    ("get", "/api/health"),
}
# What a plain User may call: their own account, what everyone reads, and the groups they are in (404 for the rest).
OWN_DATA = ("/api/v1/users/me", "/api/v1/groups", "/api/v1/workouts", "/api/v1/auth/")
SHARED_READS = {
    ("get", "/api/v1/classes"),
    ("get", "/api/v1/classes/{class_id}"),
    ("post", "/api/v1/classes/{class_id}/bookings"),
    ("delete", "/api/v1/classes/{class_id}/bookings"),
    ("get", "/api/v1/plans"),
    ("get", "/api/v1/announcements"),
    ("get", "/api/health"),
}


def fill(path: str) -> str:
    return re.sub(r"\{[^}]+\}", "1", path)


@pytest.fixture
def admin(account):
    return account("ada", role="admin")


@pytest.fixture
def manager(account):
    return account("gus", role="gym_manager")


@pytest.fixture
def trainer(account):
    return account("karim", role="trainer")


@pytest.fixture
def group(trainer, account):
    """Karim's group, with Rafi holding every permission a member can have, and one workout Karim added."""
    rafi = account("rafi")
    group_id = trainer.client.post("/api/v1/groups", json={"name": "Lifters"}).json()["id"]
    flags = {"can_create": True, "can_update": True, "can_assign": True}
    trainer.client.post(f"/api/v1/groups/{group_id}/members", json={"email": rafi.email, **flags})
    body = {"title": "Squats", "workout_date": gym_today().isoformat(), "group_id": group_id}
    workout_id = trainer.client.post("/api/v1/workouts", json=body).json()["id"]
    return group_id, workout_id, rafi


# --- Every endpoint ---


def test_every_endpoint_but_the_public_ones_needs_a_login():
    codes = {(m, p): new_client().request(m, fill(p)).status_code for m, p in OPERATIONS if (m, p) not in PUBLIC}
    assert set(codes.values()) == {401}, {k: v for k, v in codes.items() if v != 401}


def test_a_plain_user_gets_403_on_every_staff_and_admin_endpoint(account):
    user = account("rafi")
    staff = [(m, p) for m, p in OPERATIONS if not p.startswith(OWN_DATA) and (m, p) not in SHARED_READS]
    assert len(staff) > 50
    codes = {(m, p): user.client.request(m, fill(p), json={}).status_code for m, p in staff}
    assert set(codes.values()) == {403}, {k: v for k, v in codes.items() if v != 403}


def test_nobody_but_an_admin_reaches_an_admin_endpoint(manager, trainer):
    routes = [(m, p) for m, p in OPERATIONS if p.startswith("/api/v1/admin/")]
    for caller in (manager, trainer):
        codes = {(m, p): caller.client.request(m, fill(p), json={}).status_code for m, p in routes}
        assert set(codes.values()) == {403}, codes


def test_nobody_can_give_themself_a_role(anon, account):
    body = {"email": "eve@test.example", "name": "Eve", "password": PASSWORD, "role": "admin"}
    assert anon.post("/api/v1/auth/signup", json=body).json()["role"] == "user"
    rafi = account("rafi")
    rafi.client.patch("/api/v1/users/me", json={"name": "Rafi", "role": "admin"})
    assert rafi.client.get("/api/v1/users/me").json()["role"] == "user"


def test_role_names_are_compared_only_in_the_rbac_module():
    app_dir = Path(main.__file__).parent / "app"
    compared = re.compile(r"""role\)?\s*(==|!=|in|not in)\s*[\[({]?\s*["']""")
    found = [
        f"{file.name}: {line.strip()}"
        for file in app_dir.rglob("*.py")
        if file.name != "rbac.py"
        for line in file.read_text(encoding="utf-8").splitlines()
        if compared.search(line)
    ]
    assert found == []


# --- Groups: only the owner deletes ---


def test_a_member_with_every_permission_cannot_delete_a_workout(group, trainer):
    _, workout_id, rafi = group
    path = f"/api/v1/workouts/{workout_id}"
    assert rafi.client.patch(path, json={"title": "Front squats"}).status_code == 200
    assert rafi.client.delete(path).status_code == 403
    assert trainer.client.delete(path).status_code == 204


def test_a_member_cannot_delete_even_the_workout_they_added(group, trainer):
    group_id, _, rafi = group
    body = {"title": "Mine", "workout_date": gym_today().isoformat(), "group_id": group_id}
    path = f"/api/v1/workouts/{rafi.client.post('/api/v1/workouts', json=body).json()['id']}"
    assert rafi.client.delete(path).status_code == 403
    assert trainer.client.delete(path).status_code == 204


def test_a_member_cannot_manage_the_group(group, account):
    group_id, _, rafi = group
    sara = account("sara")
    path = f"/api/v1/groups/{group_id}"
    assert rafi.client.patch(path, json={"name": "Mine"}).status_code == 403
    assert rafi.client.delete(path).status_code == 403
    assert rafi.client.post(f"{path}/members", json={"email": sara.email}).status_code == 403
    assert rafi.client.patch(f"{path}/members/{rafi.id}", json={"can_create": False}).status_code == 403
    assert rafi.client.delete(f"{path}/members/{sara.id}").status_code == 403


# --- Staff accounts are for admins ---


def test_a_gym_manager_cannot_start_or_edit_a_staff_membership(admin, manager, trainer):
    for staff in (admin, trainer, manager):
        body = {"email": staff.email, "plan": "monthly"}
        assert manager.client.post("/api/v1/members", json=body).status_code == 403
        assert admin.client.post("/api/v1/members", json=body).status_code == 201
        path = f"/api/v1/members/{staff.id}"
        assert manager.client.patch(path, json={"name": "Changed"}).status_code == 403
        assert admin.client.patch(path, json={"notes": "Staff"}).status_code == 200


def test_only_an_admin_deletes_accounts(admin, manager, account):
    for key in ("rafi", "sara"):
        manager.client.post("/api/v1/members", json={"email": account(key).email, "plan": "monthly"})
    ids = [m["id"] for m in manager.client.get("/api/v1/members").json()["items"]]
    assert manager.client.delete(f"/api/v1/members/{ids[0]}").status_code == 403
    assert manager.client.post("/api/v1/members/bulk-delete", json={"ids": ids}).status_code == 403
    assert admin.client.delete(f"/api/v1/members/{ids[0]}").status_code == 204
    assert admin.client.post("/api/v1/members/bulk-delete", json={"ids": ids}).json() == {"deleted": 1}


# --- Password change: every failed attempt is recorded, and guessing is locked out ---


def change(client, current: str, new: str):
    return client.post("/api/v1/users/me/password", json={"current_password": current, "new_password": new})


def test_every_failed_password_change_is_recorded(admin, account):
    rafi = account("rafi")
    assert change(rafi.client, "wrong-password", "good-pass-123").status_code == 400
    short = change(rafi.client, PASSWORD, "short")
    assert short.status_code == 422 and "new_password" in short.json()["detail"]
    assert change(rafi.client, PASSWORD, "x" * 129).status_code == 422
    assert change(rafi.client, PASSWORD, PASSWORD).status_code == 400
    log = admin.client.get("/api/v1/admin/activity", params={"event": "password_change_failed"}).json()
    assert log["total"] == 4
    assert change(rafi.client, PASSWORD, "good-pass-123").status_code == 204


def test_guessing_the_current_password_locks_the_account(admin, account):
    rafi = account("rafi")
    codes = [change(rafi.client, f"guess-{i}", "good-pass-123").status_code for i in range(5)]
    assert codes == [400, 400, 400, 400, 429]
    # Even the right password waits, here and on Log in.
    assert change(rafi.client, PASSWORD, "good-pass-123").status_code == 429
    login = {"email": rafi.email, "password": PASSWORD}
    assert new_client().post("/api/v1/auth/login", json=login).status_code == 429
    log = admin.client.get("/api/v1/admin/activity", params={"event": "account_locked"}).json()
    assert log["total"] == 1


# --- Activity log: the deletes that are not somebody's content ---


def test_leaving_removing_and_cancelling_are_logged(admin, manager, group, trainer, account):
    group_id, _, rafi = group
    sara = account("sara")
    trainer.client.post(f"/api/v1/groups/{group_id}/members", json={"email": sara.email})
    sara.client.delete(f"/api/v1/groups/{group_id}/members/{sara.id}")
    trainer.client.delete(f"/api/v1/groups/{group_id}/members/{rafi.id}")
    log = admin.client.get("/api/v1/admin/activity", params={"event": "group_member_remove"}).json()["items"]
    assert [(e["actor_email"], e["target_email"]) for e in log] == [(trainer.email, rafi.email), (sara.email, None)]

    starts_at = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
    body = {"name": "Yoga", "duration_minutes": 60, "capacity": 5, "starts_at": starts_at}
    class_id = manager.client.post("/api/v1/classes", json=body).json()["id"]
    for person in (rafi, sara):
        manager.client.post("/api/v1/members", json={"email": person.email, "plan": "monthly"})
        person.client.post(f"/api/v1/classes/{class_id}/bookings")
    rafi.client.delete(f"/api/v1/classes/{class_id}/bookings")
    manager.client.delete(f"/api/v1/members/{sara.id}/bookings/{class_id}")
    log = admin.client.get("/api/v1/admin/activity", params={"event": "booking_cancel"}).json()["items"]
    assert [(e["actor_email"], e["target_email"]) for e in log] == [(manager.email, sara.email), (rafi.email, None)]


# --- Dashboard and CORS ---


def test_the_dashboard_counts_users_records_and_groups_new_in_7_days(admin, group):
    stats = admin.client.get("/api/v1/admin/stats").json()
    assert stats["groups"] == {"total": 1, "new_last_7_days": 1}
    assert stats["workouts"]["last_7_days"] == 1
    assert stats["users"]["new_last_7_days"] == 3 and stats["users"]["banned"] == 0


@pytest.mark.parametrize("value", [None, "", "https://other.example"])
def test_the_deployed_frontend_is_always_allowed_on_vercel(monkeypatch, value):
    monkeypatch.setenv("VERCEL", "1")
    if value is None:
        monkeypatch.delenv("FRONTEND_ORIGIN")
    else:
        monkeypatch.setenv("FRONTEND_ORIGIN", value)
    origins = config.frontend_origins()
    assert origins[0] == config.DEPLOYED_FRONTEND_ORIGIN and "*" not in origins
