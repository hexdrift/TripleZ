"""
Data models (dataclasses and Pydantic) for the room allocator.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, List, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

from config import (
    normalize_department,
    normalize_gender,
    normalize_name,
    normalize_rank,
)
from src.backend.settings import get_allowed_genders, get_allowed_ranks


@dataclass(frozen=True)
class RoomRef:
    """
    Attributes:
        building_name: Building identifier.
        room_number: Room number.
        room_rank_used: Room rank used for placement.
    """
    building_name: Any
    room_number: Any
    room_rank_used: str


class AssignRequest(BaseModel):
    """Request body for assigning a person to a room."""

    person_id: str
    rank: Optional[str] = None
    department: Optional[str] = None
    gender: Optional[str] = None
    person_name: Optional[str] = None

    @field_validator("rank", mode="before")
    @classmethod
    def v_rank(cls, v: Any) -> Any:
        """Normalize and validate the rank field.

        Args:
            v: Raw rank value.

        Returns:
            Normalized rank string or None.
        """
        if v is None:
            return None
        r = normalize_rank(v)
        if r not in get_allowed_ranks():
            raise ValueError(f"rank must be one of {sorted(get_allowed_ranks())}")
        return r

    @field_validator("department", mode="before")
    @classmethod
    def v_department(cls, v: Any) -> Any:
        """Normalize the department field.

        Args:
            v: Raw department value.

        Returns:
            Normalized department string or None.
        """
        if v is None:
            return None
        return normalize_department(v)

    @field_validator("gender", mode="before")
    @classmethod
    def v_gender(cls, v: Any) -> Any:
        """Normalize and validate the gender field.

        Args:
            v: Raw gender value.

        Returns:
            Normalized gender string or None.
        """
        if v is None:
            return None
        g = normalize_gender(v)
        if g not in get_allowed_genders():
            raise ValueError(f"gender must be one of {sorted(get_allowed_genders())}")
        return g

    @field_validator("person_name", mode="before")
    @classmethod
    def v_person_name(cls, v: Any) -> Any:
        """Normalize the person_name field.

        Args:
            v: Raw name value.

        Returns:
            Normalized name string or None.
        """
        if v is None:
            return None
        return normalize_name(v)


class UnassignRequest(BaseModel):
    """Request body for unassigning a person from their room."""

    person_id: str


class RoomCreate(BaseModel):
    """Schema for creating a new room."""

    building_name: str
    room_number: int
    number_of_beds: int = Field(ge=0)
    room_rank: str
    gender: str
    occupant_ids: List[str]

    @field_validator("room_rank", mode="before")
    @classmethod
    def v_room_rank(cls, v: Any) -> str:
        """Normalize and validate room_rank.

        Args:
            v: Raw rank value.

        Returns:
            Normalized rank string.
        """
        r = normalize_rank(v)
        if r not in get_allowed_ranks():
            raise ValueError(f"room_rank must be one of {sorted(get_allowed_ranks())}")
        return r

    @field_validator("gender", mode="before")
    @classmethod
    def v_room_gender(cls, v: Any) -> str:
        """Normalize and validate the gender field.

        Args:
            v: Raw gender value.

        Returns:
            Normalized gender string.
        """
        g = normalize_gender(v)
        if g not in get_allowed_genders():
            raise ValueError(f"gender must be one of {sorted(get_allowed_genders())}")
        return g

    @field_validator("occupant_ids")
    @classmethod
    def v_occupant_ids(cls, v: List[str]) -> List[str]:
        """Validate that occupant IDs contain no duplicates.

        Args:
            v: List of occupant ID strings.

        Returns:
            Cleaned list of occupant ID strings.
        """
        ids = [str(x).strip() for x in v]
        if len(set(ids)) != len(ids):
            raise ValueError("occupant_ids must not contain duplicates")
        return ids

    @model_validator(mode="after")
    def v_capacity(self) -> "RoomCreate":
        """Validate that occupant count does not exceed bed capacity.

        Returns:
            The validated RoomCreate instance.
        """
        if len(self.occupant_ids) > self.number_of_beds:
            raise ValueError("occupant_ids count cannot exceed number_of_beds")
        return self


class RoomUpsert(BaseModel):
    """Schema for updating or inserting a room."""

    building_name: str
    room_number: int
    number_of_beds: Optional[int] = Field(default=None, ge=0)
    room_rank: Optional[str] = None
    gender: Optional[str] = None
    designated_department: Optional[str] = None
    occupant_ids: Optional[List[str]] = None

    @field_validator("room_rank", mode="before")
    @classmethod
    def v_room_rank(cls, v: Any) -> Any:
        """Normalize and validate room_rank if provided.

        Args:
            v: Raw rank value.

        Returns:
            Normalized rank string or None.
        """
        if v is None:
            return None
        r = normalize_rank(v)
        if r not in get_allowed_ranks():
            raise ValueError(f"room_rank must be one of {sorted(get_allowed_ranks())}")
        return r

    @field_validator("gender", mode="before")
    @classmethod
    def v_gender(cls, v: Any) -> Any:
        """Normalize and validate the gender field if provided.

        Args:
            v: Raw gender value.

        Returns:
            Normalized gender string or None.
        """
        if v is None:
            return None
        g = normalize_gender(v)
        if g not in get_allowed_genders():
            raise ValueError(f"gender must be one of {sorted(get_allowed_genders())}")
        return g

    @field_validator("occupant_ids")
    @classmethod
    def v_occupants(cls, v: Optional[List[str]]) -> Optional[List[str]]:
        """Validate that occupant IDs contain no duplicates.

        Args:
            v: List of occupant ID strings or None.

        Returns:
            Cleaned list of occupant ID strings or None.
        """
        if v is None:
            return None
        ids = [str(x).strip() for x in v]
        if len(set(ids)) != len(ids):
            raise ValueError("occupant_ids must not contain duplicates")
        return ids


class RoomsLoadRequest(BaseModel):
    """Request body for bulk-loading rooms."""

    rooms: List[RoomCreate]


class RoomsUpsertRequest(BaseModel):
    """Request body for bulk-upserting rooms."""

    rooms: List[RoomUpsert]


class PersonnelCreate(BaseModel):
    """Schema for creating a personnel record."""

    person_id: str
    full_name: str
    department: str
    gender: str
    rank: str

    @field_validator("full_name", mode="before")
    @classmethod
    def v_full_name(cls, v: Any) -> str:
        """Normalize the full_name field.

        Args:
            v: Raw name value.

        Returns:
            Normalized name string.
        """
        return normalize_name(v)

    @field_validator("department", mode="before")
    @classmethod
    def v_department(cls, v: Any) -> str:
        """Normalize the department field.

        Args:
            v: Raw department value.

        Returns:
            Normalized department string.
        """
        return normalize_department(v)

    @field_validator("gender", mode="before")
    @classmethod
    def v_gender(cls, v: Any) -> str:
        """Normalize and validate the gender field.

        Args:
            v: Raw gender value.

        Returns:
            Normalized gender string.
        """
        g = normalize_gender(v)
        if g not in get_allowed_genders():
            raise ValueError(f"gender must be one of {sorted(get_allowed_genders())}")
        return g

    @field_validator("rank", mode="before")
    @classmethod
    def v_rank(cls, v: Any) -> str:
        """Normalize and validate the rank field.

        Args:
            v: Raw rank value.

        Returns:
            Normalized rank string.
        """
        r = normalize_rank(v)
        if r not in get_allowed_ranks():
            raise ValueError(f"rank must be one of {sorted(get_allowed_ranks())}")
        return r


class PersonnelLoadRequest(BaseModel):
    """Request body for bulk-loading personnel."""

    personnel: List[PersonnelCreate]


class RoomRefResponse(BaseModel):
    """Response model representing a room reference."""

    building_name: str
    room_number: int
    room_rank_used: str


class AssignResponse(BaseModel):
    """Response model for room assignment operations."""

    assigned: bool
    room: Optional[RoomRefResponse] = None
    error_code: Optional[str] = None
    error_message: Optional[str] = None


class SimpleOK(BaseModel):
    """Generic success/failure response."""

    ok: bool
    detail: Optional[str] = None


class LoginRequest(BaseModel):
    """Request body for authentication."""

    password: str


class LoginResponse(BaseModel):
    """Response model for login attempts."""

    ok: bool
    role: Optional[str] = None
    department: Optional[str] = None
    error: Optional[str] = None


class SwapRequest(BaseModel):
    """Request body for swapping two people's room assignments."""

    person_id_a: str
    person_id_b: str


class SetRoomDepartmentRequest(BaseModel):
    """Request body for setting a room's designated department."""

    building_name: str
    room_number: int
    department: Optional[str] = None

    @field_validator("department", mode="before")
    @classmethod
    def v_department(cls, v: Any) -> Any:
        if v is None or (isinstance(v, str) and not v.strip()):
            return None
        return normalize_department(v)


class MoveRequest(BaseModel):
    """Request body for moving a person to a specific room."""

    person_id: str
    target_building: str
    target_room_number: int
