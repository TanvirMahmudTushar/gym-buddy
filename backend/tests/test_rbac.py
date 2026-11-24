# Role and resource permissions (app/rbac.py, SRS 3.11): roles on admin and staff routes, private groups, group
# permissions, and the admin safety rules.
import pytest

import main

# Every admin GET route without a path parameter (stats, revenue, users, activity, security, moderation lists, CSVs).
ADMIN_GETS = sorted(
    path
    for path, operations in main.app.openapi()["paths"].items()
    if path.startswith("/api/v1/admin/") and "get" in operations and "{" not in path
)


def test_the_sweep_found_the_admin_routes():
    assert len(ADMIN_GETS) >= 10


@pytest.mark.parametrize("role", ["user", "trainer", "gym_manager"])
def test_non_admins_get_403_on_every_admin_route(account, role):
    caller = account("caller", role=role)
    codes = {path: caller.client.get(path).status_code for path in ADMIN_GETS}
    assert set(codes.values()) == {403}, codes


def test_admin_gets_200_on_every_admin_route(account):
    admin = account("ada", role="admin")
    codes = {path: admin.client.get(path).status_code for path in ADMIN_GETS}
    assert set(codes.values()) == {200}, codes


def test_visitor_gets_401_on_admin_routes(anon):
    assert {anon.get(path).status_code for path in ADMIN_GETS} == {401}


def test_user_cannot_use_staff_routes_but_a_gym_manager_can(account):
    user = account("rafi")
    manager = account("gus", role="gym_manager")
    assert user.client.get("/api/v1/members").status_code == 403
    assert manager.client.get("/api/v1/members").status_code == 200
    assert manager.client.get("/api/v1/admin/stats").status_code == 403


def test_role_change_applies_on_the_next_request(account):
    admin = account("ada", role="admin")
    trainer = account("tia", role="trainer")
    assert trainer.client.get("/api/v1/trainers/me/classes").status_code == 200
    admin.client.patch(f"/api/v1/admin/users/{trainer.id}/role", json={"role": "user"})
    # Same access token: the role is read from the database on every request, never from the token.
    assert trainer.client.get("/api/v1/trainers/me/classes").status_code == 403


def test_members_cannot_start_a_group_but_trainers_and_staff_can(account):
    assert account("rafi").client.post("/api/v1/groups", json={"name": "Mine"}).status_code == 403
    for role in ("trainer", "gym_manager", "admin"):
        caller = account(role.replace("_", ""), role=role)
        assert caller.client.post("/api/v1/groups", json={"name": "Strength"}).status_code == 201


def test_a_group_and_its_workouts_are_404_for_an_outsider(account):
    trainer = account("karim", role="trainer")
    outsider = account("sara")
    admin = account("ada", role="admin")
    group = trainer.client.post("/api/v1/groups", json={"name": "Strength"}).json()["id"]
    workout = trainer.client.post(
        "/api/v1/workouts", json={"title": "Leg day", "workout_date": "2026-11-20", "group_id": group}
    ).json()
    path = f"/api/v1/workouts/{workout['id']}"
    assert trainer.client.get(path).status_code == 200
    for client in (outsider.client, admin.client):  # an admin too: only moderation reaches other people's groups
        assert client.get(f"/api/v1/groups/{group}").status_code == 404
        assert client.get(path).status_code == 404
        assert client.patch(path, json={"title": "Changed"}).status_code == 404
        assert client.delete(path).status_code == 404


def test_a_user_cannot_reach_another_users_records(account):
    rafi = account("rafi")
    sara = account("sara")
    session_id = sara.client.get("/api/v1/users/me/sessions").json()[0]["id"]
    # Another person's login session answers 404, as if it did not exist; their membership record needs staff (403).
    assert rafi.client.delete(f"/api/v1/users/me/sessions/{session_id}").status_code == 404
    assert rafi.client.get(f"/api/v1/members/{sara.id}").status_code == 403
    assert rafi.client.get(f"/api/v1/members/{sara.id}/payments").status_code == 403


def test_group_member_without_can_update_gets_403_and_with_it_200(account):
    owner = account("karim", role="trainer")
    member = account("sara")
    outsider = account("nadia")
    group = owner.client.post("/api/v1/groups", json={"name": "Morning crew"}).json()["id"]
    owner.client.post(f"/api/v1/groups/{group}/members", json={"email": member.email})
    workout = owner.client.post(
        "/api/v1/workouts", json={"title": "Circuit", "workout_date": "2026-11-20", "group_id": group}
    ).json()["id"]
    path = f"/api/v1/workouts/{workout}"

    assert member.client.get(path).status_code == 200  # every member can read
    assert member.client.patch(path, json={"title": "Changed"}).status_code == 403
    assert outsider.client.patch(path, json={"title": "Changed"}).status_code == 404

    owner.client.patch(f"/api/v1/groups/{group}/members/{member.id}", json={"can_update": True})
    assert member.client.patch(path, json={"title": "Changed"}).status_code == 200


def test_only_the_owner_renames_or_deletes_a_group(account):
    owner = account("karim", role="trainer")
    member = account("sara")
    group = owner.client.post("/api/v1/groups", json={"name": "Morning crew"}).json()["id"]
    owner.client.post(
        f"/api/v1/groups/{group}/members",
        json={"email": member.email, "can_create": True, "can_update": True, "can_assign": True},
    )
    assert member.client.patch(f"/api/v1/groups/{group}", json={"name": "Mine now"}).status_code == 403
    assert member.client.delete(f"/api/v1/groups/{group}").status_code == 403
    assert owner.client.delete(f"/api/v1/groups/{group}").status_code == 204


def test_admin_cannot_ban_another_admin_or_themself(account):
    admin = account("ada", role="admin")
    other_admin = account("abe", role="admin")
    user = account("rafi")
    refused = admin.client.post(f"/api/v1/admin/users/{other_admin.id}/ban")
    assert refused.status_code == 400 and "admin" in refused.json()["detail"]
    assert admin.client.post(f"/api/v1/admin/users/{admin.id}/ban").status_code == 400
    assert admin.client.post(f"/api/v1/admin/users/{user.id}/ban").status_code == 200


def test_bulk_ban_skips_admins_and_bans_the_rest(account):
    admin = account("ada", role="admin")
    other_admin = account("abe", role="admin")
    user = account("rafi")
    result = admin.client.post("/api/v1/admin/users/bulk-ban", json={"ids": [user.id, other_admin.id]}).json()
    assert result["banned"] == [user.id]
    assert [s["id"] for s in result["skipped"]] == [other_admin.id]


def test_admin_cannot_change_their_own_role(account):
    admin = account("ada", role="admin")
    assert admin.client.patch(f"/api/v1/admin/users/{admin.id}/role", json={"role": "user"}).status_code == 400
