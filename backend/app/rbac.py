# Role-based access control (RBAC) in one place (final spec 2.2, NFR-17, TDD 10.3).
#
# Each account has one role, stored in app_user.role. What a role may do is the set of permissions below.
# An endpoint asks for a permission (never for a role name) with require_permission(), which runs on the server for
# every request. The app gets the same list from GET /users/me only to decide which pages and buttons to show.
#
# Routes about the caller's own data (my profile, my bookings, my sessions) need only a login: they read the
# caller's id from the token, never an id from the request, so nobody can reach another person's records there.
#
# Training groups add a second, per-group layer (GroupPermission, at the end): what one person may do in one group.
# Who may start a group is a role permission (groups:create); what happens inside it is the group layer.
#
# Import note: this module imports app.deps (who is logged in). Nothing that app.deps imports may import this
# module back, or Python would hit a circular import.
from collections.abc import Callable
from enum import Enum

from fastapi import HTTPException

from app.deps import CurrentUser
from app.models import GroupMember, User


class Permission(str, Enum):
    MEMBERS_READ = "members:read"  # member list and details, waiting list, a member's visits and bookings
    MEMBERS_MANAGE = "members:manage"  # start and edit memberships; cancel a booking for a member
    MEMBERS_DELETE = "members:delete"  # delete a member's whole account, one or many
    CHECK_INS_RECORD = "check_ins:record"  # check members in and out; the attendance list of any day
    PAYMENTS_MANAGE = "payments:manage"  # take a payment; a member's payments and the list of all payments
    PAYMENTS_VOID = "payments:void"
    PAYMENTS_EXPORT = "payments:export"
    CLASSES_MANAGE = "classes:manage"  # add, edit and delete classes; list trainers; see any class's bookings
    CLASSES_TEACH = "classes:teach"  # my classes as a trainer, and who booked them
    CLIENTS_READ = "clients:read"  # a trainer's own clients (the members they are the personal trainer of)
    GROUPS_CREATE = "groups:create"  # start a training group (its owner then holds every permission in it)
    EQUIPMENT_READ = "equipment:read"  # the equipment list; report a fault
    EQUIPMENT_MANAGE = "equipment:manage"  # add, edit, service and delete equipment
    EXPENSES_MANAGE = "expenses:manage"  # list, add, edit, delete and export expenses
    OVERVIEW_READ = "overview:read"  # the front desk part of the Dashboard
    ANNOUNCEMENTS_MANAGE = "announcements:manage"  # post, edit and delete announcements; see ended ones
    DASHBOARD_READ = "dashboard:read"  # the admin part of the Dashboard: all stats, revenue and net income
    USERS_READ = "users:read"  # the list of all accounts
    USERS_CHANGE_ROLE = "users:change_role"
    USERS_BAN = "users:ban"  # ban and unban
    USERS_RESET_PASSWORD = "users:reset_password"
    USERS_REVOKE_SESSIONS = "users:revoke_sessions"  # log a user out of every browser
    USERS_EXPORT = "users:export"  # the users CSV
    PLANS_EDIT = "plans:edit"  # add, edit, retire and delete membership plans
    ACTIVITY_READ = "activity:read"  # the activity log, its CSV export and the security view
    CONTENT_MODERATE = "content:moderate"  # list, delete and export any training group and its workouts


_GYM_MANAGER = frozenset(
    {
        Permission.MEMBERS_READ,
        Permission.MEMBERS_MANAGE,
        Permission.CHECK_INS_RECORD,
        Permission.PAYMENTS_MANAGE,
        Permission.CLASSES_MANAGE,
        Permission.GROUPS_CREATE,
        Permission.EQUIPMENT_READ,
        Permission.EQUIPMENT_MANAGE,
        Permission.OVERVIEW_READ,
        Permission.ANNOUNCEMENTS_MANAGE,
    }
)

# The whole permission matrix (SRS 3.11). A User has no extra permissions: only their own account and data.
ROLE_PERMISSIONS: dict[str, frozenset[Permission]] = {
    "user": frozenset(),
    "trainer": frozenset(
        {
            Permission.CLASSES_TEACH,
            Permission.CLIENTS_READ,
            Permission.GROUPS_CREATE,
            Permission.EQUIPMENT_READ,
        }
    ),
    "gym_manager": _GYM_MANAGER,
    "admin": _GYM_MANAGER
    | {
        Permission.MEMBERS_DELETE,
        Permission.PAYMENTS_VOID,
        Permission.PAYMENTS_EXPORT,
        Permission.EXPENSES_MANAGE,
        Permission.DASHBOARD_READ,
        Permission.USERS_READ,
        Permission.USERS_CHANGE_ROLE,
        Permission.USERS_BAN,
        Permission.USERS_RESET_PASSWORD,
        Permission.USERS_REVOKE_SESSIONS,
        Permission.USERS_EXPORT,
        Permission.PLANS_EDIT,
        Permission.ACTIVITY_READ,
        Permission.CONTENT_MODERATE,
    },
}


def permissions_for(role: str) -> frozenset[Permission]:
    """A role the map does not know (the database should never hold one) gets no permissions."""
    return ROLE_PERMISSIONS.get(role, frozenset())


def has_permission(user: User, permission: Permission) -> bool:
    # The role is read from the database on every request (deps.get_auth), never from the token,
    # so a role change takes effect on the next request.
    return permission in permissions_for(user.role)


def roles_with(permission: Permission) -> list[str]:
    """The roles that hold a permission, for database queries (such as every account that can teach)."""
    return [role for role, permissions in ROLE_PERMISSIONS.items() if permission in permissions]


def is_staff(user: User) -> bool:
    """True for a role that may do anything beyond its own account. A plain User's role holds no permissions."""
    return bool(permissions_for(user.role))


def is_admin(user: User) -> bool:
    """True for an account that manages users. Admins are protected from each other (no ban, no password reset)."""
    return has_permission(user, Permission.USERS_BAN)


def plain_roles() -> list[str]:
    """The roles of gym members, which hold no permissions, for database queries."""
    return [role for role, permissions in ROLE_PERMISSIONS.items() if not permissions]


def may_edit_account(actor: User, account: User) -> bool:
    """Whoever manages members may edit a plain User's membership and details. A staff member's are for admins only,
    so a gym manager cannot change an admin's account."""
    return is_admin(actor) or not is_staff(account)


def is_owner(user: User, owner_id: int | None) -> bool:
    """True when the record belongs to the user. The caller picks the answer for anyone else: 404 for a private
    record (so its id does not even show that it exists), 403 where the record itself is public (a class)."""
    return owner_id is not None and owner_id == user.id


def require_permission(*permissions: Permission) -> Callable[[User], User]:
    """A dependency: the caller must hold at least one of these permissions, or gets 403. It builds on
    get_current_user, so a missing or bad token gets 401 first and a banned account 403."""

    def check(user: CurrentUser) -> User:
        if not any(has_permission(user, permission) for permission in permissions):
            raise HTTPException(status_code=403, detail="You do not have permission to do this")
        return user

    return check


def me(user: User) -> dict:
    """The caller's own account plus the permissions of their role (MeRead), for the app's menus and page guards."""
    return {**user.model_dump(), "permissions": sorted(p.value for p in permissions_for(user.role))}


# --- Per-group permissions (training groups) ---


class GroupPermission(str, Enum):
    """What one person may do in one training group. Unlike the role permissions above, these depend on the group:
    the owner holds all of them, each member holds READ plus the ones the owner ticked, anyone else none."""

    READ = "read"  # see the group, its members and its workouts
    CREATE = "create"  # add a workout to the group (group_member.can_create)
    UPDATE = "update"  # edit the group's workouts (group_member.can_update)
    ASSIGN = "assign"  # assign a group workout to someone in the group (group_member.can_assign)
    # Owner only: delete a workout, rename or delete the group, and add, remove and set the permissions of members.
    MANAGE = "manage"


def group_permissions(user: User, owner_id: int, member: GroupMember | None) -> frozenset[GroupPermission]:
    """The caller's permissions in a group, given its owner and the caller's group_member row (None if not one).
    An empty set means an outsider: groups are private, so the caller answers 404, as if the group did not exist."""
    if is_owner(user, owner_id):
        return frozenset(GroupPermission)
    if member is None:
        return frozenset()
    flags = {
        GroupPermission.CREATE: member.can_create,
        GroupPermission.UPDATE: member.can_update,
        GroupPermission.ASSIGN: member.can_assign,
    }
    return frozenset({GroupPermission.READ, *(p for p, allowed in flags.items() if allowed)})
