# The tables and the request / response schemas built on them (TDD 5.1, 5.3).
# There is no separate member table: a member is a user whose account has a membership (a plan).
from datetime import date, datetime, time, timezone
from enum import Enum
from typing import Annotated, Literal

from pydantic import BeforeValidator, EmailStr, PlainSerializer, StringConstraints, field_validator, model_validator
from sqlmodel import Field, SQLModel

Plan = Literal["monthly", "quarterly", "yearly"]
FullName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
# The id column is a 32-bit integer, so anything larger cannot match an account (a member's id is their account's).
AccountId = Annotated[int, Field(gt=0, le=2_147_483_647)]
MemberId = AccountId


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def as_utc(value: datetime) -> datetime:
    """A time with no zone is taken to be UTC; any other zone is converted to UTC."""
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


# Always sent as UTC with a trailing Z, so the browser shows it in the viewer's local time.
UtcDateTime = Annotated[datetime, PlainSerializer(lambda v: as_utc(v).isoformat().replace("+00:00", "Z"), return_type=str)]


def utc_today() -> date:
    """'Today' for expiry checks is the server's UTC date (SRS C-7)."""
    return utc_now().date()


def start_of_day(day: date) -> datetime:
    """Midnight UTC at the start of a day: the calendar the date filters and the expiry check use (SRS C-7)."""
    return datetime.combine(day, time.min, tzinfo=timezone.utc)


def _blank_to_none(value: object) -> object:
    """An empty or all-space text field means "not given", so it is stored as null."""
    return (value.strip() or None) if isinstance(value, str) else value


# Optional contact text: trimmed, and blank becomes null.
ContactName = Annotated[Annotated[str, StringConstraints(max_length=100)] | None, BeforeValidator(_blank_to_none)]
ContactPhone = Annotated[Annotated[str, StringConstraints(max_length=20)] | None, BeforeValidator(_blank_to_none)]
EARLIEST_BIRTH_DATE = date(1900, 1, 1)


def _check_birth_date(value: date | None) -> date | None:
    if value is not None and not EARLIEST_BIRTH_DATE <= value <= utc_today():
        raise ValueError(f"date_of_birth must be between {EARLIEST_BIRTH_DATE.isoformat()} and today")
    return value


class User(SQLModel, table=True):
    """A login account. Once staff start a membership (set a plan) the user is also a gym member."""

    # "user" is a reserved word in PostgreSQL, so the table is called app_user.
    __tablename__ = "app_user"

    id: int | None = Field(default=None, primary_key=True)
    email: str = Field(max_length=254, unique=True, index=True)
    name: str = Field(max_length=100)
    password_hash: str
    role: str = Field(default="user", max_length=20)
    is_banned: bool = False
    banned_at: datetime | None = None
    ban_reason: str | None = Field(default=None, max_length=500)
    # Tokens issued before this moment stop working (set when the password is changed).
    password_changed_at: datetime | None = None
    # Set when an admin resets the password: until a new one is chosen, the account can do nothing else.
    must_change_password: bool = False
    # Login lockout (FR-34): wrong passwords in a row, and the moment logins are blocked until.
    failed_login_count: int = 0
    locked_until: datetime | None = None
    created_at: datetime = Field(default_factory=utc_now)
    # Membership. plan is None until staff start one; joined_on and expires_on are set together with it.
    plan: str | None = Field(default=None, max_length=10)
    joined_on: date | None = None
    expires_on: date | None = None
    # A frozen membership cannot check in or book, whatever its expiry date.
    is_frozen: bool = False
    phone: str | None = Field(default=None, max_length=20)
    # Contact and safety details: only the person themself and gym staff can read them (NFR-20).
    # An emergency contact has both a name and a phone, or neither (app/services/profile_service.py).
    date_of_birth: date | None = None
    emergency_contact_name: str | None = Field(default=None, max_length=100)
    emergency_contact_phone: str | None = Field(default=None, max_length=20)
    notes: str | None = Field(default=None, max_length=500)


class AuthSession(SQLModel, table=True):
    """One login on one browser (TDD 10.1). The refresh cookie holds a random token; only its hash is kept here, and
    every refresh replaces it (rotation). Each access token names its session (sid), so revoking the session ends
    the access token at once, not only when it expires."""

    __tablename__ = "auth_session"

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="app_user.id", ondelete="CASCADE", index=True)
    # SHA-256 of the refresh token in the cookie now.
    token_hash: str = Field(max_length=64, unique=True, index=True)
    # The token the last refresh replaced. Sent again after a short grace period, it can only be a stolen copy.
    previous_token_hash: str | None = Field(default=None, max_length=64, index=True)
    rotated_at: datetime | None = None
    created_at: datetime = Field(default_factory=utc_now)
    # Updated on login and on every refresh (at least every 15 minutes while the app is open).
    last_used_at: datetime = Field(default_factory=utc_now)
    # 7 days after the last refresh. Each refresh pushes it on, so a session ends after a week unused.
    expires_at: datetime
    ip: str | None = Field(default=None, max_length=45)
    user_agent: str | None = Field(default=None, max_length=300)
    # Set by logout, a revoke, a password change, a password reset, a ban or a reused refresh token.
    revoked_at: datetime | None = None


class CheckIn(SQLModel, table=True):
    """One arrival at the gym, recorded by a gym manager or admin (TDD 5.2)."""

    __tablename__ = "check_in"

    id: int | None = Field(default=None, primary_key=True)
    # The member who arrived: the user's id.
    member_id: int = Field(foreign_key="app_user.id", ondelete="CASCADE", index=True)
    checked_in_at: datetime = Field(default_factory=utc_now, index=True)
    recorded_by: int | None = Field(default=None, foreign_key="app_user.id")


class MemberCreate(SQLModel):
    """Start a membership on an account that already exists: the person signs up first."""

    email: EmailStr
    phone: str | None = Field(default=None, max_length=20)
    plan: Plan
    joined_on: date | None = None
    expires_on: date
    notes: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def check_dates(self) -> "MemberCreate":
        if self.expires_on < (self.joined_on or utc_today()):
            raise ValueError("expires_on must be on or after joined_on")
        return self


class ProfileRead(SQLModel):
    """A person's contact and safety details. Only they and gym staff can read them (NFR-20)."""

    phone: str | None
    date_of_birth: date | None
    emergency_contact_name: str | None
    emergency_contact_phone: str | None


class ProfileUpdate(SQLModel):
    """Only the fields sent change; null or blank text clears one. The emergency contact's name and phone are set
    or cleared together (checked against the saved values in app/services/profile_service.py)."""

    phone: ContactPhone = None
    date_of_birth: date | None = None
    emergency_contact_name: ContactName = None
    emergency_contact_phone: ContactPhone = None

    @field_validator("date_of_birth")
    @classmethod
    def birth_date_in_range(cls, value: date | None) -> date | None:
        return _check_birth_date(value)


class MemberUpdate(ProfileUpdate):
    """Staff edit a member: the membership plus the same contact and safety details the member edits themself."""

    name: FullName | None = None
    plan: Plan | None = None
    expires_on: date | None = None
    is_frozen: bool | None = None
    notes: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def check_required_not_null(self) -> "MemberUpdate":
        # A member always has these, so they may be left out but not sent as null.
        for name in ("name", "plan", "expires_on", "is_frozen"):
            if name in self.model_fields_set and getattr(self, name) is None:
                raise ValueError(f"{name} cannot be null")
        return self


class MemberRead(SQLModel):
    """A member: the user's account details plus their membership. id is the user's id."""

    id: int
    name: str
    email: str
    phone: str | None
    date_of_birth: date | None
    emergency_contact_name: str | None
    emergency_contact_phone: str | None
    plan: Plan
    joined_on: date
    expires_on: date
    is_frozen: bool
    notes: str | None


class MemberPage(SQLModel):
    """One page of the member list. total counts every member matching the filter, not just this page."""

    items: list[MemberRead]
    total: int
    offset: int
    limit: int


class MemberBulkDelete(SQLModel):
    ids: list[MemberId] = Field(min_length=1, max_length=100)


class MemberBulkDeleteResult(SQLModel):
    deleted: int


# --- Accounts and roles ---

Role = Literal["user", "trainer", "gym_manager", "admin"]
Password = Annotated[str, StringConstraints(min_length=8, max_length=128)]


class SignupRequest(SQLModel):
    email: EmailStr
    name: FullName
    password: Password


class LoginRequest(SQLModel):
    email: EmailStr
    password: Annotated[str, StringConstraints(max_length=128)]


class UserRead(SQLModel):
    id: int
    email: str
    name: str
    role: Role
    created_at: datetime
    # True after an admin reset the password: the app asks for a new one before anything else.
    must_change_password: bool


class MeRead(UserRead):
    """The logged-in user's own account, with the permissions of their role (app/rbac.py). The app builds its
    menus and page guards from them; the server checks the same permissions on every request."""

    permissions: list[str]


class AccountPage(SQLModel):
    """A page of accounts, such as the ones waiting for a membership."""

    items: list[UserRead]
    total: int
    offset: int
    limit: int


class TokenResponse(SQLModel):
    """Login and refresh. The refresh token is not here: it travels only in the HttpOnly cookie."""

    access_token: str
    token_type: Literal["bearer"] = "bearer"
    # Seconds until the access token expires.
    expires_in: int
    user: MeRead


class SessionRead(SQLModel):
    """One of my active logins (a browser where I am logged in)."""

    id: int
    created_at: UtcDateTime
    last_used_at: UtcDateTime
    expires_at: UtcDateTime
    ip: str | None
    user_agent: str | None
    # True for the session this request was sent from.
    current: bool


class AdminUserRead(UserRead):
    """What an admin sees about a user: the ban status and their membership as well."""

    is_banned: bool
    banned_at: datetime | None
    ban_reason: str | None
    # The membership: plan is None for an account without one.
    plan: Plan | None
    expires_on: date | None
    is_frozen: bool


class AdminUserPage(SQLModel):
    items: list[AdminUserRead]
    total: int
    offset: int
    limit: int


class PasswordResetResult(SQLModel):
    """The account after an admin reset its password, and the temporary password (shown only this once)."""

    user: AdminUserRead
    temporary_password: str


class BanRequest(SQLModel):
    reason: Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)] | None = None


class CheckInRead(SQLModel):
    id: int
    member_id: int
    member_name: str
    checked_in_at: UtcDateTime
    recorded_by_name: str | None


class CheckInPage(SQLModel):
    items: list[CheckInRead]
    total: int
    offset: int
    limit: int


class CheckInStats(SQLModel):
    today: int
    last_7_days: int


class MemberStats(SQLModel):
    total: int
    active: int
    expired: int
    frozen: int
    new_last_7_days: int
    # Active memberships that expire today or in the next 7 days: the people to remind about renewing.
    expiring_soon: int


class UserStats(SQLModel):
    total: int
    users: int
    trainers: int
    gym_managers: int
    admins: int
    banned: int


class ClassStats(SQLModel):
    total: int
    upcoming: int


class AdminStats(SQLModel):
    members: MemberStats
    users: UserStats
    check_ins: CheckInStats
    classes: ClassStats


class UserNameUpdate(SQLModel):
    name: FullName


class UserRoleUpdate(SQLModel):
    role: Role


class TrainerRead(SQLModel):
    """An account with the Trainer role, as a choice for a class's trainer."""

    id: int
    name: str


# --- Classes and bookings ---

DurationMinutes = Annotated[int, Field(ge=15, le=240)]
Capacity = Annotated[int, Field(ge=1, le=200)]


class GymClass(SQLModel, table=True):
    # Stored in gym_class because "class" is reserved in Python.
    __tablename__ = "gym_class"

    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(max_length=100)
    description: str | None = Field(default=None, max_length=500)
    # The trainer: an account with the Trainer role. Classes from before trainers were accounts have only
    # trainer_name (free text); choosing a trainer, or none, clears it.
    trainer_id: int | None = Field(default=None, foreign_key="app_user.id", ondelete="SET NULL", index=True)
    trainer_name: str | None = Field(default=None, max_length=100)
    starts_at: datetime = Field(index=True)
    duration_minutes: int
    capacity: int
    created_by: int | None = Field(default=None, foreign_key="app_user.id")
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class ClassBooking(SQLModel, table=True):
    __tablename__ = "class_booking"

    class_id: int = Field(foreign_key="gym_class.id", ondelete="CASCADE", primary_key=True)
    # The member who booked: the user's id.
    member_id: int = Field(foreign_key="app_user.id", ondelete="CASCADE", primary_key=True, index=True)
    booked_at: datetime = Field(default_factory=utc_now)


class ClassCreate(SQLModel):
    name: FullName
    description: str | None = Field(default=None, max_length=500)
    # An account with the Trainer role (GET /api/v1/trainers lists them), or none.
    trainer_id: AccountId | None = None
    starts_at: datetime
    duration_minutes: DurationMinutes
    capacity: Capacity

    @field_validator("starts_at")
    @classmethod
    def starts_at_in_utc(cls, value: datetime) -> datetime:
        return as_utc(value)


class ClassUpdate(SQLModel):
    name: FullName | None = None
    description: str | None = Field(default=None, max_length=500)
    # Sent: this trainer, or null for none, replacing any old text name. Left out: the trainer stays as it is.
    trainer_id: AccountId | None = None
    starts_at: datetime | None = None
    duration_minutes: DurationMinutes | None = None
    capacity: Capacity | None = None

    @field_validator("starts_at")
    @classmethod
    def starts_at_in_utc(cls, value: datetime | None) -> datetime | None:
        return None if value is None else as_utc(value)

    @model_validator(mode="after")
    def check_required_not_null(self) -> "ClassUpdate":
        # These columns are NOT NULL, so they may be left out but not sent as null.
        for name in ("name", "starts_at", "duration_minutes", "capacity"):
            if name in self.model_fields_set and getattr(self, name) is None:
                raise ValueError(f"{name} cannot be null")
        return self


class ClassRead(SQLModel):
    id: int
    name: str
    description: str | None
    trainer_id: int | None
    # The trainer's current account name, or the old text name on a class without a trainer account.
    trainer_name: str | None
    starts_at: UtcDateTime
    duration_minutes: int
    capacity: int
    booked_count: int
    is_booked_by_me: bool
    created_at: UtcDateTime
    updated_at: UtcDateTime


class ClassPage(SQLModel):
    items: list[ClassRead]
    total: int
    offset: int
    limit: int


class BookingRead(SQLModel):
    class_id: int
    member_id: int
    member_name: str
    booked_at: UtcDateTime


class BookingPage(SQLModel):
    items: list[BookingRead]
    total: int
    offset: int
    limit: int


class BookedClassRead(SQLModel):
    """One of a member's bookings, with the class it is for."""

    class_id: int
    class_name: str
    starts_at: UtcDateTime
    duration_minutes: int
    trainer_name: str | None
    booked_at: UtcDateTime


class BookedClassPage(SQLModel):
    items: list[BookedClassRead]
    total: int
    offset: int
    limit: int


# --- Password change ---


class PasswordChange(SQLModel):
    current_password: Annotated[str, StringConstraints(max_length=128)]
    new_password: Password


# --- Plans and payments ---

PaymentMethod = Literal["cash", "card", "bank_transfer", "mobile_banking"]
Amount = Annotated[int, Field(gt=0, le=10_000_000)]  # whole taka

# Price (whole taka) and length in days of each plan. These fill a new database; an admin can change them later.
DEFAULT_PLAN_PRICES: dict[str, tuple[int, int]] = {"monthly": (1500, 30), "quarterly": (4000, 90), "yearly": (14000, 365)}


class PlanPrice(SQLModel, table=True):
    __tablename__ = "plan_price"

    plan: str = Field(primary_key=True, max_length=10)
    price: int
    duration_days: int
    updated_at: datetime = Field(default_factory=utc_now)


class Payment(SQLModel, table=True):
    __tablename__ = "payment"

    id: int | None = Field(default=None, primary_key=True)
    # The member who paid (the user's id); null once their account is deleted, so the revenue stays on record.
    member_id: int | None = Field(default=None, foreign_key="app_user.id", ondelete="SET NULL", index=True)
    member_name: str = Field(max_length=100)
    amount: int
    method: str = Field(max_length=20)
    plan: str | None = Field(default=None, max_length=10)
    note: str | None = Field(default=None, max_length=200)
    paid_at: datetime = Field(default_factory=utc_now, index=True)
    renewed_until: date | None = None
    recorded_by: int | None = Field(default=None, foreign_key="app_user.id")
    # Set when an admin voids a mistaken payment. It stays on record but is left out of every total.
    voided_at: datetime | None = None
    void_reason: str | None = Field(default=None, max_length=200)
    voided_by: int | None = Field(default=None, foreign_key="app_user.id")


class PaymentCreate(SQLModel):
    amount: Amount
    method: PaymentMethod
    note: Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)] | None = None
    # Set to extend the membership by this plan's days in the same step.
    renew_plan: Plan | None = None


class PaymentRead(SQLModel):
    id: int
    member_id: int | None
    member_name: str
    amount: int
    method: PaymentMethod
    plan: Plan | None
    note: str | None
    paid_at: UtcDateTime
    renewed_until: date | None
    recorded_by_name: str | None
    voided_at: UtcDateTime | None
    void_reason: str | None
    voided_by_name: str | None


class PaymentPage(SQLModel):
    items: list[PaymentRead]
    total: int
    offset: int
    limit: int


class PaymentListPage(PaymentPage):
    """The all-payments list. total_amount adds up every matching payment that is not voided, not just this page."""

    total_amount: int


class PaymentFilter(SQLModel):
    """Query filters shared by the payments list and the CSV export. Dates are UTC calendar days, both inclusive."""

    date_from: date | None = None
    date_to: date | None = None
    method: PaymentMethod | None = None
    # Part of the member's name, any case.
    member: Annotated[str, StringConstraints(strip_whitespace=True, max_length=100)] | None = None
    include_voided: bool = False

    @model_validator(mode="after")
    def check_range(self) -> "PaymentFilter":
        if self.date_from and self.date_to and self.date_from > self.date_to:
            raise ValueError("date_from must be on or before date_to")
        return self


class VoidRequest(SQLModel):
    reason: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]


# --- Revenue (admin dashboard) ---


class MethodRevenue(SQLModel):
    method: PaymentMethod
    amount: int
    count: int


class MonthRevenue(SQLModel):
    month: str  # YYYY-MM
    amount: int


class RevenueStats(SQLModel):
    """Money taken, in whole taka, by UTC calendar day. Voided payments are never counted."""

    today: int
    this_month: int
    # The last 30 days, today included: the same as the payments list from last_30_days_from to today.
    last_30_days: int
    last_30_days_from: date
    # The last 30 days split by method: every method, in a fixed order, zero when unused.
    by_method: list[MethodRevenue]
    # The last 6 months, oldest first; the last one is this month so far.
    months: list[MonthRevenue]


class PlanRead(SQLModel):
    plan: Plan
    price: int
    duration_days: int


class PlanUpdate(SQLModel):
    """Both values are sent together, so a plan always has a price and a length."""

    price: Annotated[int, Field(ge=1, le=10_000_000)]
    duration_days: Annotated[int, Field(ge=1, le=3_660)]


# --- Overview (the Gym Manager's start page) ---


class PaymentsToday(SQLModel):
    """Payments taken since midnight UTC that are not voided."""

    count: int
    amount: int


class Overview(SQLModel):
    """What needs attention today. Each number uses the same rule as the page it links to."""

    check_ins_today: int
    expiring_soon: int
    waiting: int
    payments_today: PaymentsToday
    # The next classes that have not started yet, soonest first.
    next_classes: list[ClassRead]


# --- Announcements (news from the gym) ---

AnnouncementTitle = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
AnnouncementMessage = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1000)]


class Announcement(SQLModel, table=True):
    """Holiday hours, a new class or other news, posted by a gym manager or admin for everyone to read."""

    __tablename__ = "announcement"

    id: int | None = Field(default=None, primary_key=True)
    title: str = Field(max_length=100)
    message: str = Field(max_length=1000)
    # The last UTC day it shows on, inclusive (like a membership's expires_on). None: it shows until it is deleted.
    ends_on: date | None = None
    # Who posted it; null once that account is deleted, and the announcement stays.
    posted_by: int | None = Field(default=None, foreign_key="app_user.id", ondelete="SET NULL")
    posted_at: datetime = Field(default_factory=utc_now, index=True)
    # Set on every edit; None for one that was never edited.
    updated_at: datetime | None = None


def _not_in_the_past(ends_on: date | None) -> date | None:
    # An end date before today would hide the announcement straight away, so it is refused.
    if ends_on is not None and ends_on < utc_today():
        raise ValueError("ends_on cannot be before today (UTC)")
    return ends_on


class AnnouncementCreate(SQLModel):
    title: AnnouncementTitle
    message: AnnouncementMessage
    ends_on: date | None = None

    @field_validator("ends_on")
    @classmethod
    def ends_on_not_past(cls, value: date | None) -> date | None:
        return _not_in_the_past(value)


class AnnouncementUpdate(SQLModel):
    title: AnnouncementTitle | None = None
    message: AnnouncementMessage | None = None
    # Sent: the new end date, or null to show it until it is deleted. Left out: the end date stays as it is.
    ends_on: date | None = None

    @field_validator("ends_on")
    @classmethod
    def ends_on_not_past(cls, value: date | None) -> date | None:
        return _not_in_the_past(value)

    @model_validator(mode="after")
    def check_required_not_null(self) -> "AnnouncementUpdate":
        # These columns are NOT NULL, so they may be left out but not sent as null.
        for name in ("title", "message"):
            if name in self.model_fields_set and getattr(self, name) is None:
                raise ValueError(f"{name} cannot be null")
        return self


class AnnouncementRead(SQLModel):
    id: int
    title: str
    message: str
    ends_on: date | None
    posted_at: UtcDateTime
    # None until it is edited.
    updated_at: UtcDateTime | None
    # The poster's current account name; null once that account is deleted.
    posted_by_name: str | None


class AnnouncementPage(SQLModel):
    items: list[AnnouncementRead]
    total: int
    offset: int
    limit: int


# --- Activity log (security events, final spec 2.3) ---


class ActivityEvent(str, Enum):
    SIGNUP = "signup"
    LOGIN = "login"
    # A wrong password, an email with no account, or a login to a locked or banned account.
    LOGIN_FAILED = "login_failed"
    # The 5th wrong password in a row blocked the account's logins for 15 minutes.
    ACCOUNT_LOCKED = "account_locked"
    LOGOUT = "logout"
    PASSWORD_CHANGE = "password_change"
    PASSWORD_CHANGE_FAILED = "password_change_failed"
    PASSWORD_RESET = "password_reset"
    ROLE_CHANGE = "role_change"
    BAN = "ban"
    UNBAN = "unban"
    # One session ended: by its owner, or by the server when a replaced refresh token came back.
    SESSION_REVOKE = "session_revoke"
    ACCOUNT_DELETE = "account_delete"
    # A CSV download (payments or activity).
    EXPORT = "export"


class ActivityLog(SQLModel, table=True):
    """One security event: who did it, to which account, from where and when. Rows are only ever added.
    The emails are copied in, so a row still reads correctly after the account is deleted.
    Never holds a password, a password hash or a token (NFR-23)."""

    __tablename__ = "activity_log"

    id: int | None = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=utc_now, index=True)
    event: str = Field(max_length=30, index=True)
    # Who did it. Null when no account did: an email with no account on a failed login, or the server itself.
    actor_id: int | None = Field(default=None, foreign_key="app_user.id", ondelete="SET NULL", index=True)
    # The actor's email at the time. On a failed login, the email that was typed, which may match no account.
    actor_email: str | None = Field(default=None, max_length=254)
    # The account acted on, when it is not the actor's own (a ban, a role change, a lockout, a deleted account).
    target_id: int | None = Field(default=None, foreign_key="app_user.id", ondelete="SET NULL", index=True)
    target_email: str | None = Field(default=None, max_length=254)
    details: str | None = Field(default=None, max_length=500)
    ip: str | None = Field(default=None, max_length=45)
    user_agent: str | None = Field(default=None, max_length=300)


class ActivityRead(SQLModel):
    id: int
    created_at: UtcDateTime
    event: ActivityEvent
    actor_id: int | None
    actor_email: str | None
    target_id: int | None
    target_email: str | None
    details: str | None
    ip: str | None
    user_agent: str | None


class ActivityPage(SQLModel):
    items: list[ActivityRead]
    total: int
    offset: int
    limit: int


class ActivityFilter(SQLModel):
    """Query filters shared by the activity list and its CSV export. Dates are UTC calendar days, both inclusive."""

    event: ActivityEvent | None = None
    # Rows where this account acted or was acted on.
    user_id: AccountId | None = None
    date_from: date | None = None
    date_to: date | None = None
    # Part of an email, the IP address or the details, any case.
    q: Annotated[str, StringConstraints(strip_whitespace=True, max_length=100)] | None = None

    @model_validator(mode="after")
    def check_range(self) -> "ActivityFilter":
        if self.date_from and self.date_to and self.date_from > self.date_to:
            raise ValueError("date_from must be on or before date_to")
        return self


class FailedLoginsByIp(SQLModel):
    # None: the address was not known.
    ip: str | None
    count: int
    # How many different emails were tried from this address: many points to someone trying a list of accounts.
    accounts: int
    last_at: UtcDateTime


class FailedLoginsByAccount(SQLModel):
    # The email that was typed.
    email: str
    # The account with that email, or None when there is none.
    user_id: int | None
    count: int
    # From how many different addresses.
    ips: int
    last_at: UtcDateTime


class FailedLoginWindow(SQLModel):
    """Failed logins since `since`, grouped by IP address and by account, the most first (10 of each)."""

    since: UtcDateTime
    total: int
    # How many times an account was locked after 5 wrong passwords in a row.
    lockouts: int
    by_ip: list[FailedLoginsByIp]
    by_account: list[FailedLoginsByAccount]


class SecuritySummary(SQLModel):
    last_24_hours: FailedLoginWindow
    last_7_days: FailedLoginWindow


# --- Workouts and training groups (final spec 2.2) ---

WorkoutTitle = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
# Optional free text: trimmed, and blank becomes null.
WorkoutNotes = Annotated[Annotated[str, StringConstraints(max_length=1000)] | None, BeforeValidator(_blank_to_none)]
GroupName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
EARLIEST_WORKOUT_DATE = date(2000, 1, 1)
# A workout can be planned up to a year ahead.
WORKOUT_DAYS_AHEAD = 365


def _check_workout_date(value: date | None) -> date | None:
    if value is not None:
        latest = date.fromordinal(utc_today().toordinal() + WORKOUT_DAYS_AHEAD)
        if not EARLIEST_WORKOUT_DATE <= value <= latest:
            raise ValueError(f"workout_date must be between {EARLIEST_WORKOUT_DATE.isoformat()} and a year from today")
    return value


class TrainingGroup(SQLModel, table=True):
    """A group that shares workouts. Its owner holds every group permission (app/rbac.py) and is not a row in
    group_member; the other people in it are."""

    __tablename__ = "training_group"

    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(max_length=100)
    owner_id: int = Field(foreign_key="app_user.id", ondelete="CASCADE", index=True)
    created_at: datetime = Field(default_factory=utc_now)


class GroupMember(SQLModel, table=True):
    """Someone the owner added to a group, with the permissions the owner ticked for them. Every member can read the
    group's workouts; the three flags allow more."""

    __tablename__ = "group_member"

    group_id: int = Field(foreign_key="training_group.id", ondelete="CASCADE", primary_key=True)
    user_id: int = Field(foreign_key="app_user.id", ondelete="CASCADE", primary_key=True, index=True)
    can_create: bool = False
    can_update: bool = False
    can_assign: bool = False
    added_at: datetime = Field(default_factory=utc_now)


class Workout(SQLModel, table=True):
    """A workout. Without a group it is personal: only its owner can see it. In a group, the group's members see it
    and their group permissions decide who may add, edit and assign it."""

    __tablename__ = "workout"

    id: int | None = Field(default=None, primary_key=True)
    # Who added it. A personal workout is deleted with its owner's account; a group workout stays, with no owner.
    owner_id: int | None = Field(default=None, foreign_key="app_user.id", ondelete="SET NULL", index=True)
    group_id: int | None = Field(default=None, foreign_key="training_group.id", ondelete="CASCADE", index=True)
    title: str = Field(max_length=100)
    workout_date: date
    notes: str | None = Field(default=None, max_length=1000)
    # Only on a group workout: the group member (or the owner) it is for.
    assigned_to: int | None = Field(default=None, foreign_key="app_user.id", ondelete="SET NULL", index=True)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class WorkoutCreate(SQLModel):
    title: WorkoutTitle
    workout_date: date
    notes: WorkoutNotes = None
    # Set to add it to that group (needs the create permission there); left out, the workout is personal.
    group_id: AccountId | None = None
    # A member of that group to assign it to (needs the assign permission too).
    assigned_to: AccountId | None = None

    @field_validator("workout_date")
    @classmethod
    def date_in_range(cls, value: date) -> date:
        return _check_workout_date(value)

    @model_validator(mode="after")
    def assign_only_in_group(self) -> "WorkoutCreate":
        if self.assigned_to is not None and self.group_id is None:
            raise ValueError("assigned_to needs a group_id: only a group workout can be assigned")
        return self


class WorkoutUpdate(SQLModel):
    """Only the fields sent change. The group cannot change, and assigning has its own endpoint and permission."""

    title: WorkoutTitle | None = None
    workout_date: date | None = None
    notes: WorkoutNotes = None

    @field_validator("workout_date")
    @classmethod
    def date_in_range(cls, value: date | None) -> date | None:
        return _check_workout_date(value)

    @model_validator(mode="after")
    def check_required_not_null(self) -> "WorkoutUpdate":
        # These columns are NOT NULL, so they may be left out but not sent as null.
        for name in ("title", "workout_date"):
            if name in self.model_fields_set and getattr(self, name) is None:
                raise ValueError(f"{name} cannot be null")
        return self


class WorkoutAssign(SQLModel):
    # Required: a member of the workout's group (or its owner), or null to unassign.
    user_id: AccountId | None


class WorkoutRead(SQLModel):
    id: int
    title: str
    workout_date: date
    notes: str | None
    group_id: int | None
    group_name: str | None
    # Who added it; null once that account is deleted.
    owner_id: int | None
    owner_name: str | None
    assigned_to: int | None
    assigned_to_name: str | None
    created_at: UtcDateTime
    updated_at: UtcDateTime


class WorkoutPage(SQLModel):
    items: list[WorkoutRead]
    total: int
    offset: int
    limit: int


class GroupCreate(SQLModel):
    name: GroupName


class GroupRead(SQLModel):
    id: int
    name: str
    owner_id: int
    owner_name: str
    created_at: UtcDateTime
    # The owner included.
    member_count: int
    workout_count: int
    # What the caller may do in this group (rbac.GroupPermission values), for the app's buttons.
    my_permissions: list[str]


class GroupPage(SQLModel):
    items: list[GroupRead]
    total: int
    offset: int
    limit: int


class GroupMemberAdd(SQLModel):
    """The owner adds an existing account by its email (there are no invitations)."""

    email: EmailStr
    can_create: bool = False
    can_update: bool = False
    can_assign: bool = False


class GroupMemberUpdate(SQLModel):
    """Only the permissions sent change."""

    can_create: bool | None = None
    can_update: bool | None = None
    can_assign: bool | None = None

    @model_validator(mode="after")
    def check_not_null(self) -> "GroupMemberUpdate":
        for name in ("can_create", "can_update", "can_assign"):
            if name in self.model_fields_set and getattr(self, name) is None:
                raise ValueError(f"{name} cannot be null")
        return self


class GroupMemberRead(SQLModel):
    user_id: int
    name: str
    # Only the group's owner sees the members' emails.
    email: str | None
    is_owner: bool
    can_create: bool
    can_update: bool
    can_assign: bool
    # When they were added; for the owner, when the group was made.
    added_at: UtcDateTime
