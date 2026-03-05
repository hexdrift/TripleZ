"""Settings management endpoints — admin only."""

from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter

from src.backend.settings import load_settings, save_settings

router = APIRouter()


@router.get("/admin/settings")
def get_settings() -> Dict[str, Any]:
    """Return the current application settings.

    Returns:
        Dictionary of all configurable settings.
    """
    return load_settings()


@router.put("/admin/settings")
def update_settings(body: Dict[str, Any]) -> Dict[str, Any]:
    """Update application settings and persist to disk.

    Args:
        body: Partial or full settings dictionary. Only provided keys are updated.

    Returns:
        The merged settings after the update.
    """
    current = load_settings()
    for key, value in body.items():
        if key in current:
            if isinstance(current[key], dict) and isinstance(value, dict):
                current[key] = {**current[key], **value}
            else:
                current[key] = value
    save_settings(current)
    return current
