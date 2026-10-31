# Member CRUD endpoints under /api/v1/members (TDD 6.1).
from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Query
from sqlmodel import Session, col, select

from app.database import SessionDep
from app.models import Member, MemberCreate, MemberRead, utc_today

router = APIRouter(prefix="/api/v1/members", tags=["members"])

MemberStatus = Literal["active", "expired", "frozen"]


def get_member_or_404(session: Session, member_id: int) -> Member:
    member = session.get(Member, member_id)
    if member is None:
        raise HTTPException(status_code=404, detail="Member not found")
    return member


@router.post("", status_code=201, response_model=MemberRead)
def create_member(body: MemberCreate, session: SessionDep) -> Member:
    # Fields left out (such as joined_on) fall back to the table defaults.
    member = Member(**body.model_dump(exclude_none=True))
    session.add(member)
    session.commit()
    session.refresh(member)
    return member


@router.get("", response_model=list[MemberRead])
def list_members(
    session: SessionDep,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    status: MemberStatus | None = None,
) -> list[Member]:
    """Newest first. A frozen member counts as frozen whatever its expiry date."""
    query = select(Member)
    today = utc_today()
    if status == "active":
        query = query.where(col(Member.is_active).is_(True), Member.expires_on >= today)
    elif status == "expired":
        query = query.where(col(Member.is_active).is_(True), Member.expires_on < today)
    elif status == "frozen":
        query = query.where(col(Member.is_active).is_(False))
    query = query.order_by(col(Member.created_at).desc(), col(Member.id).desc()).offset(offset).limit(limit)
    return list(session.exec(query).all())


@router.get("/{member_id}", response_model=MemberRead)
def get_member(member_id: int, session: SessionDep) -> Member:
    return get_member_or_404(session, member_id)
