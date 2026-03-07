"""
Shared constants, type aliases, and normalization helpers for the room allocator.

All configurable values (ranks, genders, departments, buildings) are read
dynamically from the settings store so they can be changed at runtime.
Module-level constants like ALLOWED_DEPARTMENTS are computed fresh on every
import via __getattr__, so code using ``from config import X`` gets a snapshot
while validators call the getter functions directly for live values.
"""

from __future__ import annotations

from typing import Any, Iterable, List, Set, Tuple

from pydantic import BaseModel

from src.backend.settings import (
    get_allowed_buildings,
    get_allowed_departments,
    get_allowed_genders,
    get_allowed_ranks,
    get_ranks_high_to_low,
)

ROOM_ID_COLS: Tuple[str, ...] = ("building_name", "room_number")
OCCUPANT_IDS_COL: str = "occupant_ids"

_DYNAMIC_ATTRS = {
    "RANKS_HIGH_TO_LOW": get_ranks_high_to_low,
    "ALLOWED_RANKS": get_allowed_ranks,
    "ALLOWED_GENDERS": get_allowed_genders,
    "ALLOWED_DEPARTMENTS": get_allowed_departments,
    "ALLOWED_BUILDINGS": get_allowed_buildings,
}

_RANK_ALIASES = {
    "VP": ("VP", 'סמנכ"ל'),
    'סמנכ"ל': ('סמנכ"ל', "VP"),
    'סמנכ״ל': ('סמנכ"ל', "VP"),
    "DIRECTOR": ("Director", "מנהל בכיר"),
    "Director": ("Director", "מנהל בכיר"),
    "מנהל בכיר": ("מנהל בכיר", "Director"),
    "MANAGER": ("Manager", "מנהל"),
    "Manager": ("Manager", "מנהל"),
    "מנהל": ("מנהל", "Manager"),
    "JUNIOR": ("Junior", "זוטר"),
    "Junior": ("Junior", "זוטר"),
    "זוטר": ("זוטר", "Junior"),
}

_GENDER_ALIASES = {
    "M": ("M", "בנים"),
    "MALE": ("M", "בנים"),
    "בנים": ("בנים", "M"),
    "F": ("F", "בנות"),
    "FEMALE": ("F", "בנות"),
    "בנות": ("בנות", "F"),
}

_DEPARTMENT_ALIASES = {
    "Exec": ("Exec", "הנהלה"),
    "EXEC": ("Exec", "הנהלה"),
    "הנהלה": ("הנהלה", "Exec"),
    "Sales": ("Sales", "מכירות"),
    "SALES": ("Sales", "מכירות"),
    "מכירות": ("מכירות", "Sales"),
    "R&D": ("R&D", 'מו"פ'),
    "r&d": ("R&D", 'מו"פ'),
    'מו"פ': ('מו"פ', "R&D"),
    'מו״פ': ('מו"פ', "R&D"),
    "IT": ("IT", "מערכות מידע"),
    "it": ("IT", "מערכות מידע"),
    "מערכות מידע": ("מערכות מידע", "IT"),
    "QA": ("QA", "בקרת איכות"),
    "qa": ("QA", "בקרת איכות"),
    "בקרת איכות": ("בקרת איכות", "QA"),
    "Ops": ("Ops", "תפעול"),
    "OPS": ("Ops", "תפעול"),
    "ops": ("Ops", "תפעול"),
    "תפעול": ("תפעול", "Ops"),
}

_BUILDING_ALIASES = {
    "A": ("A", "א"),
    "a": ("A", "א"),
    "א": ("א", "A"),
    "מבנה א": ("א", "A"),
    "B": ("B", "ב"),
    "b": ("B", "ב"),
    "ב": ("ב", "B"),
    "מבנה ב": ("ב", "B"),
    "C": ("C", "ג"),
    "c": ("C", "ג"),
    "ג": ("ג", "C"),
    "מבנה ג": ("ג", "C"),
    "D": ("D", "ד"),
    "d": ("D", "ד"),
    "ד": ("ד", "D"),
    "מבנה ד": ("ד", "D"),
}


def __getattr__(name: str) -> Any:
    """Provide dynamic module-level constants backed by the settings store.

    Args:
        name: Attribute name being accessed.

    Returns:
        The computed value for dynamic constants, or raises AttributeError.
    """
    if name in _DYNAMIC_ATTRS:
        return _DYNAMIC_ATTRS[name]()
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


def _candidate_values(value: str, aliases: dict[str, Iterable[str]]) -> list[str]:
    """Expand a value into all candidate strings using case variants and aliases.

    Args:
        value: The original string to expand.
        aliases: Mapping of known values to their alias tuples.

    Returns:
        Deduplicated list of candidate strings to try for matching.
    """
    keys = [value]
    upper = value.upper()
    lower = value.lower()
    if upper not in keys:
        keys.append(upper)
    if lower not in keys:
        keys.append(lower)

    candidates: list[str] = []
    for candidate in keys:
        if candidate not in candidates:
            candidates.append(candidate)
        for alias_candidate in aliases.get(candidate, ()):
            if alias_candidate not in candidates:
                candidates.append(alias_candidate)
    return candidates


def normalize_rank(value: Any) -> str:
    """Normalize a rank value to a trimmed string.

    Args:
        value: Raw input.

    Returns:
        Trimmed rank string.

    Raises:
        ValueError: If missing/empty.
    """
    if value is None:
        raise ValueError("דרגה היא שדה חובה")
    s = str(value).strip()
    if not s:
        raise ValueError("דרגה היא שדה חובה")
    allowed = get_allowed_ranks()
    for candidate in _candidate_values(s, _RANK_ALIASES):
        if candidate in allowed:
            return candidate
    return s


def normalize_gender(value: Any) -> str:
    """Normalize a gender value to an uppercased, trimmed string.

    Args:
        value: Raw input.

    Returns:
        Uppercased, trimmed gender string.

    Raises:
        ValueError: If missing/empty.
    """
    if value is None:
        raise ValueError("מגדר הוא שדה חובה")
    s = str(value).strip()
    if not s:
        raise ValueError("מגדר הוא שדה חובה")
    allowed = get_allowed_genders()
    for candidate in _candidate_values(s, _GENDER_ALIASES):
        if candidate in allowed:
            return candidate
    return s.upper()


def normalize_department(value: Any) -> str:
    """Normalize a department value and validate against allowed departments.

    Args:
        value: Raw input.

    Returns:
        Trimmed department string.

    Raises:
        ValueError: If missing/empty or not in allowed departments.
    """
    if value is None:
        raise ValueError("זירה היא שדה חובה")
    s = str(value).strip()
    if not s:
        raise ValueError("זירה היא שדה חובה")
    allowed = get_allowed_departments()
    for candidate in _candidate_values(s, _DEPARTMENT_ALIASES):
        if candidate in allowed:
            return candidate
    raise ValueError(f"זירה לא תקינה '{s}'. ערכים מותרים: {sorted(allowed)}")


def normalize_building(value: Any) -> str:
    """Normalize a building name and validate against allowed buildings.

    Args:
        value: Raw input.

    Returns:
        Trimmed building name string.

    Raises:
        ValueError: If missing/empty or not in allowed buildings.
    """
    if value is None:
        raise ValueError("שם מבנה הוא שדה חובה")
    s = str(value).strip()
    if not s:
        raise ValueError("שם מבנה הוא שדה חובה")
    allowed = get_allowed_buildings()
    for candidate in _candidate_values(s, _BUILDING_ALIASES):
        if candidate in allowed:
            return candidate
    raise ValueError(f"שם מבנה לא תקין '{s}'. ערכים מותרים: {sorted(allowed)}")


def normalize_name(value: Any) -> str:
    """Normalize a name value to a trimmed string.

    Args:
        value: Raw input.

    Returns:
        Trimmed name string.

    Raises:
        ValueError: If missing/empty.
    """
    if value is None:
        raise ValueError("שם הוא שדה חובה")
    s = str(value).strip()
    if not s:
        raise ValueError("שם הוא שדה חובה")
    return s


def model_to_dict(model: BaseModel, *, exclude_unset: bool = False) -> dict:
    """Convert a Pydantic model to a dictionary.

    Args:
        model: BaseModel instance.
        exclude_unset: Omit fields not explicitly set.

    Returns:
        Dict representation.
    """
    if hasattr(model, "model_dump"):
        return model.model_dump(exclude_unset=exclude_unset)
    return model.dict(exclude_unset=exclude_unset)
