# Read backend/.env (developer machines only) before any module reads an environment variable. See app/config.py.
from app.config import load_local_env

load_local_env()
