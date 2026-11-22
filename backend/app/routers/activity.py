# The activity log and the security view under /api/v1/admin/activity (SRS 3.7i, TDD 6.2).
# Every route needs activity:read (app/rbac.py), which only the Admin role holds; everyone else gets 403.
# Routes only handle HTTP; the queries live in app/services/activity_service.py.
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response

from app.database import SessionDep
from app.models import ActivityFilter, ActivityPage, SecuritySummary, User, utc_today
from app.rbac import Permission, require_permission
from app.request_info import ClientDep
from app.services import activity_service

router = APIRouter(prefix="/api/v1/admin/activity", tags=["activity"])

READ_ACTIVITY = Depends(require_permission(Permission.ACTIVITY_READ))
# The export also needs to know who downloads it, since the download is logged too.
Reader = Annotated[User, Depends(require_permission(Permission.ACTIVITY_READ))]
Filters = Annotated[ActivityFilter, Query()]


@router.get("", response_model=ActivityPage, dependencies=[READ_ACTIVITY])
def list_activity(
    session: SessionDep,
    filters: Filters,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> dict:
    """Newest first. event, user_id (rows where that account acted or was acted on), date_from and date_to (UTC days,
    both included) and q (part of an email, the IP address or the details) can be combined."""
    items, total = activity_service.list_activity(session, filters, offset, limit)
    return {"items": items, "total": total, "offset": offset, "limit": limit}


@router.get("/security", response_model=SecuritySummary, dependencies=[READ_ACTIVITY])
def security_summary(session: SessionDep) -> dict:
    """Failed logins in the last 24 hours and the last 7 days, with the 10 IP addresses and the 10 accounts with
    the most, and how many lockouts there were."""
    return activity_service.security_summary(session)


@router.get(
    "/export.csv",
    response_class=Response,
    responses={200: {"content": {"text/csv": {}}, "description": "The matching events as CSV"}},
)
def export_activity(session: SessionDep, filters: Filters, reader: Reader, client: ClientDep) -> Response:
    """The same filters and order as the list, every matching row up to 10,000. The export is itself logged."""
    filename = f"activity-{utc_today().isoformat()}.csv"
    return Response(
        content=activity_service.export_csv(session, filters, reader, client),
        media_type="text/csv; charset=utf-8",
        # The log names people and addresses, so no cache on the way may keep a copy.
        headers={"Content-Disposition": f'attachment; filename="{filename}"', "Cache-Control": "no-store"},
    )
