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
  app/services/   member_service.py, auth_service.py, user_service.py: rules and database queries
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
| User | Log in, see and rename their own account |
| Gym Manager | Everything a User can, plus manage gym members (add, edit, renew, freeze, delete) |
| Admin | Everything a Gym Manager can, plus list users and change their roles |

Pages: `#/login`, `#/signup`, `#/members` (Gym Manager, Admin), `#/users` (Admin), `#/account` (everyone).

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
| Health | `GET /api/health` | `200` `{"status": "ok"}` | |
| Sign up | `POST /api/v1/auth/signup` `{email, name, password}` | `201` user (role `user`) | `409`, `422` |
| Log in | `POST /api/v1/auth/login` `{email, password}` | `200` `{access_token, token_type, user}` | `401`, `422` |
| My account | `GET` / `PATCH /api/v1/users/me` | `200` user | `401`, `422` |
| List users (admin) | `GET /api/v1/admin/users?offset=0&limit=20` | `200` `{items, total, offset, limit}` | `401`, `403` |
| Change role (admin) | `PATCH /api/v1/admin/users/{id}/role` `{"role": "gym_manager"}` | `200` user | `400` (own role), `403`, `404`, `422` |

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

The backend accepts `postgres://` or `postgresql://` URLs and creates the `member` and `app_user` tables on start. To use Supabase locally as well, set `DATABASE_URL` in your terminal before `fastapi dev main.py`.

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
