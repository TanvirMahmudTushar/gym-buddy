# Every error the API answers with, in one place (NFR-07): {"detail": "one readable sentence"} and a status code.
# The services raise plain exceptions and know nothing about HTTP; the tables here say what each one becomes.
import logging
import math

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import DataError

from app.models import MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, utc_now
from app.services import (
    announcement_service,
    auth_service,
    checkin_service,
    class_service,
    equipment_service,
    expense_service,
    group_service,
    member_service,
    payment_service,
    plan_service,
    profile_service,
    session_service,
    trainer_service,
    user_service,
    workout_service,
)

logger = logging.getLogger("gym_buddy")

NO_ACCOUNT = "No account has that email. Ask the person to sign up first."

# Errors with a fixed message.
FIXED: dict[type[Exception], tuple[int, str]] = {
    # Accounts and sessions
    auth_service.EmailTakenError: (409, "An account with this email already exists"),
    auth_service.AccountBannedError: (403, auth_service.ACCOUNT_BANNED_MESSAGE),
    auth_service.WrongPasswordError: (400, "Current password is wrong"),
    auth_service.PasswordLengthError: (
        422,
        f"new_password: use {MIN_PASSWORD_LENGTH} to {MAX_PASSWORD_LENGTH} characters",
    ),
    auth_service.SamePasswordError: (400, "Choose a password different from your current one"),
    session_service.SessionNotFoundError: (404, "Session not found"),
    user_service.UserNotFoundError: (404, "User not found"),
    user_service.CannotChangeOwnRoleError: (400, "You cannot change your own role"),
    user_service.CannotRevokeOwnSessionsError: (400, "Log out your own sessions on My account"),
    profile_service.IncompleteEmergencyContactError: (
        422,
        "emergency_contact: give both a name and a phone, or leave both empty",
    ),
    # Members, plans and payments
    member_service.MemberNotFoundError: (404, "Member not found"),
    member_service.AccountNotFoundError: (422, NO_ACCOUNT),
    member_service.AlreadyMemberError: (409, "That account already has a membership"),
    member_service.StaffAccountError: (403, "Only an admin can change a staff member's account"),
    member_service.NoMembershipError: (404, "You do not have a membership yet"),
    plan_service.PlanNotFoundError: (404, "Plan not found"),
    plan_service.PlanNotOfferedError: (422, "plan: pick a plan the gym offers now"),
    plan_service.PlanNameTakenError: (409, "Another plan already has this name"),
    plan_service.PlanInUseError: (409, "Members or payments have this plan; retire it instead of deleting it"),
    payment_service.PaymentNotFoundError: (404, "Payment not found"),
    checkin_service.CheckInNotFoundError: (404, "Check-in not found"),
    # Classes and trainers
    class_service.ClassNotFoundError: (404, "Class not found"),
    class_service.ClassInThePastError: (422, "starts_at: pick a time that has not passed yet"),
    class_service.ClassStartedError: (400, "This class has already started"),
    class_service.ClassFullError: (409, "This class is full"),
    class_service.AlreadyBookedError: (409, "You have already booked this class"),
    class_service.BookingNotFoundError: (404, "You have not booked this class"),
    class_service.NotYourClassError: (403, "You can only see the bookings of the classes you teach"),
    class_service.AttendanceNotOpenError: (400, "Attendance can be marked from one hour before the class starts"),
    class_service.MemberNotBookedError: (404, "This member has not booked this class"),
    trainer_service.TrainerNotFoundError: (422, "trainer_id: pick an account with the Trainer role"),
    # Training groups and workouts
    group_service.GroupNotFoundError: (404, "Group not found"),
    group_service.GroupAccountNotFoundError: (422, NO_ACCOUNT),
    group_service.AlreadyInGroupError: (409, "That account is already in this group"),
    group_service.GroupMemberNotFoundError: (404, "That account is not a member of this group"),
    workout_service.WorkoutNotFoundError: (404, "Workout not found"),
    workout_service.NotAssignedToYouError: (403, "Only the person this workout is assigned to can mark it done"),
    workout_service.AssigneeNotInGroupError: (422, "user_id: pick someone in this workout's group"),
    # The rest of the gym
    equipment_service.EquipmentNotFoundError: (404, "Equipment not found"),
    expense_service.ExpenseNotFoundError: (404, "Expense not found"),
    announcement_service.AnnouncementNotFoundError: (404, "Announcement not found"),
    # A value PostgreSQL cannot store, such as text with a NUL character: the client's mistake, so not a 500.
    DataError: (422, "One of the values cannot be stored"),
}

# Errors whose own message says what went wrong (which permission is missing, why a ban is refused, and so on).
OWN_MESSAGE: dict[type[Exception], int] = {
    member_service.InvalidExpiryError: 422,
    member_service.CannotDeleteAccountError: 400,
    checkin_service.MembershipNotValidError: 400,
    checkin_service.CannotCheckOutError: 400,
    checkin_service.AlreadyInsideError: 409,
    class_service.CapacityBelowBookingsError: 422,
    group_service.GroupPermissionError: 403,
    group_service.GroupOwnerError: 400,
    user_service.CannotBanError: 400,
    user_service.CannotResetPasswordError: 400,
}


def _answer(status: int, detail: str, headers: dict[str, str] | None = None) -> JSONResponse:
    return JSONResponse(status_code=status, content={"detail": detail}, headers=headers)


async def _fixed(request: Request, exc: Exception) -> JSONResponse:
    status, detail = FIXED[type(exc)]
    return _answer(status, detail)


async def _own_message(request: Request, exc: Exception) -> JSONResponse:
    return _answer(OWN_MESSAGE[type(exc)], str(exc))


async def _invalid_credentials(request: Request, exc: Exception) -> JSONResponse:
    return _answer(401, "Wrong email or password", {"WWW-Authenticate": "Bearer"})


async def _account_locked(request: Request, exc: auth_service.AccountLockedError) -> JSONResponse:
    # Retry-After tells the client how many seconds are left; the message rounds up to whole minutes.
    seconds = max(1, math.ceil((exc.until - utc_now()).total_seconds()))
    minutes = math.ceil(seconds / 60)
    return _answer(
        429,
        f"Too many wrong passwords. Try again in {minutes} minute{'' if minutes == 1 else 's'}.",
        {"Retry-After": str(seconds)},
    )


async def _invalid_request(request: Request, exc: RequestValidationError) -> JSONResponse:
    """422 in the same shape as every other error. FastAPI's own answer repeats the value that was sent, which on
    sign up or a password change is the password, so only the field names and the reasons are sent back."""
    problems = []
    for error in exc.errors():
        # The first part says where the value was (body, query, path); the rest is the field.
        field = ".".join(str(part) for part in error["loc"][1:])
        reason = error["msg"].removeprefix("Value error, ")
        problems.append(f"{field}: {reason}" if field else reason)
    return _answer(422, "; ".join(problems))


async def _unexpected(request: Request, exc: Exception) -> JSONResponse:
    """Log the real error, but never send a stack trace or database details to the client."""
    logger.error("Unhandled error on %s %s", request.method, request.url.path, exc_info=exc)
    return _answer(500, "Internal server error")


def register_error_handlers(app: FastAPI) -> None:
    for exc_type in FIXED:
        app.add_exception_handler(exc_type, _fixed)
    for exc_type in OWN_MESSAGE:
        app.add_exception_handler(exc_type, _own_message)
    app.add_exception_handler(auth_service.InvalidCredentialsError, _invalid_credentials)
    app.add_exception_handler(auth_service.AccountLockedError, _account_locked)
    app.add_exception_handler(RequestValidationError, _invalid_request)
    app.add_exception_handler(Exception, _unexpected)
