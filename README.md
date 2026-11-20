# Gym Buddy

A simple gym management system: front-desk staff add, view, edit, renew, freeze and delete gym members on one page. FastAPI backend + Vite/React/TypeScript frontend, deployed to Vercel as one project, with Supabase PostgreSQL as the database.

This is the **MVP** (mid-term). The plan for the Beta (accounts, roles, class bookings, check-ins) is in the docs.

```
backend/          FastAPI app (routes under /api)
  main.py         creates the app, error handler, health check
  app/database.py engine and session (Supabase or local SQLite)
  app/models.py   tables (a member is a user with a membership) and request / response schemas
  app/security.py password hashing (Argon2) and login tokens (JWT)
  app/deps.py     who is calling, and the role check
  app/routers/    members.py, auth.py, users.py, admin.py, check_ins.py, classes.py, plans.py, payments.py: the endpoints (HTTP only)
  app/services/   member_service.py, auth_service.py, user_service.py, checkin_service.py, class_service.py, payment_service.py, stats_service.py, revenue_service.py: rules and database queries
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

**Members are users.** There is no separate member table: a member is a user whose account has a membership (a plan, joined and expiry dates, a frozen flag, phone and notes). The person signs up first, then staff start their membership.

| Role | Can do |
|---|---|
| User | Log in, see and rename their own account, see their own membership, visits and payments, book and cancel classes, change their password |
| Gym Manager | Everything a User can, plus manage gym members (add, edit, renew, freeze, delete), record check-ins, take payments and see the list of all payments, and run the class timetable |
| Admin | Everything a Gym Manager can, plus list users and change their roles, set plan prices, void payments and export them as CSV |

Pages: `#/login`, `#/signup`, `#/dashboard` (Admin), `#/overview` (Gym Manager, Admin), `#/members` (Gym Manager, Admin), `#/classes` (Gym Manager, Admin), `#/payments` (Gym Manager, Admin), `#/users` (Admin), `#/plans` (Admin), `#/membership` and `#/timetable` (User), `#/account` (everyone). After logging in, an Admin lands on the Dashboard, a Gym Manager on the Overview and a User on My membership.

**Gym Manager features (also available to Admins)**
- **Check in a member:** open a member on the Members page and click **Check in**. Frozen and expired members cannot be checked in (the page says why; renew or unfreeze first). The same member can check in more than once a day.
- **Visit history:** each member's visits, newest first, with who recorded each one.
- **A member's bookings:** in the member details, **Bookings** lists the classes they booked, soonest first, with **Cancel** so the front desk can cancel for them; **Show past bookings** lists the classes that have already started.
- **Renewals due:** the **Expiring soon** chip on the Members page lists the active (not frozen) memberships that end today or within the next 7 days, soonest first, so staff know who to remind. Every member whose expiry is that close shows "today", "tomorrow" or "in 5 days" next to the date. The filter is kept in the address (`#/members?filter=expiring_soon`), so the Dashboard can link to it.
- **Checked in today:** a card at the top of the Members page lists everyone who has arrived since midnight UTC. Click a name to open that member.
- **Find a member:** the search box on the Members page finds members by part of their name, email or phone, in any case, together with the status chips.
- **Waiting for a membership:** a card on the Members page lists the people who signed up in the app but have no membership yet, newest first, with its own search. **Start membership** fills their email into **Add member** and moves to the plan, so nobody types an email by hand.
- **Add a member:** the person signs up first. On the Members page, **Add member** takes the email they signed up with, plus plan, expiry date and optional phone and notes; their name comes from their account. An email with no account is refused ("Ask the person to sign up first"), and so is an account that already has a membership.
- **Open a member from anywhere:** every member's name in the Payments list, a class's bookings and Checked in today opens that member on the Members page. The address keeps the open member and the filter (`#/members?filter=expiring_soon&member=5`), so a reload or a shared link shows the same.
- **Delete a member:** deletes the person's whole account. They can no longer log in, and their check-ins and class bookings are removed; their payments stay on record. Only a User's account can be deleted here: a Gym Manager or Admin who has a membership must have their role changed first.
- **Classes:** the **Classes** page lists upcoming classes (or all of them), in start-time order. Add a class with a name, start time, length (15 to 240 minutes) and places (1 to 200), plus an optional trainer and description. Edit or delete a class, and open **Bookings** to see who has booked it. Capacity cannot be lowered below the bookings already made, and deleting a class deletes its bookings. A member's bookings are made by the member (see **User features**).

- **Payments:** in a member's details, **Payments** records what the member paid (amount in whole taka, and cash, card, bank transfer or mobile banking, with an optional note). Tick **Renew the membership with this payment**, pick the plan, and the amount fills in from the plan's price and the new expiry date is shown. An active member renews from their current expiry, so no paid days are lost; an expired member renews from today. The member's payments are listed below, newest first; a voided one is struck through with the reason. A payment stays on record when its member's account is deleted.
- **Overview:** a Gym Manager's start page (Admins can open it too) with what needs attention today: members checked in today, memberships expiring in 7 days, people waiting for a membership, and payments taken today (amount and count, voided left out), plus the next 5 classes with places booked. Each number links to its list, which shows the same number: Checked in today on Members, the Expiring soon filter, the waiting list, and the Payments page filtered to today. Revenue history and account numbers stay on the admin Dashboard.
- **All payments:** the **Payments** page lists every payment, newest first, with filters for dates (From and To, both included, in UTC), method and part of the member's name. Above the list is the total of the matching payments, for every page and not just the rows shown. The From and To dates are kept in the address (`#/payments?from=2026-11-20&to=2026-11-20`), so a link can open the list on a day. Voided payments are hidden unless **Show voided payments** is ticked, and never count towards the total. **Load more** shows the next 20.

**User features**
- **My membership:** plan, status, joined and expiry dates, and the person's own visits, newest first. A User can only ever see their own record. Before staff start a membership, the page says so and shows the email to give the front desk.
- **My bookings:** on My membership, the person's upcoming classes with **Cancel**, past classes on request, and a link to book another.
- **Plans and prices:** on My membership, what each plan costs and how many days it adds, with the person's own plan marked, and how renewing at the front desk works.
- **My payments:** on My membership, the person's own payments, newest first. A voided payment shows as voided with the reason. Nobody can see another person's payments.
- **Classes:** upcoming classes with places left. **Book** takes a place, **Cancel booking** frees it (until the class starts; after that the booking is history and cannot be cancelled by anyone). Booking needs a valid membership (not frozen or expired) and a class that has not started; a full class or one you already booked is refused with a clear message. Two people booking the last place at the same moment cannot both get it.
- **My account:** change your name, and change your password. After a password change every earlier login stops working and you log in again with the new password.

**Admin features**
- **Dashboard:** members (total, active, expired, frozen, new in the last 7 days, and **Expiring in 7 days**, which links to that list), check-ins (today, last 7 days), classes (total, upcoming) and accounts (total, users, gym managers, admins, banned).
- **Revenue:** a card on the Dashboard with the money taken today, this month and in the last 30 days (today included), the last 30 days split by payment method, and a column chart of the last 6 months (hover or focus a column for its amount; **Show as a table** lists every month). Days are UTC days, the same as the Payments page filters, so each number matches the Payments page total for the same dates. Voided payments are never counted.
- **Plans and prices:** the **Plans** page sets the price (whole taka) and the number of days a renewal adds for the monthly, quarterly and yearly plans. The price fills in the amount when staff take a payment, and the days decide how far a renewal extends a membership. Payments already taken are not changed.
- **Void a payment:** on the **Payments** page, **Void** marks a mistaken payment, with a reason that must be given. The payment stays on record (struck through, with who voided it, when and why) but is left out of every total. Voiding an already voided payment changes nothing. Voiding does not change the member's expiry date; edit it on the Members page if a renewal was wrong.
- **Export CSV:** on the **Payments** page, **Export CSV** downloads every payment that matches the current filters (not just the rows loaded), newest first, with the columns `id`, `paid_at_utc`, `member`, `member_id`, `amount_taka`, `method`, `plan`, `renewed_until`, `note`, `recorded_by`, `voided_at_utc`, `void_reason` and `voided_by`. It opens in Excel or Google Sheets with Bengali names intact, and any text that a spreadsheet would run as a formula (starting with `=`, `+`, `-` or `@`) is saved with a leading `'` so it shows as plain text.
- **Users and their memberships:** the **Users** page shows each account's membership (plan, status and expiry, linking to the member) or "None yet" with a link to start one, and has a search by name or email.
- **Ban / unban:** on the **Users** page, an admin can ban a User or Gym Manager with an optional reason. A banned person gets `403 Account banned` when logging in and on every request, even with a token that has not expired, and the app logs them out. Unbanning restores access with their role and data unchanged. An admin cannot ban themself or another admin; change the other admin's role first.

**First admin.** Nobody can make themselves an admin. Sign up in the app, then in Supabase → **Table Editor** → `app_user`, set that row's `role` to `admin` (or run `update app_user set role = 'admin' where email = 'you@example.com';` in the SQL editor). Log in again. From then on, change roles on the **Users** page.

**Login lockout.** After 5 wrong passwords in a row for an account, logging in to it is blocked for 15 minutes, even with the right password: the app shows "Too many failed logins. Try again in 15 minutes." (`429`, with a `Retry-After` header in seconds). Attempts while it is blocked do not count, and a successful login resets the count. Someone already logged in stays logged in. An email with no account always gets the same "Wrong email or password".

**`JWT_SECRET`.** Login tokens are signed with the `JWT_SECRET` environment variable (at least 32 bytes). Locally it is optional: without it the backend makes a temporary secret and you log in again after each restart. On Vercel it is required; generate one with `python -c "import secrets; print(secrets.token_urlsafe(48))"` and add it under **Settings** → **Environment Variables**.

## REST API

Interactive docs: `/api/docs` (for example http://localhost:8000/api/docs).

| Operation | Method and path | Success | Errors |
|---|---|---|---|
| Create (start a membership) | `POST /api/v1/members` `{email, plan, expires_on, phone?, notes?}` | `201` member | `409` (already a member), `422` (no account has that email) |
| Read list | `GET /api/v1/members?offset=0&limit=20&status=active&q=rafi` (`q`: part of the name, email or phone) | `200` `{items, total, offset, limit}`, newest first (`expiring_soon`: soonest expiry first) | `422` |
| Read single | `GET /api/v1/members/{id}` | `200` member | `404` |
| Update | `PATCH /api/v1/members/{id}` | `200` member | `404`, `422` |
| Delete (the account) | `DELETE /api/v1/members/{id}` | `204` | `400` (Gym Manager or Admin), `404` |
| Delete several | `POST /api/v1/members/bulk-delete` with `{"ids": [1, 2, 3]}` | `200` `{"deleted": 3}` | `400` (one is a Gym Manager or Admin; nothing deleted), `422` |
| Record a payment | `POST /api/v1/members/{id}/payments` `{amount, method, note?, renew_plan?}` | `201` payment | `403`, `404`, `422` |
| Member's payments | `GET /api/v1/members/{id}/payments?offset=0&limit=20` | `200` `{items, total, offset, limit}`, newest first, voided included | `403`, `404`, `422` |
| All payments | `GET /api/v1/payments?date_from=&date_to=&method=&member=&include_voided=false&offset=0&limit=20` | `200` `{items, total, offset, limit, total_amount}`, newest first; `total_amount` leaves out voided payments | `401`, `403`, `422` (bad method, or `date_from` after `date_to`) |
| Void a payment (admin) | `POST /api/v1/payments/{id}/void` `{"reason": "Entered twice"}` | `200` payment with `voided_at`, `void_reason`, `voided_by_name` (again: unchanged) | `403`, `404`, `422` (no reason) |
| Export payments (admin) | `GET /api/v1/payments/export.csv` with the same filters | `200` `text/csv` file | `403`, `422` |
| My bookings | `GET /api/v1/users/me/bookings?when=upcoming&offset=0&limit=20` (`when=past` for started classes) | `200` `{items, total, offset, limit}` of `{class_id, class_name, starts_at, duration_minutes, trainer_name, booked_at}` | `401`, `422` |
| My payments | `GET /api/v1/users/me/payments?offset=0&limit=20` | `200` `{items, total, offset, limit}`, only my own, newest first | `401` |
| Plan prices | `GET /api/v1/plans` (any logged-in user) | `200` list of `{plan, price, duration_days}` | `401` |
| Change a plan (admin) | `PUT /api/v1/admin/plans/{plan}` `{price, duration_days}` | `200` plan | `403`, `422` |
| Check in a member | `POST /api/v1/members/{id}/check-ins` | `201` check-in | `400` (frozen or expired), `403`, `404` |
| Member's visits | `GET /api/v1/members/{id}/check-ins?offset=0&limit=20` | `200` `{items, total, offset, limit}`, newest first | `403`, `404`, `422` |
| Checked in today | `GET /api/v1/check-ins/today?offset=0&limit=50` | `200` `{items, total, offset, limit}`, newest first | `401`, `403` |
| Add a class | `POST /api/v1/classes` `{name, starts_at, duration_minutes, capacity, ...}` | `201` class | `403`, `422` |
| List classes | `GET /api/v1/classes?upcoming=true&offset=0&limit=20` (any logged-in user) | `200` `{items, total, offset, limit}` ordered by start time, each with `booked_count` | `401`, `422` |
| One class | `GET /api/v1/classes/{id}` (any logged-in user) | `200` class | `401`, `404` |
| Edit a class | `PATCH /api/v1/classes/{id}` | `200` class | `403`, `404`, `422` (including capacity below the bookings) |
| Delete a class | `DELETE /api/v1/classes/{id}` | `204` | `403`, `404` |
| Class bookings | `GET /api/v1/classes/{id}/bookings` | `200` `{items, total, offset, limit}` with member name and time | `403`, `404` |
| Book a class | `POST /api/v1/classes/{id}/bookings` (for the logged-in user) | `201` booking | `400` (membership not valid or class started), `404` (no membership, or no such class), `409` (full or already booked) |
| Cancel my booking | `DELETE /api/v1/classes/{id}/bookings` | `204` | `400` (class has started), `404` |
| A member's bookings | `GET /api/v1/members/{id}/bookings?when=upcoming&offset=0&limit=20` | `200` same shape as My bookings | `403`, `404`, `422` |
| Cancel for a member | `DELETE /api/v1/members/{id}/bookings/{class_id}` | `204` | `400` (class has started), `403`, `404` |
| My membership | `GET /api/v1/users/me/membership` | `200` member | `401`, `404` (no membership yet) |
| My visits | `GET /api/v1/users/me/check-ins?offset=0&limit=20` | `200` `{items, total, offset, limit}`, newest first | `401`, `404` |
| Change my password | `POST /api/v1/users/me/password` `{current_password, new_password}` | `204` | `400` (wrong current password), `401`, `422` |
| Health | `GET /api/health` | `200` `{"status": "ok"}` | |
| Sign up | `POST /api/v1/auth/signup` `{email, name, password}` | `201` user (role `user`) | `409`, `422` |
| Log in | `POST /api/v1/auth/login` `{email, password}` | `200` `{access_token, token_type, user}` | `401`, `403` (banned), `422`, `429` (locked after 5 wrong passwords) |
| My account | `GET` / `PATCH /api/v1/users/me` | `200` user | `401`, `422` |
| Overview (Gym Manager, Admin) | `GET /api/v1/overview` | `200` `{check_ins_today, expiring_soon, waiting, payments_today: {count, amount}, next_classes}` | `401`, `403` |
| Dashboard stats (admin) | `GET /api/v1/admin/stats` | `200` `{members, users, check_ins, classes}` counts; `members.expiring_soon` included | `401`, `403` |
| Revenue (admin) | `GET /api/v1/admin/revenue` | `200` `{today, this_month, last_30_days, last_30_days_from, by_method, months}` in whole taka, voided left out | `401`, `403` |
| Waiting for a membership | `GET /api/v1/members/waiting?offset=0&limit=20&q=` | `200` `{items, total, offset, limit}` of `{id, name, email, role, created_at}`: User accounts with no membership, newest first | `401`, `403` |
| List users (admin) | `GET /api/v1/admin/users?offset=0&limit=20&q=` (`q`: part of the name or email) | `200` `{items, total, offset, limit}`; each user has `is_banned`, `banned_at`, `ban_reason`, `plan`, `expires_on`, `is_frozen` | `401`, `403` |
| Change role (admin) | `PATCH /api/v1/admin/users/{id}/role` `{"role": "gym_manager"}` | `200` user | `400` (own role), `403`, `404`, `422` |
| Ban (admin) | `POST /api/v1/admin/users/{id}/ban` `{"reason": "optional"}` | `200` user | `400` (self or another admin), `403`, `404`, `422` |
| Unban (admin) | `POST /api/v1/admin/users/{id}/unban` | `200` user | `403`, `404` |

- Every `/api/v1/members` endpoint needs `Authorization: Bearer <access_token>` from a Gym Manager or Admin: `401` without a token, `403` for a User.
- A member's `id` is their user id. A member is `{id, name, email, phone, plan, joined_on, expires_on, is_frozen, notes}`.
- `status` filter: `active` (valid), `expired` (expiry date passed), `frozen` (`is_frozen = true`) or `expiring_soon` (not frozen, expiring from today to 7 days from today, both included).
- `total` counts every member matching the filter, not just the page returned.
- `PATCH` changes only the fields sent (`name`, `phone`, `plan`, `expires_on`, `is_frozen`, `notes`): a later `expires_on` renews, `is_frozen: true` freezes.

Example body for `POST`:

```json
{ "email": "rafi@example.com", "phone": "01700000000", "plan": "monthly", "expires_on": "2026-12-01", "notes": "Prefers morning sessions" }
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

The backend accepts `postgres://` or `postgresql://` URLs and creates the `app_user`, `check_in`, `gym_class`, `class_booking`, `plan_price` and `payment` tables on start (and fills `plan_price` with monthly 1,500 / 30 days, quarterly 4,000 / 90 days and yearly 14,000 / 365 days), and adds any columns an older `app_user` table is missing (the ban and membership columns), keeping existing data.

**Upgrading a database from before members became users:** on its first start the backend drops the old `member` table together with `check_in`, `class_booking` and `payment` (all of their rows are deleted) and creates the last three again, pointing at `app_user`. Accounts, classes and plan prices are kept. Staff then start memberships again for the people who need one. To use Supabase locally as well, set `DATABASE_URL` in your terminal before `fastapi dev main.py`.

Free-tier Supabase projects pause after a week with no activity; open the dashboard and restore the project before a demo if needed.

## Deploy to Vercel

1. Push the repo to GitHub.
2. Go to https://vercel.com/new, import the repo and click **Deploy**. Keep **Root Directory** as `./`.
3. Set `DATABASE_URL` as above. Without it, data is kept only in `/tmp` and is lost between requests.
4. Set `JWT_SECRET` (see **Accounts and roles**). Without it, login and the members API return `500`.

The Vercel project is not connected to GitHub, so merging into `main` does not deploy by itself. Deploy from an up-to-date `main` with `vercel --prod`, or connect the repository under Project → **Settings** → **Git** so every push to `main` deploys.

`vercel.json` adds security headers to every response (pages and API): `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin` and `Strict-Transport-Security`. They apply on Vercel only, not to `fastapi dev`.

## Troubleshooting

- **"Running scripts is disabled" in PowerShell:** run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.
- **`fastapi` not found:** activate the virtual environment first.
- **`'FastAPI' object has no attribute 'frontend'`:** your FastAPI is too old; run `pip install -r requirements.txt` again.
- **`Request failed: 500` in the app:** the backend isn't running, or it can't reach the database (check `DATABASE_URL`).
- **App at localhost:8000 shows an old version:** delete `frontend/dist`.
- **Vercel build fails:** check **Build Logs** in the Vercel dashboard, and make sure `npm run build` works in `frontend/`.
