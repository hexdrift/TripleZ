"""Authentication endpoint — password-only login."""

from __future__ import annotations

import hmac

from fastapi import APIRouter, Cookie, Depends, Response

from src.backend.auth_session import (
    SESSION_COOKIE_MAX_AGE,
    SESSION_COOKIE_NAME,
    AuthSession,
    create_session_token,
    decode_session_token,
    require_authenticated,
)
from src.backend.schemas import LoginRequest, LoginResponse
from src.backend.settings import load_settings

router = APIRouter()


@router.get("/auth/context")
def auth_context(session: AuthSession = Depends(require_authenticated)) -> dict:
    """Return authenticated auth-related runtime metadata.

    Returns:
        Dict with departments, personnel URL, ranks, and genders from
        current settings.
    """
    settings = load_settings()
    return {
        "departments": settings.get("departments", []),
        "personnel_url": str(settings.get("personnel_url", "")).strip(),
        "ranks_high_to_low": settings.get("ranks_high_to_low", []),
        "genders": settings.get("genders", []),
    }


@router.get("/auth/me", response_model=LoginResponse)
def auth_me(
    triplez_session: str | None = Cookie(default=None, alias=SESSION_COOKIE_NAME),
) -> LoginResponse:
    """Return the active authenticated session.

    Args:
        triplez_session: Session cookie value, or None when absent.

    Returns:
        LoginResponse with ok=True and role/department when valid, or
        ok=False when the cookie is missing or expired.
    """
    if not triplez_session:
        return LoginResponse(ok=False)
    session = decode_session_token(triplez_session)
    if session is None:
        return LoginResponse(ok=False)
    return LoginResponse(
        ok=True,
        role=session.role,
        department=session.department,
    )


@router.post("/auth/login", response_model=LoginResponse)
def login(req: LoginRequest, response: Response) -> LoginResponse:
    """Authenticate a user by password.

    Args:
        req: Login request containing the password to validate.

    Returns:
        LoginResponse indicating success with role/department, or failure with error message.
    """
    settings = load_settings()
    pw = req.password.strip()

    if hmac.compare_digest(pw.encode("utf-8"), settings["admin_password"].encode("utf-8")):
        response.set_cookie(
            key=SESSION_COOKIE_NAME,
            value=create_session_token(role="admin"),
            max_age=SESSION_COOKIE_MAX_AGE,
            httponly=True,
            samesite="none",
            secure=True,
            path="/",
        )
        return LoginResponse(ok=True, role="admin")

    dept_passwords: dict[str, str] = settings.get("dept_passwords", {})
    for dept, dept_pw in dept_passwords.items():
        if hmac.compare_digest(pw.encode("utf-8"), dept_pw.encode("utf-8")):
            response.set_cookie(
                key=SESSION_COOKIE_NAME,
                value=create_session_token(role="manager", department=dept),
                max_age=SESSION_COOKIE_MAX_AGE,
                httponly=True,
                samesite="none",
                secure=True,
                path="/",
            )
            return LoginResponse(ok=True, role="manager", department=dept)

    return LoginResponse(ok=False, error="סיסמה שגויה")


@router.post("/auth/logout")
def logout(response: Response) -> dict:
    """Clear the active auth session.

    Returns:
        Dict with ``ok: True`` confirming the session was cleared.
    """
    response.delete_cookie(key=SESSION_COOKIE_NAME, path="/", samesite="none", secure=True)
    return {"ok": True}
