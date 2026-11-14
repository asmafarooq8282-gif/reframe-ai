"""Phase 0 smoke tests — run on CPU, no models needed."""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import app  # noqa: E402
from utils.errors import MESSAGES, ReframeError  # noqa: E402


def test_health_shape():
    h = app.health()
    assert h["app"] == "reframe-ai"
    assert h["phase"] == app.PHASE
    assert h["models_loaded"] == []
    assert h["paid_fallback"] is False


def test_health_reports_paid_fallback(monkeypatch):
    monkeypatch.setenv("FAL_KEY", "x")
    assert app.health()["paid_fallback"] is True


def test_gpu_check_runs_without_gpu():
    assert isinstance(app.gpu_check(), str)


def test_demo_exposes_api_endpoints():
    names = {d.api_name for d in app.demo.fns.values()}
    assert {"health", "gpu_check"} <= names


def test_error_codes():
    err = ReframeError("quota_exceeded")
    assert err.to_dict() == {"error": "quota_exceeded", "message": MESSAGES["quota_exceeded"]}
    assert ReframeError("internal", "custom").message == "custom"
    with pytest.raises(ValueError):
        ReframeError("not_a_code")


def test_app_never_calls_anthropic():
    """Ground rule 1: no Claude / Anthropic API anywhere in the app."""
    space_dir = Path(__file__).resolve().parents[1]
    for path in space_dir.rglob("*"):
        if path.suffix not in {".py", ".txt"} or "tests" in path.parts:
            continue
        text = path.read_text(encoding="utf-8").lower()
        assert "import anthropic" not in text, path
        assert "api.anthropic.com" not in text, path
    reqs = (space_dir / "requirements.txt").read_text(encoding="utf-8").lower()
    assert "anthropic" not in reqs
