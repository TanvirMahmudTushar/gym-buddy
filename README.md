# Gym Buddy

A simple gym management system: front-desk staff add, view, edit, renew, freeze and delete gym members on one page. FastAPI backend + Vite/React/TypeScript frontend, deployed to Vercel as one project, with Supabase PostgreSQL as the database.

This is the **MVP** (mid-term). The plan for the Beta (accounts, roles, class bookings, check-ins) is in the docs.

```
backend/          FastAPI app (routes under /api)
  main.py         creates the app, error handler, health check
  app/database.py engine and session (Supabase or local SQLite)
  app/models.py   Member and user tables and request / response schemas
  app/security.py password hashing (Argon2) and login tokens (JWT)
  app/deps.py     who is calling, and the role check
  app/routers/    members.py, auth.py, users.py, admin.py: the endpoints (HTTP only)
  app/services/   member_service.py, auth_service.py, user_service.py, checkin_service.py, class_service.py, stats_service.py: rules and database queries
frontend/         Vite + React + TypeScript, one page (src/pages/HomePage/index.tsx)
  src/components/ add form, member list, details panel
  src/context/    AuthContext.tsx: who is logged in
  src/layouts/    AppLayout.tsx: header with the pages each role may open
  src/services/   memberService.ts: fetch calls to the API
  src/types/      member.ts: TypeScript types
  src/utils/      member.ts: display helpers
docs/             PRD, SRS and TDD
vercel.json       Vercel setup: /api/* goes to backend, everything else to frontend
```

## Documents

- [Product Requirements Document (PRD)](docs/01-prd.md)
- [Software Requirements Specification (SRS)](docs/02-srs.md)
- [Technical Design Document (TDD)](docs/03-tdd.md)

## Accounts and roles

Everyone who signs up is a **User**. Only an admin can change a role.

| Role | Can do |
|---|---|
| User | Log in, see and rename their own account, see their own membership and visits, book and cancel classes, change their password |
| Gym Manager | Everything a User can, plus manage gym members (add, edit, renew, freeze, delete), record check-ins and run the class timetable |
| Admin | Everything a Gym Manager can, plus list users and change their roles |

Pages: `#/login`, `#/signup`, `#/dashboard` (Admin), `#/members` (Gym Manager, Admin), `#/classes` (Gym Manager, Admin), `#/users` (Admin), `#/membership` and `#/timetable` (User), `#/account` (everyone). After logging in, an Admin lands on the Dashboard, a Gym Manager on Members and a User on My membership.

**Gym Manager features (also available to Admins)**
- **Check in a member:** open a member on the Members page and click **Check in**. Frozen and expired members cannot be checked in (the page says why; renew or unfreeze first). The same member can check in more than once a day.
- **Visit history:** each member's visits, newest first, with who recorded each one.
- **Checked in today:** a card at the top of the Members page lists everyone who has arrived since midnight UTC. Click a name to open that member.
- Deleting a member also deletes their check-ins and class bookings.
- **Classes:** the **Classes** page lists upcoming classes (or all of them), in start-time order. Add a class with a name, start time, length (15 to 240 minutes) and places (1 to 200), plus an optional trainer and description. Edit or delete a class, and open **Bookings** to see who has booked it. Capacity cannot be lowered below the bookings already made, and deleting a class deletes its bookings. A member's bookings are made by the member (see **User features**).
- **Link an account to a member:** in a member's details, **Linked account** takes the person's account email and links it, so that person can see their own membership and book classes. One account can be linked to only one member. Unlink at any time. Without a link, a User sees "Your account is not linked to a gym membership yet".

**User features**
- **My membership:** plan, status, joined and expiry dates, and the person's own visits, newest first. A User can only ever see their own record.
- **Classes:** upcoming classes with places left. **Book** takes a place, **Cancel booking** frees it. Booking needs a valid membership (not frozen or expired) and a class that has not started; a full class or one you already booked is refused with a clear message. Two people booking the last place at the same moment cannot both get it.
- **My account:** change your name, and change your password. After a password change every earlier login stops working and you log in again with the new password.

**Admin features**
- **Dashboard:** members (total, active, expired, frozen, new in the last 7 days), check-ins (today, last 7 days), classes (total, upcoming) and accounts (total, users, gym managers, admins, banned).
- **Ban / unban:** on the **Users** page, an admin can ban a User or Gym Manager with an optional reason. A banned person gets `403 Account banned` when logging in and on every request, even with a token that has not expired, and the app logs them out. Unbanning restores access with their role and data unchanged. An admin cannot ban themself or another admin; change the other admin's role first.

**First admin.** Nobody can make themselves an admin. Sign up in the app, then in Supabase → **Table Editor** → `app_user`, set that row's `role` to `admin` (or run `update app_user set role = 'admin' where email = 'you@example.com';` in the SQL editor). Log in again. From then on, change roles on the **Users** page.

**`JWT_SECRET`.** Login tokens are signed with the `JWT_SECRET` environment variable (at least 32 bytes). Locally it is optional: without it the backend makes a temporary secret and you log in again after each restart. On Vercel it is required; generate one with `python -c "import secrets; print(secrets.token_urlsafe(48))"` and add it under **Settings** → **Environment Variables**.

## REST API

Interactive docs: `/api/docs` (for example http://localhost:8000/api/docs).

| Operation | Method and path | Success | Errors |
|---|---|---|---|
| Create | `POST /api/v1/members` | `201` member | `422` |
| Read list | `GET /api/v1/members?offset=0&limit=20&status=active` | `200` `{items, total, offset, limit}`, newest first | `422` |
| Read single | `GET /api/v1/members/{id}` | `200` member | `404` |
| Update | `PATCH /api/v1/members/{id}` | `200` member | `404`, `422` |
| Delete | `DELETE /api/v1/members/{id}` | `204` | `404` |
| Delete several | `POST /api/v1/members/bulk-delete` with `{"ids": [1, 2, 3]}` | `200` `{"deleted": 3}` | `422` |
| Check in a member | `POST /api/v1/members/{id}/check-ins` | `201` check-in | `400` (frozen or expired), `403`, `404` |
| Member's visits | `GET /api/v1/members/{id}/check-ins?offset=0&limit=20` | `200` `{items, total, offset, limit}`, newest first | `403`, `404`, `422` |
| Checked in today | `GET /api/v1/check-ins/today?offset=0&limit=50` | `200` `{items, total, offset, limit}`, newest first | `401`, `403` |
| Add a class | `POST /api/v1/classes` `{name, starts_at, duration_minutes, capacity, ...}` | `201` class | `403`, `422` |
| List classes | `GET /api/v1/classes?upcoming=true&offset=0&limit=20` (any logged-in user) | `200` `{items, total, offset, limit}` ordered by start time, each with `booked_count` | `401`, `422` |
| One class | `GET /api/v1/classes/{id}` (any logged-in user) | `200` class | `401`, `404` |
| Edit a class | `PATCH /api/v1/classes/{id}` | `200` class | `403`, `404`, `422` (including capacity below the bookings) |
| Delete a class | `DELETE /api/v1/classes/{id}` | `204` | `403`, `404` |
| Class bookings | `GET /api/v1/classes/{id}/bookings` | `200` `{items, total, offset, limit}` with member name and time | `403`, `404` |
| Book a class | `POST /api/v1/classes/{id}/bookings` (for the logged-in account's own member) | `201` booking | `400` (membership not valid or class started), `404` (no linked membership or class), `409` (full or already booked) |
| Cancel my booking | `DELETE /api/v1/classes/{id}/bookings` | `204` | `404` |
| Link an account | `PATCH /api/v1/members/{id}` with `{"user_id": 5}` (`null` unlinks) | `200` member | `409` (account already linked), `422` (no such account) |
| Find an account (staff) | `GET /api/v1/users/lookup?email=...` or `?id=...` | `200` `{id, name, email}` | `403`, `404`, `422` |
| My membership | `GET /api/v1/users/me/membership` | `200` member | `401`, `404` (nothing linked) |
| My visits | `GET /api/v1/users/me/check-ins?offset=0&limit=20` | `200` `{items, total, offset, limit}`, newest first | `401`, `404` |
| Change my password | `POST /api/v1/users/me/password` `{current_password, new_password}` | `204` | `400` (wrong current password), `401`, `422` |
| Health | `GET /api/health` | `200` `{"status": "ok"}` | |
| Sign up | `POST /api/v1/auth/signup` `{email, name, password}` | `201` user (role `user`) | `409`, `422` |
| Log in | `POST /api/v1/auth/login` `{email, password}` | `200` `{access_token, token_type, user}` | `401`, `422` |
| My account | `GET` / `PATCH /api/v1/users/me` | `200` user | `401`, `422` |
| Dashboard stats (admin) | `GET /api/v1/admin/stats` | `200` `{members, users}` counts | `401`, `403` |
| List users (admin) | `GET /api/v1/admin/users?offset=0&limit=20` | `200` `{items, total, offset, limit}`; each user has `is_banned`, `banned_at`, `ban_reason` | `401`, `403` |
| Change role (admin) | `PATCH /api/v1/admin/users/{id}/role` `{"role": "gym_manager"}` | `200` user | `400` (own role), `403`, `404`, `422` |
| Ban (admin) | `POST /api/v1/admin/users/{id}/ban` `{"reason": "optional"}` | `200` user | `400` (self or another admin), `403`, `404`, `422` |
| Unban (admin) | `POST /api/v1/admin/users/{id}/unban` | `200` user | `403`, `404` |

- Every `/api/v1/members` endpoint needs `Authorization: Bearer <access_token>` from a Gym Manager or Admin: `401` without a token, `403` for a User.
- `status` filter: `active` (valid), `expired` (expiry date passed) or `frozen` (`is_active = false`).
- `total` counts every member matching the filter, not just the page returned.
- `PATCH` changes only the fields sent: a later `expires_on` renews, `is_active: false` freezes.

Example body for `POST`:

```json
{ "full_name": "Rafi Ahmed", "phone": "01700000000", "plan": "monthly", "expires_on": "2026-12-01", "notes": "Prefers morning sessions" }
```

## Requirements

- [Python](https://www.python.org/downloads/) 3.10+
- [Node.js](https://nodejs.org/) 22+

> On macOS/Linux, use `python3` instead of `python`.

## Run locally

**Backend** (terminal 1):

```bash
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1      # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
fastapi dev main.py
```

With no `DATABASE_URL` set, the backend uses a local SQLite file, `backend/gym_buddy.db`, created on first start.

**Frontend** (terminal 2):

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. Vite forwards `/api` requests to the backend on port 8000.

To run it the way Vercel does instead, from the project root:

```bash
npm install -g vercel
vercel dev -L
```

> Add new Python packages to `backend/requirements.txt`.

## Database (Supabase)

1. Create a project at https://supabase.com and save the database password.
2. **Connect** → **Transaction pooler** → copy the URI (port `6543`).
3. In Vercel → Project → **Settings** → **Environment Variables**, add it as `DATABASE_URL`, then redeploy.

The backend accepts `postgres://` or `postgresql://` URLs and creates the `member`, `app_user`, `check_in`, `gym_class` and `class_booking` tables on start, and adds any columns an older `app_user` table is missing (the ban columns), keeping existing data. To use Supabase locally as well, set `DATABASE_URL` in your terminal before `fastapi dev main.py`.

Free-tier Supabase projects pause after a week with no activity; open the dashboard and restore the project before a demo if needed.

## Deploy to Vercel

1. Push the repo to GitHub.
2. Go to https://vercel.com/new, import the repo and click **Deploy**. Keep **Root Directory** as `./`.
3. Set `DATABASE_URL` as above. Without it, data is kept only in `/tmp` and is lost between requests.
4. Set `JWT_SECRET` (see **Accounts and roles**). Without it, login and the members API return `500`.

Every push to `main` redeploys automatically. Or deploy from your machine with `vercel --prod`.

## Troubleshooting

- **"Running scripts is disabled" in PowerShell:** run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.
- **`fastapi` not found:** activate the virtual environment first.
- **`'FastAPI' object has no attribute 'frontend'`:** your FastAPI is too old; run `pip install -r requirements.txt` again.
- **`Request failed: 500` in the app:** the backend isn't running, or it can't reach the database (check `DATABASE_URL`).
- **App at localhost:8000 shows an old version:** delete `frontend/dist`.
- **Vercel build fails:** check **Build Logs** in the Vercel dashboard, and make sure `npm run build` works in `frontend/`.
