# The path and query parameters many routes share, with the limits that keep a bad value from reaching the database.
from typing import Annotated

from fastapi import Path, Query

# The id columns are 32-bit integers, so a larger id gets 422 here instead of a database error.
RowId = Annotated[int, Path(ge=1, le=2_147_483_647)]
# Paging: how many rows to skip, and how many to return.
Offset = Annotated[int, Query(ge=0, le=1_000_000)]
Limit = Annotated[int, Query(ge=1, le=100)]
# The Security page: how far back to look (up to 7 days) and how many hostile requests an address or email needs to be listed.
Hours = Annotated[int, Query(ge=1, le=168)]
MinCount = Annotated[int, Query(ge=1, le=10_000)]
# Text typed in a search box. Surrounding spaces are ignored and a blank box means no search.
Search = Annotated[str | None, Query(max_length=100)]
