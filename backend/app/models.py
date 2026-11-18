# The member table and the request / response schemas built on it (TDD 5.1, 5.3).
from datetime import date, datetime, timezone
from typing import Annotated, Literal

from pydantic import EmailStr, StringConstraints, model_validator
from sqlmodel import Field, SQLModel

Plan = Literal["monthly", "quarterly", "yearly"]
FullName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
# The id column is a 32-bit integer, so anything larger cannot match a member.
MemberId = Annotated[int, Field(gt=0, le=2_147_483_647)]


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


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
    checked_in_at: datetime
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


class AdminStats(SQLModel):
    members: MemberStats
    users: UserStats
    check_ins: CheckInStats


class UserNameUpdate(SQLModel):
    name: FullName


class UserRoleUpdate(SQLModel):
    role: Role
