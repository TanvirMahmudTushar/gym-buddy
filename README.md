# Gym Buddy

A gym management system for a small gym. Members see their membership, visits and payments, book classes and follow the workouts their trainer gives them. Trainers run classes, look after their clients and lead training groups. Front-desk staff run memberships, attendance, payments, classes, equipment and announcements. Admins set the plans, record expenses, see the gym's net income, and manage accounts, roles and security. FastAPI backend + Vite/React/TypeScript frontend, deployed to Vercel as one project, with Supabase PostgreSQL as the database.

| | Live URL |
|---|---|
| App | https://2321648gymbuddy.vercel.app/ |
| API (base) | https://2321648gymbuddy.vercel.app/api/v1 |
| API docs (Swagger UI) | https://2321648gymbuddy.vercel.app/api/docs |
| Health check | https://2321648gymbuddy.vercel.app/api/health |

**What it does (final release)**
- **Accounts and security:** sign up, log in and out; a 5-minute access token kept in memory and a rotating refresh cookie, with reuse detection; a Login devices page with every device that holds a valid refresh token, each one able to be logged out; lockout after 5 wrong passwords (on Log in and on a password change); Argon2 password hashing with a server-side pepper; security headers and a CORS allowlist.
- **Four roles and permissions (RBAC):** User, Trainer, Gym Manager and Admin. Every protected endpoint asks one module ([`backend/app/rbac.py`](backend/app/rbac.py)) for a permission, and the app shows only what the API allows.
- **Members and plans:** a member is a user with a membership. Admins add, edit and retire the plans the gym sells. Staff start a membership (and take the first payment in the same step), renew and freeze it, pick a personal trainer, search and filter members (active, expired, frozen, expiring soon), see the people waiting for a membership, and keep contact and emergency details.
- **Attendance:** check members in (only with a valid membership) and out, see who is in the gym now, and look up any day.
- **Classes and bookings:** a class timetable with trainers and a capacity that two people booking at the same moment can never exceed; members book and cancel; trainers and staff mark who came.
- **Money:** take payments (optionally renewing in the same step), the list of all payments with totals, void with a reason, expenses by category, CSV exports, and revenue, expenses and net income on the Dashboard.
- **Equipment:** what the gym owns, what is broken and what is due for a service; trainers report faults, staff record services and repairs.
- **Training:** trainers see their clients and run training groups: they add members, tick what each may do (add, edit, assign workouts) and assign workouts; members mark theirs done.
- **Admin tools:** Dashboard, Users page (filters, pages, details with records, bulk ban and unban, log out everywhere, password reset, CSV), activity log and failed-login view, moderation of every training group and workout, announcements.

```
backend/          FastAPI app (routes under /api)
  main.py         creates the app: CORS, the routes and the error handlers
  app/errors.py   every error: which status code and message each exception becomes, all in one shape
  app/params.py   the path and query parameters the routes share (ids, paging, search), with their limits
  app/database.py engine and session (Supabase or local SQLite)
  app/models.py   tables (a member is a user with a membership) and request / response schemas
  app/security.py password hashing (Argon2 with a pepper), access tokens (JWT) and refresh tokens
  app/deps.py     who is calling (token and session check)
  app/rbac.py     what each role may do: permission constants, the role → permission map, require_permission()
  app/request_info.py  where a request came from: client IP (X-Forwarded-For on Vercel) and browser
  app/config.py   settings: reads backend/.env on a developer machine, and the CORS origins (FRONTEND_ORIGIN)
  app/cors.py     CORS that answers only the frontend's origin
  tests/          pytest suite (see Tests)
  app/routers/    members.py, auth.py, users.py, admin.py, check_ins.py, classes.py, plans.py, payments.py, expenses.py, equipment.py, overview.py, trainers.py, announcements.py, activity.py, groups.py, workouts.py, moderation.py: the endpoints (HTTP only)
  app/services/   one file per area, with the rules and database queries: member, plan, checkin, class, trainer, payment, expense, revenue, equipment, group, workout, moderation, announcement, stats, user, profile, auth, session (logins and refresh tokens), activity (the activity log and the failed-login view), csv_export.py and search.py (shared helpers)
frontend/         Vite + React + TypeScript, one page per route (hash router in src/App.tsx)
  src/pages/      one folder per page: Dashboard, Members, Attendance, Payments, Classes, Training, Equipment, Announcements, Plans, Expenses, Users, Security, Activity, MyClasses, MyClients, Membership, Timetable, Account, ...
  src/components/ the shared parts (PageHeader, Modal, ConfirmModal, Pager, ListState, Alert, Icon, ...) and the forms, lists and cards built from them
  src/context/    AuthContext.tsx: who is logged in, and restoring the login on reload; PlansContext.tsx: the plans' names and prices
  src/layouts/    AppLayout.tsx: the sidebar with the pages the caller's permissions allow (a menu button on a phone)
  src/services/   one file per API area (memberService.ts, classService.ts, ...); api.ts adds the token and refreshes it
  src/types/      TypeScript types for the API's responses
  src/utils/      display helpers; time.ts shows every time as the gym's time, hash.ts reads and builds the app's addresses
  src/hooks/      usePagedList (lists with Previous / Next), useShowMore (short lists), useSelection (ticked rows), useSave (a form's saving and error state), useHashValue and useDebouncedValue (search boxes)
scripts/          seed_demo.py: creates the demo accounts and sample data through the API (see Demo data)
docs/             PRD, SRS, TDD and the final report
vercel.json       Vercel setup: /api/* goes to backend, everything else to frontend (any path opens the app)
```

## Documents

- [Final report](docs/FINAL_REPORT.md): the finished product, its requirements and its design in one place
- [Product Requirements Document (PRD)](docs/01-prd.md)
- [Software Requirements Specification (SRS)](docs/02-srs.md)
- [Technical Design Document (TDD)](docs/03-tdd.md)

## Test accounts

These accounts are on the live site, each with the role shown. **The password (the same for every account below) is given only in the submission form and the PDF report, never in this repository.** The email is the user ID you log in with.

| User ID (email) | Name | Role | Lands on | Good for trying |
|---|---|---|---|---|
| `admin.ayesha@gmail.com` | Ayesha Rahman | Admin | Dashboard | Revenue and net income, plans, expenses, users, roles, bans, password reset, activity log, failed logins, moderation (Training → All groups / All workouts), payments void and CSV |
| `admin.imran@gmail.com` | Imran Hossain | Admin | Dashboard | A second admin: neither admin can ban the other or reset the other's password, and neither can change their own role |
| `manager.nadia@gmail.com` | Nadia Islam | Gym Manager | Dashboard (front desk part) | Members, attendance, payments, classes, equipment and announcements; `403` on the admin endpoints |
| `trainer.karim@gmail.com` | Karim Uddin | Trainer | My classes | Who booked his classes and who came, his clients, reporting a fault; owner of the shared training group |
| `rafi@gmail.com` | Rafi Ahmed | User | My membership | Monthly membership expiring within 7 days, Karim's client, 3 bookings (one class now full), may add, edit and assign workouts in the shared group |
| `sadia@gmail.com` | Sadia Karim | User | My membership | Quarterly membership, Karim's client, in the gym now; in the shared group, may add workouts only; one assigned workout done |
| `tanim@gmail.com` | Tanim Chowdhury | User | My membership | Frozen yearly membership (cannot book or be checked in); in the shared group, read only |
| `mitu@gmail.com` | Mitu Das | User | My membership | Signed up but no membership yet: shows on the Members page waiting list |

The app never sends email and does not check that an address exists, so these accounts need no real inbox. All eight use the same password.

### Shared group with mixed permissions

**Strength Program**, owned by **Karim Uddin** (`trainer.karim@gmail.com`). Open **Training** → **My groups** after logging in as any of the four people below.

| Person | In the group as | Add workouts | Edit workouts | Assign workouts | Delete workouts; rename or delete the group; add and remove people |
|---|---|---|---|---|---|
| Karim Uddin (trainer) | Owner | ✓ | ✓ | ✓ | ✓ |
| Rafi Ahmed | Member | ✓ | ✓ | ✓ | |
| Sadia Karim | Member | ✓ | | | |
| Tanim Chowdhury | Member (read only) | | | | |

Everyone in the group sees its workouts and its people. The group has four workouts: **Squat day** (added by Karim, assigned to Rafi), **Week 1 circuit** (added by Karim, assigned to Sadia, who marked it done), **Upper body** (added by Rafi, assigned to Tanim) and **Core finisher** (added by Sadia). Things to try: as Sadia, **Add workout** works but there is no **Edit** button, and the API answers `403` if asked anyway; as Tanim, nothing can be changed except marking his own workout done; as Mitu, who is not in the group, the group and its workouts answer `404`, as if they did not exist; as Karim, tick or untick a box and the change applies on that person's next request. A member cannot start a group (`403`): trainers and staff do.

## Demo data

[`scripts/seed_demo.py`](scripts/seed_demo.py) creates the accounts above and the sample data: a Student monthly plan, three memberships (one expiring soon, one frozen) with their payments and trainers, two visits today (one still inside), three classes in the coming days (two taught by Karim, one full), bookings, two announcements, four pieces of equipment (one broken, one due for a service), two expenses and the shared training group. It uses only the public API, so the passwords are hashed with the server's own pepper and every rule is checked as in the app. It needs only Python 3.10+, no packages, and running it again skips what already exists.

```bash
python scripts/seed_demo.py --base-url https://2321648gymbuddy.vercel.app
```

- The passwords are read from `gym-buddy-demo-passwords.json` in your home folder, outside the repository (`--passwords` picks another file). If the file does not exist, random passwords are made and saved there. To give every account one shared password, write it for each email in that file before the first run.
- Nobody can make themselves an admin through the API, so the first run signs the accounts up, then stops and prints one SQL line that makes `admin.ayesha@gmail.com` an admin. Run it in Supabase → **SQL editor** and run the script again; from then on that admin gives the other roles.
- Class and workout dates are relative to the day the script runs, so run it shortly before a demo.

## Accounts and roles

Everyone who signs up is a **User**. Only an admin can change a role.

**Members are users.** There is no separate member table: a member is a user whose account has a membership (a plan, joined and expiry dates, a frozen flag, a personal trainer, phone and notes). The person signs up first, then staff start their membership. Every account can also hold a date of birth and an emergency contact, which only the person and the staff can read.

| Role | Can do |
|---|---|
| User | Log in, see and rename their own account, keep their phone, date of birth and emergency contact up to date, see their own membership, visits and payments and the gym's announcements, book and cancel classes, train in the groups they were added to, change their password |
| Trainer | Everything about their own account, plus see the classes they teach with who booked each one and mark who came, see their own clients, run training groups, and see the equipment and report faults |
| Gym Manager | Manage gym members (add, edit, renew, freeze, pick a trainer; not the accounts of staff), record attendance, take payments and see the list of all payments, run the class timetable, manage equipment, run training groups, and post announcements |
| Admin | Everything a Gym Manager can, plus set the plans, record expenses, see revenue and net income, void payments and export them as CSV, list users and change their roles (including giving the Trainer role), moderate every training group, and read the activity log and the failed-login view |

**Permissions (RBAC).** The server never asks "is this an admin?". Every protected endpoint asks for a permission, and [`backend/app/rbac.py`](backend/app/rbac.py) says which roles hold it. The role is read from the database on every request, so a role change applies on the next request. A missing permission gets `403`; no login gets `401`. Endpoints about your own data (profile, membership, bookings, payments, sessions) need only a login, because they take your id from the token, never from the request.

| Permission | Allows | User | Trainer | Gym Manager | Admin |
|---|---|---|---|---|---|
| `members:read` | Member list and details, waiting list, a member's visits and bookings | | | ✓ | ✓ |
| `members:manage` | Start and edit memberships; cancel a booking for a member | | | ✓ | ✓ |
| `members:delete` | Delete a member's whole account, one or many | | | | ✓ |
| `check_ins:record` | Check members in and out; the attendance list of any day | | | ✓ | ✓ |
| `payments:manage` | Take payments; a member's payments; the list of all payments | | | ✓ | ✓ |
| `classes:manage` | Add, edit and delete classes; list trainers; any class's bookings | | | ✓ | ✓ |
| `classes:teach` | My classes, who booked them and who came (only classes I teach) | | ✓ | | |
| `clients:read` | My clients: the members I am the personal trainer of | | ✓ | | |
| `groups:create` | Start a training group | | ✓ | ✓ | ✓ |
| `equipment:read` | The equipment list; report a fault | | ✓ | ✓ | ✓ |
| `equipment:manage` | Add, edit, service and delete equipment | | | ✓ | ✓ |
| `overview:read` | The front desk part of the Dashboard | | | ✓ | ✓ |
| `announcements:manage` | Post, edit and delete announcements; see ended ones | | | ✓ | ✓ |
| `payments:void`, `payments:export` | Void a payment; export payments as CSV | | | | ✓ |
| `expenses:manage` | List, add, edit, delete and export expenses | | | | ✓ |
| `dashboard:read` | The admin part of the Dashboard: all stats, revenue and net income | | | | ✓ |
| `users:read`, `users:change_role`, `users:ban`, `users:reset_password`, `users:revoke_sessions`, `users:export` | The Users page and a user's details, and their actions (including bulk ban and unban, Log out everywhere and the users CSV) | | | | ✓ |
| `plans:edit` | Add, edit, retire and delete membership plans | | | | ✓ |
| `activity:read` | The Security section: failed logins and the activity log, with its CSV | | | | ✓ |
| `content:moderate` | Training → All groups and All workouts: list, delete and export any of them | | | | ✓ |

**Group permissions.** Who may start a training group is a role permission (`groups:create`); what happens inside one is a second layer, per group, decided in the same module (`rbac.group_permissions()`). The owner holds all five; each member holds `read` plus the ones the owner ticked; anyone outside the group holds none and gets `404` for the group and its workouts, as if they did not exist. A member without the permission an action needs gets `403`. Every group response includes the caller's `my_permissions`, and the app shows only the buttons they allow.

| Group permission | Allows | Owner | Member |
|---|---|---|---|
| `read` | See the group, its people and its workouts | ✓ | ✓ |
| `create` | Add a workout to the group | ✓ | if **Add** is ticked (`can_create`) |
| `update` | Edit the group's workouts | ✓ | if **Edit** is ticked (`can_update`) |
| `assign` | Assign a group workout to someone in the group | ✓ | if **Assign** is ticked (`can_assign`) |
| `manage` | Delete a workout; rename or delete the group; add, remove and set the permissions of members | ✓ | |

`GET /api/v1/users/me` (and the login and refresh responses) include the caller's `permissions`. The app builds its menu and page guards from them, so it shows exactly what the API allows. If the API refuses something because the role changed meanwhile, the app asks for the account again and its menu follows. The two member pages, My membership and Book a class, use only your-own-data endpoints and are shown to Users and to anyone else who has a membership.

Pages: `#/login`, `#/signup`; `#/dashboard`, `#/members`, `#/attendance`, `#/payments`, `#/classes` and `#/announcements` (Gym Manager, Admin); `#/equipment` (Trainer, Gym Manager, Admin); `#/plans`, `#/expenses`, `#/users`, `#/security` and `#/activity` (Admin); `#/my-classes` and `#/clients` (Trainer); `#/membership` and `#/timetable` (User); `#/training`, `#/account` and `#/devices` (everyone). The same names without `#` work too (`/members?filter=active`). A page the person's role may not open shows **No access**, and the API refuses its data with `403`. After logging in, Gym Managers and Admins land on the Dashboard, a Trainer on My classes and a User on My membership. The menu is a sidebar in sections (Front desk, Gym, Business, Administration, You); on a phone it opens with **Menu**, and tables become cards.

Times and days are the gym's (Dhaka, UTC+6) everywhere in the app and the API's date filters; the database and the CSV time columns keep UTC.

**Gym Manager features (also available to Admins)**
- **Dashboard:** today at the front desk: who is in the gym now, check-ins and payments today, memberships expiring in 7 days, people waiting for a membership, equipment to fix and services due, the next 5 classes with places booked, and the announcements. Each number links to its list, which shows the same number. Revenue, expenses and account numbers show to admins only.
- **Attendance:** type part of a name, email or phone and press **Check in** (Enter works when one person matches). Frozen and expired members cannot be checked in, and someone already inside has to be checked out first. **Check out** records when they left and how long they stayed. **In the gym now** shows who is inside; the **Day** box lists any earlier day. The same buttons are on a member's page.
- **Visit history:** each member's visits, newest first, with when they came and left and who recorded each one.
- **A member's bookings:** on the member's page, **Bookings** lists the classes they booked, soonest first, with **Cancel** so the front desk can cancel for them; **Past** lists the classes that have already started, with who came.
- **Renewals due:** the **Expiring soon** chip on the Members page lists the active (not frozen) memberships that end today or within the next 7 days, soonest first, so staff know who to remind. Every member whose expiry is that close shows "ends today", "ends tomorrow" or "5 days left" under the date. The filter is kept in the address (`#/members?filter=expiring_soon`), so the Dashboard can link to it.
- **Contact and safety details:** a member's page shows their phone, date of birth (with their age) and emergency contact (a name and a phone). **Edit** changes them with the same checks the member gets on My account, so the front desk can fill them in for someone, and either side sees the other's changes. A User or Trainer can never read another person's details: every member endpoint answers them `403`.
- **Find a member:** the search box on the Members page finds members by part of their name, email or phone, in any case, together with the status chips.
- **Waiting for a membership:** this chip on the Members page lists the people who signed up in the app but have no membership yet, newest first. **Start membership** opens **Add member** with their email filled in, so nobody types an email by hand.
- **Add a member:** the person signs up first. On the Members page, **Add member** takes the email they signed up with, a plan, and optionally a personal trainer, phone, notes and an expiry date (left empty, the membership runs for the plan's days). **First payment** records the plan's price as paid in the same step. Their name comes from their account. Leaving the phone empty keeps one the person already saved on My account. An email with no account is refused ("Ask the person to sign up first"), and so is an account that already has a membership.
- **A member's page:** every member's name, in any list, opens it (`#/members?member=5`), so a reload or a shared link shows the same: the membership, contact details, payments, visits and bookings, with **Edit**, **Freeze** and (for an Admin) **Delete**.
- **Delete a member (Admin):** deletes the person's whole account; a Gym Manager gets `403`. They can no longer log in, and their check-ins and class bookings are removed; their payments stay on record. Only a User's account can be deleted here: a Gym Manager or Admin who has a membership must have their role changed first.
- **Classes:** the **Classes** page lists upcoming classes (or all of them), in start-time order. Add a class with a name, a start time that has not passed, a length (15 to 240 minutes) and places (1 to 200), plus an optional description and an optional trainer, picked from the accounts with the Trainer role (banned ones are left out). The class shows the trainer's current name, so a trainer who changes their name on My account shows the new one everywhere. A class whose trainer is no longer a trainer keeps their name as text: editing it offers that name ("Lina (name only)") until a trainer or **No trainer** is chosen. Edit or delete a class, and open **Bookings** to see who has booked it and, from an hour before it starts, mark each person **Came** or **Missed** (pressing the mark again clears it). Capacity cannot be lowered below the bookings already made, and deleting a class deletes its bookings. A member's bookings are made by the member (see **User features**).

- **Payments:** on a member's page, **Take a payment** records what the member paid (amount in whole taka, and cash, card, bank transfer or mobile banking, with an optional note). **Renew the membership with this payment** is ticked to begin with: pick the plan, and the amount fills in from the plan's price and the new expiry date is shown. An active member renews from their current expiry, so no paid days are lost; an expired member renews from today. The member's payments are listed newest first; a voided one is struck through with the reason. A payment stays on record when its member's account is deleted.
- **Equipment:** the **Equipment** page lists what the gym owns, with a category, how many, when it was bought and serviced, and how often it needs a service; the next service date is worked out from those. **Report fault** marks it out of order with what is wrong and who said so; **Being repaired** shows it is in hand; **Fixed** (or **Serviced**) records the service today, clears the fault and moves the next service on. Lists: All, Working, Needs attention, Service due (overdue or within 7 days).
- **Announcements:** the **Announcements** page posts holiday hours, new classes and other news: a title, a message (line breaks are kept) and an optional **Show until** date, the last day it shows (it cannot be before today). Leave the date empty to keep it up until it is deleted. Members see the current announcements on My membership, trainers on My classes, and staff on the Dashboard. **Showing now** lists what members see; **All, with ended** also lists the ended ones. **Edit** changes the text or the date (an ended one keeps its date until a new one is picked, so its text can still be corrected) and **Delete** removes it straight away. Each shows who posted it, when, and whether it was edited. A User or Trainer cannot post (`403`).
- **All payments:** the **Payments** page lists every payment, newest first, with filters for dates (From and To, both included), method and part of the member's name. Above the list is the total of the matching payments, on every page and not just the rows shown. The From and To dates are kept in the address (`#/payments?from=2026-11-20&to=2026-11-20`), so a link can open the list on a day. Voided payments are hidden unless **Show voided** is ticked, and never count towards the total.

**User features**
- **My membership:** plan, status, joined and expiry dates, personal trainer, and the person's own visits, newest first, with when they came and left. A User can only ever see their own record. Before staff start a membership, the page says so, shows the email to give the front desk, and lists the plans and prices.
- **Announcements:** on My membership, the gym's current announcements, newest first, with who posted them. An announcement disappears the day after its end date.
- **My bookings:** on My membership, the person's upcoming classes with **Cancel**, and past classes (marked **Attended** or **Missed**).
- **Plans and prices:** on My membership, what each plan costs and how many days it adds, with the person's own plan marked, and how renewing at the front desk works.
- **My payments:** on My membership, the person's own payments, newest first. A voided payment shows as voided with the reason. Nobody can see another person's payments.
- **Book a class:** upcoming classes with places left. **Book** takes a place, **Cancel booking** frees it (until the class starts; after that the booking is history and cannot be cancelled by anyone). Booking needs a valid membership (not frozen or expired) and a class that has not started; a full class or one you already booked is refused with a clear message. Two people booking the last place at the same moment cannot both get it.
- **My contact details:** on My account, every logged-in person keeps their own phone, date of birth and emergency contact up to date. The date of birth must be between 1 Jan 1900 and today, and the emergency contact needs both a name and a phone, or neither. Only the person and the gym staff can see them; staff see them in the member details.
- **My account:** change your name, and change your password. A password change logs out every other device where you were logged in; the one you used stays logged in.
- **Login devices** (`#/devices`, in the menu under You): every device that holds a valid refresh token for your account (for example "Chrome on Windows"), when and from which IP address it logged in, when it was last used (its last refresh) and when its login ends if it is not used again, with **This device** marked. **Log out** next to one ends that login on the server at once: its next request is refused and it shows Log in. Logging out **This device** is a normal logout. A device is one refresh token: a refresh replaces the token but keeps the device, and logging in again on the same browser replaces the earlier device instead of adding a second one.

**Trainer features**
- **My classes:** the classes the trainer teaches, upcoming ones soonest first, with places booked; **Past** lists the classes that have started, latest first. **Bookings and attendance** lists the people booked on a class, in booking order, and from an hour before it starts marks each one **Came** or **Missed**. A trainer can read and mark their own classes only: any other class's bookings answer `403`. Trainers land here after logging in.
- **My clients:** the members the trainer is the personal trainer of, with their phone, plan, membership status and last visit, and no payments, notes or date of birth. Staff pick a member's trainer on the Members page.
- **Equipment:** the list, and **Report fault**.
- **Becoming a trainer:** an admin gives the **Trainer** role on the Users page; a Gym Manager can then pick them for classes and members. If an admin changes a trainer's role, their classes keep their name as plain text and their clients have no trainer until staff pick another.

**Training**
- **Assigned to me:** the workouts assigned to a person, from every group they are in, latest first. **Mark as done** records when they did it; only the person it is assigned to can, and giving it to someone else clears the mark.
- **My groups:** trainers, gym managers and admins start training groups and own the ones they start. The owner adds people who already have an account by their email (a trainer's own clients are suggested) and ticks what each one may do: **Add** workouts, **Edit** them, **Assign** them to someone in the group. Ticking a box applies on that person's next request. Everyone in the group sees its workouts and its people; only the owner sees their emails. Outside the group, anyone (even an admin) gets `404` for it.
- **A group's page:** its workouts (latest date first) with the buttons the person's permissions allow, and the people table. Only the owner can delete a workout (whoever added it), rename or delete the group (which deletes its workouts) and add or remove people; a member can **Leave group**, which unassigns the workouts assigned to them. The owner cannot leave: they delete the group instead.
- Deleting an account deletes the groups it owns; workouts it added to other groups stay, without a name.

**Admin features**
- **Dashboard:** below the front desk part, accounts (total, new in the last 7 days, banned, admins, gym managers, trainers), members (total, new, active, expired, frozen, expiring soon), records and groups (training groups and workouts with how many are new in 7 days, workouts done, upcoming classes, equipment), and check-ins on each of the last 7 days.
- **Revenue and net income:** the money taken today, this month and in the last 30 days (today included), the expenses and net income this month, the last 30 days split by payment method, and a column chart of the last 6 months (hover or focus a column for its amount; **Show as a table** lists every month with its expenses and net income). Each number counts the same days as the Payments and Expenses filters, so it matches those pages. Voided payments are never counted.
- **Plans:** the **Plans** page adds, edits and retires the plans the gym sells: a name, a price (whole taka), a length in days and what it includes. The price fills in the amount when staff take a payment, and the days decide how far a new membership or a renewal runs. Payments already taken are not changed. A retired plan cannot be chosen any more, but the members who have it keep it; only a plan nobody ever had can be deleted.
- **Expenses:** the **Expenses** page records what the gym spends (rent, salaries, utilities, equipment, maintenance, marketing, other) with an amount, a date up to today and a description, and lists them with filters, a total and **Export CSV**. Deleting one is written to the activity log.
- **Void a payment:** on the **Payments** page, **Void** marks a mistaken payment, with a reason that must be given. The payment stays on record (struck through, with who voided it, when and why) but is left out of every total. Voiding an already voided payment changes nothing. Voiding does not change the member's expiry date; edit it on the Members page if a renewal was wrong.
- **Export CSV:** on the **Payments** page, **Export CSV** downloads the payments that match the current filters (not just the page shown), newest first, up to 10,000 rows (every CSV download has that limit), with the columns `id`, `paid_at_utc`, `member`, `member_id`, `amount_taka`, `method`, `plan`, `renewed_until`, `note`, `recorded_by`, `voided_at_utc`, `void_reason` and `voided_by`. It opens in Excel or Google Sheets with Bengali names intact, and any text that a spreadsheet would run as a formula (starting with `=`, `+`, `-` or `@`) is saved with a leading `'` so it shows as plain text. Each download is recorded in the activity log, with the filters used and the number of rows.
- **Users and their memberships:** the **Users** page lists every account, newest first, 20 to a page with **Previous** and **Next**, each with its role, membership (linking to the member) and status. The search (name or email), the **role** filter and the **status** filter (active or banned) work together. A role is changed in the list, after a question that says what the role may do.
- **Ban or unban many at once:** tick users (or the box in the header for every row shown), then **Ban selected** or **Unban selected**, with one optional reason (up to 100 at a time, in one transaction). You, admins and accounts with nothing to change are skipped, and the message names each one and why ("Skipped: Abe Admin (You cannot ban an admin; change their role first)"); everyone else is banned or unbanned.
- **A user's details:** click a name on the Users page (`#/users?user=5`) to see the account, role, status (with any ban reason or login lockout), when the password last changed, membership, the browsers where they are logged in, their training groups, how many visits, bookings, payments and workouts they have with the 5 newest of each, and their 10 newest activity rows, with a link to all of them. **Log out everywhere** ends every session of that user: their next request is refused and the app shows Log in; their password does not change. It is not offered for your own account (use **Login devices**).
- **Moderation:** on **Training**, **All groups** lists every training group, newest first, with its owner and how many people and workouts it has (filter by search and the days it was started), and **All workouts** lists every workout, latest date first, with who added it, its group and its assignee (filter by search, status and the workout's date; a group's workout count opens just that group's). **Delete** removes one; tick rows (or the header box) and **Delete selected** removes many; the question says what goes with them. There is no undo and no editing. Every delete is a `workout_delete` or `group_delete` row in the activity log, with the owner as the account affected. **Export CSV** on each downloads the same rows as the list, and the download is logged.
- **Export users:** **Export CSV** on the Users page downloads every user matching the current filters, newest first, with `id`, `name`, `email`, `role`, `status`, `banned_at_utc`, `ban_reason`, `must_change_password`, `plan`, `joined_on`, `expires_on`, `is_frozen` and `created_at_utc` (formula-safe and readable in Excel, like the payments CSV). The download is recorded in the activity log.
- **Reset a password:** on a user's details, **Reset password** (not for yourself or another admin) makes a random 12-character temporary password and shows it once, with **Copy**, to hand over in person. The person's old password stops working, every session they had is logged out, and any login lockout is cleared. When they log in with the temporary password, the app shows only **Choose a new password** (the API refuses everything else with `403 Choose a new password first`); the new one must differ from the temporary one, and the app then opens normally.
- **Activity log:** lists security events, newest first: sign-ups, logins, failed logins (with the email that was typed, even when no account has it), lockouts, logouts, ended sessions, password changes and failed changes, password resets, role changes, bans and unbans, every delete (accounts, workouts, groups, classes, equipment, announcements, plans, expenses), people removed from or leaving a group, cancelled bookings, voided payments, and CSV exports. Each row shows who did it, the account affected, details (such as `user → trainer` or a ban reason), the time, the IP address and the browser. Filter by event, by From and To dates (both included) and by a search over the emails, IP address and details; click an email to show only that account's activity, or an address to show everything from it. The filters are kept in the address (`#/activity?event=login_failed&q=192.0.2.66`). **Export CSV** downloads the same rows as the list (up to the newest 10,000), and the download is logged too. Passwords, temporary passwords and tokens are never written to the log. On Vercel the IP address comes from the `X-Forwarded-For` header the platform sets; elsewhere it is the address of the connection.
- **Security:** failed logins, rejected tokens (not made by this server, logged once a minute at most for each address; an expired one is normal and not counted) and denied requests (403) in the last 1, 6 or 24 hours, 3 or 7 days, and the lockouts. The 10 IP addresses with the most show what happened, the emails tried, the browser and the last time seen; the 10 emails with the most failed logins show from how many addresses. A box sets the least number an address or email needs to be listed (3 to start with), and rows with 5 or more (as many as one lockout) are marked **Watch**. Each row opens the activity log filtered to those attempts.
- **Ban / unban:** on the **Users** page, an admin can ban a User or Gym Manager with an optional reason. A banned person gets `403 Account banned` when logging in and on every request, even with a token that has not expired, and the app logs them out. A ban also ends all their sessions, so their refresh cookie cannot get a new token, and unbanning does not bring those sessions back. Unbanning restores access with their role and data unchanged. An admin cannot ban themself or another admin; change the other admin's role first.

**First admin.** Nobody can make themselves an admin. Sign up in the app, then in Supabase → **Table Editor** → `app_user`, set that row's `role` to `admin` (or run `update app_user set role = 'admin' where email = 'you@example.com';` in the SQL editor). Log in again. From then on, change roles on the **Users** page.

**Lockout.** After 5 wrong passwords in a row for an account, on Log in or as the current password of a password change, both are blocked for 15 minutes, even with the right password: the app shows "Too many wrong passwords. Try again in 15 minutes." (`429`, with a `Retry-After` header in seconds). Attempts while it is blocked do not count, and a successful login resets the count. Someone already logged in stays logged in. An email with no account always gets the same "Wrong email or password".

**Logins and sessions.** Logging in starts a session for that browser and gives two tokens:
- an **access token** (a JWT holding the user id, role and session id) that lasts **5 minutes**. The app keeps it in memory only, never in `localStorage` or `sessionStorage`, and sends it as `Authorization: Bearer …`;
- a **refresh token** in a cookie that page scripts cannot read (`HttpOnly`, `Secure`, `SameSite=Strict`, sent only to `/api/v1/auth`) that lasts **7 days**. The database keeps only its SHA-256 hash.

When the access token expires, the API answers `401`. The app then calls `POST /api/v1/auth/refresh` once, gets a new access token and a new refresh cookie (the old one is replaced: **rotation**), and repeats the request, so the person notices nothing. After a reload the app gets its access token the same way, showing "Loading…" meanwhile, never a flash of the Log in page. If the server cannot be reached, nobody is logged out: the app says so and offers **Try again**. If an old refresh token is used again more than 30 seconds after it was replaced, someone copied it, and the whole session is ended. **Log out** ends the session on the server: its access token is refused at once (every request checks that its session is still active), not only after 5 minutes. A session also ends after 7 days without use, when the password is changed (other devices only) or reset, when someone logs in again on the same browser, and when the account is banned.

**`JWT_SECRET` and `PASSWORD_PEPPER`.** Access tokens are signed with `JWT_SECRET`, and passwords are hashed with Argon2 after mixing in `PASSWORD_PEPPER` (HMAC-SHA256), a secret kept only in the server's environment: someone with a copy of the database but not the pepper cannot test password guesses. Both must be at least 32 bytes. On Vercel both are required; generate each with `python -c "import secrets; print(secrets.token_urlsafe(48))"` and add them under **Settings** → **Environment Variables**. Never change the pepper once set: every password hashed with it would stop working. Locally both are optional: without `JWT_SECRET` the backend makes a temporary secret (you log in again after each restart), and without `PASSWORD_PEPPER` it uses a fixed development pepper. Passwords hashed before the pepper existed still work: the next successful login replaces the hash with a peppered one.

## REST API

Interactive docs: `/api/docs` (for example http://localhost:8000/api/docs).

| Operation | Method and path | Success | Errors |
|---|---|---|---|
| Create (start a membership) | `POST /api/v1/members` `{email, plan, expires_on?, trainer_id?, phone?, notes?, payment_method?}` (no `expires_on`: the plan's days; `payment_method`: the plan's price is recorded as paid) | `201` member | `409` (already a member), `422` (no account has that email, a plan the gym does not offer, or not a trainer) |
| Read list | `GET /api/v1/members?offset=0&limit=20&status=active&q=rafi` (`q`: part of the name, email or phone) | `200` `{items, total, offset, limit}`, newest first (`expiring_soon`: soonest expiry first) | `422` |
| Read single | `GET /api/v1/members/{id}` | `200` member | `404` |
| Update | `PATCH /api/v1/members/{id}` | `200` member | `403` (a Gym Manager, for a staff account), `404`, `422` |
| Delete (the account, admin) | `DELETE /api/v1/members/{id}` | `204` | `400` (a staff account), `403`, `404` |
| Delete several (admin) | `POST /api/v1/members/bulk-delete` with `{"ids": [1, 2, 3]}` | `200` `{"deleted": 3}` | `400` (one is a staff account; nothing deleted), `403`, `422` |
| Record a payment | `POST /api/v1/members/{id}/payments` `{amount, method, note?, renew_plan?}` | `201` payment | `403`, `404`, `422` |
| Member's payments | `GET /api/v1/members/{id}/payments?offset=0&limit=20` | `200` `{items, total, offset, limit}`, newest first, voided included | `403`, `404`, `422` |
| All payments | `GET /api/v1/payments?date_from=&date_to=&method=&member=&include_voided=false&offset=0&limit=20` | `200` `{items, total, offset, limit, total_amount}`, newest first; `total_amount` leaves out voided payments | `401`, `403`, `422` (bad method, or `date_from` after `date_to`) |
| Void a payment (admin) | `POST /api/v1/payments/{id}/void` `{"reason": "Entered twice"}` | `200` payment with `voided_at`, `void_reason`, `voided_by_name` (again: unchanged) | `403`, `404`, `422` (no reason) |
| Export payments (admin) | `GET /api/v1/payments/export.csv` with the same filters | `200` `text/csv` file | `403`, `422` |
| My bookings | `GET /api/v1/users/me/bookings?when=upcoming&offset=0&limit=20` (`when=past` for started classes) | `200` `{items, total, offset, limit}` of `{class_id, class_name, starts_at, duration_minutes, trainer_name, booked_at}` | `401`, `422` |
| My payments | `GET /api/v1/users/me/payments?offset=0&limit=20` | `200` `{items, total, offset, limit}`, only my own, newest first | `401` |
| Plans | `GET /api/v1/plans` (any logged-in user) | `200` list of `{plan, name, price, duration_days, description, is_active}`, cheapest first, retired ones included | `401` |
| Add a plan (admin) | `POST /api/v1/plans` `{name, price, duration_days, description?}` | `201` plan (its code is made from the name) | `403`, `409` (name taken), `422` |
| Change or retire a plan (admin) | `PATCH /api/v1/plans/{plan}` (only the fields sent; `is_active: false` retires it) | `200` plan | `403`, `404`, `409`, `422` |
| Delete a plan (admin) | `DELETE /api/v1/plans/{plan}` | `204` | `403`, `404`, `409` (a member or payment has it) |
| Check in a member | `POST /api/v1/members/{id}/check-ins` | `201` check-in | `400` (frozen or expired), `403`, `404`, `409` (already inside) |
| Check out | `POST /api/v1/check-ins/{id}/check-out` | `200` check-in with `checked_out_at` | `400` (already out, or an earlier day), `403`, `404` |
| Member's visits | `GET /api/v1/members/{id}/check-ins?offset=0&limit=20` | `200` `{items, total, offset, limit}`, newest first | `403`, `404`, `422` |
| Attendance | `GET /api/v1/check-ins?day=2026-11-25&inside=false&q=&offset=0&limit=50` (no `day`: today; `inside=true`: in the gym now) | `200` `{items, total, offset, limit}`, newest first | `401`, `403`, `422` |
| Add a class | `POST /api/v1/classes` `{name, starts_at, duration_minutes, capacity, description?, trainer_id?}` | `201` class, with `trainer_id` and `trainer_name` (the trainer's current name) | `403`, `422` (including a start in the past, or a `trainer_id` that is not a Trainer) |
| List trainers (Gym Manager, Admin) | `GET /api/v1/trainers` | `200` list of `{id, name}`, by name | `401`, `403` |
| My classes (Trainer) | `GET /api/v1/trainers/me/classes?when=upcoming&offset=0&limit=20` (`when=past` for started classes) | `200` `{items, total, offset, limit}` of classes I teach | `401`, `403`, `422` |
| My clients (Trainer) | `GET /api/v1/trainers/me/clients?offset=0&limit=20` | `200` `{items, total, offset, limit}` of `{id, name, email, phone, plan, expires_on, is_frozen, last_visit_at}` | `401`, `403` |
| List classes | `GET /api/v1/classes?upcoming=true&offset=0&limit=20` (any logged-in user) | `200` `{items, total, offset, limit}` ordered by start time, each with `booked_count` | `401`, `422` |
| One class | `GET /api/v1/classes/{id}` (any logged-in user) | `200` class | `401`, `404` |
| Edit a class | `PATCH /api/v1/classes/{id}` (`trainer_id`: a Trainer, or `null` for none; either replaces an old text name) | `200` class | `403`, `404`, `422` (including capacity below the bookings, or a `trainer_id` that is not a Trainer) |
| Delete a class | `DELETE /api/v1/classes/{id}` | `204` | `403`, `404` |
| Class bookings | `GET /api/v1/classes/{id}/bookings` (Gym Manager, Admin; a Trainer for the classes they teach) | `200` `{items, total, offset, limit}` with member name, time and `attended` | `403` (including a Trainer and another class), `404` |
| Mark attendance | `PUT /api/v1/classes/{id}/bookings/{member_id}/attendance` `{"attended": true}` (`null` clears it; same people as above) | `200` booking | `400` (more than an hour before the class), `403`, `404` (not booked) |
| Book a class | `POST /api/v1/classes/{id}/bookings` (for the logged-in user) | `201` booking | `400` (membership not valid or class started), `404` (no membership, or no such class), `409` (full or already booked) |
| Cancel my booking | `DELETE /api/v1/classes/{id}/bookings` | `204` | `400` (class has started), `404` |
| A member's bookings | `GET /api/v1/members/{id}/bookings?when=upcoming&offset=0&limit=20` | `200` same shape as My bookings | `403`, `404`, `422` |
| Cancel for a member | `DELETE /api/v1/members/{id}/bookings/{class_id}` | `204` | `400` (class has started), `403`, `404` |
| My contact details | `GET /api/v1/users/me/profile` | `200` `{phone, date_of_birth, emergency_contact_name, emergency_contact_phone}`, my own only | `401` |
| Change my contact details | `PATCH /api/v1/users/me/profile` (only the fields sent; `null` or blank text clears one) | `200` the same shape | `401`, `422` (date of birth before 1900 or in the future, too long, or an emergency contact with only a name or only a phone) |
| My membership | `GET /api/v1/users/me/membership` | `200` member | `401`, `404` (no membership yet) |
| My visits | `GET /api/v1/users/me/check-ins?offset=0&limit=20` | `200` `{items, total, offset, limit}`, newest first | `401`, `404` |
| Change my password | `POST /api/v1/users/me/password` `{current_password, new_password}` | `204`; every other session is ended, this one stays (also ends the must-choose-a-new-password state) | `400` (wrong current password, or the new one is the same), `401`, `422` |
| My login devices | `GET /api/v1/users/me/sessions` | `200` list of `{id, created_at, last_used_at, expires_at, ip, user_agent, current}`, most recently used first; only those with a valid refresh token | `401` |
| Log out a device | `DELETE /api/v1/users/me/sessions/{id}` | `204`; that device's refresh cookie and access token stop working at once | `401`, `404` (not mine, or no longer active) |
| Health | `GET /api/health` | `200` `{"status": "ok"}` | |
| Sign up | `POST /api/v1/auth/signup` `{email, name, password}` | `201` user (role `user`) | `409`, `422` |
| Log in | `POST /api/v1/auth/login` `{email, password}` | `200` `{access_token, token_type, expires_in, user}` and a `refresh_token` cookie | `401`, `403` (banned), `422`, `429` (locked after 5 wrong passwords) |
| Refresh | `POST /api/v1/auth/refresh` (the browser sends the cookie) | `200` same as Log in, with a new cookie (rotation); `204` when there is no cookie (not logged in) | `401` (expired, revoked or reused; the cookie is cleared) |
| Log out | `POST /api/v1/auth/logout` | `204`; the session is revoked and the cookie cleared (always `204`) | |
| My account | `GET` / `PATCH /api/v1/users/me` | `200` user with `permissions` (the list from `app/rbac.py` for my role) | `401`, `422` |
| Front desk overview (Gym Manager, Admin) | `GET /api/v1/overview` | `200` `{check_ins_today, inside_now, expiring_soon, waiting, payments_today: {count, amount}, equipment_attention, equipment_service_due, next_classes}` | `401`, `403` |
| Current announcements | `GET /api/v1/announcements?offset=0&limit=20` (any logged-in user; `include_ended=true` for Gym Manager, Admin) | `200` `{items, total, offset, limit}` of `{id, title, message, ends_on, posted_at, updated_at, posted_by_name}`, newest first; without `include_ended`, only those with no `ends_on` or one of today or later | `401`, `403` (`include_ended` from a User or Trainer) |
| Post an announcement (Gym Manager, Admin) | `POST /api/v1/announcements` `{title, message, ends_on?}` | `201` announcement | `403`, `422` (empty or too long, or `ends_on` before today) |
| Edit an announcement (Gym Manager, Admin) | `PATCH /api/v1/announcements/{id}` (only the fields sent; `ends_on: null` removes the end date) | `200` announcement, `updated_at` set | `403`, `404`, `422` |
| Delete an announcement (Gym Manager, Admin) | `DELETE /api/v1/announcements/{id}` | `204` | `403`, `404` |
| Dashboard stats (admin) | `GET /api/v1/admin/stats` | `200` `{members, users, check_ins, classes, workouts, groups, equipment}` counts; `check_ins.by_day` holds the last 7 days | `401`, `403` |
| Revenue (admin) | `GET /api/v1/admin/revenue` | `200` `{today, this_month, expenses_this_month, net_this_month, last_30_days, last_30_days_from, by_method, months: [{month, amount, expenses, net}]}` in whole taka, voided left out | `401`, `403` |
| Expenses (admin) | `GET /api/v1/expenses?date_from=&date_to=&category=&q=&offset=0&limit=20` | `200` `{items, total, offset, limit, total_amount}`, latest first | `401`, `403`, `422` |
| Add / edit / delete an expense (admin) | `POST /api/v1/expenses` `{category, amount, spent_on, description?}`, `PATCH` / `DELETE /api/v1/expenses/{id}` | `201` / `200` expense / `204` (the delete is logged) | `403`, `404`, `422` (a date in the future) |
| Export expenses (admin) | `GET /api/v1/expenses/export.csv` with the same filters | `200` `text/csv` file; logged | `403`, `422` |
| Equipment (Trainer, Gym Manager, Admin) | `GET /api/v1/equipment?status=&category=&needs_attention=false&service_due=false&q=&offset=0&limit=20` | `200` `{items, total, offset, limit}`, by name | `401`, `403`, `422` |
| Report a fault (Trainer, Gym Manager, Admin) | `POST /api/v1/equipment/{id}/report` `{"issue": "Belt slips"}` | `200` equipment, `out_of_order` | `403`, `404`, `422` |
| Add / edit / delete equipment (Gym Manager, Admin) | `POST /api/v1/equipment` `{name, category, quantity?, purchased_on?, service_every_days?, last_serviced_on?, notes?}`, `PATCH` / `DELETE /api/v1/equipment/{id}` | `201` / `200` equipment / `204` | `403`, `404`, `422` |
| Record a service (Gym Manager, Admin) | `POST /api/v1/equipment/{id}/service` | `200` equipment, `working`, with the next service date | `403`, `404` |
| Waiting for a membership | `GET /api/v1/members/waiting?offset=0&limit=20&q=` | `200` `{items, total, offset, limit}` of `{id, name, email, role, created_at}`: User accounts with no membership, newest first | `401`, `403` |
| List users (admin) | `GET /api/v1/admin/users?offset=0&limit=20&q=&role=&status=` (`q`: part of the name or email; `role`: `user`, `trainer`, `gym_manager` or `admin`; `status`: `active` or `banned`) | `200` `{items, total, offset, limit}`; each user has `is_banned`, `banned_at`, `ban_reason`, `plan`, `expires_on`, `is_frozen` | `401`, `403`, `422` (unknown role or status) |
| Export users (admin) | `GET /api/v1/admin/users/export.csv` with the same filters | `200` `text/csv` file `users-YYYY-MM-DD.csv` (`Cache-Control: no-store`); the export is logged | `401`, `403`, `422` |
| A user's details (admin) | `GET /api/v1/admin/users/{id}` | `200` the user plus `joined_on`, `locked_until`, `password_changed_at`, `sessions` (active), `records {visits, bookings, payments, workouts_added, workouts_assigned, workouts_completed}`, `recent_records {workouts, bookings, visits, payments}` (5 newest of each), `groups [{id, name, is_owner, member_count}]`, `recent_activity` (10 newest) | `401`, `403`, `404`, `422` |
| Log a user out everywhere (admin) | `POST /api/v1/admin/users/{id}/revoke-sessions` | `200` `{"revoked": 2}`; their next request gets `401` | `400` (yourself), `403`, `404` |
| Moderate workouts (admin) | `GET /api/v1/admin/workouts?owner_id=&group_id=&status=&date_from=&date_to=&q=&offset=0&limit=20` (dates: the workout's date; `status`: `unassigned`, `to_do` or `done`) | `200` `{items, total, offset, limit}` of workouts with `owner_email`, latest date first | `401`, `403`, `422` |
| Export workouts (admin) | `GET /api/v1/admin/workouts/export.csv` with the same filters | `200` `text/csv` `workouts-YYYY-MM-DD.csv` (`Cache-Control: no-store`), the same rows as the list; logged | `401`, `403`, `422` |
| Delete workouts (admin) | `DELETE /api/v1/admin/workouts/{id}` or `POST /api/v1/admin/workouts/bulk-delete` `{"ids": [1, 2]}` (1 to 100) | `204` / `200` `{"deleted": 2}` (unknown ids skipped); one `workout_delete` log row each | `403`, `404` (single), `422` |
| Moderate groups (admin) | `GET /api/v1/admin/groups?owner_id=&date_from=&date_to=&q=&offset=0&limit=20` (dates: the day it was made) | `200` `{items, total, offset, limit}` of `{id, name, owner_id, owner_name, owner_email, created_at, member_count, workout_count}`, newest first | `401`, `403`, `422` |
| Export groups (admin) | `GET /api/v1/admin/groups/export.csv` with the same filters | `200` `text/csv` `groups-YYYY-MM-DD.csv`; logged | `401`, `403`, `422` |
| Delete groups (admin) | `DELETE /api/v1/admin/groups/{id}` or `POST /api/v1/admin/groups/bulk-delete` `{"ids": [1]}` | `204` / `200` `{"deleted": 1}`; their workouts and memberships go too; one `group_delete` log row each | `403`, `404` (single), `422` |
| Bulk ban / unban (admin) | `POST /api/v1/admin/users/bulk-ban` or `/bulk-unban` `{"ids": [3, 4], "reason": "optional"}` (1 to 100 ids) | `200` `{banned: [ids], skipped: [{id, name, reason}]}` (`unbanned` for an unban); yourself, admins, no change and unknown ids are skipped | `403`, `422` |
| Change role (admin) | `PATCH /api/v1/admin/users/{id}/role` `{"role": "trainer"}` (`user`, `trainer`, `gym_manager` or `admin`) | `200` user | `400` (own role), `403`, `404`, `422` |
| Ban (admin) | `POST /api/v1/admin/users/{id}/ban` `{"reason": "optional"}` | `200` user | `400` (self or another admin), `403`, `404`, `422` |
| Unban (admin) | `POST /api/v1/admin/users/{id}/unban` | `200` user | `403`, `404` |
| Reset a password (admin) | `POST /api/v1/admin/users/{id}/reset-password` | `200` `{user, temporary_password}` (`Cache-Control: no-store`); the user's `must_change_password` is `true` until they choose a new one | `400` (yourself or another admin), `403`, `404` |
| Activity log (admin) | `GET /api/v1/admin/activity?event=&user_id=&date_from=&date_to=&q=&offset=0&limit=50` (`user_id`: rows where that account acted or was acted on; `q`: part of an email, the IP address or the details) | `200` `{items, total, offset, limit}` of `{id, created_at, event, actor_id, actor_email, target_id, target_email, details, ip, user_agent}`, newest first | `401`, `403`, `422` (unknown event, or `date_from` after `date_to`) |
| Export the activity log (admin) | `GET /api/v1/admin/activity/export.csv` with the same filters | `200` `text/csv` file `activity-YYYY-MM-DD.csv` (`Cache-Control: no-store`), the same rows as the list up to 10,000; the export is logged | `401`, `403`, `422` |
| Assigned to me | `GET /api/v1/workouts/assigned?offset=0&limit=20` | `200` `{items, total, offset, limit}` of `{id, title, workout_date, notes, group_id, group_name, owner_id, owner_name, assigned_to, assigned_to_name, completed_at, created_at, updated_at}`, latest date first | `401` |
| Add a workout | `POST /api/v1/workouts` `{title, workout_date, group_id, notes?, assigned_to?}` | `201` workout | `403` (no `create`, or `assigned_to` without `assign`), `404` (not in that group), `422` (no group, bad date or text, or `assigned_to` outside the group) |
| One workout | `GET /api/v1/workouts/{id}` | `200` workout | `404` (a group I am not in) |
| Edit a workout | `PATCH /api/v1/workouts/{id}` `{title?, workout_date?, notes?}` | `200` workout | `403` (no `update`), `404`, `422` |
| Assign a workout | `PUT /api/v1/workouts/{id}/assignee` `{"user_id": 5}` (`null` unassigns) | `200` workout, not done | `403` (no `assign`), `404`, `422` (not in the group) |
| Mark a workout done | `PUT /api/v1/workouts/{id}/completion` `{"done": true}` (`false` clears it) | `200` workout | `403` (it is not assigned to me), `404` |
| Delete a workout | `DELETE /api/v1/workouts/{id}` | `204` | `403` (not the owner of its group), `404` |
| My groups | `GET /api/v1/groups?offset=0&limit=20` | `200` `{items, total, offset, limit}` of `{id, name, owner_id, owner_name, created_at, member_count, workout_count, my_permissions}`, by name | `401` |
| Start a group (Trainer, Gym Manager, Admin) | `POST /api/v1/groups` `{name}` | `201` group; I am its owner | `401`, `403`, `422` |
| One group | `GET /api/v1/groups/{id}` | `200` group | `404` (not in it) |
| Rename / delete a group | `PATCH /api/v1/groups/{id}` `{name}` / `DELETE /api/v1/groups/{id}` | `200` group / `204` (its workouts and members go too) | `403` (a member), `404` (not in it) |
| A group's workouts | `GET /api/v1/groups/{id}/workouts?offset=0&limit=20` | `200` page of workouts, latest date first | `404` |
| A group's people | `GET /api/v1/groups/{id}/members` | `200` list of `{user_id, name, email, is_owner, can_create, can_update, can_assign, added_at}`, owner first; `email` only for the owner | `404` |
| Add someone (owner) | `POST /api/v1/groups/{id}/members` `{email, can_create?, can_update?, can_assign?}` | `201` member | `403`, `404`, `409` (already in the group), `422` (no account has the email) |
| Change permissions (owner) | `PATCH /api/v1/groups/{id}/members/{user_id}` (only the flags sent) | `200` member | `400` (the owner's row), `403`, `404` |
| Remove someone / leave | `DELETE /api/v1/groups/{id}/members/{user_id}` (my own id: leave) | `204`; their assigned workouts in the group become unassigned | `400` (the owner), `403` (a member removing someone else), `404` |
| Security view (admin) | `GET /api/v1/admin/activity/security?hours=24&min_count=3` (`hours` 1 to 168, `min_count` 1 or more) | `200` `{since, hours, min_count, total, failed_logins, lockouts, by_ip: [{ip, count, events: [{event, count}], accounts, emails, user_agent, last_at}], by_account: [{email, user_id, count, ips, last_at}]}` (10 of each, the most first, each with at least `min_count`) | `401`, `403`, `422` |

- Every `/api/v1/members` endpoint needs `Authorization: Bearer <access_token>` from a Gym Manager or Admin: `401` without a token, `403` for a User.
- A member's `id` is their user id. A member is `{id, name, email, phone, date_of_birth, emergency_contact_name, emergency_contact_phone, plan, joined_on, expires_on, is_frozen, trainer_id, trainer_name, notes}`.
- `status` filter: `active` (valid), `expired` (expiry date passed), `frozen` (`is_frozen = true`) or `expiring_soon` (not frozen, expiring from today to 7 days from today, both included).
- `total` counts every member matching the filter, not just the page returned.
- `PATCH` changes only the fields sent (`name`, `phone`, `date_of_birth`, `emergency_contact_name`, `emergency_contact_phone`, `plan`, `expires_on`, `is_frozen`, `trainer_id`, `notes`): a later `expires_on` renews, `is_frozen: true` freezes. The contact fields follow the same rules as `PATCH /api/v1/users/me/profile`.

Example body for `POST`:

```json
{ "email": "rafi@example.com", "phone": "01700000000", "plan": "monthly", "payment_method": "cash", "notes": "Prefers morning sessions" }
```

## Tests

The backend has a pytest suite in `backend/tests/` (login, token rejection, refresh rotation and reuse, RBAC, the gym's day to day, bad input and error responses, the delete log, the final spec's rules on every endpoint (`test_rules.py`), the Security page, start-up, CORS and the settings). It runs against a throwaway SQLite database that is emptied before every test, with test-only secrets, so it never touches `backend/gym_buddy.db`, Supabase or your `.env`.

```bash
cd backend
.venv\Scripts\Activate.ps1          # macOS/Linux: source .venv/bin/activate
pip install -r requirements-dev.txt  # pytest and httpx, plus everything in requirements.txt
pytest
```

`requirements-dev.txt` is for development only: Vercel installs `requirements.txt`, which has no test tools. The tests run locally; there is no CI job for them. Production runs on PostgreSQL, which is stricter than SQLite: set `TEST_DATABASE_URL` to an **empty** PostgreSQL database to run the same tests there (every table in it is dropped).

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

**Settings (optional locally).** Copy `backend/.env.example` to `backend/.env` and fill in what you need: `DATABASE_URL`, `JWT_SECRET`, `PASSWORD_PEPPER` and `FRONTEND_ORIGIN`. The example holds placeholders only (the secrets are deliberately too short to be accepted). The backend reads `backend/.env` on a developer machine only, never on Vercel, and a variable already set in your terminal wins over the file. `.env` is ignored by git; never commit real values.

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

The backend accepts `postgres://` or `postgresql://` URLs and creates the `app_user`, `auth_session`, `check_in`, `gym_class`, `class_booking`, `plan_price`, `payment`, `announcement`, `activity_log`, `training_group`, `group_member`, `workout`, `equipment`, `expense` and `schema_state` tables on start (and gives a new `plan_price` table monthly 1,500 / 30 days, quarterly 4,000 / 90 days and yearly 14,000 / 365 days), adds any columns an older table is missing, and widens the plan code columns, keeping existing data. When nothing changed since the last start, one query on `schema_state` skips all of this; delete its row after dropping a table by hand.

**Same region.** In Vercel → Project → **Settings** → **Functions**, set the function region to the one the database in `DATABASE_URL` is in (for example `hnd1` for Tokyo, `cdg1` for Paris), then redeploy. With the two far apart, every query is a long trip and the app is slow.

To use Supabase locally as well, set `DATABASE_URL` in your terminal before `fastapi dev main.py`.

Free-tier Supabase projects pause after a week with no activity; open the dashboard and restore the project before a demo if needed.

## Deploy to Vercel

1. Push the repo to GitHub.
2. Go to https://vercel.com/new, import the repo and click **Deploy**. Keep **Root Directory** as `./`.
3. Set `DATABASE_URL` as above. Without it, data is kept only in `/tmp` and is lost between requests.
4. Set `JWT_SECRET` and `PASSWORD_PEPPER` (see **Accounts and roles**), then redeploy. Without them, sign up, login and every logged-in request return `500`.
5. `FRONTEND_ORIGIN` is optional on Vercel: CORS always answers the deployed frontend, `https://2321648gymbuddy.vercel.app`. Set it only to allow another origin as well (exact, no trailing slash).

The Vercel project is connected to GitHub (Project → **Settings** → **Git**): merging into `main` deploys production by itself, and every pushed branch gets a preview. GitHub shows the result next to each commit and on the pull request. Merge only when the preview has deployed: Vercel also checks `vercel.json` there, which `pytest` and `npm run build` do not read.

**CORS.** On Vercel the API answers cross-origin requests only from the deployed frontend (`https://2321648gymbuddy.vercel.app`, built in, so it is allowed even when the variable is not set) and what `FRONTEND_ORIGIN` lists (one exact origin, or several separated by commas; `*` is refused at start-up), with credentials. A request from any other origin, including its preflight, gets no CORS headers at all, so the browser does not let that site read the response. A developer machine without the variable allows the Vite dev server (`http://localhost:5173`). `vercel.json` names the same origin for the pages and assets, which Vercel would otherwise serve with `Access-Control-Allow-Origin: *`.

`vercel.json` adds security headers to every response (pages and API): `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin` and `Strict-Transport-Security`. The app's pages (not `/api`) also send a `Content-Security-Policy` that allows scripts and API calls from the app's own origin only. They apply on Vercel only, not to `fastapi dev`.

## Troubleshooting

- **"Running scripts is disabled" in PowerShell:** run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.
- **`fastapi` not found:** activate the virtual environment first.
- **"The server could not answer (500)" in the app:** the backend isn't running, or it can't reach the database (check `DATABASE_URL`).
- **Vercel deployment fails:** open the failed Vercel check on the commit or pull request (or **Build Logs** in the Vercel dashboard), and make sure `npm run build` works in `frontend/`. "`vercel.json` schema validation failed" means that file has a property Vercel does not know.
