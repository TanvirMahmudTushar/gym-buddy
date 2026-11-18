# Sign up and log in under /api/v1/auth (TDD 6.2).
from fastapi import APIRouter

from app.database import SessionDep
from app.models import LoginRequest, SignupRequest, TokenResponse, User, UserRead
from app.security import create_access_token
from app.services import auth_service

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


@router.post("/signup", status_code=201, response_model=UserRead)
def signup(body: SignupRequest, session: SessionDep) -> User:
    """Creates an account with the role user. A duplicate email returns 409."""
    return auth_service.signup(session, body)


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, session: SessionDep) -> dict:
    """A wrong email and a wrong password give the same 401."""
    user = auth_service.authenticate(session, body)
    return {"access_token": create_access_token(user.id), "token_type": "bearer", "user": user}
