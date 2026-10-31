# The member table and the request / response schemas built on it (TDD 5.1, 5.3).
from datetime import date, datetime, timezone
from typing import Annotated, Literal

from pydantic import StringConstraints, model_validator
from sqlmodel import Field, SQLModel

Plan = Literal["monthly", "quarterly", "yearly"]
FullName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]


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
