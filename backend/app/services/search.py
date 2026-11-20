# Text search shared by the member, waiting-account and user lists.
from sqlalchemy import or_
from sqlmodel import col


def contains_any(text: str, *columns):
    """Rows where any of the columns contains the text, in any case. A % or _ typed in the box matches itself."""
    return or_(*(col(column).icontains(text, autoescape=True) for column in columns))
