# The gym's day to day: plans, memberships, attendance, class attendance, personal trainers, training, equipment and
# expenses.
from datetime import datetime, timedelta, timezone

import pytest

from app.models import gym_today

TODAY = gym_today()


@pytest.fixture
def manager(account):
    return account("gus", role="gym_manager")


@pytest.fixture
def admin(account):
    return account("ada", role="admin")


@pytest.fixture
def trainer(account):
    return account("karim", role="trainer")


@pytest.fixture
def member(account, manager):
    """Rafi, with a monthly membership."""
    rafi = account("rafi")
    response = manager.client.post("/api/v1/members", json={"email": rafi.email, "plan": "monthly"})
    assert response.status_code == 201, response.text
    return rafi


# --- Plans ---


def test_admin_adds_edits_retires_and_deletes_a_plan(admin, manager):
    body = {"name": "Student monthly", "price": 1000, "duration_days": 30}
    created = admin.client.post("/api/v1/plans", json=body)
    assert created.status_code == 201
    assert created.json()["plan"] == "student-monthly"
    assert admin.client.post("/api/v1/plans", json={**body, "name": "STUDENT monthly"}).status_code == 409
    assert manager.client.post("/api/v1/plans", json={**body, "name": "Other"}).status_code == 403

    path = "/api/v1/plans/student-monthly"
    changed = admin.client.patch(path, json={"name": "Student", "price": 1200}).json()
    assert (changed["plan"], changed["name"], changed["price"]) == ("student-monthly", "Student", 1200)
    assert admin.client.patch(path, json={"is_active": False}).json()["is_active"] is False
    assert admin.client.delete(path).status_code == 204
    assert admin.client.delete(path).status_code == 404


def test_a_retired_plan_cannot_be_chosen_but_members_keep_it(admin, manager, member, account):
    admin.client.patch("/api/v1/plans/monthly", json={"is_active": False})
    new = account("sara")
    refused = manager.client.post("/api/v1/members", json={"email": new.email, "plan": "monthly"})
    assert refused.status_code == 422
    assert manager.client.post("/api/v1/members", json={"email": new.email, "plan": "nope"}).status_code == 422
    # Sending the plan a member already has is not a new choice.
    kept = manager.client.patch(f"/api/v1/members/{member.id}", json={"plan": "monthly", "notes": "Hi"})
    assert kept.status_code == 200
    assert admin.client.delete("/api/v1/plans/monthly").status_code == 409  # a member has it


# --- Memberships ---


def test_a_new_membership_runs_for_the_plans_days_and_can_be_paid_at_once(manager, account):
    sara = account("sara")
    body = {"email": sara.email, "plan": "quarterly", "payment_method": "cash"}
    created = manager.client.post("/api/v1/members", json=body).json()
    assert created["expires_on"] == (TODAY + timedelta(days=90)).isoformat()
    payments = sara.client.get("/api/v1/users/me/payments").json()["items"]
    assert [(p["amount"], p["method"], p["plan"]) for p in payments] == [(4000, "cash", "quarterly")]


# --- Attendance ---


def test_check_in_then_out(manager, member):
    path = f"/api/v1/members/{member.id}/check-ins"
    visit = manager.client.post(path)
    assert visit.status_code == 201 and visit.json()["checked_out_at"] is None
    assert manager.client.post(path).status_code == 409  # already inside
    assert manager.client.get("/api/v1/check-ins?inside=true").json()["total"] == 1
    assert manager.client.get("/api/v1/overview").json()["inside_now"] == 1

    out = f"/api/v1/check-ins/{visit.json()['id']}/check-out"
    assert member.client.post(out).status_code == 403
    assert manager.client.post(out).json()["checked_out_at"] is not None
    assert manager.client.post(out).status_code == 400
    assert manager.client.get("/api/v1/check-ins?inside=true").json()["total"] == 0
    assert manager.client.post(path).status_code == 201  # back again the same day
    assert manager.client.get("/api/v1/check-ins").json()["total"] == 2
    assert manager.client.get("/api/v1/check-ins?day=2020-01-01").json()["total"] == 0


def test_a_frozen_member_cannot_check_in(manager, member):
    manager.client.patch(f"/api/v1/members/{member.id}", json={"is_frozen": True})
    assert manager.client.post(f"/api/v1/members/{member.id}/check-ins").status_code == 400


# --- Class attendance ---


def _class(manager, trainer_id, starts_at):
    body = {"name": "HIIT", "starts_at": starts_at.isoformat(), "duration_minutes": 45, "capacity": 5}
    return manager.client.post("/api/v1/classes", json={**body, "trainer_id": trainer_id}).json()["id"]


def test_trainer_marks_attendance_of_their_own_class_only(manager, trainer, member, account):
    other = account("tia", role="trainer")
    class_id = _class(manager, trainer.id, datetime.now(timezone.utc) + timedelta(minutes=30))
    member.client.post(f"/api/v1/classes/{class_id}/bookings")
    path = f"/api/v1/classes/{class_id}/bookings/{member.id}/attendance"
    assert trainer.client.put(path, json={"attended": True}).json()["attended"] is True
    assert other.client.put(path, json={"attended": False}).status_code == 403
    assert member.client.put(path, json={"attended": True}).status_code == 403
    not_booked = f"/api/v1/classes/{class_id}/bookings/{other.id}/attendance"
    assert trainer.client.put(not_booked, json={"attended": True}).status_code == 404


def test_attendance_is_not_open_a_day_before(manager, trainer, member):
    class_id = _class(manager, trainer.id, datetime.now(timezone.utc) + timedelta(days=1))
    member.client.post(f"/api/v1/classes/{class_id}/bookings")
    path = f"/api/v1/classes/{class_id}/bookings/{member.id}/attendance"
    assert trainer.client.put(path, json={"attended": True}).status_code == 400


# --- Personal trainers ---


def test_a_trainer_sees_only_their_own_clients(manager, trainer, member, account, admin):
    other = account("tia", role="trainer")
    path = f"/api/v1/members/{member.id}"
    assert manager.client.patch(path, json={"trainer_id": manager.id}).status_code == 422  # not a trainer
    assert manager.client.patch(path, json={"trainer_id": trainer.id}).json()["trainer_name"] == "Karim"
    assert member.client.get("/api/v1/users/me/membership").json()["trainer_name"] == "Karim"

    clients = trainer.client.get("/api/v1/trainers/me/clients").json()
    assert [c["name"] for c in clients["items"]] == ["Rafi"]
    assert "date_of_birth" not in clients["items"][0] and "password_hash" not in clients["items"][0]
    assert other.client.get("/api/v1/trainers/me/clients").json()["total"] == 0
    assert member.client.get("/api/v1/trainers/me/clients").status_code == 403

    # Someone who stops being a trainer lets go of their clients.
    admin.client.patch(f"/api/v1/admin/users/{trainer.id}/role", json={"role": "user"})
    assert manager.client.get(path).json()["trainer_id"] is None


def test_deleting_a_former_trainers_account_leaves_their_clients(admin, manager, trainer, member):
    manager.client.patch(f"/api/v1/members/{member.id}", json={"trainer_id": trainer.id})
    admin.client.patch(f"/api/v1/admin/users/{trainer.id}/role", json={"role": "user"})
    manager.client.post("/api/v1/members", json={"email": trainer.email, "plan": "monthly"})
    assert admin.client.delete(f"/api/v1/members/{trainer.id}").status_code == 204
    assert manager.client.get(f"/api/v1/members/{member.id}").json()["trainer_id"] is None


# --- Training ---


def test_only_the_assigned_member_marks_a_workout_done(trainer, member, account):
    sara = account("sara")
    group = trainer.client.post("/api/v1/groups", json={"name": "Strength"}).json()["id"]
    for person in (member, sara):
        trainer.client.post(f"/api/v1/groups/{group}/members", json={"email": person.email})
    body = {"title": "Squats", "workout_date": TODAY.isoformat(), "group_id": group, "assigned_to": member.id}
    workout = trainer.client.post("/api/v1/workouts", json=body).json()["id"]
    path = f"/api/v1/workouts/{workout}/completion"

    assert trainer.client.put(path, json={"done": True}).status_code == 403
    assert sara.client.put(path, json={"done": True}).status_code == 403
    assert member.client.put(path, json={"done": True}).json()["completed_at"] is not None
    assert member.client.get("/api/v1/workouts/assigned").json()["total"] == 1
    # Given to someone else, it is not done any more.
    moved = trainer.client.put(f"/api/v1/workouts/{workout}/assignee", json={"user_id": sara.id}).json()
    assert moved["completed_at"] is None


def test_a_workout_needs_a_group(member):
    body = {"title": "Squats", "workout_date": TODAY.isoformat()}
    assert member.client.post("/api/v1/workouts", json=body).status_code == 422


# --- Equipment ---


def test_equipment_service_and_faults(manager, trainer, member):
    body = {
        "name": "Treadmill 1",
        "category": "cardio",
        "service_every_days": 30,
        "last_serviced_on": (TODAY - timedelta(days=40)).isoformat(),
    }
    assert trainer.client.post("/api/v1/equipment", json=body).status_code == 403
    item = manager.client.post("/api/v1/equipment", json=body).json()
    assert item["next_service_on"] == (TODAY - timedelta(days=10)).isoformat()
    assert manager.client.get("/api/v1/equipment?service_due=true").json()["total"] == 1

    path = f"/api/v1/equipment/{item['id']}"
    assert member.client.get("/api/v1/equipment").status_code == 403
    reported = trainer.client.post(f"{path}/report", json={"issue": "Belt slips"}).json()
    assert (reported["status"], reported["reported_by_name"]) == ("out_of_order", "Karim")
    assert manager.client.get("/api/v1/overview").json()["equipment_attention"] == 1
    assert trainer.client.post(f"{path}/service").status_code == 403

    serviced = manager.client.post(f"{path}/service").json()
    assert (serviced["status"], serviced["issue"]) == ("working", None)
    assert serviced["next_service_on"] == (TODAY + timedelta(days=30)).isoformat()
    assert manager.client.delete(path).status_code == 204


# --- Expenses ---


def test_expenses_and_net_income(admin, manager, member):
    assert manager.client.get("/api/v1/expenses").status_code == 403
    manager.client.post(f"/api/v1/members/{member.id}/payments", json={"amount": 5000, "method": "card"})
    body = {"category": "rent", "amount": 2000, "spent_on": TODAY.isoformat(), "description": "Hall"}
    expense = admin.client.post("/api/v1/expenses", json=body).json()
    tomorrow = (TODAY + timedelta(days=1)).isoformat()
    assert admin.client.post("/api/v1/expenses", json={**body, "spent_on": tomorrow}).status_code == 422

    revenue = admin.client.get("/api/v1/admin/revenue").json()
    assert (revenue["this_month"], revenue["expenses_this_month"], revenue["net_this_month"]) == (5000, 2000, 3000)
    assert admin.client.get("/api/v1/expenses?category=rent").json()["total_amount"] == 2000
    assert "Hall" in admin.client.get("/api/v1/expenses/export.csv").text

    assert admin.client.delete(f"/api/v1/expenses/{expense['id']}").status_code == 204
    log = admin.client.get("/api/v1/admin/activity?event=expense_delete").json()
    assert log["total"] == 1 and "2000" in log["items"][0]["details"]


# --- User details ---


def test_user_details_count_the_users_records(admin, manager, member):
    manager.client.post(f"/api/v1/members/{member.id}/check-ins")
    detail = admin.client.get(f"/api/v1/admin/users/{member.id}").json()
    assert detail["records"]["visits"] == 1
    assert detail["records"]["bookings"] == 0
    assert "password_hash" not in detail
