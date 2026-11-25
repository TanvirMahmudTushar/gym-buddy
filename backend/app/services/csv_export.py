# CSV files for spreadsheets, shared by the payments and activity exports (FR-51, FR-88).
import csv
import io
from collections.abc import Iterable
from datetime import datetime

from app.models import as_utc

# Every CSV holds at most this many rows (newest first), so one download cannot outgrow a serverless function.
EXPORT_LIMIT = 10_000

# A cell starting with one of these could run as a formula when the CSV is opened in a spreadsheet.
_FORMULA_START = ("=", "+", "-", "@", "\t", "\r")


def utc_text(value: datetime | None) -> str:
    return as_utc(value).strftime("%Y-%m-%d %H:%M:%S") if value else ""


def cell(value: object) -> object:
    """Text that a spreadsheet would treat as a formula gets a leading apostrophe, so it shows as plain text."""
    if value is None:
        return ""
    if isinstance(value, str) and value.startswith(_FORMULA_START):
        return "'" + value
    return value


def to_csv(header: list[str], rows: Iterable[list[object]]) -> str:
    """One header row, then the rows. Starts with a BOM so Excel reads it as UTF-8 (Bengali names included)."""
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\r\n")
    writer.writerow(header)
    for row in rows:
        writer.writerow([cell(v) for v in row])
    return "﻿" + buffer.getvalue()


def describe_filters(filters: dict) -> str:
    """The filters an export used, for the activity log: "date_from=2026-11-01, method=cash" or "no filters"."""
    parts = [f"{key}={value.value if hasattr(value, 'value') else value}" for key, value in filters.items()]
    return ", ".join(parts) or "no filters"
