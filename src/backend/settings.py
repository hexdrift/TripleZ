"""
Persistent application settings stored in a JSON file.

Provides dynamic access to configurable constants (ranks, genders,
departments, buildings, passwords) and Hebrew label mappings.
The settings file is written next to the executable (or in the project root
during development), so changes survive restarts and PyInstaller bundles.
"""

from __future__ import annotations

import json
import os
import secrets
import sys
from pathlib import Path
from urllib.parse import urlparse
from typing import Any, Dict, List

_SETTINGS_FILE = "triplez_settings.json"
_SESSION_SECRET_FILE = ".triplez_session_secret"


def default_department_password(department: str) -> str:
    """Return the default password for a department."""
    return f"{str(department).strip()}123"


LEGACY_DEFAULT_DEPT_PASSWORDS = {
    "הנהלה": "הנהלה123",
    "מכירות": "מכירות123",
    "מו\"פ": "מופ123",
    "מערכות מידע": "מערכות123",
    "בקרת איכות": "בקרת123",
    "תפעול": "תפעול123",
}

DEFAULTS: Dict[str, Any] = {
    "ranks_high_to_low": ["סמנכ\"ל", "מנהל בכיר", "מנהל", "זוטר"],
    "genders": ["בנים", "בנות"],
    "departments": ["הנהלה", "מכירות", "מו\"פ", "מערכות מידע", "בקרת איכות", "תפעול"],
    "buildings": ["א", "ב", "ג", "ד"],
    "personnel_url": "",
    "personnel_sync_interval_seconds": 30,
    "personnel_sync_paused": False,
    "auto_assign_policy": "department_first",
    "admin_password": "admin123",
    "dept_passwords": {
        department: default_department_password(department)
        for department in ["הנהלה", "מכירות", "מו\"פ", "מערכות מידע", "בקרת איכות", "תפעול"]
    },
}

FIXED_PERSONNEL_SYNC_INTERVAL_SECONDS = int(DEFAULTS["personnel_sync_interval_seconds"])
FIXED_AUTO_ASSIGN_POLICY = str(DEFAULTS["auto_assign_policy"])


def get_runtime_storage_dir() -> Path:
    """Return the directory used for writable runtime data.

    The same directory is used for the settings JSON and the default SQLite
    database so packaged and containerized deployments keep their state
    together.
    """
    override = os.environ.get("TRIPLEZ_DATA_DIR", "").strip()
    if override:
        base = Path(override).expanduser().resolve()
    elif getattr(sys, "frozen", False):
        base = Path(sys.executable).resolve().parent
    else:
        base = Path.cwd().resolve()
    base.mkdir(parents=True, exist_ok=True)
    return base


def get_default_database_url() -> str:
    """Return the default SQLite URL for persisted runtime data."""
    db_path = get_runtime_storage_dir() / "triplez.db"
    return f"sqlite:///{db_path.as_posix()}"


def _settings_path() -> str:
    """Return the absolute path to the settings JSON file.

    Returns:
        File path string. Uses the directory containing the frozen executable
        when running under PyInstaller, otherwise the current working directory.
    """
    return str(get_runtime_storage_dir() / _SETTINGS_FILE)


def get_session_secret() -> str:
    """Return the persistent secret used to sign auth sessions."""
    path = get_runtime_storage_dir() / _SESSION_SECRET_FILE
    try:
        secret = path.read_text(encoding="utf-8").strip()
    except OSError:
        secret = ""

    if not secret:
        secret = secrets.token_urlsafe(48)
        path.write_text(secret, encoding="utf-8")
    return secret


def load_settings() -> Dict[str, Any]:
    """Load settings from disk, falling back to defaults for missing keys.

    Returns:
        Complete settings dictionary with all keys guaranteed present.
    """
    path = _settings_path()
    data: Dict[str, Any] = {}
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except (json.JSONDecodeError, OSError):
            data = {}

    merged = {**DEFAULTS}
    for key in DEFAULTS:
        if key in data:
            if isinstance(DEFAULTS[key], dict) and isinstance(data[key], dict):
                merged[key] = {**DEFAULTS[key], **data[key]}
            else:
                merged[key] = data[key]

    raw_dept_passwords = data.get("dept_passwords")
    if isinstance(raw_dept_passwords, dict):
        password_source = {str(k).strip(): str(v) for k, v in raw_dept_passwords.items() if str(k).strip()}
    else:
        password_source = {str(k): str(v) for k, v in DEFAULTS["dept_passwords"].items()}

    merged["dept_passwords"] = {}
    for department in merged["departments"]:
        current_password = str(password_source.get(department, "")).strip()
        if (
            not current_password
            or current_password == LEGACY_DEFAULT_DEPT_PASSWORDS.get(department, "")
        ):
            current_password = default_department_password(department)
        merged["dept_passwords"][department] = current_password

    merged["personnel_sync_interval_seconds"] = FIXED_PERSONNEL_SYNC_INTERVAL_SECONDS
    merged["personnel_sync_paused"] = bool(merged.get("personnel_sync_paused", False))
    merged["auto_assign_policy"] = FIXED_AUTO_ASSIGN_POLICY

    merged.pop("hebrew", None)
    return merged


def save_settings(settings: Dict[str, Any]) -> None:
    """Persist settings to the JSON file.

    Args:
        settings: Full settings dictionary to write.
    """
    path = _settings_path()
    with open(path, "w", encoding="utf-8") as f:
        json.dump(settings, f, ensure_ascii=False, indent=2)


def get_ranks_high_to_low() -> List[str]:
    """Return the ordered list of ranks from highest to lowest.

    Returns:
        List of rank strings.
    """
    return load_settings()["ranks_high_to_low"]


def get_allowed_ranks() -> set[str]:
    """Return the set of allowed rank values.

    Returns:
        Set of rank strings.
    """
    return set(load_settings()["ranks_high_to_low"])


def get_allowed_genders() -> set[str]:
    """Return the set of allowed gender values.

    Returns:
        Set of gender strings.
    """
    return set(load_settings()["genders"])


def get_allowed_departments() -> set[str]:
    """Return the set of allowed department values.

    Returns:
        Set of department strings.
    """
    return set(load_settings()["departments"])


def get_allowed_buildings() -> set[str]:
    """Return the set of allowed building values.

    Returns:
        Set of building strings.
    """
    return set(load_settings()["buildings"])


def get_personnel_sync_interval_seconds() -> int:
    """Return the active personnel sync interval in seconds."""
    return FIXED_PERSONNEL_SYNC_INTERVAL_SECONDS


def is_personnel_sync_paused() -> bool:
    """Return whether background personnel sync is paused."""
    return bool(load_settings()["personnel_sync_paused"])


def get_auto_assign_policy() -> str:
    """Return the active auto-assignment policy."""
    return FIXED_AUTO_ASSIGN_POLICY


def validate_personnel_source_url(url: str) -> str:
    """Validate and normalize the configured personnel source URL."""
    value = str(url or "").strip()
    if not value:
        return ""

    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"}:
        raise ValueError("כתובת מקור כוח האדם חייבת להיות מסוג http או https")
    if not parsed.netloc:
        raise ValueError("כתובת מקור כוח האדם חייבת לכלול שם מארח")
    if parsed.username or parsed.password:
        raise ValueError("כתובת מקור כוח האדם לא יכולה לכלול פרטי התחברות בתוך ה-URL")
    return value
