"""Authentication endpoint — password-only login."""

from __future__ import annotations

from fastapi import APIRouter

from src.backend.schemas import LoginRequest, LoginResponse
from src.backend.settings import load_settings

router = APIRouter()


@router.post("/auth/login", response_model=LoginResponse)
def login(req: LoginRequest) -> LoginResponse:
    """Authenticate a user by password.

    Args:
        req: Login request containing the password to validate.

    Returns:
        LoginResponse indicating success with role/department, or failure with error message.
    """
    settings = load_settings()
    pw = req.password.strip()

    if pw == settings["admin_password"]:
        return LoginResponse(ok=True, role="admin")

    dept_passwords: dict[str, str] = settings.get("dept_passwords", {})
    for dept, dept_pw in dept_passwords.items():
        if pw == dept_pw:
            return LoginResponse(ok=True, role="manager", department=dept)

    return LoginResponse(ok=False, error="סיסמה שגויה")
