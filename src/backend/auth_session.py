"""Cookie-backed auth session helpers and FastAPI dependencies."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from dataclasses import dataclass
from typing import Optional

from fastapi import Cookie, Depends, HTTPException

from src.backend.settings import get_session_secret, load_settings

SESSION_COOKIE_NAME = "triplez_session"
SESSION_COOKIE_MAX_AGE = 60 * 60 * 12


@dataclass(frozen=True)
class AuthSession:
    role: str
    department: Optional[str] = None


def _b64encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _b64decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


def _sign(payload: str) -> str:
    secret = get_session_secret().encode("utf-8")
    signature = hmac.new(secret, payload.encode("utf-8"), hashlib.sha256).digest()
    return _b64encode(signature)


def create_session_token(*, role: str, department: Optional[str] = None) -> str:
    payload = {
        "v": 1,
        "role": role,
        "department": department,
        "iat": int(time.time()),
    }
    payload_part = _b64encode(json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
    signature_part = _sign(payload_part)
    return f"{payload_part}.{signature_part}"


def decode_session_token(token: str) -> Optional[AuthSession]:
    try:
        payload_part, signature_part = token.split(".", 1)
    except ValueError:
        return None

    expected_signature = _sign(payload_part)
    if not hmac.compare_digest(signature_part, expected_signature):
        return None

    try:
        payload = json.loads(_b64decode(payload_part).decode("utf-8"))
    except (ValueError, json.JSONDecodeError):
        return None

    iat = payload.get("iat", 0)
    if isinstance(iat, (int, float)) and time.time() - iat > SESSION_COOKIE_MAX_AGE:
        return None

    role = str(payload.get("role", "")).strip()
    department = payload.get("department")
    if role not in {"admin", "manager"}:
        return None
    if role == "manager":
        department = str(department or "").strip()
        if not department:
            return None
    else:
        department = None

    settings = load_settings()
    if role == "manager" and department not in settings.get("departments", []):
        return None

    return AuthSession(role=role, department=department)


def require_authenticated(
    triplez_session: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
) -> AuthSession:
    if not triplez_session:
        raise HTTPException(status_code=401, detail="נדרשת התחברות")
    session = decode_session_token(triplez_session)
    if session is None:
        raise HTTPException(status_code=401, detail="החיבור פג. יש להתחבר מחדש")
    return session


def require_admin(
    session: AuthSession = Depends(require_authenticated),
) -> AuthSession:
    if session.role != "admin":
        raise HTTPException(status_code=403, detail="נדרשות הרשאות מנהל")
    return session

