"""Create the demo accounts and sample data through the Gym Buddy API.

    python scripts/seed_demo.py --base-url https://2321648gymbuddy.vercel.app

It only calls the public API, so every rule (validation, password hashing with the server's pepper, permissions) is
the same as in the app. Running it again skips what already exists.

Passwords never go into the repository. They are read from a JSON file outside it (default: your home folder,
gym-buddy-demo-passwords.json); if the file does not exist, random passwords are made and saved there. Hand them over
only in the submission form and the PDF report.

Nobody can make themselves an admin through the API (README, "First admin"). On the first run the script signs the
accounts up, then stops and prints one SQL line that makes the first demo admin an admin; run it in the Supabase SQL
editor (or sqlite3 locally) and run the script again.

Standard library only: any Python 3.10+ runs it, no virtual environment needed.
"""

from __future__ import annotations

import argparse
import json
import secrets
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

DOMAIN = "gymbuddy.example"  # .example is reserved (RFC 2606): these addresses can never receive mail.
DHAKA = timezone(timedelta(hours=6))  # Class times are written in the gym's local time and sent with their offset.


@dataclass(frozen=True)
class Account:
    key: str
    name: str
    role: str  # user, trainer, gym_manager or admin

    @property
    def email(self) -> str:
        return f"{self.key}@{DOMAIN}"


ACCOUNTS = [
    Account("admin.ayesha", "Ayesha Rahman", "admin"),
    Account("admin.imran", "Imran Hossain", "admin"),
    Account("manager.nadia", "Nadia Islam", "gym_manager"),
    Account("trainer.karim", "Karim Uddin", "trainer"),
    Account("rafi", "Rafi Ahmed", "user"),
    Account("sadia", "Sadia Karim", "user"),
    Account("tanim", "Tanim Chowdhury", "user"),
    Account("mitu", "Mitu Das", "user"),  # Signed up, no membership yet: shows on the waiting list.
]
BY_KEY = {account.key: account for account in ACCOUNTS}
FIRST_ADMIN = BY_KEY["admin.ayesha"]

GROUP_NAME = "Morning Crew"
GROUP_OWNER = "rafi"
# Mixed permissions: one member may add, one may add, edit and assign, one may only read.
GROUP_MEMBERS = {
    "sadia": {"can_create": True, "can_update": False, "can_assign": False},
    "trainer.karim": {"can_create": True, "can_update": True, "can_assign": True},
    "tanim": {"can_create": False, "can_update": False, "can_assign": False},
}


class ApiError(Exception):
    pass


class Api:
    def __init__(self, base_url: str) -> None:
        self.base_url = base_url.rstrip("/")

    def call(self, method: str, path: str, token: str | None = None, body: dict | None = None,
             expect: tuple[int, ...] = (200, 201, 204)) -> tuple[int, object]:
        data = json.dumps(body).encode() if body is not None else None
        request = urllib.request.Request(f"{self.base_url}/api/v1{path}", data=data, method=method)
        request.add_header("Accept", "application/json")
        if data is not None:
            request.add_header("Content-Type", "application/json")
        if token:
            request.add_header("Authorization", f"Bearer {token}")
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                status, raw = response.status, response.read()
        except urllib.error.HTTPError as error:
            status, raw = error.code, error.read()
        payload = json.loads(raw) if raw else None
        if status not in expect:
            detail = payload.get("detail") if isinstance(payload, dict) else payload
            raise ApiError(f"{method} {path} answered {status}: {detail}")
        return status, payload


def load_passwords(path: Path) -> dict[str, str]:
    """One password per demo email, kept in a file outside the repository."""
    passwords: dict[str, str] = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    alphabet = "abcdefghjkmnpqrstuvwxyz23456789"  # No look-alikes (l, 1, o, 0), so they are easy to type.
    missing = [account.email for account in ACCOUNTS if account.email not in passwords]
    for email in missing:
        passwords[email] = "-".join("".join(secrets.choice(alphabet) for _ in range(4)) for _ in range(4))
    if missing:
        path.write_text(json.dumps(passwords, indent=2) + "\n", encoding="utf-8")
        print(f"Saved {len(missing)} new password(s) to {path} (keep this file out of git).")
    return passwords


def log_in_everyone(api: Api, passwords: dict[str, str]) -> dict[str, dict]:
    """Sign up the accounts that do not exist yet, then log each one in. Returns {key: {"token", "user"}}."""
    sessions: dict[str, dict] = {}
    for account in ACCOUNTS:
        password = passwords[account.email]
        status, _ = api.call("POST", "/auth/signup", body={"email": account.email, "name": account.name,
                                                           "password": password}, expect=(201, 409))
        print(f"  {'signed up' if status == 201 else 'exists   '} {account.email}")
        try:
            _, login = api.call("POST", "/auth/login", body={"email": account.email, "password": password})
        except ApiError as error:
            raise ApiError(f"{account.email} exists but cannot log in with the saved password ({error}).") from None
        sessions[account.key] = {"token": login["access_token"], "user": login["user"]}
    return sessions


def set_roles(api: Api, sessions: dict[str, dict]) -> None:
    admin = sessions[FIRST_ADMIN.key]["token"]
    for account in ACCOUNTS:
        user = sessions[account.key]["user"]
        if user["role"] != account.role:
            api.call("PATCH", f"/admin/users/{user['id']}/role", admin, {"role": account.role})
            print(f"  {account.email}: {user['role']} -> {account.role}")
            user["role"] = account.role  # The server reads the role on every request, so the token still works.


def seed_memberships(api: Api, sessions: dict[str, dict], today: date) -> None:
    staff = sessions["manager.nadia"]["token"]
    _, plans = api.call("GET", "/plans", staff)
    price = {plan["plan"]: plan["price"] for plan in plans}
    memberships = [
        # key, plan, joined, expires, phone, notes, payment method, frozen
        ("rafi", "monthly", today - timedelta(days=25), today + timedelta(days=5), "01711000001",
         "Prefers morning sessions", "cash", False),
        ("sadia", "quarterly", today - timedelta(days=20), today + timedelta(days=70), "01711000002",
         None, "mobile_banking", False),
        ("tanim", "yearly", today - timedelta(days=100), today + timedelta(days=265), "01711000003",
         "Frozen while travelling", "card", True),
    ]
    for key, plan, joined, expires, phone, notes, method, frozen in memberships:
        member_id = sessions[key]["user"]["id"]
        status, _ = api.call("GET", f"/members/{member_id}", staff, expect=(200, 404))
        if status == 200:
            print(f"  {key}: already a member")
            continue
        api.call("POST", "/members", staff, {"email": BY_KEY[key].email, "plan": plan, "joined_on": joined.isoformat(),
                                             "expires_on": expires.isoformat(), "phone": phone, "notes": notes})
        api.call("POST", f"/members/{member_id}/payments", staff,
                 {"amount": price[plan], "method": method, "note": f"{plan.capitalize()} plan"})
        if frozen:
            api.call("PATCH", f"/members/{member_id}", staff, {"is_frozen": True})
        print(f"  {key}: {plan} membership{' (frozen)' if frozen else ''}, payment of {price[plan]} taka")

    _, today_list = api.call("GET", "/check-ins/today?limit=100", staff)
    checked_in = {row["member_id"] for row in today_list["items"]}
    for key in ("rafi", "sadia"):
        member_id = sessions[key]["user"]["id"]
        if member_id not in checked_in:
            api.call("POST", f"/members/{member_id}/check-ins", staff)
            print(f"  {key}: checked in today")


def seed_classes(api: Api, sessions: dict[str, dict], today: date) -> dict[str, int]:
    staff = sessions["manager.nadia"]["token"]
    trainer_id = sessions["trainer.karim"]["user"]["id"]

    def at(days: int, hour: int) -> str:
        day = today + timedelta(days=days)
        return datetime(day.year, day.month, day.day, hour, 0, tzinfo=DHAKA).isoformat()

    classes = [
        {"name": "Morning HIIT", "starts_at": at(1, 7), "duration_minutes": 45, "capacity": 12, "trainer_id": trainer_id,
         "description": "High-intensity intervals. Bring water and a towel."},
        {"name": "Evening Yoga Flow", "starts_at": at(2, 18), "duration_minutes": 60, "capacity": 15,
         "trainer_id": trainer_id, "description": "All levels welcome. Mats are provided."},
        {"name": "Strength Basics", "starts_at": at(3, 17), "duration_minutes": 50, "capacity": 2,
         "description": "Squat, bench and deadlift technique in a small group."},
    ]
    _, existing = api.call("GET", "/classes?upcoming=true&limit=100", staff)
    ids = {row["name"]: row["id"] for row in existing["items"]}
    for body in classes:
        if body["name"] not in ids:
            _, created = api.call("POST", "/classes", staff, body)
            ids[body["name"]] = created["id"]
            print(f"  class {body['name']} on {body['starts_at'][:16].replace('T', ' ')} (Dhaka time)")
    return ids


def seed_bookings(api: Api, sessions: dict[str, dict], class_ids: dict[str, int]) -> None:
    bookings = {"rafi": ["Morning HIIT", "Evening Yoga Flow", "Strength Basics"], "sadia": ["Morning HIIT", "Strength Basics"]}
    for key, names in bookings.items():
        for name in names:
            status, _ = api.call("POST", f"/classes/{class_ids[name]}/bookings", sessions[key]["token"], expect=(201, 409))
            if status == 201:
                print(f"  {key} booked {name}")


def seed_announcements(api: Api, sessions: dict[str, dict], today: date) -> None:
    staff = sessions["manager.nadia"]["token"]
    announcements = [
        {"title": "Welcome to Gym Buddy", "message": "Book classes, see your visits and payments, and log your "
         "workouts in the app.\nAsk at the front desk if you need help."},
        {"title": "New Evening Yoga Flow class", "message": "Karim now runs a 60-minute yoga class in the evenings. "
         "Places are limited, so book in the app.", "ends_on": (today + timedelta(days=30)).isoformat()},
    ]
    _, existing = api.call("GET", "/announcements?include_ended=true&limit=100", staff)
    titles = {row["title"] for row in existing["items"]}
    for body in announcements:
        if body["title"] not in titles:
            api.call("POST", "/announcements", staff, body)
            print(f"  announcement {body['title']}")


def seed_workouts(api: Api, sessions: dict[str, dict], today: date) -> None:
    personal = {
        "rafi": [("Leg day", -1, "Squats 5x5 at 80 kg, lunges, calf raises."), ("Upper body", 1, None)],
        "sadia": [("5 km run", -2, "28 minutes. Felt good."), ("Mobility and stretching", 0, None)],
        "tanim": [("Swimming", -3, "30 laps.")],
        "trainer.karim": [("Plan next week's HIIT", 2, "Six stations, 40 s on and 20 s off.")],
    }
    for key, rows in personal.items():
        token = sessions[key]["token"]
        _, existing = api.call("GET", "/workouts?limit=100", token)
        titles = {row["title"] for row in existing["items"]}
        for title, offset, notes in rows:
            if title not in titles:
                api.call("POST", "/workouts", token, {"title": title, "notes": notes,
                                                      "workout_date": (today + timedelta(days=offset)).isoformat()})
                print(f"  {key}: workout {title}")


def seed_group(api: Api, sessions: dict[str, dict], today: date) -> None:
    owner = sessions[GROUP_OWNER]["token"]
    _, groups = api.call("GET", "/groups?limit=100", owner)
    group = next((row for row in groups["items"] if row["name"] == GROUP_NAME and row["owner_id"] ==
                  sessions[GROUP_OWNER]["user"]["id"]), None)
    if group is None:
        _, group = api.call("POST", "/groups", owner, {"name": GROUP_NAME})
        print(f"  group {GROUP_NAME} owned by {GROUP_OWNER}")
    group_id = group["id"]

    _, people = api.call("GET", f"/groups/{group_id}/members", owner)
    current = {row["user_id"]: row for row in people}
    for key, flags in GROUP_MEMBERS.items():
        user_id = sessions[key]["user"]["id"]
        if user_id not in current:
            api.call("POST", f"/groups/{group_id}/members", owner, {"email": BY_KEY[key].email, **flags})
            print(f"  {key} added to {GROUP_NAME} {flags}")
        elif any(current[user_id][name] != value for name, value in flags.items()):
            api.call("PATCH", f"/groups/{group_id}/members/{user_id}", owner, flags)
            print(f"  {key}: permissions in {GROUP_NAME} set to {flags}")

    workouts = [
        # added by, title, days from today, notes, assigned to
        (GROUP_OWNER, "Saturday long run", 4, "8 km easy pace. Meet at the gym at 6:30.", "sadia"),
        ("trainer.karim", "Week 1 circuit", 1, "Burpees, kettlebell swings, rows: 4 rounds.", "tanim"),
        ("sadia", "Core finisher", 2, "Plank 3 x 60 s, dead bugs, side planks.", None),
    ]
    _, existing = api.call("GET", f"/groups/{group_id}/workouts?limit=100", owner)
    titles = {row["title"] for row in existing["items"]}
    for key, title, offset, notes, assignee in workouts:
        if title in titles:
            continue
        body = {"title": title, "notes": notes, "group_id": group_id,
                "workout_date": (today + timedelta(days=offset)).isoformat()}
        if assignee:
            body["assigned_to"] = sessions[assignee]["user"]["id"]
        api.call("POST", "/workouts", sessions[key]["token"], body)
        print(f"  {key} added {title} to {GROUP_NAME}" + (f", assigned to {assignee}" if assignee else ""))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--base-url", required=True, help="the site, e.g. https://2321648gymbuddy.vercel.app or "
                        "http://localhost:8000")
    parser.add_argument("--passwords", type=Path, default=Path.home() / "gym-buddy-demo-passwords.json",
                        help="JSON file of {email: password}, outside the repository (default: %(default)s)")
    args = parser.parse_args()
    sys.stdout.reconfigure(line_buffering=True)  # Show progress as it happens, even when piped to a file.

    api = Api(args.base_url)
    today = datetime.now(timezone.utc).date()
    try:
        passwords = load_passwords(args.passwords)
        print("Accounts")
        sessions = log_in_everyone(api, passwords)
        if sessions[FIRST_ADMIN.key]["user"]["role"] != "admin":
            print(f"\n{FIRST_ADMIN.email} is not an admin yet, and only an admin can give roles. Run this once in the "
                  f"Supabase SQL editor (or sqlite3 backend/gym_buddy.db locally), then run the script again:\n\n"
                  f"  update app_user set role = 'admin' where email = '{FIRST_ADMIN.email}';\n")
            return 2
        print("Roles")
        set_roles(api, sessions)
        print("Memberships, payments and check-ins")
        seed_memberships(api, sessions, today)
        print("Classes and bookings")
        class_ids = seed_classes(api, sessions, today)
        seed_bookings(api, sessions, class_ids)
        print("Announcements")
        seed_announcements(api, sessions, today)
        print("Workouts and the shared group")
        seed_workouts(api, sessions, today)
        seed_group(api, sessions, today)
    except (ApiError, urllib.error.URLError) as error:
        print(f"\nStopped: {error}", file=sys.stderr)
        return 1
    print("\nDone. Every account logs in with the password saved in", args.passwords)
    return 0


if __name__ == "__main__":
    sys.exit(main())
