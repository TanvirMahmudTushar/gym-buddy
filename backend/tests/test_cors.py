# CORS limited to FRONTEND_ORIGIN (NFR-15): the frontend gets CORS headers with credentials, any other origin none.
import pytest
from conftest import ALLOWED_ORIGIN

HEALTH = "/api/health"
PREFLIGHT = {"Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization,content-type"}


def _cors_headers(response) -> dict:
    return {k: v for k, v in response.headers.items() if k.lower().startswith("access-control-")}


def test_frontend_origin_gets_cors_headers_with_credentials(anon):
    response = anon.get(HEALTH, headers={"Origin": ALLOWED_ORIGIN})
    assert response.headers["access-control-allow-origin"] == ALLOWED_ORIGIN
    assert response.headers["access-control-allow-credentials"] == "true"


def test_frontend_preflight_is_allowed(anon):
    response = anon.options("/api/v1/auth/login", headers={"Origin": ALLOWED_ORIGIN, **PREFLIGHT})
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == ALLOWED_ORIGIN
    assert "POST" in response.headers["access-control-allow-methods"]


@pytest.mark.parametrize(
    "origin", ["https://evil.example", "http://frontend.test", "https://frontend.test.evil.example", "null"]
)
def test_other_origins_get_no_cors_headers(anon, origin):
    response = anon.get(HEALTH, headers={"Origin": origin})
    assert response.status_code == 200  # the server still answers; the browser just will not let that site read it
    assert _cors_headers(response) == {}


def test_other_origins_preflight_gets_no_cors_headers(anon):
    response = anon.options("/api/v1/auth/login", headers={"Origin": "https://evil.example", **PREFLIGHT})
    assert _cors_headers(response) == {}


def test_no_wildcard_is_ever_sent(account):
    me = account("rafi")
    response = me.client.get("/api/v1/users/me", headers={"Origin": ALLOWED_ORIGIN})
    assert response.headers["access-control-allow-origin"] != "*"
