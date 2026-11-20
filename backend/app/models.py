# The tables and the request / response schemas built on them (TDD 5.1, 5.3).
# There is no separate member table: a member is a user whose account has a membership (a plan).
from datetime import date, datetime, timezone
from typing import Annotated, Literal

from pydantic import EmailStr, PlainSerializer, StringConstraints, field_validator, model_validator
from sqlmodel import Field, SQLModel

Plan = Literal["monthly", "quarterly", "yearly"]
FullName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
# The id column is a 32-bit integer, so anything larger cannot match a member.
MemberId = Annotated[int, Field(gt=0, le=2_147_483_647)]


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
    notes: str | None = Field(default=None, max_length=500)


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


class MemberUpdate(SQLModel):
    name: FullName | None = None
    phone: str | None = Field(default=None, max_length=20)
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

Role = Literal["user", "gym_manager", "admin"]
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


class AccountPage(SQLModel):
    """A page of accounts, such as the ones waiting for a membership."""

    items: list[UserRead]
    total: int
    offset: int
    limit: int


class TokenResponse(SQLModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    user: UserRead


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


# --- Classes and bookings ---

DurationMinutes = Annotated[int, Field(ge=15, le=240)]
Capacity = Annotated[int, Field(ge=1, le=200)]


class GymClass(SQLModel, table=True):
    # Stored in gym_class because "class" is reserved in Python.
    __tablename__ = "gym_class"

    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(max_length=100)
    description: str | None = Field(default=None, max_length=500)
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
    trainer_name: str | None = Field(default=None, max_length=100)
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
    trainer_name: str | None = Field(default=None, max_length=100)
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
