"""
Core room allocation engine backed by a RemoteStore.

All state lives in the remote store (rooms, personnel tables).
No in-memory cache — every operation reads from and writes to the store.

Rooms store occupant_ids (list of person_id strings).
Personnel stores person details (name, rank, department, gender).
"""

from __future__ import annotations

import json
from functools import wraps
from threading import RLock
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd

from config import (
    OCCUPANT_IDS_COL,
    ROOM_ID_COLS,
    normalize_building,
    normalize_department,
    normalize_department_lenient,
    normalize_gender,
    normalize_gender_lenient,
    normalize_name,
    normalize_name_lenient,
    normalize_rank,
    normalize_rank_lenient,
)
from src.backend.settings import (
    get_allowed_buildings,
    get_allowed_departments,
    get_allowed_genders,
    get_ranks_high_to_low,
    load_settings,
)
from src.backend.schemas import RoomRef
from src.backend.services.rank_policy import RankPolicy
from src.backend.store.base import RemoteStore


def _locked_mutation(method):
    """Decorator that acquires the instance's mutation lock before calling the method.

    Args:
        method: The instance method to wrap with lock acquisition.

    Returns:
        A wrapper function that holds ``_mutation_lock`` for the duration of
        the call.
    """

    @wraps(method)
    def wrapper(self, *args, **kwargs):
        """Acquire the mutation lock, then delegate to the wrapped method."""
        with self._mutation_lock:
            return method(self, *args, **kwargs)

    return wrapper


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

    ROOM_COL_HEBREW: dict[str, str] = {
        "building_name": "שם מבנה",
        "room_number": "מספר חדר",
        "number_of_beds": "מספר מיטות",
        "room_rank": "דרגת חדר",
        "gender": "מגדר",
    }

    REQUIRED_PERSONNEL_COLS = ("person_id", "full_name", "department", "gender", "rank")

    PERSONNEL_COL_HEBREW: dict[str, str] = {
        "person_id": "מספר אישי",
        "full_name": "שם מלא",
        "department": "זירה",
        "gender": "מגדר",
        "rank": "דרגה",
    }

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
        self._mutation_lock = RLock()

    def get_known_personnel_ids(self) -> set:
        """Return the set of all known person_id strings."""
        return {p["person_id"] for p in self._store.get_all("personnel")}

    @_locked_mutation
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
            missing_he = [self.ROOM_COL_HEBREW.get(c, c) for c in missing]
            raise ValueError(f"חסרות עמודות נדרשות בטבלת החדרים: {missing_he}")
        for c in self.room_id_cols:
            if c not in rooms_df.columns:
                he = self.ROOM_COL_HEBREW.get(c, c)
                raise ValueError(f"חסרה עמודת מזהה חדר בטבלת החדרים: '{he}'")

        rooms = rooms_df.copy()
        if self.occupant_ids_col not in rooms.columns:
            rooms[self.occupant_ids_col] = None

        room_records = [self._room_record_from_row(row) for _, row in rooms.iterrows()]
        personnel_by_id = self._personnel_map()
        self._validate_room_records(
            room_records,
            personnel_by_id=personnel_by_id if personnel_by_id else None,
        )

        self._store.delete_all("rooms")
        for record in room_records:
            self._store.insert("rooms", {
                "room_id": self._make_room_id(record["building_name"], record["room_number"]),
                "building_name": record["building_name"],
                "room_number": record["room_number"],
                "number_of_beds": record["number_of_beds"],
                "room_rank": record["room_rank"],
                "gender": record["gender"],
                "designated_department": record["designated_department"],
                "occupant_ids": json.dumps(record["occupant_ids"]),
            })

    @_locked_mutation
    def load_personnel(self, personnel_df: pd.DataFrame) -> None:
        """Replace all personnel in the store with rows from a DataFrame.

        Args:
            personnel_df: DataFrame containing personnel data with all required columns.

        Raises:
            ValueError: If required columns are missing or field values are invalid.
        """
        if "person_id" not in personnel_df.columns:
            raise ValueError("חסרה עמודת מספר אישי (person_id) בטבלת כוח האדם")

        # Fill missing optional columns with empty string
        for col in ("full_name", "department", "gender", "rank"):
            if col not in personnel_df.columns:
                personnel_df[col] = ""

        rows_to_insert: List[dict] = []
        seen_person_ids: set[str] = set()

        for _, row in personnel_df.iterrows():
            pid = str(row["person_id"]).strip()
            if not pid or pid.lower() == "nan":
                continue
            if pid in seen_person_ids:
                raise ValueError(f"מספר אישי כפול '{pid}' בנתוני כוח האדם.")
            seen_person_ids.add(pid)
            name = normalize_name_lenient(row["full_name"])
            dept = normalize_department_lenient(row["department"])
            gender = normalize_gender_lenient(row["gender"])
            rank = normalize_rank_lenient(row["rank"])

            if rank:
                self.rank_policy.validate_rank(rank)
            if gender and gender not in get_allowed_genders():
                raise ValueError(f"מגדר לא תקין '{gender}' עבור מספר אישי {pid}.")

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

    @_locked_mutation
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
                "error_message": f"חובה לספק דרגה, זירה ומגדר (מספר אישי {pid} לא נמצא ברשומות כוח האדם).",
            }

        rank_n = normalize_rank(rank)
        dept_n = normalize_department(department)
        gender_n = normalize_gender(gender)

        if gender_n not in get_allowed_genders():
            return None, {
                "error_code": "INVALID_GENDER",
                "error_message": f"מגדר לא תקין '{gender_n}'. ערכים מותרים: {sorted(get_allowed_genders())}",
            }

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
                person_rank=rank_n,
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
                "error_message": (
                    f"אין חדר פנוי בדרגת {top_rank} עבור מגדר '{gender_n}'. "
                    f"דרגת {top_rank} אינה יכולה לרדת בדרגה."
                ),
            }

        return None, {
            "error_code": "NO_ROOM_AVAILABLE",
            "error_message": (
                f"לא נמצא חדר פנוי עבור דרגה '{rank_n}' "
                f"(נוסו {self.rank_policy.chain(rank_n)}), זירה '{dept_n}', מגדר '{gender_n}'."
            ),
        }

    @_locked_mutation
    def assign_all_unassigned(
        self,
        *,
        department: Optional[str] = None,
        gender: Optional[str] = None,
        rank: Optional[str] = None,
        person_ids: Optional[list[str]] = None,
    ) -> Dict[str, Any]:
        """Automatically assign every currently unassigned person.

        Args:
            department: Optional department scope. When provided, only personnel
                from that department are considered.
            gender: Optional gender filter.
            rank: Optional rank filter.
            person_ids: Optional list of specific person IDs to assign.

        Returns:
            A structured report containing per-person placement outcomes.
        """
        personnel_rows = list(self._store.get_all("personnel"))
        if department:
            department = normalize_department(department)
            personnel_rows = [person for person in personnel_rows if person["department"] == department]
        if gender:
            personnel_rows = [person for person in personnel_rows if person.get("gender") == gender]
        if rank:
            personnel_rows = [person for person in personnel_rows if person.get("rank") == rank]
        if person_ids:
            id_set = set(person_ids)
            personnel_rows = [person for person in personnel_rows if str(person["person_id"]) in id_set]

        assigned_now: list[Dict[str, Any]] = []
        already_assigned: list[Dict[str, Any]] = []
        failed: list[Dict[str, Any]] = []

        for person in personnel_rows:
            person_id = str(person["person_id"])
            existing_room = self.get_person_room(person_id)
            if existing_room is not None:
                already_assigned.append({
                    "person_id": person_id,
                    "full_name": person["full_name"],
                    "building_name": existing_room.building_name,
                    "room_number": existing_room.room_number,
                    "room_rank_used": existing_room.room_rank_used,
                })
                continue

            room_ref, error = self.assign(
                person_id=person_id,
                rank=person["rank"],
                department=person["department"],
                gender=person["gender"],
                person_name=person["full_name"],
            )

            if room_ref is not None:
                assigned_now.append({
                    "person_id": person_id,
                    "full_name": person["full_name"],
                    "department": person["department"],
                    "gender": person["gender"],
                    "rank": person["rank"],
                    "building_name": room_ref.building_name,
                    "room_number": room_ref.room_number,
                    "room_rank_used": room_ref.room_rank_used,
                })
            else:
                failed.append({
                    "person_id": person_id,
                    "full_name": person["full_name"],
                    "department": person["department"],
                    "gender": person["gender"],
                    "rank": person["rank"],
                    "error_code": error["error_code"],
                    "error_message": error["error_message"],
                })

        message_parts = []
        if assigned_now:
            message_parts.append(f"שובצו {len(assigned_now)} אנשים")
        if already_assigned:
            message_parts.append(f"{len(already_assigned)} כבר היו משובצים")
        if failed:
            message_parts.append(f"{len(failed)} לא שובצו")

        return {
            "ok": True,
            "assigned_count": len(assigned_now),
            "already_assigned_count": len(already_assigned),
            "failed_count": len(failed),
            "assigned": assigned_now,
            "already_assigned": already_assigned,
            "failed": failed,
            "message": " · ".join(message_parts) if message_parts else "לא נמצאו אנשי כוח אדם לשיבוץ",
        }

    @_locked_mutation
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

    @_locked_mutation
    def assign_person_to_room(
        self,
        person_id: str,
        target_building: str,
        target_room_number: int,
    ) -> Tuple[bool, Optional[str]]:
        """Assign an unassigned person directly into a specific room.

        Args:
            person_id: Identifier of the person to assign.
            target_building: Building name where the target room is located.
            target_room_number: Room number within the target building.

        Returns:
            A ``(success, error_message)`` tuple.  On success the error
            message is ``None``; on failure it contains a Hebrew description
            of the problem.
        """
        pid = str(person_id)
        person = self._personnel_map().get(pid)
        if person is None:
            return False, f"האדם {pid} לא נמצא בכוח האדם."
        if self._find_room_for_person(pid) is not None:
            return False, "האדם כבר משובץ לחדר."

        target_id = self._make_room_id(target_building, target_room_number)
        target = self._store.get_by_id("rooms", target_id)
        if target is None:
            return False, f"חדר היעד {target_building}#{target_room_number} לא נמצא."

        compatibility_error = self._room_person_compatibility_error(target, person)
        if compatibility_error:
            return False, compatibility_error

        target_ids = json.loads(target["occupant_ids"])
        reserved = self._get_reservations_by_room().get(target_id, 0)
        # Don't count this person's own reservation against availability
        if self._person_has_reservation_for_room(pid, target_id):
            reserved = max(0, reserved - 1)
        avail = target["number_of_beds"] - len(target_ids) - reserved
        if avail <= 0:
            return False, f"חדר היעד {target_building}#{target_room_number} מלא."

        if pid in target_ids:
            return False, "האדם כבר נמצא בחדר הזה."

        target_ids.append(pid)
        self._store.update("rooms", target_id, {"occupant_ids": json.dumps(target_ids)})
        # Clean up fulfilled reservation
        self._clear_person_reservation(pid)
        return True, None

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

        reservations_by_room = self._get_reservations_by_room()
        # Build per-room list of reserved person details
        reserved_persons_by_room: Dict[str, list] = {}
        settings = load_settings()
        if settings.get("bed_reservation_policy", "reserve") == "reserve":
            for sa in self._store.get_all("saved_assignments"):
                room_id = f"{sa['building_name']}__{sa['room_number']}"
                reserved_persons_by_room.setdefault(room_id, []).append({
                    "person_id": sa["person_id"],
                    "full_name": sa.get("full_name", ""),
                    "department": sa.get("department", ""),
                    "rank": sa.get("rank", ""),
                    "saved_at": sa.get("saved_at", ""),
                })

        rows = []
        for room in all_rooms:
            ids = json.loads(room["occupant_ids"])
            names = {pid: all_personnel[pid]["full_name"] for pid in ids if pid in all_personnel}
            designated = room.get("designated_department", "")
            occupant_departments = sorted({all_personnel[pid]["department"] for pid in ids if pid in all_personnel})
            if designated:
                departments = [designated, *[department for department in occupant_departments if department != designated]]
            else:
                departments = occupant_departments
            raw_reserved = reservations_by_room.get(room["room_id"], 0)
            reserved = min(raw_reserved, max(0, room["number_of_beds"] - len(ids)))
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
                "available_beds": max(0, room["number_of_beds"] - len(ids) - reserved),
                "reserved_beds": reserved,
                "reserved_persons": reserved_persons_by_room.get(room["room_id"], []),
                "occupant_count": len(ids),
            })
        return pd.DataFrame(rows) if rows else pd.DataFrame(
            columns=["building_name", "room_number", "number_of_beds", "room_rank",
                     "designated_department", "departments", "gender", "occupant_ids",
                     "available_beds", "reserved_beds", "reserved_persons", "occupant_count"]
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

    @_locked_mutation
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
                raise ValueError(f"חסרה עמודת מזהה חדר בטבלת עדכוני החדרים: '{c}'")

        current_rooms: Dict[str, Dict[str, Any]] = {}
        for room in self._store.get_all("rooms"):
            current_rooms[room["room_id"]] = {
                "building_name": normalize_building(room["building_name"]),
                "room_number": int(room["room_number"]),
                "number_of_beds": self._parse_positive_int(room["number_of_beds"], label=f"קיבולת עבור חדר {room['room_id']}"),
                "room_rank": normalize_rank(str(room["room_rank"])),
                "gender": normalize_gender(str(room["gender"])),
                "designated_department": normalize_department(str(room.get("designated_department", ""))) if self._is_present(room.get("designated_department")) else "",
                "occupant_ids": self._parse_occupant_ids(room.get("occupant_ids")),
            }

        updated = 0
        added = 0

        for _, row in rooms_updates_df.iterrows():
            building = normalize_building(row["building_name"])
            room_num = self._parse_positive_int(row["room_number"], label="מספר חדר")
            room_id = self._make_room_id(building, room_num)

            existing = current_rooms.get(room_id)
            if existing:
                next_state = {**existing}
                if "number_of_beds" in row.index and self._is_present(row.get("number_of_beds")):
                    next_state["number_of_beds"] = self._parse_positive_int(
                        row["number_of_beds"],
                        label=f"קיבולת עבור חדר {building}#{room_num}",
                        max_value=100,
                    )
                if "room_rank" in row.index and self._is_present(row.get("room_rank")):
                    next_state["room_rank"] = normalize_rank(str(row["room_rank"]))
                if "gender" in row.index and self._is_present(row.get("gender")):
                    next_state["gender"] = normalize_gender(str(row["gender"]))
                if "designated_department" in row.index:
                    val = row.get("designated_department")
                    next_state["designated_department"] = normalize_department(str(val)) if self._is_present(val) else ""
                if self.occupant_ids_col in row.index and self._is_present(row.get(self.occupant_ids_col)):
                    next_state["occupant_ids"] = self._parse_occupant_ids(row[self.occupant_ids_col])
                current_rooms[room_id] = next_state
                updated += 1
            else:
                for col in self.REQUIRED_ROOM_COLS:
                    if col not in row.index or not self._is_present(row.get(col)):
                        raise ValueError(f"בחדר חדש {building}#{room_num} חסרה עמודה נדרשת '{col}'.")
                current_rooms[room_id] = self._room_record_from_row(row)
                added += 1

        personnel_by_id = self._personnel_map()
        self._validate_room_records(
            current_rooms.values(),
            personnel_by_id=personnel_by_id if personnel_by_id else None,
        )

        for room_id, room in current_rooms.items():
            existing = self._store.get_by_id("rooms", room_id)
            payload = {
                "number_of_beds": room["number_of_beds"],
                "room_rank": room["room_rank"],
                "gender": room["gender"],
                "designated_department": room["designated_department"],
                "occupant_ids": json.dumps(room["occupant_ids"]),
            }
            if existing:
                self._store.update("rooms", room_id, payload)
            else:
                self._store.insert("rooms", {
                    "room_id": room_id,
                    "building_name": room["building_name"],
                    "room_number": room["room_number"],
                    **payload,
                })

        total = len(self._store.get_all("rooms"))
        return {"updated": updated, "added": added, "total_rooms": total}

    @_locked_mutation
    def swap_people(self, person_id_a: str, person_id_b: str) -> Tuple[bool, Optional[str]]:
        """Swap room assignments of two people.

        Args:
            person_id_a: First person's ID.
            person_id_b: Second person's ID.

        Returns:
            Tuple of (success, error_message). error_message is None on success.
        """
        pid_a = str(person_id_a)
        pid_b = str(person_id_b)
        if pid_a == pid_b:
            return False, "יש לבחור שני אנשים שונים."

        people = self._personnel_map()
        person_a = people.get(pid_a)
        person_b = people.get(pid_b)
        if person_a is None:
            return False, f"האדם {pid_a} לא נמצא בכוח האדם."
        if person_b is None:
            return False, f"האדם {pid_b} לא נמצא בכוח האדם."

        room_a = self._find_room_for_person(pid_a)
        room_b = self._find_room_for_person(pid_b)
        if room_a is None:
            return False, f"האדם {pid_a} אינו משובץ לאף חדר."
        if room_b is None:
            return False, f"האדם {pid_b} אינו משובץ לאף חדר."
        if room_a["room_id"] == room_b["room_id"]:
            return False, "שני האנשים נמצאים באותו חדר."

        compatibility_error = self._room_person_compatibility_error(room_a, person_b)
        if compatibility_error:
            return False, compatibility_error

        compatibility_error = self._room_person_compatibility_error(room_b, person_a)
        if compatibility_error:
            return False, compatibility_error

        # Verify reservations don't block the swap
        reservations = self._get_reservations_by_room()
        ids_a = json.loads(room_a["occupant_ids"])
        ids_b = json.loads(room_b["occupant_ids"])

        # After swap: room_a loses pid_a, gains pid_b (count stays same)
        # But check pid_b's own reservation doesn't double-count
        res_a = reservations.get(room_a["room_id"], 0)
        if self._person_has_reservation_for_room(pid_b, room_a["room_id"]):
            res_a = max(0, res_a - 1)
        if len(ids_a) + res_a > room_a["number_of_beds"]:
            return False, f"חדר {room_a['building_name']}#{room_a['room_number']} מלא (כולל מיטות שמורות)."

        res_b = reservations.get(room_b["room_id"], 0)
        if self._person_has_reservation_for_room(pid_a, room_b["room_id"]):
            res_b = max(0, res_b - 1)
        if len(ids_b) + res_b > room_b["number_of_beds"]:
            return False, f"חדר {room_b['building_name']}#{room_b['room_number']} מלא (כולל מיטות שמורות)."

        ids_a.remove(pid_a)
        ids_a.append(pid_b)
        ids_b.remove(pid_b)
        ids_b.append(pid_a)
        self._store.bulk_update(
            "rooms",
            [
                (room_a["room_id"], {"occupant_ids": json.dumps(ids_a)}),
                (room_b["room_id"], {"occupant_ids": json.dumps(ids_b)}),
            ],
        )
        return True, None

    @_locked_mutation
    def move_person(self, person_id: str, target_building: str, target_room_number: int) -> Tuple[bool, Optional[str]]:
        """Move a person to a specific room.

        Args:
            person_id: ID of the person to move.
            target_building: Building name of the target room.
            target_room_number: Room number within the target building.

        Returns:
            Tuple of (success, error_message). error_message is None on success.
        """
        pid = str(person_id)
        person = self._personnel_map().get(pid)
        if person is None:
            return False, f"האדם {pid} לא נמצא בכוח האדם."

        current = self._find_room_for_person(pid)
        target_id = self._make_room_id(target_building, target_room_number)
        target = self._store.get_by_id("rooms", target_id)
        if target is None:
            return False, f"חדר היעד {target_building}#{target_room_number} לא נמצא."
        if current is not None and current["room_id"] == target_id:
            return False, "האדם כבר נמצא בחדר הזה."

        compatibility_error = self._room_person_compatibility_error(target, person)
        if compatibility_error:
            return False, compatibility_error

        target_ids = json.loads(target["occupant_ids"])
        reserved = self._get_reservations_by_room().get(target_id, 0)
        # Don't count this person's own reservation against availability
        if self._person_has_reservation_for_room(pid, target_id):
            reserved = max(0, reserved - 1)
        avail = target["number_of_beds"] - len(target_ids) - reserved
        if avail <= 0:
            return False, f"חדר היעד {target_building}#{target_room_number} מלא."
        if pid in target_ids:
            return False, "האדם כבר נמצא בחדר הזה."

        room_updates: List[Tuple[str, dict]] = []
        if current is not None:
            cur_ids = json.loads(current["occupant_ids"])
            cur_ids.remove(pid)
            room_updates.append((current["room_id"], {"occupant_ids": json.dumps(cur_ids)}))

        target_ids.append(pid)
        room_updates.append((target_id, {"occupant_ids": json.dumps(target_ids)}))
        self._store.bulk_update("rooms", room_updates)
        # Clean up fulfilled reservation
        self._clear_person_reservation(pid)
        return True, None

    @_locked_mutation
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
            return False, f"החדר {building_name}#{room_number} לא נמצא."
        val = normalize_department(department) if department else ""
        self._store.update("rooms", room_id, {"designated_department": val})
        return True, None

    @_locked_mutation
    def reconcile_runtime_state(self) -> Dict[str, Any]:
        """Repair persisted data so it matches current settings and room rules.

        Returns:
            A report dict with keys such as ``has_changes``,
            ``removed_personnel_count``, ``removed_room_count``, and a
            human-readable ``message`` summarising all repairs performed.
        """
        allowed_departments = set(get_allowed_departments())
        allowed_ranks = set(get_ranks_high_to_low())
        allowed_genders = set(get_allowed_genders())
        allowed_buildings = set(get_allowed_buildings())

        report: Dict[str, Any] = {
            "has_changes": False,
            "removed_personnel_count": 0,
            "removed_room_count": 0,
            "cleared_room_designations_count": 0,
            "removed_unknown_occupants_count": 0,
            "removed_incompatible_occupants_count": 0,
            "removed_duplicate_assignments_count": 0,
            "trimmed_over_capacity_count": 0,
            "removed_occupants": [],
            "messages": [],
        }

        invalid_person_ids: set[str] = set()
        for person in self._store.get_all("personnel"):
            dept = str(person.get("department") or "").strip()
            gender = str(person.get("gender") or "").strip()
            rank = str(person.get("rank") or "").strip()
            if (
                (dept and dept not in allowed_departments)
                or (gender and gender not in allowed_genders)
                or (rank and rank not in allowed_ranks)
            ):
                invalid_person_ids.add(str(person["person_id"]))

        for person_id in invalid_person_ids:
            self._store.delete("personnel", person_id)
        report["removed_personnel_count"] = len(invalid_person_ids)

        personnel_by_id = self._personnel_map()
        seen_assignments: set[str] = set()

        rooms = sorted(
            self._store.get_all("rooms"),
            key=lambda room: (str(room["building_name"]), int(room["room_number"])),
        )
        normalized_rooms: list[dict[str, Any]] = []

        for room in rooms:
            room_id = room["room_id"]
            room_label = f"{room['building_name']}#{room['room_number']}"

            try:
                capacity = self._parse_positive_int(room["number_of_beds"], label=f"קיבולת עבור חדר {room_label}")
            except ValueError:
                self._store.delete("rooms", room_id)
                report["removed_room_count"] += 1
                continue

            if (
                room["building_name"] not in allowed_buildings
                or room["room_rank"] not in allowed_ranks
                or room["gender"] not in allowed_genders
            ):
                self._store.delete("rooms", room_id)
                report["removed_room_count"] += 1
                continue

            designated_department = str(room.get("designated_department") or "").strip()
            next_designated_department = designated_department
            if designated_department and designated_department not in allowed_departments:
                next_designated_department = ""
                report["cleared_room_designations_count"] += 1

            raw_occupant_ids = self._parse_occupant_ids(room.get("occupant_ids"))
            candidate_occupant_ids: list[str] = []
            room_seen_ids: set[str] = set()
            compatibility_room = {
                **room,
                "designated_department": next_designated_department,
            }

            for person_id in raw_occupant_ids:
                if person_id in room_seen_ids:
                    report["removed_duplicate_assignments_count"] += 1
                    continue
                room_seen_ids.add(person_id)

                person = personnel_by_id.get(person_id)
                if person is None:
                    report["removed_unknown_occupants_count"] += 1
                    report["removed_occupants"].append({
                        "person_id": person_id,
                        "building_name": room["building_name"],
                        "room_number": int(room["room_number"]),
                    })
                    continue

                if person_id in seen_assignments:
                    report["removed_duplicate_assignments_count"] += 1
                    continue

                compatibility_error = self._room_person_compatibility_error(compatibility_room, person)
                if compatibility_error:
                    report["removed_incompatible_occupants_count"] += 1
                    continue

                candidate_occupant_ids.append(person_id)

            if len(candidate_occupant_ids) > capacity:
                overflow = len(candidate_occupant_ids) - capacity
                report["trimmed_over_capacity_count"] += overflow
                candidate_occupant_ids = candidate_occupant_ids[:capacity]

            for person_id in candidate_occupant_ids:
                seen_assignments.add(person_id)

            updates: dict[str, Any] = {}
            if next_designated_department != designated_department:
                updates["designated_department"] = next_designated_department
            if candidate_occupant_ids != raw_occupant_ids:
                updates["occupant_ids"] = json.dumps(candidate_occupant_ids)
            if updates:
                self._store.update("rooms", room_id, updates)

            normalized_rooms.append({
                "building_name": room["building_name"],
                "room_number": int(room["room_number"]),
                "number_of_beds": capacity,
                "room_rank": room["room_rank"],
                "gender": room["gender"],
                "designated_department": next_designated_department,
                "occupant_ids": candidate_occupant_ids,
            })

        if normalized_rooms:
            self._validate_room_records(normalized_rooms, personnel_by_id=personnel_by_id)

        if report["removed_personnel_count"]:
            report["messages"].append(
                f"נמחקו {report['removed_personnel_count']} אנשי כוח אדם עם זירה, דרגה או מגדר שאינם מוגדרים עוד."
            )
        if report["removed_room_count"]:
            report["messages"].append(
                f"נמחקו {report['removed_room_count']} חדרים עם מבנה, דרגה או מגדר שאינם מוגדרים עוד."
            )
        if report["cleared_room_designations_count"]:
            report["messages"].append(
                f"נוקו שיוכי זירה מ-{report['cleared_room_designations_count']} חדרים."
            )
        if report["removed_unknown_occupants_count"]:
            report["messages"].append(
                f"הוסרו {report['removed_unknown_occupants_count']} שיבוצים שלא הופיעו ברשימת כוח האדם."
            )
        if report["removed_incompatible_occupants_count"]:
            report["messages"].append(
                f"הוסרו {report['removed_incompatible_occupants_count']} שיבוצים שלא תאמו למגדר של החדר."
            )
        if report["removed_duplicate_assignments_count"]:
            report["messages"].append(
                f"הוסרו {report['removed_duplicate_assignments_count']} שיבוצים כפולים."
            )
        if report["trimmed_over_capacity_count"]:
            report["messages"].append(
                f"הוסרו {report['trimmed_over_capacity_count']} שיבוצים מחדרים שחרגו מהקיבולת."
            )

        report["has_changes"] = bool(report["messages"])
        report["message"] = " ".join(report["messages"])
        return report

    def _get_reservations_by_room(self) -> Dict[str, int]:
        """Return {room_id: count} of saved_assignments when policy is 'reserve'.

        Filters out people who are already assigned to any room (prevents
        double-counting) and people who no longer exist in personnel.
        """
        settings = load_settings()
        policy = settings.get("bed_reservation_policy", "reserve")
        result: Dict[str, int] = {}
        if policy == "reserve":
            currently_assigned: set = set()
            for room in self._store.get_all("rooms"):
                currently_assigned.update(json.loads(room["occupant_ids"]))
            known_personnel = {p["person_id"] for p in self._store.get_all("personnel")}
            for sa in self._store.get_all("saved_assignments"):
                pid = sa["person_id"]
                if pid in currently_assigned or pid not in known_personnel:
                    continue
                room_id = f"{sa['building_name']}__{sa['room_number']}"
                result[room_id] = result.get(room_id, 0) + 1
        return result

    def _person_has_reservation_for_room(self, person_id: str, room_id: str) -> bool:
        """Check if a person has a saved_assignment for a specific room."""
        sa = self._store.get_by_id("saved_assignments", person_id)
        if sa is None:
            return False
        return f"{sa['building_name']}__{sa['room_number']}" == room_id

    def _clear_person_reservation(self, person_id: str) -> None:
        """Delete a person's saved_assignment if it exists."""
        if self._store.get_by_id("saved_assignments", person_id) is not None:
            self._store.delete("saved_assignments", person_id)

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
        person_rank: str,
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
        reservations = self._get_reservations_by_room()
        scored: List[Tuple[int, int, int, str, int, dict]] = []
        for room in candidates:
            ids = json.loads(room["occupant_ids"])
            reserved = reservations.get(room["room_id"], 0)
            avail = room["number_of_beds"] - len(ids) - reserved
            if avail <= 0:
                continue
            dept_priority = self._department_fit_score(
                room,
                department,
                ids,
                all_personnel,
            )
            rank_priority = self._occupant_rank_fit_score(
                ids,
                person_rank,
                all_personnel,
            )
            scored.append((
                dept_priority,
                rank_priority,
                avail,
                room["building_name"],
                room["room_number"],
                room,
            ))

        if not scored:
            return None

        scored.sort(key=lambda t: (t[0], t[1], t[2], t[3], t[4]))
        _, _, _, _, _, chosen = scored[0]

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
        if isinstance(value, str):
            return bool(value.strip())
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

    def _room_record_from_row(self, row: pd.Series) -> Dict[str, Any]:
        """Normalize a room row into a validated record structure.

        Args:
            row: A single row from a rooms DataFrame.

        Returns:
            A dict with normalised room fields ready for store insertion.
        """
        building = normalize_building(row["building_name"])
        room_num = self._parse_positive_int(row["room_number"], label="מספר חדר")
        designated_dept = ""
        if "designated_department" in row.index and self._is_present(row.get("designated_department")):
            designated_dept = normalize_department(str(row["designated_department"]))
        return {
            "building_name": building,
            "room_number": room_num,
            "number_of_beds": self._parse_positive_int(row["number_of_beds"], label=f"קיבולת עבור חדר {building}#{room_num}", max_value=100),
            "room_rank": normalize_rank(str(row["room_rank"])),
            "gender": normalize_gender(str(row["gender"])),
            "designated_department": designated_dept,
            "occupant_ids": self._parse_occupant_ids(row.get(self.occupant_ids_col)),
        }

    def _validate_room_records(
        self,
        rooms: List[Dict[str, Any]] | Any,
        *,
        personnel_by_id: Optional[Dict[str, dict]] = None,
    ) -> None:
        """Validate room records before they are written to the store.

        Args:
            rooms: List of room record dicts to validate.
            personnel_by_id: Optional mapping of person_id to personnel
                record.  When provided, occupant compatibility checks are
                also performed.

        Raises:
            ValueError: If any room record violates capacity, gender,
                uniqueness, or compatibility constraints.
        """
        assigned_to_room: Dict[str, str] = {}
        allowed_genders = get_allowed_genders()

        for room in rooms:
            room_label = f"{room['building_name']}#{room['room_number']}"
            self.rank_policy.validate_rank(room["room_rank"])
            if room["gender"] not in allowed_genders:
                raise ValueError(f"מגדר חדר לא תקין '{room['gender']}'. ערכים מותרים: {sorted(allowed_genders)}")

            capacity = self._parse_positive_int(room["number_of_beds"], label=f"קיבולת עבור חדר {room_label}")
            occupants = list(room["occupant_ids"])

            if len(set(occupants)) != len(occupants):
                raise ValueError(f"בחדר {room_label} קיימים מזהי דיירים כפולים.")
            if len(occupants) > capacity:
                raise ValueError(f"בחדר {room_label} יש {len(occupants)} דיירים אך הקיבולת היא {capacity}.")

            for person_id in occupants:
                previous_room = assigned_to_room.get(person_id)
                if previous_room and previous_room != room_label:
                    raise ValueError(
                        f"האדם {person_id} משובץ ליותר מחדר אחד ({previous_room}, {room_label})."
                    )
                if personnel_by_id is not None:
                    person = personnel_by_id.get(person_id)
                    if person is None:
                        raise ValueError(f"בחדר {room_label} קיים מספר אישי לא מוכר '{person_id}'.")
                    compatibility_error = self._room_person_compatibility_error(room, person)
                    if compatibility_error:
                        raise ValueError(f"בחדר {room_label}: {compatibility_error}")
                assigned_to_room[person_id] = room_label

    def _personnel_map(self) -> Dict[str, dict]:
        """Build a dict mapping person_id to personnel record.

        Returns:
            A dict keyed by ``person_id`` (str) with personnel record dicts
            as values.
        """
        return {
            str(person["person_id"]): person
            for person in self._store.get_all("personnel")
        }

    @staticmethod
    def _room_person_compatibility_error(room: dict, person: dict) -> Optional[str]:
        """Check gender compatibility between a room and a person.

        Args:
            room: Room record dict containing at least a ``gender`` key.
            person: Personnel record dict containing ``person_id`` and
                ``gender`` keys.

        Returns:
            A Hebrew error string if the person is incompatible with the
            room, or ``None`` if compatible.
        """
        person_gender = str(person.get("gender") or "").strip()
        room_gender = str(room.get("gender") or "").strip()

        # Skip gender check if person has no gender set
        if not person_gender:
            return None

        if person_gender != room_gender:
            return (
                f"לאדם {person['person_id']} מגדר '{person_gender}' "
                f"שאינו תואם למגדר החדר '{room_gender}'."
            )

        return None

    @staticmethod
    def _department_fit_score(
        room: dict,
        department: str,
        occupant_ids: list[str],
        personnel_by_id: Dict[str, dict],
    ) -> int:
        """Score how well a person's department fits a room.

        Lower scores indicate a better fit (0 = best).

        Args:
            room: Room record dict, may contain ``designated_department``.
            department: The department of the person being considered.
            occupant_ids: List of person_ids currently occupying the room.
            personnel_by_id: Mapping of person_id to personnel record.

        Returns:
            An integer score from 0 (ideal match) to 5 (worst match).
        """
        designated_department = str(room.get("designated_department") or "").strip()
        occupant_departments = {
            str(personnel_by_id[person_id]["department"]).strip()
            for person_id in occupant_ids
            if person_id in personnel_by_id
        }

        if designated_department == department:
            return 0
        if occupant_departments == {department}:
            return 1
        if department in occupant_departments:
            return 2
        if not occupant_departments and not designated_department:
            return 3
        if not occupant_departments and designated_department:
            return 4
        if designated_department:
            return 5
        return 4

    @staticmethod
    def _occupant_rank_fit_score(
        occupant_ids: list[str],
        person_rank: str,
        personnel_by_id: Dict[str, dict],
    ) -> int:
        """Score how well a person's rank fits with existing occupants.

        Lower scores indicate a better fit (0 = best).

        Args:
            occupant_ids: List of person_ids currently occupying the room.
            person_rank: The rank of the person being considered.
            personnel_by_id: Mapping of person_id to personnel record.

        Returns:
            An integer score from 0 (identical or empty) to 2 (no overlap).
        """
        occupant_ranks = {
            str(personnel_by_id[person_id]["rank"]).strip()
            for person_id in occupant_ids
            if person_id in personnel_by_id
        }
        if not occupant_ranks or occupant_ranks == {person_rank}:
            return 0
        if person_rank in occupant_ranks:
            return 1
        return 2

    @staticmethod
    def _parse_positive_int(value: Any, *, label: str, max_value: int | None = None) -> int:
        """Parse a positive integer from user-provided input.

        Args:
            value: Raw value to parse (may be string, float, etc.).
            label: Human-readable label used in error messages.
            max_value: Optional upper bound for the parsed integer.

        Returns:
            The parsed positive integer.

        Raises:
            ValueError: If the value is not numeric, not positive, or
                exceeds ``max_value``.
        """
        parsed = pd.to_numeric(value, errors="coerce")
        if pd.isna(parsed):
            raise ValueError(f"ערך לא תקין עבור {label}.")
        parsed_int = int(parsed)
        if parsed_int <= 0:
            raise ValueError(f"הערך של {label} חייב להיות גדול מאפס.")
        if max_value is not None and parsed_int > max_value:
            raise ValueError(f"הערך של {label} חייב להיות לכל היותר {max_value}.")
        return parsed_int
