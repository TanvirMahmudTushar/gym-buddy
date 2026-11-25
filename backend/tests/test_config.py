# app/config.py: reading backend/.env on a developer machine, and the FRONTEND_ORIGIN setting.
import os

import pytest

from app import config


def test_env_file_fills_in_missing_variables_but_never_overrides(tmp_path, monkeypatch):
    env_file = tmp_path / ".env"
    env_file.write_text("GYM_BUDDY_TEST_ONLY=from-file\nJWT_SECRET=from-file-should-not-win\n", encoding="utf-8")
    monkeypatch.setattr(config, "ENV_FILE", env_file)
    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.delenv("GYM_BUDDY_TEST_ONLY", raising=False)
    jwt_secret = os.environ["JWT_SECRET"]
    try:
        config.load_local_env()
        assert os.environ["GYM_BUDDY_TEST_ONLY"] == "from-file"
        assert os.environ["JWT_SECRET"] == jwt_secret
    finally:
        os.environ.pop("GYM_BUDDY_TEST_ONLY", None)


def test_env_file_is_never_read_on_vercel(tmp_path, monkeypatch):
    env_file = tmp_path / ".env"
    env_file.write_text("GYM_BUDDY_TEST_ONLY=from-file\n", encoding="utf-8")
    monkeypatch.setattr(config, "ENV_FILE", env_file)
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.delenv("GYM_BUDDY_TEST_ONLY", raising=False)
    config.load_local_env()
    assert "GYM_BUDDY_TEST_ONLY" not in os.environ


def test_missing_env_file_is_fine(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "ENV_FILE", tmp_path / "absent.env")
    config.load_local_env()


def test_frontend_origin_list(monkeypatch):
    monkeypatch.setenv("FRONTEND_ORIGIN", "https://a.example/, https://b.example")
    assert config.frontend_origins() == ["https://a.example", "https://b.example"]


@pytest.mark.parametrize("value", ["*", "https://*.example", "https://a.example,*"])
def test_wildcard_origin_is_refused(monkeypatch, value):
    monkeypatch.setenv("FRONTEND_ORIGIN", value)
    with pytest.raises(RuntimeError, match="not allowed"):
        config.frontend_origins()


def test_origin_must_have_a_scheme(monkeypatch):
    monkeypatch.setenv("FRONTEND_ORIGIN", "frontend.example")
    with pytest.raises(RuntimeError, match="not an origin"):
        config.frontend_origins()


def test_default_origins(monkeypatch):
    monkeypatch.delenv("FRONTEND_ORIGIN")
    monkeypatch.delenv("VERCEL", raising=False)
    assert config.frontend_origins() == [config.LOCAL_FRONTEND_ORIGIN]
    # On Vercel the deployed frontend, and nothing else unless FRONTEND_ORIGIN says so.
    monkeypatch.setenv("VERCEL", "1")
    assert config.frontend_origins() == [config.DEPLOYED_FRONTEND_ORIGIN]
