# The member table and the request / response schemas built on it (TDD 5.1, 5.3).
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


class Member(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    full_name: str = Field(max_length=100)
    phone: str | None = Field(default=None, max_length=20)
    plan: str = Field(max_length=10)
    joined_on: date = Field(default_factory=utc_today)
    expires_on: date
    is_active: bool = True
    notes: str | None = Field(default=None, max_length=500)
    # The login account this record belongs to, if any. One account can be linked to only one member.
    user_id: int | None = Field(default=None, foreign_key="app_user.id", unique=True, index=True)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class CheckIn(SQLModel, table=True):
    """One arrival at the gym, recorded by a gym manager or admin (TDD 5.2)."""

    __tablename__ = "check_in"

    id: int | None = Field(default=None, primary_key=True)
    member_id: int = Field(foreign_key="member.id", ondelete="CASCADE", index=True)
    checked_in_at: datetime = Field(default_factory=utc_now, index=True)
    recorded_by: int | None = Field(default=None, foreign_key="app_user.id")


class MemberCreate(SQLModel):
    full_name: FullName
    phone: str | None = Field(default=None, max_length=20)
    plan: Plan
    joined_on: date | None = None
    expires_on: date
    notes: str | None = Field(default=None, max_length=500)
    user_id: int | None = None

    @model_validator(mode="after")
    def check_dates(self) -> "MemberCreate":
        if self.expires_on < (self.joined_on or utc_today()):
            raise ValueError("expires_on must be on or after joined_on")
        return self


class MemberUpdate(SQLModel):
    full_name: FullName | None = None
    phone: str | None = Field(default=None, max_length=20)
    plan: Plan | None = None
    expires_on: date | None = None
    is_active: bool | None = None
    notes: str | None = Field(default=None, max_length=500)
    # null unlinks the account
    user_id: int | None = None

    @model_validator(mode="after")
    def check_required_not_null(self) -> "MemberUpdate":
        # These columns are NOT NULL, so they may be left out but not sent as null.
        for name in ("full_name", "plan", "expires_on", "is_active"):
            if name in self.model_fields_set and getattr(self, name) is None:
                raise ValueError(f"{name} cannot be null")
        return self


class MemberRead(SQLModel):
    id: int
    full_name: str
    phone: str | None
    plan: Plan
    joined_on: date
    expires_on: date
    is_active: bool
    notes: str | None
    user_id: int | None
    created_at: datetime
    updated_at: datetime


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


class User(SQLModel, table=True):
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
    created_at: datetime = Field(default_factory=utc_now)


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


class TokenResponse(SQLModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    user: UserRead


class AdminUserRead(UserRead):
    """What an admin sees about a user: the ban status as well."""

    is_banned: bool
    banned_at: datetime | None
    ban_reason: str | None


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
    member_id: int = Field(foreign_key="member.id", ondelete="CASCADE", primary_key=True, index=True)
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


# --- Account lookup (for staff linking a member to an account) and password change ---


class AccountLookup(SQLModel):
    id: int
    name: str
    email: str


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
    # null once the member is deleted: the payment, and so the revenue, stays on record.
    member_id: int | None = Field(default=None, foreign_key="member.id", ondelete="SET NULL", index=True)
    member_name: str = Field(max_length=100)
    amount: int
    method: str = Field(max_length=20)
    plan: str | None = Field(default=None, max_length=10)
    note: str | None = Field(default=None, max_length=200)
    paid_at: datetime = Field(default_factory=utc_now, index=True)
    renewed_until: date | None = None
    recorded_by: int | None = Field(default=None, foreign_key="app_user.id")


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


class PaymentPage(SQLModel):
    items: list[PaymentRead]
    total: int
    offset: int
    limit: int


class PlanRead(SQLModel):
    plan: Plan
    price: int
    duration_days: int


class PlanUpdate(SQLModel):
    """Both values are sent together, so a plan always has a price and a length."""

    price: Annotated[int, Field(ge=1, le=10_000_000)]
    duration_days: Annotated[int, Field(ge=1, le=3_660)]
