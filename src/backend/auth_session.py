"""Cookie-backed auth session helpers and FastAPI dependencies."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from dataclasses import dataclass
from typing import Optional

from fastapi import Cookie, Depends, Header, HTTPException

from src.backend.settings import get_session_secret, load_settings

SESSION_COOKIE_NAME = "triplez_session"
SESSION_COOKIE_MAX_AGE = 60 * 60 * 12


@dataclass(frozen=True)
class AuthSession:
    role: str
    department: Optional[str] = None


def _b64encode(data: bytes) -> str:
    """Encode bytes to a URL-safe Base64 string without padding.

    Args:
        data: Raw bytes to encode.

    Returns:
        Unpadded URL-safe Base64 string.
    """
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _b64decode(data: str) -> bytes:
    """Decode a URL-safe Base64 string (with or without padding) to bytes.

    Args:
        data: URL-safe Base64 string.

    Returns:
        Decoded raw bytes.
    """
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


def _sign(payload: str) -> str:
    """Compute an HMAC-SHA256 signature for a payload string.

    Args:
        payload: The string to sign.

    Returns:
        URL-safe Base64-encoded signature.
    """
    secret = get_session_secret().encode("utf-8")
    signature = hmac.new(secret, payload.encode("utf-8"), hashlib.sha256).digest()
    return _b64encode(signature)


def create_session_token(*, role: str, department: Optional[str] = None) -> str:
    """Create a signed session token encoding the user's role and department.

    Args:
        role: User role (``"admin"`` or ``"manager"``).
        department: Department name, required when *role* is ``"manager"``.

    Returns:
        Signed ``payload.signature`` token string.
    """
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
    """Decode and verify a session token.

    Args:
        token: The ``payload.signature`` token string.

    Returns:
        An ``AuthSession`` if the token is valid, or ``None`` on any failure
        (bad signature, expired, unknown role, missing department).
    """
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
    """FastAPI dependency that requires a valid session cookie.

    Args:
        triplez_session: Session cookie value injected by FastAPI.

    Returns:
        The authenticated ``AuthSession``.

    Raises:
        HTTPException: 401 if the cookie is missing or the token is invalid/expired.
    """
    if not triplez_session:
        raise HTTPException(status_code=401, detail="נדרשת התחברות")
    session = decode_session_token(triplez_session)
    if session is None:
        raise HTTPException(status_code=401, detail="החיבור פג. יש להתחבר מחדש")
    return session


def require_admin(
    session: AuthSession = Depends(require_authenticated),
) -> AuthSession:
    """FastAPI dependency that requires an admin session.

    Args:
        session: Authenticated session injected via ``require_authenticated``.

    Returns:
        The admin ``AuthSession``.

    Raises:
        HTTPException: 403 if the session role is not ``"admin"``.
    """
    if session.role != "admin":
        raise HTTPException(status_code=403, detail="נדרשות הרשאות מנהל")
    return session


def require_admin_or_api_key(
    triplez_session: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    x_api_key: Optional[str] = Header(default=None),
) -> AuthSession:
    """Allow access via admin session cookie OR a valid X-API-Key header.

    Args:
        triplez_session: Session cookie value injected by FastAPI.
        x_api_key: Optional API key from the ``X-API-Key`` header.

    Returns:
        An admin ``AuthSession``.

    Raises:
        HTTPException: 401 if neither credential is valid, or 403 if the
            session is not an admin.
    """
    # Try API key first
    if x_api_key:
        settings = load_settings()
        configured_key = str(settings.get("api_key", "")).strip()
        if configured_key and hmac.compare_digest(x_api_key, configured_key):
            return AuthSession(role="admin")
        raise HTTPException(status_code=401, detail="מפתח API לא תקין")

    # Fall back to cookie-based admin auth
    if not triplez_session:
        raise HTTPException(status_code=401, detail="נדרשת התחברות או מפתח API")
    session = decode_session_token(triplez_session)
    if session is None:
        raise HTTPException(status_code=401, detail="החיבור פג. יש להתחבר מחדש")
    if session.role != "admin":
        raise HTTPException(status_code=403, detail="נדרשות הרשאות מנהל")
    return session

