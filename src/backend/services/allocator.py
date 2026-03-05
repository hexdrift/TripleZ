"""
Core room allocation engine backed by a RemoteStore.

All state lives in the remote store (rooms, personnel tables).
No in-memory cache — every operation reads from and writes to the store.

Rooms store occupant_ids (list of person_id strings).
Personnel stores person details (name, rank, department, gender).
"""

from __future__ import annotations

import json
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd

from config import (
    OCCUPANT_IDS_COL,
    ROOM_ID_COLS,
    normalize_building,
    normalize_department,
    normalize_gender,
    normalize_name,
    normalize_rank,
)
from src.backend.settings import get_allowed_genders, get_ranks_high_to_low
from src.backend.schemas import RoomRef
from src.backend.services.rank_policy import RankPolicy
from src.backend.store.base import RemoteStore


class RoomAllocatorCore:
    """Core room allocation engine that manages room assignments via a RemoteStore.

    Attributes:
        REQUIRED_ROOM_COLS: Column names required in rooms DataFrames.
        REQUIRED_PERSONNEL_COLS: Column names required in personnel DataFrames.
    """

    REQUIRED_ROOM_COLS = (
        "building_name",
        "room_number",
        "number_of_beds",
        "room_rank",
        "gender",
    )

    REQUIRED_PERSONNEL_COLS = ("person_id", "full_name", "department", "gender", "rank")

    def __init__(
        self,
        store: RemoteStore,
        *,
        rank_policy: RankPolicy,
        occupant_ids_col: str = OCCUPANT_IDS_COL,
        room_id_cols: Tuple[str, ...] = ROOM_ID_COLS,
    ) -> None:
        """
        Args:
            store: Remote store backend for persistence.
            rank_policy: Policy controlling rank fallback chains.
            occupant_ids_col: Column name for occupant IDs in room data.
            room_id_cols: Column names used to identify a room.
        """
        self._store = store
        self.rank_policy = rank_policy
        self.occupant_ids_col = occupant_ids_col
        self.room_id_cols = room_id_cols

    def get_known_personnel_ids(self) -> set:
        """Return the set of all known person_id strings."""
        return {p["person_id"] for p in self._store.get_all("personnel")}

    def is_empty(self) -> bool:
        """Check whether the rooms table is empty.

        Returns:
            True if no rooms exist in the store.
        """
        return len(self._store.get_all("rooms")) == 0

    def load_rooms(self, rooms_df: pd.DataFrame) -> None:
        """Replace all rooms in the store with rows from a DataFrame.

        Args:
            rooms_df: DataFrame containing room data with all required columns.

        Raises:
            ValueError: If required columns are missing, ranks/genders are invalid,
                or occupant data is inconsistent.
        """
        missing = [c for c in self.REQUIRED_ROOM_COLS if c not in rooms_df.columns]
        if missing:
            raise ValueError(f"rooms_df missing columns: {missing}")
        for c in self.room_id_cols:
            if c not in rooms_df.columns:
                raise ValueError(f"rooms_df missing room_id_cols column: '{c}'")

        rooms = rooms_df.copy()
        rooms["room_rank"] = rooms["room_rank"].astype(str).map(normalize_rank)
        rooms["gender"] = rooms["gender"].astype(str).map(normalize_gender)
        rooms["number_of_beds"] = pd.to_numeric(rooms["number_of_beds"], errors="coerce").fillna(0).astype(int)

        for r in rooms["room_rank"].unique().tolist():
            self.rank_policy.validate_rank(r)
        for g in rooms["gender"].unique().tolist():
            if g not in get_allowed_genders():
                raise ValueError(f"Invalid room gender '{g}'. Allowed: {sorted(get_allowed_genders())}")

        if self.occupant_ids_col not in rooms.columns:
            rooms[self.occupant_ids_col] = None

        self._store.delete_all("rooms")

        for _, row in rooms.iterrows():
            building = normalize_building(row["building_name"])
            room_num = int(row["room_number"])
            cap = int(row["number_of_beds"])
            ids = self._parse_occupant_ids(row.get(self.occupant_ids_col))

            if len(set(ids)) != len(ids):
                raise ValueError(f"Room {building}#{room_num} has duplicate occupant IDs.")
            if len(ids) > cap:
                raise ValueError(f"Room {building}#{room_num} has {len(ids)} occupants but capacity {cap}.")

            designated_dept = ""
            if "designated_department" in row.index and self._is_present(row.get("designated_department")):
                designated_dept = normalize_department(str(row["designated_department"]))

            self._store.insert("rooms", {
                "room_id": self._make_room_id(building, room_num),
                "building_name": building,
                "room_number": room_num,
                "number_of_beds": cap,
                "room_rank": str(row["room_rank"]),
                "gender": str(row["gender"]),
                "designated_department": designated_dept,
                "occupant_ids": json.dumps(ids),
            })

    def load_personnel(self, personnel_df: pd.DataFrame) -> None:
        """Replace all personnel in the store with rows from a DataFrame.

        Args:
            personnel_df: DataFrame containing personnel data with all required columns.

        Raises:
            ValueError: If required columns are missing or field values are invalid.
        """
        missing = [c for c in self.REQUIRED_PERSONNEL_COLS if c not in personnel_df.columns]
        if missing:
            raise ValueError(f"personnel_df missing columns: {missing}")

        rows_to_insert: List[dict] = []

        for _, row in personnel_df.iterrows():
            pid = str(row["person_id"])
            name = normalize_name(row["full_name"])
            dept = normalize_department(row["department"])
            gender = normalize_gender(row["gender"])
            rank = normalize_rank(row["rank"])

            self.rank_policy.validate_rank(rank)
            if gender not in get_allowed_genders():
                raise ValueError(f"Invalid gender '{gender}' for person_id={pid}")

            rows_to_insert.append({
                "person_id": pid,
                "full_name": name,
                "department": dept,
                "gender": gender,
                "rank": rank,
            })

        self._store.delete_all("personnel")
        for r in rows_to_insert:
            self._store.insert("personnel", r)

    def assign(
        self,
        *,
        person_id: str,
        rank: Optional[str] = None,
        department: Optional[str] = None,
        gender: Optional[str] = None,
        person_name: Optional[str] = None,
    ) -> Tuple[Optional[RoomRef], Optional[dict]]:
        """Assign a person to the best available room.

        Args:
            person_id: Unique identifier of the person.
            rank: Person's rank (looked up from personnel if not provided).
            department: Person's department (looked up from personnel if not provided).
            gender: Person's gender (looked up from personnel if not provided).
            person_name: Person's name (looked up from personnel if not provided).

        Returns:
            Tuple of (RoomRef, None) on success, or (None, error_dict) on failure.
        """
        pid = str(person_id)

        rec = self._store.get_by_id("personnel", pid)
        if rec:
            rank = rank or rec["rank"]
            department = department or rec["department"]
            gender = gender or rec["gender"]
            person_name = person_name or rec["full_name"]

        if not rank or not department or not gender:
            return None, {
                "error_code": "MISSING_FIELDS",
                "error_message": f"rank, department, gender are required (person_id={pid} not in personnel records).",
            }

        rank_n = normalize_rank(rank)
        dept_n = normalize_department(department)
        gender_n = normalize_gender(gender)

        if gender_n not in get_allowed_genders():
            return None, {"error_code": "INVALID_GENDER", "error_message": f"Invalid gender '{gender_n}'. Allowed: {sorted(get_allowed_genders())}"}

        try:
            self.rank_policy.validate_rank(rank_n)
        except ValueError as e:
            return None, {"error_code": "INVALID_RANK", "error_message": str(e)}

        existing = self.get_person_room(pid)
        if existing is not None:
            return existing, None

        for try_rank in self.rank_policy.chain(rank_n):
            ref = self._try_assign_for_rank(
                person_id=pid,
                try_rank=try_rank,
                department=dept_n,
                gender=gender_n,
            )
            if ref is not None:
                return ref, None

        top_rank = get_ranks_high_to_low()[0]
        if rank_n == top_rank:
            return None, {
                "error_code": f"NO_{top_rank.upper()}_ROOM_AVAILABLE",
                "error_message": f"No available {top_rank} room for gender='{gender_n}'. {top_rank} cannot be assigned to other ranks.",
            }

        return None, {
            "error_code": "NO_ROOM_AVAILABLE",
            "error_message": f"No available room for rank='{rank_n}' (tried {self.rank_policy.chain(rank_n)}), department='{dept_n}', gender='{gender_n}'.",
        }

    def unassign(self, *, person_id: str) -> bool:
        """Remove a person from their currently assigned room.

        Args:
            person_id: Unique identifier of the person to unassign.

        Returns:
            True if the person was found and removed, False otherwise.
        """
        pid = str(person_id)
        room = self._find_room_for_person(pid)
        if room is None:
            return False

        ids = json.loads(room["occupant_ids"])
        ids.remove(pid)
        self._store.update("rooms", room["room_id"], {"occupant_ids": json.dumps(ids)})
        return True

    def get_person_room(self, person_id: str) -> Optional[RoomRef]:
        """Look up the room a person is currently assigned to.

        Args:
            person_id: Unique identifier of the person.

        Returns:
            RoomRef if the person is assigned, None otherwise.
        """
        pid = str(person_id)
        room = self._find_room_for_person(pid)
        if room is None:
            return None
        return RoomRef(
            building_name=room["building_name"],
            room_number=room["room_number"],
            room_rank_used=room["room_rank"],
        )

    def rooms_with_state(self) -> pd.DataFrame:
        """Build a DataFrame of all rooms with occupancy details.

        Returns:
            DataFrame with room info, occupant IDs/names, and available bed counts.
        """
        all_rooms = self._store.get_all("rooms")
        all_personnel = {p["person_id"]: p for p in self._store.get_all("personnel")}
        rows = []
        for room in all_rooms:
            ids = json.loads(room["occupant_ids"])
            names = {pid: all_personnel[pid]["full_name"] for pid in ids if pid in all_personnel}
            designated = room.get("designated_department", "")
            if designated:
                departments = [designated]
            else:
                departments = sorted({all_personnel[pid]["department"] for pid in ids if pid in all_personnel})
            rows.append({
                "building_name": room["building_name"],
                "room_number": room["room_number"],
                "number_of_beds": room["number_of_beds"],
                "room_rank": room["room_rank"],
                "designated_department": designated,
                "departments": departments,
                "gender": room["gender"],
                "occupant_ids": ids,
                "occupant_names": names,
                "available_beds": max(0, room["number_of_beds"] - len(ids)),
                "occupant_count": len(ids),
            })
        return pd.DataFrame(rows) if rows else pd.DataFrame(
            columns=["building_name", "room_number", "number_of_beds", "room_rank",
                     "designated_department", "departments", "gender", "occupant_ids", "available_beds", "occupant_count"]
        )

    def links_df(self) -> pd.DataFrame:
        """Build a DataFrame mapping each assigned person to their room.

        Returns:
            DataFrame with columns person_id, building_name, room_number.
        """
        rows = []
        for room in self._store.get_all("rooms"):
            for pid in json.loads(room["occupant_ids"]):
                rows.append({"person_id": pid, "building_name": room["building_name"], "room_number": room["room_number"]})
        return pd.DataFrame(rows) if rows else pd.DataFrame(columns=["person_id", "building_name", "room_number"])

    def upsert_rooms(self, rooms_updates_df: pd.DataFrame) -> Dict[str, int]:
        """Update existing rooms or insert new ones from a DataFrame.

        Args:
            rooms_updates_df: DataFrame with room data to upsert.

        Returns:
            Dict with counts of updated, added, and total_rooms.

        Raises:
            ValueError: If required columns are missing for new rooms.
        """
        if rooms_updates_df is None or len(rooms_updates_df) == 0:
            return {"updated": 0, "added": 0, "total_rooms": len(self._store.get_all("rooms"))}

        for c in self.room_id_cols:
            if c not in rooms_updates_df.columns:
                raise ValueError(f"rooms_updates_df missing room_id_cols: '{c}'")

        updated = 0
        added = 0

        for _, row in rooms_updates_df.iterrows():
            building = normalize_building(row["building_name"])
            room_num = int(row["room_number"])
            room_id = self._make_room_id(building, room_num)

            existing = self._store.get_by_id("rooms", room_id)
            if existing:
                updates: Dict[str, Any] = {}
                for col in ("number_of_beds", "room_rank", "gender"):
                    if col in row.index and self._is_present(row.get(col)):
                        updates[col] = row[col]
                if "designated_department" in row.index:
                    val = row.get("designated_department")
                    updates["designated_department"] = normalize_department(str(val)) if self._is_present(val) else ""
                if self.occupant_ids_col in row.index and self._is_present(row.get(self.occupant_ids_col)):
                    ids = self._parse_occupant_ids(row[self.occupant_ids_col])
                    updates["occupant_ids"] = json.dumps(ids)
                if updates:
                    self._store.update("rooms", room_id, updates)
                updated += 1
            else:
                for col in self.REQUIRED_ROOM_COLS:
                    if col not in row.index or not self._is_present(row.get(col)):
                        raise ValueError(f"New room missing required column '{col}' for room {building}#{room_num}")
                ids = self._parse_occupant_ids(row.get(self.occupant_ids_col)) if self.occupant_ids_col in row.index else []
                designated_dept = ""
                if "designated_department" in row.index and self._is_present(row.get("designated_department")):
                    designated_dept = normalize_department(str(row["designated_department"]))
                self._store.insert("rooms", {
                    "room_id": room_id,
                    "building_name": building,
                    "room_number": room_num,
                    "number_of_beds": int(row["number_of_beds"]),
                    "room_rank": normalize_rank(str(row["room_rank"])),
                    "gender": normalize_gender(str(row["gender"])),
                    "designated_department": designated_dept,
                    "occupant_ids": json.dumps(ids),
                })
                added += 1

        total = len(self._store.get_all("rooms"))
        return {"updated": updated, "added": added, "total_rooms": total}

    def swap_people(self, person_id_a: str, person_id_b: str) -> Tuple[bool, Optional[str]]:
        """Swap room assignments of two people.

        Args:
            person_id_a: First person's ID.
            person_id_b: Second person's ID.

        Returns:
            Tuple of (success, error_message). error_message is None on success.
        """
        room_a = self._find_room_for_person(person_id_a)
        room_b = self._find_room_for_person(person_id_b)
        if room_a is None:
            return False, f"Person {person_id_a} is not assigned to any room."
        if room_b is None:
            return False, f"Person {person_id_b} is not assigned to any room."
        if room_a["room_id"] == room_b["room_id"]:
            return False, "Both people are in the same room."

        ids_a = json.loads(room_a["occupant_ids"])
        ids_b = json.loads(room_b["occupant_ids"])
        ids_a.remove(person_id_a)
        ids_a.append(person_id_b)
        ids_b.remove(person_id_b)
        ids_b.append(person_id_a)
        self._store.update("rooms", room_a["room_id"], {"occupant_ids": json.dumps(ids_a)})
        self._store.update("rooms", room_b["room_id"], {"occupant_ids": json.dumps(ids_b)})
        return True, None

    def move_person(self, person_id: str, target_building: str, target_room_number: int) -> Tuple[bool, Optional[str]]:
        """Move a person to a specific room.

        Args:
            person_id: ID of the person to move.
            target_building: Building name of the target room.
            target_room_number: Room number within the target building.

        Returns:
            Tuple of (success, error_message). error_message is None on success.
        """
        current = self._find_room_for_person(person_id)
        target_id = self._make_room_id(target_building, target_room_number)
        target = self._store.get_by_id("rooms", target_id)
        if target is None:
            return False, f"Target room {target_building}#{target_room_number} not found."

        target_ids = json.loads(target["occupant_ids"])
        avail = target["number_of_beds"] - len(target_ids)
        if avail <= 0:
            return False, f"Target room {target_building}#{target_room_number} is full."
        if person_id in target_ids:
            return False, "Person is already in that room."

        if current is not None:
            cur_ids = json.loads(current["occupant_ids"])
            cur_ids.remove(person_id)
            self._store.update("rooms", current["room_id"], {"occupant_ids": json.dumps(cur_ids)})

        target_ids.append(person_id)
        self._store.update("rooms", target_id, {"occupant_ids": json.dumps(target_ids)})
        return True, None

    def set_room_department(self, building_name: str, room_number: int, department: Optional[str]) -> Tuple[bool, Optional[str]]:
        """Set or clear a room's designated department.

        Args:
            building_name: Building identifier.
            room_number: Room number.
            department: Department to designate, or None to clear.

        Returns:
            Tuple of (success, error_message).
        """
        room_id = self._make_room_id(building_name, room_number)
        existing = self._store.get_by_id("rooms", room_id)
        if existing is None:
            return False, f"Room {building_name}#{room_number} not found."
        val = normalize_department(department) if department else ""
        self._store.update("rooms", room_id, {"designated_department": val})
        return True, None

    def _find_room_for_person(self, person_id: str) -> Optional[dict]:
        """Find the room dict containing the given person.

        Args:
            person_id: Person ID to search for.

        Returns:
            Room dict if found, None otherwise.
        """
        for room in self._store.get_all("rooms"):
            if person_id in json.loads(room["occupant_ids"]):
                return room
        return None

    def _try_assign_for_rank(
        self,
        *,
        person_id: str,
        try_rank: str,
        department: str,
        gender: str,
    ) -> Optional[RoomRef]:
        """Attempt to assign a person to a room of a specific rank.

        Args:
            person_id: Person ID to assign.
            try_rank: Rank of rooms to consider.
            department: Person's department (used for prioritization).
            gender: Person's gender (must match room gender).

        Returns:
            RoomRef if assignment succeeded, None if no suitable room found.
        """
        candidates = self._store.query("rooms", {"room_rank": try_rank, "gender": gender})
        if not candidates:
            return None

        all_personnel = {p["person_id"]: p for p in self._store.get_all("personnel")}

        scored: List[Tuple[int, int, str, int, dict]] = []
        for room in candidates:
            ids = json.loads(room["occupant_ids"])
            avail = room["number_of_beds"] - len(ids)
            if avail <= 0:
                continue
            designated = room.get("designated_department", "")
            if designated:
                dept_priority = 0 if department == designated else 1
            else:
                occupant_depts = {
                    all_personnel[pid]["department"]
                    for pid in ids
                    if pid in all_personnel
                }
                dept_priority = 0 if (not occupant_depts or department in occupant_depts) else 1
            scored.append((dept_priority, avail, room["building_name"], room["room_number"], room))

        if not scored:
            return None

        scored.sort(key=lambda t: (t[0], t[1], t[2], t[3]))
        _, _, _, _, chosen = scored[0]

        ids = json.loads(chosen["occupant_ids"])
        ids.append(person_id)
        self._store.update("rooms", chosen["room_id"], {"occupant_ids": json.dumps(ids)})

        return RoomRef(
            building_name=chosen["building_name"],
            room_number=chosen["room_number"],
            room_rank_used=chosen["room_rank"],
        )

    @staticmethod
    def _make_room_id(building_name: Any, room_number: Any) -> str:
        """Create a composite room ID from building name and room number.

        Args:
            building_name: Building identifier.
            room_number: Room number.

        Returns:
            Composite string key in the form "building__number".
        """
        return f"{building_name}__{room_number}"

    @staticmethod
    def _is_present(value: Any) -> bool:
        """Check whether a value is non-null and non-NaN.

        Args:
            value: Value to check.

        Returns:
            True if the value is considered present.
        """
        if isinstance(value, (list, tuple)):
            return True
        if value is None:
            return False
        if isinstance(value, float):
            return not pd.isna(value)
        return True

    @staticmethod
    def _parse_occupant_ids(value: Any) -> List[str]:
        """Parse occupant IDs from various input formats.

        Args:
            value: Raw occupant IDs as None, list, JSON string, or comma-separated string.

        Returns:
            List of person ID strings.
        """
        if value is None:
            return []
        if isinstance(value, float) and pd.isna(value):
            return []
        if isinstance(value, (list, tuple, set)):
            return [str(v) for v in value if v is not None and not (isinstance(v, float) and pd.isna(v))]
        if isinstance(value, str):
            s = value.strip()
            if not s:
                return []
            if s.startswith("["):
                try:
                    parsed = json.loads(s)
                    if isinstance(parsed, list):
                        return [str(v) for v in parsed]
                except (json.JSONDecodeError, ValueError):
                    pass
            return [p.strip() for p in s.split(",") if p.strip()]
        return [str(value)]
