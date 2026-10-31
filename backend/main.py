from pathlib import Path

from fastapi import FastAPI

from app.database import create_db_and_tables
from app.routers import members

# Docs live under /api because vercel.json only sends /api/* to the backend.
app = FastAPI(
    title="Gym Buddy API",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
    redoc_url=None,
)

app.include_router(members.router)

# Run at import (not in a lifespan hook) so it also works on Vercel's serverless functions.
create_db_and_tables()


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/hello")
def hello(name: str = "World") -> dict[str, str]:
    return {"message": f"Hello, {name}!"}


# EXERCISE (part 1): uncomment to add POST /api/user, then test it at /docs.
from pydantic import BaseModel, EmailStr


class User(BaseModel):
    id: int
    name: str
    email: EmailStr  # invalid emails get a 422 response automatically


@app.post("/api/user")
def create_user(user: User) -> dict[str, str]:
    return {"message": f"Hello {user.name} (ID {user.id}), we'll email you at {user.email}."}


FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend" / "dist"

# dist/ only exists after `npm run build`; in dev the Vite server serves the UI.
if FRONTEND_DIR.is_dir():
    app.frontend("/", directory=FRONTEND_DIR)
