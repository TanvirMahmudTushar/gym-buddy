# Contact and safety details on an account (SRS FR-76 to FR-79): phone, date of birth and an emergency contact.
# The person edits their own on My account (PATCH /users/me/profile); staff edit a member's through
# member_service.update_member(). Only they and gym staff can read them (NFR-20).
from sqlmodel import Session

from app.models import User

CONTACT_FIELDS = ("emergency_contact_name", "emergency_contact_phone")


class IncompleteEmergencyContactError(Exception):
    """An emergency contact was given a name without a phone, or a phone without a name."""


def check_emergency_contact(user: User, changes: dict) -> None:
    """Checks the contact as it will be after the changes, so sending only the phone works when a name is saved."""
    name, phone = (changes.get(field, getattr(user, field)) for field in CONTACT_FIELDS)
    if (name is None) != (phone is None):
        raise IncompleteEmergencyContactError


def update_profile(session: Session, user: User, changes: dict) -> User:
    """Apply only the given fields to the person's own account."""
    check_emergency_contact(user, changes)
    if changes:
        user.sqlmodel_update(changes)
        session.add(user)
        session.commit()
        session.refresh(user)
    return user
