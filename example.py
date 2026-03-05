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

BASE_URL = "http://localhost:8000"


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
    {"building_name": "A", "room_number": 1, "number_of_beds": 4, "room_rank": "Director", "department": "R&D",   "gender": "M", "occupant_ids": ["101", "102"]},
    {"building_name": "A", "room_number": 2, "number_of_beds": 3, "room_rank": "Manager",  "department": "Sales", "gender": "F", "occupant_ids": []},
    {"building_name": "A", "room_number": 3, "number_of_beds": 2, "room_rank": "VP",       "department": "Exec",  "gender": "M", "occupant_ids": ["103"]},
    {"building_name": "B", "room_number": 1, "number_of_beds": 4, "room_rank": "Junior",   "department": "IT",    "gender": "F", "occupant_ids": ["104"]},
    {"building_name": "B", "room_number": 2, "number_of_beds": 3, "room_rank": "Manager",  "department": "R&D",   "gender": "M", "occupant_ids": []},
    {"building_name": "B", "room_number": 3, "number_of_beds": 2, "room_rank": "Director", "department": "QA",    "gender": "F", "occupant_ids": []},
])

personnel_df = pd.DataFrame([
    {"person_id": "101", "full_name": "דוד לוי",        "department": "R&D",   "gender": "M", "rank": "Director"},
    {"person_id": "102", "full_name": "יוסף כהן",       "department": "R&D",   "gender": "M", "rank": "Director"},
    {"person_id": "103", "full_name": "אבי בן דוד",     "department": "Exec",  "gender": "M", "rank": "VP"},
    {"person_id": "104", "full_name": "שרה מזרחי",      "department": "IT",    "gender": "F", "rank": "Junior"},
    {"person_id": "105", "full_name": "דן פרידמן",      "department": "Sales", "gender": "M", "rank": "Manager"},
    {"person_id": "106", "full_name": "נועה שפירא",     "department": "QA",    "gender": "F", "rank": "Director"},
    {"person_id": "107", "full_name": "אייל גולדברג",   "department": "R&D",   "gender": "M", "rank": "Junior"},
    {"person_id": "108", "full_name": "מאיה רוזן",      "department": "IT",    "gender": "F", "rank": "Manager"},
])

print(f"Rooms DataFrame: {len(rooms_df)} rows")
print(rooms_df.to_string(index=False))
print(f"\nPersonnel DataFrame: {len(personnel_df)} rows")
print(personnel_df.to_string(index=False))


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

# ── Lookup a pre-assigned person ──
show("GET /person/{id} — lookup person 101 (pre-assigned to A#1)",
     "GET", "/person/101")

# ── Lookup an unassigned person ──
show("GET /person/{id} — lookup person 105 (not yet assigned)",
     "GET", "/person/105")

# ── Assign a known person (rank/dept/gender resolved from personnel) ──
show("POST /assign — assign known person 105 (auto-resolves fields)",
     "POST", "/assign", {"person_id": "105"})

# ── Verify assignment ──
show("GET /person/{id} — verify person 105 is now assigned",
     "GET", "/person/105")

# ── Assign same person again (idempotent — returns existing room) ──
show("POST /assign — assign 105 again (idempotent, returns same room)",
     "POST", "/assign", {"person_id": "105"})

# ── Assign a walk-in guest (not in personnel, all fields required) ──
show("POST /assign — walk-in guest (all fields required)",
     "POST", "/assign", {
         "person_id": "9999",
         "rank": "Junior",
         "department": "IT",
         "gender": "F",
         "person_name": "אורח חד פעמי",
     })

# ── Assign unknown person without required fields (should fail) ──
show("POST /assign — unknown person, missing fields (should fail)",
     "POST", "/assign", {"person_id": "88888"})

# ── Unassign a person ──
show("POST /unassign — remove walk-in guest from room",
     "POST", "/unassign", {"person_id": "9999"})

# ── Verify unassignment ──
show("GET /person/{id} — verify walk-in is no longer assigned",
     "GET", "/person/9999")

# ── Unassign someone not assigned (returns ok=false) ──
show("POST /unassign — person not assigned (returns ok=false)",
     "POST", "/unassign", {"person_id": "9999"})

# ── Lookup unknown person (never existed) ──
show("GET /person/{id} — completely unknown person",
     "GET", "/person/77777")

# ── Upsert: update an existing room's capacity ──
show("POST /admin/upsert_rooms — update room A#1 to 6 beds",
     "POST", "/admin/upsert_rooms", {
         "rooms": [{"building_name": "A", "room_number": 1, "number_of_beds": 6}],
     })

# ── Upsert: add a brand new room ──
show("POST /admin/upsert_rooms — add new room C#1",
     "POST", "/admin/upsert_rooms", {
         "rooms": [{
             "building_name": "C", "room_number": 1, "number_of_beds": 4,
             "room_rank": "Junior", "department": "Ops", "gender": "M",
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
  GET  /person/{person_id}      → lookup a person's assigned room

  POST /assign                  → assign person to best available room
       body: {"person_id": "..."}
       body: {"person_id": "...", "rank": "...", "department": "...",
              "gender": "...", "person_name": "..."}   (walk-in)

  POST /unassign                → remove person from their room
       body: {"person_id": "..."}

  POST /admin/load_rooms        → replace all rooms
       body: {"rooms": rooms_df.to_dict(orient="records")}

  POST /admin/load_personnel    → replace all personnel
       body: {"personnel": personnel_df.to_dict(orient="records")}

  POST /admin/upsert_rooms      → update/add specific rooms
       body: {"rooms": [{"building_name": "A", "room_number": 1, ...}]}
""")
