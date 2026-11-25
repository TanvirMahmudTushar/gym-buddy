# The API: the app, CORS, the routes and the error handlers. Vercel runs this file (vercel.json).
from fastapi import FastAPI

from app.config import frontend_origins
from app.cors import AllowlistCORSMiddleware
from app.database import create_db_and_tables
from app.errors import register_error_handlers
from app.routers import (
    activity,
    admin,
    announcements,
    auth,
    check_ins,
    classes,
    equipment,
    expenses,
    groups,
    members,
    moderation,
    overview,
    payments,
    plans,
    trainers,
    users,
    workouts,
)

# Docs live under /api because vercel.json only sends /api/* to the backend.
app = FastAPI(
    title="Gym Buddy API",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
    redoc_url=None,
)

# CORS (NFR-15): only the frontend's origin may call the API from another origin, with cookies, and never "*".
# The app and the API share one origin on Vercel, so the browser needs no CORS there; any other site gets no CORS
# headers, so it cannot read a response even if a logged-in user visits it.
app.add_middleware(
    AllowlistCORSMiddleware,
    allow_origins=frontend_origins(),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
    max_age=600,
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(admin.router)
app.include_router(members.router)
app.include_router(check_ins.router)
app.include_router(classes.router)
app.include_router(plans.router)
app.include_router(payments.router)
app.include_router(overview.router)
app.include_router(trainers.router)
app.include_router(announcements.router)
app.include_router(activity.router)
app.include_router(workouts.router)
app.include_router(groups.router)
app.include_router(moderation.router)
app.include_router(equipment.router)
app.include_router(expenses.router)

register_error_handlers(app)

# Run at import (not in a lifespan hook) so it also works on Vercel's serverless functions.
create_db_and_tables()


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
