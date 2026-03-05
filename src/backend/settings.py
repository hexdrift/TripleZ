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
import sys
from typing import Any, Dict, List

_SETTINGS_FILE = "triplez_settings.json"

DEFAULTS: Dict[str, Any] = {
    "ranks_high_to_low": ["VP", "Director", "Manager", "Junior"],
    "genders": ["M", "F"],
    "departments": ["Exec", "Sales", "R&D", "IT", "QA", "Ops"],
    "buildings": ["A", "B", "C", "D"],
    "admin_password": "admin123",
    "dept_passwords": {
        "Exec": "Exec123",
        "Sales": "Sales123",
        "R&D": "R&D123",
        "IT": "IT123",
        "QA": "QA123",
        "Ops": "Ops123",
    },
    "hebrew": {
        "ranks": {"VP": "סמנכ\"ל", "Director": "מנהל בכיר", "Manager": "מנהל", "Junior": "זוטר"},
        "departments": {"Exec": "הנהלה", "Sales": "מכירות", "R&D": "מו\"פ", "IT": "מערכות מידע", "QA": "בקרת איכות", "Ops": "תפעול"},
        "genders": {"M": "בנים", "F": "בנות"},
        "buildings": {"A": "א", "B": "ב", "C": "ג", "D": "ד"},
    },
}


def _settings_path() -> str:
    """Return the absolute path to the settings JSON file.

    Returns:
        File path string. Uses the directory containing the frozen executable
        when running under PyInstaller, otherwise the current working directory.
    """
    if getattr(sys, "frozen", False):
        base = os.path.dirname(sys.executable)
    else:
        base = os.path.abspath(".")
    return os.path.join(base, _SETTINGS_FILE)


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
