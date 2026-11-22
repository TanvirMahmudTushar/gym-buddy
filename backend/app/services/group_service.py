# Training groups and their members (final spec 2.2, SRS 3.7j), used by app/routers/groups.py.
#
# What someone may do in a group comes only from rbac.group_permissions(): the owner holds every group permission,
# a member READ plus the ones the owner ticked, anyone else none. access() turns "none" into GroupNotFoundError
# (404, so a private group's id does not show it exists) and require() a missing permission into
# GroupPermissionError (403).
from sqlalchemy import and_, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import aliased
from sqlmodel import Session, col, delete, func, select, update

from app import rbac
from app.models import GroupMember, GroupMemberAdd, TrainingGroup, User, Workout
from app.rbac import GroupPermission


class GroupNotFoundError(Exception):
    """No group has this id, or the caller is not in it."""


class GroupPermissionError(Exception):
    """The caller is in the group but lacks the permission. The message says which."""


class GroupAccountNotFoundError(Exception):
    """No account has the email the owner typed."""


class AlreadyInGroupError(Exception):
    """That account is the owner or already a member."""


class GroupMemberNotFoundError(Exception):
    """That account is not a member of the group."""


class GroupOwnerError(Exception):
    """Something only a member can have done to them was asked of the owner. The message says what."""


_REFUSED = {
    GroupPermission.CREATE: "You do not have permission to add workouts to this group",
    GroupPermission.UPDATE: "You do not have permission to edit workouts in this group",
    GroupPermission.ASSIGN: "You do not have permission to assign workouts in this group",
    GroupPermission.MANAGE: "Only the group's owner can do this",
}

Owner = aliased(User)
# The caller's own group_member row, outer-joined so a group they own (and have no row in) is listed too.
Mine = aliased(GroupMember)


def access(session: Session, user: User, group_id: int) -> tuple[TrainingGroup, frozenset[GroupPermission]]:
    """The group and the caller's permissions in it. An outsider gets GroupNotFoundError."""
    group = session.get(TrainingGroup, group_id)
    if group is None:
        raise GroupNotFoundError(group_id)
    permissions = rbac.group_permissions(user, group.owner_id, session.get(GroupMember, (group_id, user.id)))
    if not permissions:
        raise GroupNotFoundError(group_id)
    return group, permissions


def require(permissions: frozenset[GroupPermission], permission: GroupPermission) -> None:
    if permission not in permissions:
        raise GroupPermissionError(_REFUSED[permission])


def in_group(session: Session, group: TrainingGroup, user_id: int) -> bool:
    """The owner or a member: who a group workout can be assigned to."""
    return user_id == group.owner_id or session.get(GroupMember, (group.id, user_id)) is not None


def _with_counts(user: User):
    """Groups with their owner's name, how many people and workouts they have, and the caller's own member row."""
    members = (
        select(func.count())
        .select_from(GroupMember)
        .where(col(GroupMember.group_id) == col(TrainingGroup.id))
        .correlate(TrainingGroup)
        .scalar_subquery()
    )
    workouts = (
        select(func.count())
        .select_from(Workout)
        .where(col(Workout.group_id) == col(TrainingGroup.id))
        .correlate(TrainingGroup)
        .scalar_subquery()
    )
    return (
        select(TrainingGroup, Owner.name, members, workouts, Mine)
        .join(Owner, col(TrainingGroup.owner_id) == col(Owner.id))
        .join(Mine, and_(col(Mine.group_id) == col(TrainingGroup.id), col(Mine.user_id) == user.id), isouter=True)
    )


def _read(user: User, group: TrainingGroup, owner_name: str, members: int, workouts: int, mine: GroupMember | None):
    permissions = rbac.group_permissions(user, group.owner_id, mine)
    return {
        "id": group.id,
        "name": group.name,
        "owner_id": group.owner_id,
        "owner_name": owner_name,
        "created_at": group.created_at,
        "member_count": members + 1,
        "workout_count": workouts,
        # In the enum's order (read, create, update, assign, manage), not alphabetical.
        "my_permissions": [p.value for p in GroupPermission if p in permissions],
    }


def get_group(session: Session, user: User, group_id: int) -> dict:
    row = session.exec(_with_counts(user).where(col(TrainingGroup.id) == group_id)).first()
    if row is None or not rbac.group_permissions(user, row[0].owner_id, row[4]):
        raise GroupNotFoundError(group_id)
    return _read(user, *row)


def list_groups(session: Session, user: User, offset: int, limit: int) -> tuple[list[dict], int]:
    """The groups the caller owns or is a member of, by name."""
    mine = or_(col(TrainingGroup.owner_id) == user.id, col(Mine.user_id).is_not(None))
    total = session.exec(
        select(func.count())
        .select_from(TrainingGroup)
        .join(Mine, and_(col(Mine.group_id) == col(TrainingGroup.id), col(Mine.user_id) == user.id), isouter=True)
        .where(mine)
    ).one()
    rows = session.exec(
        _with_counts(user)
        .where(mine)
        .order_by(col(TrainingGroup.name), col(TrainingGroup.id))
        .offset(offset)
        .limit(limit)
    ).all()
    return [_read(user, *row) for row in rows], total


def create_group(session: Session, user: User, name: str) -> dict:
    """Anyone logged in can start a group; they become its owner."""
    group = TrainingGroup(name=name, owner_id=user.id)
    session.add(group)
    session.commit()
    session.refresh(group)
    return get_group(session, user, group.id)


def rename_group(session: Session, user: User, group_id: int, name: str) -> dict:
    group, permissions = access(session, user, group_id)
    require(permissions, GroupPermission.MANAGE)
    group.name = name
    session.add(group)
    session.commit()
    return get_group(session, user, group_id)


def delete_group(session: Session, user: User, group_id: int) -> None:
    """Deletes the group with its workouts and memberships. The database cascades too, but SQLite does not
    enforce that by default, so the rows are deleted here."""
    group, permissions = access(session, user, group_id)
    require(permissions, GroupPermission.MANAGE)
    delete_groups(session, [group.id])
    session.commit()


def delete_groups(session: Session, ids: list[int]) -> None:
    """Delete these groups with their workouts and memberships (the owner's delete, a moderator's delete and an
    account deletion all come here). The caller commits."""
    session.exec(delete(Workout).where(col(Workout.group_id).in_(ids)))
    session.exec(delete(GroupMember).where(col(GroupMember.group_id).in_(ids)))
    session.exec(delete(TrainingGroup).where(col(TrainingGroup.id).in_(ids)))


def _member_read(member: GroupMember, account: User, show_email: bool) -> dict:
    return {
        "user_id": account.id,
        "name": account.name,
        "email": account.email if show_email else None,
        "is_owner": False,
        "can_create": member.can_create,
        "can_update": member.can_update,
        "can_assign": member.can_assign,
        "added_at": member.added_at,
    }


def list_members(session: Session, user: User, group_id: int) -> list[dict]:
    """The owner first, then the members by name. Every member can see who is in the group; only the owner sees
    their emails. Not paged: a training group is small."""
    group, permissions = access(session, user, group_id)
    show_email = GroupPermission.MANAGE in permissions
    owner = session.get(User, group.owner_id)
    rows = session.exec(
        select(GroupMember, User)
        .join(User, col(User.id) == col(GroupMember.user_id))
        .where(col(GroupMember.group_id) == group_id)
        .order_by(col(User.name), col(User.id))
    ).all()
    owner_row = {
        "user_id": owner.id,
        "name": owner.name,
        "email": owner.email if show_email else None,
        "is_owner": True,
        "can_create": True,
        "can_update": True,
        "can_assign": True,
        "added_at": group.created_at,
    }
    return [owner_row, *(_member_read(m, account, show_email) for m, account in rows)]


def add_member(session: Session, user: User, group_id: int, data: GroupMemberAdd) -> dict:
    group, permissions = access(session, user, group_id)
    require(permissions, GroupPermission.MANAGE)
    account = session.exec(select(User).where(col(User.email) == data.email.lower())).first()
    if account is None:
        raise GroupAccountNotFoundError(data.email)
    if in_group(session, group, account.id):
        raise AlreadyInGroupError(account.id)
    member = GroupMember(
        group_id=group_id,
        user_id=account.id,
        can_create=data.can_create,
        can_update=data.can_update,
        can_assign=data.can_assign,
    )
    session.add(member)
    try:
        session.commit()
    except IntegrityError as exc:
        # The same account added twice at the same moment: the primary key lets only one through.
        session.rollback()
        raise AlreadyInGroupError(account.id) from exc
    session.refresh(member)
    return _member_read(member, account, show_email=True)


def _member(session: Session, group: TrainingGroup, user_id: int, owner_message: str) -> GroupMember:
    if user_id == group.owner_id:
        raise GroupOwnerError(owner_message)
    member = session.get(GroupMember, (group.id, user_id))
    if member is None:
        raise GroupMemberNotFoundError(user_id)
    return member


def update_member(session: Session, user: User, group_id: int, member_id: int, changes: dict) -> dict:
    """The owner ticks or unticks a member's permissions; only the ones sent change."""
    group, permissions = access(session, user, group_id)
    require(permissions, GroupPermission.MANAGE)
    member = _member(session, group, member_id, "The owner always holds every permission")
    member.sqlmodel_update(changes)
    session.add(member)
    session.commit()
    session.refresh(member)
    return _member_read(member, session.get(User, member_id), show_email=True)


def remove_member(session: Session, user: User, group_id: int, member_id: int) -> None:
    """The owner removes a member, or a member leaves (removes themself). The workouts they added stay in the group;
    the ones assigned to them become unassigned."""
    group, permissions = access(session, user, group_id)
    if member_id != user.id:
        require(permissions, GroupPermission.MANAGE)
    member = _member(session, group, member_id, "The owner cannot leave or be removed; delete the group instead")
    session.exec(
        update(Workout)
        .where(col(Workout.group_id) == group_id, col(Workout.assigned_to) == member_id)
        .values(assigned_to=None)
    )
    session.delete(member)
    session.commit()


def delete_for_accounts(session: Session, ids: list[int]) -> None:
    """Before accounts are deleted: their groups go (with those groups' workouts and members), they leave every other
    group, their personal workouts go, and the group workouts they added or were assigned stay without them.
    The caller commits."""
    owned = list(session.exec(select(TrainingGroup.id).where(col(TrainingGroup.owner_id).in_(ids))).all())
    if owned:
        delete_groups(session, owned)
    session.exec(delete(GroupMember).where(col(GroupMember.user_id).in_(ids)))
    session.exec(delete(Workout).where(col(Workout.owner_id).in_(ids), col(Workout.group_id).is_(None)))
    session.exec(update(Workout).where(col(Workout.owner_id).in_(ids)).values(owner_id=None))
    session.exec(update(Workout).where(col(Workout.assigned_to).in_(ids)).values(assigned_to=None))


def groups_of(session: Session, user_id: int) -> list[dict]:
    """The groups an account owns or is in, by name, for the admin's user details. Names and sizes only."""
    members = (
        select(func.count())
        .select_from(GroupMember)
        .where(col(GroupMember.group_id) == col(TrainingGroup.id))
        .correlate(TrainingGroup)
        .scalar_subquery()
    )
    member_of = select(GroupMember.group_id).where(col(GroupMember.user_id) == user_id)
    rows = session.exec(
        select(TrainingGroup, members)
        .where(or_(col(TrainingGroup.owner_id) == user_id, col(TrainingGroup.id).in_(member_of)))
        .order_by(col(TrainingGroup.name), col(TrainingGroup.id))
    ).all()
    return [
        {"id": g.id, "name": g.name, "is_owner": g.owner_id == user_id, "member_count": count + 1} for g, count in rows
    ]


def count_groups(session: Session) -> int:
    return session.exec(select(func.count()).select_from(TrainingGroup)).one()
