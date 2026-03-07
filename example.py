"""
Usage guide: preload data from DataFrames and exercise all API endpoints.

Start the server first:
    uvicorn main:app --host 0.0.0.0 --port 8000

Then run:
    python example.py

Requirements:
    pip install requests pandas
"""

from __future__ import annotations

import json

import pandas as pd
import requests

BASE_URL = "http://localhost:8000/api"


def pp(obj: object) -> str:
    return json.dumps(obj, indent=2, ensure_ascii=False)


def show(label: str, method: str, path: str, body: object = None) -> dict:
    print(f"\n{'─' * 60}")
    print(f"  {label}")
    if body is not None:
        print(f"  {method} {path}\n{pp(body)}")
    else:
        print(f"  {method} {path}")

    url = f"{BASE_URL}{path}"
    if method == "GET":
        r = requests.get(url)
    else:
        r = requests.post(url, json=body)

    data = r.json()
    print(f"  → [{r.status_code}] {pp(data)}")
    return data


# ═══════════════════════════════════════════════════════════════════════════════
# STEP 1: Prepare your DataFrames
#
# These are the two DataFrames you already have.
# occupant_ids contains lists of person_id strings for pre-filled rooms.
# ═══════════════════════════════════════════════════════════════════════════════

rooms_df = pd.DataFrame([
    {"building_name": "א", "room_number": 1, "number_of_beds": 2, "room_rank": 'סמנכ"ל', "gender": "בנים", "designated_department": "הנהלה", "occupant_ids": ["1001"]},
    {"building_name": "א", "room_number": 2, "number_of_beds": 2, "room_rank": 'סמנכ"ל', "gender": "בנות", "designated_department": "הנהלה", "occupant_ids": ["1002"]},
    {"building_name": "א", "room_number": 5, "number_of_beds": 4, "room_rank": "מנהל בכיר", "gender": "בנים", "designated_department": 'מו"פ', "occupant_ids": ["2001", "2011"]},
    {"building_name": "ב", "room_number": 3, "number_of_beds": 3, "room_rank": "מנהל", "gender": "בנות", "occupant_ids": ["3004"]},
    {"building_name": "ג", "room_number": 7, "number_of_beds": 4, "room_rank": "זוטר", "gender": "בנים", "occupant_ids": ["4001", "4021"]},
    {"building_name": "ד", "room_number": 9, "number_of_beds": 3, "room_rank": "זוטר", "gender": "בנות", "occupant_ids": []},
])

personnel_df = pd.DataFrame([
    {"person_id": "1001", "full_name": "אברהם לוי", "department": "הנהלה", "gender": "בנים", "rank": 'סמנכ"ל'},
    {"person_id": "1002", "full_name": "שרה כהן", "department": "הנהלה", "gender": "בנות", "rank": 'סמנכ"ל'},
    {"person_id": "1003", "full_name": "יצחק מזרחי", "department": "הנהלה", "gender": "בנים", "rank": 'סמנכ"ל'},
    {"person_id": "2001", "full_name": "דוד אזולאי", "department": 'מו"פ', "gender": "בנים", "rank": "מנהל בכיר"},
    {"person_id": "2011", "full_name": "בנימין שמש", "department": 'מו"פ', "gender": "בנים", "rank": "מנהל בכיר"},
    {"person_id": "2002", "full_name": "מרים שלום", "department": 'מו"פ', "gender": "בנות", "rank": "מנהל בכיר"},
    {"person_id": "3004", "full_name": "נעמי שפירא", "department": "מכירות", "gender": "בנות", "rank": "מנהל"},
    {"person_id": "3003", "full_name": "עמוס ריבלין", "department": "מכירות", "gender": "בנים", "rank": "מנהל"},
    {"person_id": "4001", "full_name": "אדם אור", "department": 'מו"פ', "gender": "בנים", "rank": "זוטר"},
    {"person_id": "4021", "full_name": "לביא ראובן", "department": 'מו"פ', "gender": "בנים", "rank": "זוטר"},
    {"person_id": "4002", "full_name": "נועה שמיר", "department": 'מו"פ', "gender": "בנות", "rank": "זוטר"},
    {"person_id": "4005", "full_name": "עמית חיים", "department": "מכירות", "gender": "בנים", "rank": "זוטר"},
])

print(f"Rooms DataFrame: {len(rooms_df)} rows")
print(rooms_df.to_string(index=False))
print(f"\nPersonnel DataFrame: {len(personnel_df)} rows")
print(personnel_df.to_string(index=False))
print(f"\nCurrently assigned in rooms: {sum(len(ids) for ids in rooms_df['occupant_ids'])}")
print(f"Unassigned personnel (sleeping at home / not yet placed): {len(personnel_df) - sum(len(ids) for ids in rooms_df['occupant_ids'])}")


# ═══════════════════════════════════════════════════════════════════════════════
# STEP 2: Preload data via admin endpoints
#
# Convert DataFrames to list-of-dicts with .to_dict(orient="records").
# These endpoints REPLACE all existing data in the respective table.
# ═══════════════════════════════════════════════════════════════════════════════

print("\n" + "=" * 60)
print("PRELOAD")
print("=" * 60)

show("Load rooms from DataFrame (replaces all rooms)",
     "POST", "/admin/load_rooms",
     {"rooms": rooms_df.to_dict(orient="records")})

show("Load personnel from DataFrame (replaces all personnel)",
     "POST", "/admin/load_personnel",
     {"personnel": personnel_df.to_dict(orient="records")})


# ═══════════════════════════════════════════════════════════════════════════════
# STEP 3: All available API calls
# ═══════════════════════════════════════════════════════════════════════════════

print("\n" + "=" * 60)
print("AVAILABLE API CALLS")
print("=" * 60)

# ── Health check ──
show("GET /health — server health check",
     "GET", "/health")

# ── List all rooms with availability ──
show("GET /rooms — all rooms with available_beds computed",
     "GET", "/rooms")

# ── List all person→room assignments ──
show("GET /links — all person_id → room mappings",
     "GET", "/links")

# ── Auto-assign everyone currently unplaced ──
show("POST /admin/auto_assign — place all unassigned personnel",
     "POST", "/admin/auto_assign", {})

# ── Manually assign a specific person to a chosen room ──
show("POST /assign-to-room — place person 105 into A#2",
     "POST", "/assign-to-room", {
         "person_id": "105",
         "building_name": "A",
         "room_number": 2,
     })

# ── Unassign a person ──
show("POST /unassign — remove person 105 from room",
     "POST", "/unassign", {"person_id": "105"})

# ── Unassign someone not assigned (returns ok=false) ──
show("POST /unassign — person not assigned (returns ok=false)",
     "POST", "/unassign", {"person_id": "105"})

# ── Upsert: update an existing room's capacity ──
show("POST /admin/upsert_rooms — update room A#1 to 6 beds",
     "POST", "/admin/upsert_rooms", {
         "rooms": [{"building_name": "A", "room_number": 1, "number_of_beds": 6}],
     })

# ── Upsert: add a brand new room ──
show("POST /admin/upsert_rooms — add new room C#1",
     "POST", "/admin/upsert_rooms", {
         "rooms": [{
             "building_name": "ג", "room_number": 1, "number_of_beds": 4,
             "room_rank": "זוטר", "designated_department": "תפעול", "gender": "בנים",
             "occupant_ids": [],
         }],
     })

# ── Reload all rooms (full replace) ──
show("POST /admin/load_rooms — reload all rooms (full replace)",
     "POST", "/admin/load_rooms",
     {"rooms": rooms_df.to_dict(orient="records")})

# ── Reload all personnel (full replace) ──
show("POST /admin/load_personnel — reload all personnel (full replace)",
     "POST", "/admin/load_personnel",
     {"personnel": personnel_df.to_dict(orient="records")})

# ── Verify state after reload ──
show("GET /links — verify assignments after full reload",
     "GET", "/links")


# ═══════════════════════════════════════════════════════════════════════════════
# SUMMARY
# ═══════════════════════════════════════════════════════════════════════════════

print("\n" + "=" * 60)
print("ENDPOINT SUMMARY")
print("=" * 60)
print("""
  GET  /health                  → health check
  GET  /rooms                   → all rooms with available_beds
  GET  /links                   → all person_id → room mappings
  GET  /personnel               → all personnel rows

  POST /unassign                → remove person from their room
       body: {"person_id": "..."}

  POST /assign-to-room          → manually place a person in a target room
       body: {"person_id": "...", "building_name": "A", "room_number": 1}

  POST /admin/load_rooms        → replace all rooms
       body: {"rooms": rooms_df.to_dict(orient="records")}

  POST /admin/load_personnel    → replace all personnel
       body: {"personnel": personnel_df.to_dict(orient="records")}

  POST /admin/auto_assign       → place all currently unassigned personnel
       body: {}

  POST /admin/upsert_rooms      → update/add specific rooms
       body: {"rooms": [{"building_name": "A", "room_number": 1, ...}]}
""")
