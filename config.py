"""
Shared constants, type aliases, and normalization helpers for the room allocator.

All configurable values (ranks, genders, departments, buildings) are read
dynamically from the settings store so they can be changed at runtime.
Module-level constants like ALLOWED_DEPARTMENTS are computed fresh on every
import via __getattr__, so code using ``from config import X`` gets a snapshot
while validators call the getter functions directly for live values.
"""

from __future__ import annotations

from typing import Any, List, Set, Tuple

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
        raise ValueError("rank is required")
    s = str(value).strip()
    if not s:
        raise ValueError("rank is required")
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
        raise ValueError("gender is required")
    s = str(value).strip().upper()
    if not s:
        raise ValueError("gender is required")
    return s


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
        raise ValueError("department is required")
    s = str(value).strip()
    if not s:
        raise ValueError("department is required")
    allowed = get_allowed_departments()
    if s not in allowed:
        raise ValueError(f"Invalid department '{s}'. Allowed: {sorted(allowed)}")
    return s


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
        raise ValueError("building_name is required")
    s = str(value).strip()
    if not s:
        raise ValueError("building_name is required")
    allowed = get_allowed_buildings()
    if s not in allowed:
        raise ValueError(f"Invalid building_name '{s}'. Allowed: {sorted(allowed)}")
    return s


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
        raise ValueError("name is required")
    s = str(value).strip()
    if not s:
        raise ValueError("name is required")
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
