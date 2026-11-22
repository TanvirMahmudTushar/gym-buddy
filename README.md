# Gym Buddy

A simple gym management system: front-desk staff add, view, edit, renew, freeze and delete gym members on one page. FastAPI backend + Vite/React/TypeScript frontend, deployed to Vercel as one project, with Supabase PostgreSQL as the database.

This is the **MVP** (mid-term). The plan for the Beta (accounts, roles, class bookings, check-ins) is in the docs.

```
backend/          FastAPI app (routes under /api)
  main.py         creates the app, error handler, health check
  app/database.py engine and session (Supabase or local SQLite)
  app/models.py   tables (a member is a user with a membership) and request / response schemas
  app/security.py password hashing (Argon2 with a pepper), access tokens (JWT) and refresh tokens
  app/deps.py     who is calling (token and session check)
  app/rbac.py     what each role may do: permission constants, the role → permission map, require_permission()
  app/request_info.py  where a request came from: client IP (X-Forwarded-For on Vercel) and browser
  app/routers/    members.py, auth.py, users.py, admin.py, check_ins.py, classes.py, plans.py, payments.py, overview.py, trainers.py, announcements.py, activity.py: the endpoints (HTTP only)
  app/services/   member_service.py, auth_service.py, session_service.py (logins and refresh tokens), user_service.py, checkin_service.py, class_service.py, payment_service.py, stats_service.py, revenue_service.py, announcement_service.py, activity_service.py (the activity log and the security view), csv_export.py (the CSV writer both exports share): rules and database queries
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

**Members are users.** There is no separate member table: a member is a user whose account has a membership (a plan, joined and expiry dates, a frozen flag, phone and notes). The person signs up first, then staff start their membership. Every account can also hold a date of birth and an emergency contact, which only the person and the staff can read.

| Role | Can do |
|---|---|
| User | Log in, see and rename their own account, keep their phone, date of birth and emergency contact up to date, see their own membership, visits and payments and the gym's announcements, book and cancel classes, change their password |
| Trainer | Log in, see and rename their own account, change their password, and see the classes they teach with who booked each one |
| Gym Manager | Everything a User can, plus manage gym members (add, edit, renew, freeze, delete), record check-ins, take payments and see the list of all payments, run the class timetable, and post announcements |
| Admin | Everything a Gym Manager can, plus list users and change their roles (including giving the Trainer role), set plan prices, void payments and export them as CSV, and read the activity log and the security view |

**Permissions (RBAC).** The server never asks "is this an admin?". Every protected endpoint asks for a permission, and [`backend/app/rbac.py`](backend/app/rbac.py) says which roles hold it. The role is read from the database on every request, so a role change applies on the next request. A missing permission gets `403`; no login gets `401`. Endpoints about your own data (profile, membership, bookings, payments, sessions) need only a login, because they take your id from the token, never from the request.

| Permission | Allows | User | Trainer | Gym Manager | Admin |
|---|---|---|---|---|---|
| `members:read` | Member list and details, waiting list, a member's visits and bookings | | | ✓ | ✓ |
| `members:manage` | Start, edit and delete memberships; cancel a booking for a member | | | ✓ | ✓ |
| `check_ins:record` | Check a member in; today's check-ins | | | ✓ | ✓ |
| `payments:manage` | Take payments; a member's payments; the list of all payments | | | ✓ | ✓ |
| `classes:manage` | Add, edit and delete classes; list trainers; any class's bookings | | | ✓ | ✓ |
| `classes:teach` | My classes, and who booked them (only classes I teach) | | ✓ | | |
| `overview:read` | The Overview page | | | ✓ | ✓ |
| `announcements:manage` | Post, edit and delete announcements; see ended ones | | | ✓ | ✓ |
| `payments:void`, `payments:export` | Void a payment; export payments as CSV | | | | ✓ |
| `dashboard:read` | Dashboard stats and revenue | | | | ✓ |
| `users:read`, `users:change_role`, `users:ban`, `users:reset_password` | The Users page and its actions | | | | ✓ |
| `plans:edit` | Plan prices and lengths | | | | ✓ |
| `activity:read` | The Activity and Security pages, and the activity CSV | | | | ✓ |

`GET /api/v1/users/me` (and the login and refresh responses) include the caller's `permissions`. The app builds its menu and page guards from them, so it shows exactly what the API allows. The two member pages, My membership and Classes, use only your-own-data endpoints and are shown to Users.

Pages: `#/login`, `#/signup`, `#/dashboard` (Admin), `#/overview` (Gym Manager, Admin), `#/members` (Gym Manager, Admin), `#/classes` (Gym Manager, Admin), `#/payments` (Gym Manager, Admin), `#/announcements` (Gym Manager, Admin), `#/users` (Admin), `#/plans` (Admin), `#/activity` and `#/security` (Admin), `#/membership` and `#/timetable` (User), `#/my-classes` (Trainer), `#/account` (everyone). After logging in, an Admin lands on the Dashboard, a Gym Manager on the Overview, a Trainer on My classes and a User on My membership.

**Gym Manager features (also available to Admins)**
- **Check in a member:** open a member on the Members page and click **Check in**. Frozen and expired members cannot be checked in (the page says why; renew or unfreeze first). The same member can check in more than once a day.
- **Visit history:** each member's visits, newest first, with who recorded each one.
- **A member's bookings:** in the member details, **Bookings** lists the classes they booked, soonest first, with **Cancel** so the front desk can cancel for them; **Show past bookings** lists the classes that have already started.
- **Renewals due:** the **Expiring soon** chip on the Members page lists the active (not frozen) memberships that end today or within the next 7 days, soonest first, so staff know who to remind. Every member whose expiry is that close shows "today", "tomorrow" or "in 5 days" next to the date. The filter is kept in the address (`#/members?filter=expiring_soon`), so the Dashboard can link to it.
- **Checked in today:** a card at the top of the Members page lists everyone who has arrived since midnight UTC. Click a name to open that member.
- **Contact and safety details:** the member details show the member's phone, date of birth (with their age) and emergency contact (a name and a phone). **Edit** changes them with the same checks the member gets on My account, so the front desk can fill them in for someone, and either side sees the other's changes. A User or Trainer can never read another person's details: every member endpoint answers them `403`.
- **Find a member:** the search box on the Members page finds members by part of their name, email or phone, in any case, together with the status chips.
- **Waiting for a membership:** a card on the Members page lists the people who signed up in the app but have no membership yet, newest first, with its own search. **Start membership** fills their email into **Add member** and moves to the plan, so nobody types an email by hand.
- **Add a member:** the person signs up first. On the Members page, **Add member** takes the email they signed up with, plus plan, expiry date and optional phone and notes; their name comes from their account. Leaving the phone empty keeps one the person already saved on My account. An email with no account is refused ("Ask the person to sign up first"), and so is an account that already has a membership.
- **Open a member from anywhere:** every member's name in the Payments list, a class's bookings and Checked in today opens that member on the Members page. The address keeps the open member and the filter (`#/members?filter=expiring_soon&member=5`), so a reload or a shared link shows the same.
- **Delete a member:** deletes the person's whole account. They can no longer log in, and their check-ins and class bookings are removed; their payments stay on record. Only a User's account can be deleted here: a Gym Manager or Admin who has a membership must have their role changed first.
- **Classes:** the **Classes** page lists upcoming classes (or all of them), in start-time order. Add a class with a name, start time, length (15 to 240 minutes) and places (1 to 200), plus an optional description and an optional trainer, picked from the accounts with the Trainer role. The class shows the trainer's current name, so a trainer who changes their name on My account shows the new one everywhere. A class from before trainers were accounts keeps its old text name: editing it offers that name ("Lina (name only)") until a trainer or **No trainer** is chosen. Edit or delete a class, and open **Bookings** to see who has booked it. Capacity cannot be lowered below the bookings already made, and deleting a class deletes its bookings. A member's bookings are made by the member (see **User features**).

- **Payments:** in a member's details, **Payments** records what the member paid (amount in whole taka, and cash, card, bank transfer or mobile banking, with an optional note). Tick **Renew the membership with this payment**, pick the plan, and the amount fills in from the plan's price and the new expiry date is shown. An active member renews from their current expiry, so no paid days are lost; an expired member renews from today. The member's payments are listed below, newest first; a voided one is struck through with the reason. A payment stays on record when its member's account is deleted.
- **Overview:** a Gym Manager's start page (Admins can open it too) with what needs attention today: members checked in today, memberships expiring in 7 days, people waiting for a membership, and payments taken today (amount and count, voided left out), plus the next 5 classes with places booked. Each number links to its list, which shows the same number: Checked in today on Members, the Expiring soon filter, the waiting list, and the Payments page filtered to today. Revenue history and account numbers stay on the admin Dashboard.
- **Announcements:** the **Announcements** page posts holiday hours, new classes and other news: a title, a message (line breaks are kept) and an optional **Show until** date, the last day it shows (a UTC day, like a membership's expiry; it cannot be before today). Leave the date empty to keep it up until it is deleted. Members see the current announcements on My membership, and staff see them at the bottom of the Overview. **Showing now** lists what members see; **All, with ended** also lists the ended ones. **Edit** changes the text or the date (an ended one keeps its date until a new one is picked, so its text can still be corrected) and **Delete** removes it straight away. Each shows who posted it, when, and whether it was edited. A User or Trainer cannot post (`403`).
- **All payments:** the **Payments** page lists every payment, newest first, with filters for dates (From and To, both included, in UTC), method and part of the member's name. Above the list is the total of the matching payments, for every page and not just the rows shown. The From and To dates are kept in the address (`#/payments?from=2026-11-20&to=2026-11-20`), so a link can open the list on a day. Voided payments are hidden unless **Show voided payments** is ticked, and never count towards the total. **Load more** shows the next 20.

**User features**
- **My membership:** plan, status, joined and expiry dates, and the person's own visits, newest first. A User can only ever see their own record. Before staff start a membership, the page says so and shows the email to give the front desk.
- **Announcements:** on My membership, the gym's current announcements, newest first, with who posted them and the last day each one shows. The card is hidden when there are none, and an announcement disappears the day after its end date.
- **My bookings:** on My membership, the person's upcoming classes with **Cancel**, past classes on request, and a link to book another.
- **Plans and prices:** on My membership, what each plan costs and how many days it adds, with the person's own plan marked, and how renewing at the front desk works.
- **My payments:** on My membership, the person's own payments, newest first. A voided payment shows as voided with the reason. Nobody can see another person's payments.
- **Classes:** upcoming classes with places left. **Book** takes a place, **Cancel booking** frees it (until the class starts; after that the booking is history and cannot be cancelled by anyone). Booking needs a valid membership (not frozen or expired) and a class that has not started; a full class or one you already booked is refused with a clear message. Two people booking the last place at the same moment cannot both get it.
- **My contact details:** on My account, every logged-in person keeps their own phone, date of birth and emergency contact up to date. The date of birth must be between 1 Jan 1900 and today, and the emergency contact needs both a name and a phone, or neither. Only the person and the gym staff can see them; staff see them in the member details.
- **My account:** change your name, and change your password. A password change logs out every other browser where you were logged in; the one you used stays logged in.
- **Where I am logged in:** on My account, every browser with an active login (for example "Chrome on Windows"), its IP address, when it logged in and when it was last active, with **This browser** marked. **Log out** next to one ends that login on the server at once: its next request is refused and it shows Log in. Logging out **This browser** is a normal logout.

**Trainer features**
- **My classes:** the classes the trainer teaches, upcoming ones soonest first, with places booked; **Past** lists the classes that have started, latest first. **Who booked** lists the people booked on a class, in booking order (the next class opens with it showing). A trainer can read the bookings of their own classes only: any other class's bookings answer `403`. Trainers land here after logging in.
- **Becoming a trainer:** an admin gives the **Trainer** role on the Users page; the person logs in again and a Gym Manager can then pick them for classes. If an admin changes a trainer's role, their classes keep their name as plain text and no longer show on their My classes.

**Admin features**
- **Dashboard:** members (total, active, expired, frozen, new in the last 7 days, and **Expiring in 7 days**, which links to that list), check-ins (today, last 7 days), classes (total, upcoming) and accounts (total, users, trainers, gym managers, admins, banned).
- **Revenue:** a card on the Dashboard with the money taken today, this month and in the last 30 days (today included), the last 30 days split by payment method, and a column chart of the last 6 months (hover or focus a column for its amount; **Show as a table** lists every month). Days are UTC days, the same as the Payments page filters, so each number matches the Payments page total for the same dates. Voided payments are never counted.
- **Plans and prices:** the **Plans** page sets the price (whole taka) and the number of days a renewal adds for the monthly, quarterly and yearly plans. The price fills in the amount when staff take a payment, and the days decide how far a renewal extends a membership. Payments already taken are not changed.
- **Void a payment:** on the **Payments** page, **Void** marks a mistaken payment, with a reason that must be given. The payment stays on record (struck through, with who voided it, when and why) but is left out of every total. Voiding an already voided payment changes nothing. Voiding does not change the member's expiry date; edit it on the Members page if a renewal was wrong.
- **Export CSV:** on the **Payments** page, **Export CSV** downloads every payment that matches the current filters (not just the rows loaded), newest first, with the columns `id`, `paid_at_utc`, `member`, `member_id`, `amount_taka`, `method`, `plan`, `renewed_until`, `note`, `recorded_by`, `voided_at_utc`, `void_reason` and `voided_by`. It opens in Excel or Google Sheets with Bengali names intact, and any text that a spreadsheet would run as a formula (starting with `=`, `+`, `-` or `@`) is saved with a leading `'` so it shows as plain text. Each download is recorded in the activity log, with the filters used and the number of rows.
- **Users and their memberships:** the **Users** page shows each account's membership (plan, status and expiry, linking to the member) or "None yet" with a link to start one, and has a search by name or email.
- **Reset a password:** on the **Users** page, **Reset password** (for a User or Gym Manager, not yourself or another admin) makes a random 12-character temporary password and shows it once, with **Copy**, to hand over in person. The person's old password stops working, every session they had is logged out, and any login lockout is cleared. When they log in with the temporary password, the app shows only **Choose a new password** (the API refuses everything else with `403 Choose a new password first`); the new one must differ from the temporary one, and the app then opens normally.
- **Activity:** the **Activity** page lists security events, newest first: sign-ups, logins, failed logins (with the email that was typed, even when no account has it), lockouts, logouts, ended sessions, password changes and failed changes, password resets, role changes, bans and unbans, deleted accounts and CSV exports. Each row shows who did it, the account affected, details (such as `user → trainer` or a ban reason), the IP address and the browser. Filter by event, by From and To dates (UTC days, both included) and by a search over the emails, IP address and details; click an email to show only that account's activity, or an address to show everything from it. The filters are kept in the address (`#/activity?event=login_failed&q=192.0.2.66`). **Export CSV** downloads the same rows as the list (up to the newest 10,000), and the download is logged too. Passwords, temporary passwords and tokens are never written to the log. On Vercel the IP address comes from the `X-Forwarded-For` header the platform sets; elsewhere it is the address of the connection.
- **Security:** the **Security** page shows failed logins and lockouts in the last 24 hours and the last 7 days, and the 10 IP addresses and 10 emails with the most failed logins, each with how many accounts that address tried (or how many addresses tried that email) and the last attempt. Rows with 5 or more (as many as one lockout) are marked **Watch**. Each row opens the Activity page filtered to those attempts.
- **Ban / unban:** on the **Users** page, an admin can ban a User or Gym Manager with an optional reason. A banned person gets `403 Account banned` when logging in and on every request, even with a token that has not expired, and the app logs them out. A ban also ends all their sessions, so their refresh cookie cannot get a new token, and unbanning does not bring those sessions back. Unbanning restores access with their role and data unchanged. An admin cannot ban themself or another admin; change the other admin's role first.

**First admin.** Nobody can make themselves an admin. Sign up in the app, then in Supabase → **Table Editor** → `app_user`, set that row's `role` to `admin` (or run `update app_user set role = 'admin' where email = 'you@example.com';` in the SQL editor). Log in again. From then on, change roles on the **Users** page.

**Login lockout.** After 5 wrong passwords in a row for an account, logging in to it is blocked for 15 minutes, even with the right password: the app shows "Too many failed logins. Try again in 15 minutes." (`429`, with a `Retry-After` header in seconds). Attempts while it is blocked do not count, and a successful login resets the count. Someone already logged in stays logged in. An email with no account always gets the same "Wrong email or password".

**Logins and sessions.** Logging in starts a session for that browser and gives two tokens:
- an **access token** (a JWT holding the user id, role and session id) that lasts **15 minutes**. The app keeps it in memory only, never in `localStorage` or `sessionStorage`, and sends it as `Authorization: Bearer …`;
- a **refresh token** in a cookie that page scripts cannot read (`HttpOnly`, `Secure`, `SameSite=Strict`, sent only to `/api/v1/auth`) that lasts **7 days**. The database keeps only its SHA-256 hash.

When the access token expires, the API answers `401`. The app then calls `POST /api/v1/auth/refresh` once, gets a new access token and a new refresh cookie (the old one is replaced: **rotation**), and repeats the request, so the person notices nothing. After a reload the app gets its access token the same way, showing "Loading…" meanwhile, never a flash of the Log in page. If an old refresh token is used again more than 30 seconds after it was replaced, someone copied it, and the whole session is ended. **Log out** ends the session on the server: its access token is refused at once (every request checks that its session is still active), not only after 15 minutes. A session also ends after 7 days without use, when the password is changed (other browsers only) or reset, and when the account is banned.

**`JWT_SECRET` and `PASSWORD_PEPPER`.** Access tokens are signed with `JWT_SECRET`, and passwords are hashed with Argon2 after mixing in `PASSWORD_PEPPER` (HMAC-SHA256), a secret kept only in the server's environment: someone with a copy of the database but not the pepper cannot test password guesses. Both must be at least 32 bytes. On Vercel both are required; generate each with `python -c "import secrets; print(secrets.token_urlsafe(48))"` and add them under **Settings** → **Environment Variables**. Never change the pepper once set: every password hashed with it would stop working. Locally both are optional: without `JWT_SECRET` the backend makes a temporary secret (you log in again after each restart), and without `PASSWORD_PEPPER` it uses a fixed development pepper. Passwords hashed before the pepper existed still work: the next successful login replaces the hash with a peppered one.

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
| Add a class | `POST /api/v1/classes` `{name, starts_at, duration_minutes, capacity, description?, trainer_id?}` | `201` class, with `trainer_id` and `trainer_name` (the trainer's current name) | `403`, `422` (including a `trainer_id` that is not a Trainer) |
| List trainers (Gym Manager, Admin) | `GET /api/v1/trainers` | `200` list of `{id, name}`, by name | `401`, `403` |
| My classes (Trainer) | `GET /api/v1/trainers/me/classes?when=upcoming&offset=0&limit=20` (`when=past` for started classes) | `200` `{items, total, offset, limit}` of classes I teach | `401`, `403`, `422` |
| List classes | `GET /api/v1/classes?upcoming=true&offset=0&limit=20` (any logged-in user) | `200` `{items, total, offset, limit}` ordered by start time, each with `booked_count` | `401`, `422` |
| One class | `GET /api/v1/classes/{id}` (any logged-in user) | `200` class | `401`, `404` |
| Edit a class | `PATCH /api/v1/classes/{id}` (`trainer_id`: a Trainer, or `null` for none; either replaces an old text name) | `200` class | `403`, `404`, `422` (including capacity below the bookings, or a `trainer_id` that is not a Trainer) |
| Delete a class | `DELETE /api/v1/classes/{id}` | `204` | `403`, `404` |
| Class bookings | `GET /api/v1/classes/{id}/bookings` (Gym Manager, Admin; a Trainer for the classes they teach) | `200` `{items, total, offset, limit}` with member name and time | `403` (including a Trainer and another class), `404` |
| Book a class | `POST /api/v1/classes/{id}/bookings` (for the logged-in user) | `201` booking | `400` (membership not valid or class started), `404` (no membership, or no such class), `409` (full or already booked) |
| Cancel my booking | `DELETE /api/v1/classes/{id}/bookings` | `204` | `400` (class has started), `404` |
| A member's bookings | `GET /api/v1/members/{id}/bookings?when=upcoming&offset=0&limit=20` | `200` same shape as My bookings | `403`, `404`, `422` |
| Cancel for a member | `DELETE /api/v1/members/{id}/bookings/{class_id}` | `204` | `400` (class has started), `403`, `404` |
| My contact details | `GET /api/v1/users/me/profile` | `200` `{phone, date_of_birth, emergency_contact_name, emergency_contact_phone}`, my own only | `401` |
| Change my contact details | `PATCH /api/v1/users/me/profile` (only the fields sent; `null` or blank text clears one) | `200` the same shape | `401`, `422` (date of birth before 1900 or in the future, too long, or an emergency contact with only a name or only a phone) |
| My membership | `GET /api/v1/users/me/membership` | `200` member | `401`, `404` (no membership yet) |
| My visits | `GET /api/v1/users/me/check-ins?offset=0&limit=20` | `200` `{items, total, offset, limit}`, newest first | `401`, `404` |
| Change my password | `POST /api/v1/users/me/password` `{current_password, new_password}` | `204`; every other session is ended, this one stays (also ends the must-choose-a-new-password state) | `400` (wrong current password, or the new one is the same), `401`, `422` |
| My sessions | `GET /api/v1/users/me/sessions` | `200` list of `{id, created_at, last_used_at, expires_at, ip, user_agent, current}`, most recently used first; only active ones | `401` |
| Log out a session | `DELETE /api/v1/users/me/sessions/{id}` | `204`; that browser's refresh cookie and access token stop working at once | `401`, `404` (not mine, or no longer active) |
| Health | `GET /api/health` | `200` `{"status": "ok"}` | |
| Sign up | `POST /api/v1/auth/signup` `{email, name, password}` | `201` user (role `user`) | `409`, `422` |
| Log in | `POST /api/v1/auth/login` `{email, password}` | `200` `{access_token, token_type, expires_in, user}` and a `refresh_token` cookie | `401`, `403` (banned), `422`, `429` (locked after 5 wrong passwords) |
| Refresh | `POST /api/v1/auth/refresh` (the browser sends the cookie) | `200` same as Log in, with a new cookie (rotation); `204` when there is no cookie (not logged in) | `401` (expired, revoked or reused; the cookie is cleared) |
| Log out | `POST /api/v1/auth/logout` | `204`; the session is revoked and the cookie cleared (always `204`) | |
| My account | `GET` / `PATCH /api/v1/users/me` | `200` user with `permissions` (the list from `app/rbac.py` for my role) | `401`, `422` |
| Overview (Gym Manager, Admin) | `GET /api/v1/overview` | `200` `{check_ins_today, expiring_soon, waiting, payments_today: {count, amount}, next_classes}` | `401`, `403` |
| Current announcements | `GET /api/v1/announcements?offset=0&limit=20` (any logged-in user; `include_ended=true` for Gym Manager, Admin) | `200` `{items, total, offset, limit}` of `{id, title, message, ends_on, posted_at, updated_at, posted_by_name}`, newest first; without `include_ended`, only those with no `ends_on` or one of today or later (UTC) | `401`, `403` (`include_ended` from a User or Trainer) |
| Post an announcement (Gym Manager, Admin) | `POST /api/v1/announcements` `{title, message, ends_on?}` | `201` announcement | `403`, `422` (empty or too long, or `ends_on` before today) |
| Edit an announcement (Gym Manager, Admin) | `PATCH /api/v1/announcements/{id}` (only the fields sent; `ends_on: null` removes the end date) | `200` announcement, `updated_at` set | `403`, `404`, `422` |
| Delete an announcement (Gym Manager, Admin) | `DELETE /api/v1/announcements/{id}` | `204` | `403`, `404` |
| Dashboard stats (admin) | `GET /api/v1/admin/stats` | `200` `{members, users, check_ins, classes}` counts; `members.expiring_soon` included | `401`, `403` |
| Revenue (admin) | `GET /api/v1/admin/revenue` | `200` `{today, this_month, last_30_days, last_30_days_from, by_method, months}` in whole taka, voided left out | `401`, `403` |
| Waiting for a membership | `GET /api/v1/members/waiting?offset=0&limit=20&q=` | `200` `{items, total, offset, limit}` of `{id, name, email, role, created_at}`: User accounts with no membership, newest first | `401`, `403` |
| List users (admin) | `GET /api/v1/admin/users?offset=0&limit=20&q=` (`q`: part of the name or email) | `200` `{items, total, offset, limit}`; each user has `is_banned`, `banned_at`, `ban_reason`, `plan`, `expires_on`, `is_frozen` | `401`, `403` |
| Change role (admin) | `PATCH /api/v1/admin/users/{id}/role` `{"role": "trainer"}` (`user`, `trainer`, `gym_manager` or `admin`) | `200` user | `400` (own role), `403`, `404`, `422` |
| Ban (admin) | `POST /api/v1/admin/users/{id}/ban` `{"reason": "optional"}` | `200` user | `400` (self or another admin), `403`, `404`, `422` |
| Unban (admin) | `POST /api/v1/admin/users/{id}/unban` | `200` user | `403`, `404` |
| Reset a password (admin) | `POST /api/v1/admin/users/{id}/reset-password` | `200` `{user, temporary_password}` (`Cache-Control: no-store`); the user's `must_change_password` is `true` until they choose a new one | `400` (yourself or another admin), `403`, `404` |
| Activity log (admin) | `GET /api/v1/admin/activity?event=&user_id=&date_from=&date_to=&q=&offset=0&limit=50` (`user_id`: rows where that account acted or was acted on; `q`: part of an email, the IP address or the details) | `200` `{items, total, offset, limit}` of `{id, created_at, event, actor_id, actor_email, target_id, target_email, details, ip, user_agent}`, newest first | `401`, `403`, `422` (unknown event, or `date_from` after `date_to`) |
| Export the activity log (admin) | `GET /api/v1/admin/activity/export.csv` with the same filters | `200` `text/csv` file `activity-YYYY-MM-DD.csv` (`Cache-Control: no-store`), the same rows as the list up to 10,000; the export is logged | `401`, `403`, `422` |
| Security view (admin) | `GET /api/v1/admin/activity/security` | `200` `{last_24_hours, last_7_days}`, each `{since, total, lockouts, by_ip: [{ip, count, accounts, last_at}], by_account: [{email, user_id, count, ips, last_at}]}` (10 of each, the most first) | `401`, `403` |

- Every `/api/v1/members` endpoint needs `Authorization: Bearer <access_token>` from a Gym Manager or Admin: `401` without a token, `403` for a User.
- A member's `id` is their user id. A member is `{id, name, email, phone, date_of_birth, emergency_contact_name, emergency_contact_phone, plan, joined_on, expires_on, is_frozen, notes}`.
- `status` filter: `active` (valid), `expired` (expiry date passed), `frozen` (`is_frozen = true`) or `expiring_soon` (not frozen, expiring from today to 7 days from today, both included).
- `total` counts every member matching the filter, not just the page returned.
- `PATCH` changes only the fields sent (`name`, `phone`, `date_of_birth`, `emergency_contact_name`, `emergency_contact_phone`, `plan`, `expires_on`, `is_frozen`, `notes`): a later `expires_on` renews, `is_frozen: true` freezes. The contact fields follow the same rules as `PATCH /api/v1/users/me/profile`.

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

The backend accepts `postgres://` or `postgresql://` URLs and creates the `app_user`, `auth_session`, `check_in`, `gym_class`, `class_booking`, `plan_price`, `payment`, `announcement` and `activity_log` tables on start (and fills `plan_price` with monthly 1,500 / 30 days, quarterly 4,000 / 90 days and yearly 14,000 / 365 days), and adds any columns an older table is missing (the ban and membership columns on `app_user`, `trainer_id` and its index on `gym_class`), keeping existing data.

**Upgrading a database from before members became users:** on its first start the backend drops the old `member` table together with `check_in`, `class_booking` and `payment` (all of their rows are deleted) and creates the last three again, pointing at `app_user`. Accounts, classes and plan prices are kept. Staff then start memberships again for the people who need one. To use Supabase locally as well, set `DATABASE_URL` in your terminal before `fastapi dev main.py`.

Free-tier Supabase projects pause after a week with no activity; open the dashboard and restore the project before a demo if needed.

## Deploy to Vercel

1. Push the repo to GitHub.
2. Go to https://vercel.com/new, import the repo and click **Deploy**. Keep **Root Directory** as `./`.
3. Set `DATABASE_URL` as above. Without it, data is kept only in `/tmp` and is lost between requests.
4. Set `JWT_SECRET` and `PASSWORD_PEPPER` (see **Accounts and roles**), then redeploy. Without them, sign up, login and every logged-in request return `500`.

The Vercel project is not connected to GitHub, so merging into `main` does not deploy by itself. Deploy from an up-to-date `main` with `vercel --prod`, or connect the repository under Project → **Settings** → **Git** so every push to `main` deploys.

`vercel.json` adds security headers to every response (pages and API): `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin` and `Strict-Transport-Security`. They apply on Vercel only, not to `fastapi dev`.

## Troubleshooting

- **"Running scripts is disabled" in PowerShell:** run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.
- **`fastapi` not found:** activate the virtual environment first.
- **`'FastAPI' object has no attribute 'frontend'`:** your FastAPI is too old; run `pip install -r requirements.txt` again.
- **`Request failed: 500` in the app:** the backend isn't running, or it can't reach the database (check `DATABASE_URL`).
- **App at localhost:8000 shows an old version:** delete `frontend/dist`.
- **Vercel build fails:** check **Build Logs** in the Vercel dashboard, and make sure `npm run build` works in `frontend/`.
