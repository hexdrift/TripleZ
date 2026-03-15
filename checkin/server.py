"""
Checkin app backend — SQLite + FastAPI.

Three tables:
  - personnel: personal info (מ.א., name, rank, etc.)
  - current_routine: current work schedule per person per day
  - future_routine: planned/future schedule per person per day

Run: uvicorn server:app --reload --port 4001
"""

import json
import sqlite3
import random
from datetime import date, timedelta
from pathlib import Path
from contextlib import contextmanager

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

DB_PATH = Path(__file__).parent / "checkin.db"
CONFIG_PATH = Path(__file__).parent / "config.json"

app = FastAPI(title="Checkin")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


# ── DB helpers ──

@contextmanager
def get_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db():
    with get_db() as db:
        db.execute("""
            CREATE TABLE IF NOT EXISTS personnel (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL DEFAULT '',
                rank TEXT NOT NULL DEFAULT '',
                service_type TEXT NOT NULL DEFAULT '',
                arena TEXT NOT NULL DEFAULT '',
                branch TEXT NOT NULL DEFAULT '',
                base TEXT NOT NULL DEFAULT ''
            )
        """)
        db.execute("""
            CREATE TABLE IF NOT EXISTS current_routine (
                person_id TEXT NOT NULL,
                date TEXT NOT NULL,
                entry_time TEXT NOT NULL DEFAULT '',
                exit_time TEXT NOT NULL DEFAULT '',
                on_shift INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (person_id, date),
                FOREIGN KEY (person_id) REFERENCES personnel(id) ON DELETE CASCADE
            )
        """)
        db.execute("""
            CREATE TABLE IF NOT EXISTS future_routine (
                person_id TEXT NOT NULL,
                date TEXT NOT NULL,
                entry_time TEXT NOT NULL DEFAULT '',
                exit_time TEXT NOT NULL DEFAULT '',
                on_shift INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (person_id, date),
                FOREIGN KEY (person_id) REFERENCES personnel(id) ON DELETE CASCADE
            )
        """)


def load_config():
    try:
        return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {}


def seed_if_empty():
    """Generate sample data if tables are empty."""
    with get_db() as db:
        count = db.execute("SELECT COUNT(*) FROM personnel").fetchone()[0]
        if count > 0:
            return

    cfg = load_config()
    ranks = cfg.get("ranks", ["סמל"])
    service_types = cfg.get("service_types", ["סדיר"])
    arenas = cfg.get("arenas", ["מרכז"])
    branches = cfg.get("branches", ["חי\"ר"])
    bases = cfg.get("bases", ["בסיס 1"])
    day_names = cfg.get("day_names", ["היום"])
    n_days = cfg.get("days_to_show", 7)
    n_people = cfg.get("sample_count", 80)

    first_names = ["אברהם","יצחק","יעקב","משה","דוד","שלמה","יוסף","דניאל",
                   "שרה","רבקה","רחל","לאה","מרים","חנה","דבורה","רות",
                   "אסתר","נעמי","תמר","הילה","נועה","ליאת","גלית","ענת"]
    last_names = ["כהן","לוי","מזרחי","פרץ","ביטון","אברהם","דוד","חדד",
                  "עמר","גבאי","אזולאי","שלום","ישראלי","בן דוד","אלון","שמש"]

    today = date.today()
    dates = [(today + timedelta(days=i)).isoformat() for i in range(n_days)]

    with get_db() as db:
        for i in range(n_people):
            pid = str(100000 + random.randint(0, 899999))
            name = f"{random.choice(first_names)} {random.choice(last_names)}"
            db.execute(
                "INSERT OR IGNORE INTO personnel (id, name, rank, service_type, arena, branch, base) VALUES (?,?,?,?,?,?,?)",
                (pid, name, random.choice(ranks), random.choice(service_types),
                 random.choice(arenas), random.choice(branches), random.choice(bases)),
            )
            for d in dates:
                has_current = random.random() > 0.3
                has_future = random.random() > 0.3
                # Sometimes make them differ to show inconsistencies
                differ = random.random() > 0.7

                c_entry = f"{random.randint(6,9):02d}:{random.randint(0,59):02d}" if has_current else ""
                c_exit = f"{random.randint(16,21):02d}:{random.randint(0,59):02d}" if has_current else ""
                c_shift = 1 if has_current else 0

                if differ and has_future:
                    f_entry = f"{random.randint(6,9):02d}:{random.randint(0,59):02d}"
                    f_exit = f"{random.randint(16,21):02d}:{random.randint(0,59):02d}"
                else:
                    f_entry = c_entry if has_future else ""
                    f_exit = c_exit if has_future else ""
                f_shift = 1 if has_future else 0

                db.execute(
                    "INSERT OR IGNORE INTO current_routine (person_id, date, entry_time, exit_time, on_shift) VALUES (?,?,?,?,?)",
                    (pid, d, c_entry, c_exit, c_shift),
                )
                db.execute(
                    "INSERT OR IGNORE INTO future_routine (person_id, date, entry_time, exit_time, on_shift) VALUES (?,?,?,?,?)",
                    (pid, d, f_entry, f_exit, f_shift),
                )


# ── Models ──

class PersonnelUpdate(BaseModel):
    name: str | None = None
    rank: str | None = None
    service_type: str | None = None
    arena: str | None = None
    branch: str | None = None
    base: str | None = None


class RoutineEntry(BaseModel):
    person_id: str
    date: str
    entry_time: str = ""
    exit_time: str = ""
    on_shift: int = 0


class BulkRoutineUpdate(BaseModel):
    person_ids: list[str]
    entries: list[RoutineEntry]


class BulkShiftUpdate(BaseModel):
    person_ids: list[str]
    on_shift: bool


# ── Routes ──

@app.get("/api/config")
def get_config():
    return load_config()


@app.get("/api/data")
def get_all_data():
    """Return all three tables joined, ready for the frontend."""
    cfg = load_config()
    n_days = cfg.get("days_to_show", 7)
    today = date.today()
    dates = [(today + timedelta(days=i)).isoformat() for i in range(n_days)]

    with get_db() as db:
        people = [dict(r) for r in db.execute("SELECT * FROM personnel ORDER BY id").fetchall()]

        current = {}
        for r in db.execute("SELECT * FROM current_routine WHERE date IN ({})".format(",".join("?" * len(dates))), dates).fetchall():
            current.setdefault(r["person_id"], {})[r["date"]] = dict(r)

        future = {}
        for r in db.execute("SELECT * FROM future_routine WHERE date IN ({})".format(",".join("?" * len(dates))), dates).fetchall():
            future.setdefault(r["person_id"], {})[r["date"]] = dict(r)

    result = []
    for p in people:
        person_current = []
        person_future = []
        for d in dates:
            c = current.get(p["id"], {}).get(d, {"person_id": p["id"], "date": d, "entry_time": "", "exit_time": "", "on_shift": 0})
            f = future.get(p["id"], {}).get(d, {"person_id": p["id"], "date": d, "entry_time": "", "exit_time": "", "on_shift": 0})
            person_current.append(c)
            person_future.append(f)
        result.append({
            "personnel": p,
            "current": person_current,
            "future": person_future,
            "dates": dates,
        })

    return {"records": result, "dates": dates}


@app.put("/api/personnel/{person_id}")
def update_personnel(person_id: str, body: PersonnelUpdate):
    with get_db() as db:
        existing = db.execute("SELECT id FROM personnel WHERE id = ?", (person_id,)).fetchone()
        if not existing:
            raise HTTPException(404, "לא נמצא")
        updates = {k: v for k, v in body.dict().items() if v is not None}
        if updates:
            set_clause = ", ".join(f"{k} = ?" for k in updates)
            db.execute(f"UPDATE personnel SET {set_clause} WHERE id = ?", (*updates.values(), person_id))
    return {"ok": True}


@app.put("/api/routine/{table}/{person_id}/{date_str}")
def update_routine_entry(table: str, person_id: str, date_str: str, body: RoutineEntry):
    if table not in ("current", "future"):
        raise HTTPException(400, "טבלה לא תקינה")
    tbl = "current_routine" if table == "current" else "future_routine"
    with get_db() as db:
        db.execute(
            f"INSERT OR REPLACE INTO {tbl} (person_id, date, entry_time, exit_time, on_shift) VALUES (?,?,?,?,?)",
            (person_id, date_str, body.entry_time, body.exit_time, body.on_shift),
        )
    return {"ok": True}


@app.post("/api/routine/{table}/bulk")
def bulk_update_routine(table: str, body: BulkRoutineUpdate):
    if table not in ("current", "future"):
        raise HTTPException(400, "טבלה לא תקינה")
    tbl = "current_routine" if table == "current" else "future_routine"
    with get_db() as db:
        for entry in body.entries:
            for pid in body.person_ids:
                if entry.entry_time or entry.exit_time:
                    db.execute(
                        f"INSERT OR REPLACE INTO {tbl} (person_id, date, entry_time, exit_time, on_shift) VALUES (?,?,?,?,?)",
                        (pid, entry.date, entry.entry_time, entry.exit_time, entry.on_shift),
                    )
    return {"ok": True, "count": len(body.person_ids)}


@app.post("/api/shift/bulk")
def bulk_update_shift(body: BulkShiftUpdate):
    """Update on_shift for multiple people across all dates in both tables."""
    cfg = load_config()
    n_days = cfg.get("days_to_show", 7)
    today = date.today()
    dates = [(today + timedelta(days=i)).isoformat() for i in range(n_days)]
    val = 1 if body.on_shift else 0
    with get_db() as db:
        for pid in body.person_ids:
            for d in dates:
                db.execute("UPDATE current_routine SET on_shift = ? WHERE person_id = ? AND date = ?", (val, pid, d))
                db.execute("UPDATE future_routine SET on_shift = ? WHERE person_id = ? AND date = ?", (val, pid, d))
    return {"ok": True}


@app.post("/api/upload-future")
async def upload_future_shifts(file: UploadFile = File(...)):
    """Upload an Excel file to update future_routine entries.

    Expected columns: מ.א., then date columns as headers (e.g. 2026-03-15).
    Each cell = "HH:MM-HH:MM" (entry-exit) or empty.
    """
    import io
    import pandas as pd

    contents = await file.read()
    filename = (file.filename or "").lower()
    if filename.endswith(".csv"):
        df = pd.read_csv(io.BytesIO(contents), dtype=str)
    else:
        df = pd.read_excel(io.BytesIO(contents), dtype=str)

    df.columns = [str(c).strip() for c in df.columns]

    id_col = None
    for candidate in ["מ.א.", "מספר אישי", "id"]:
        if candidate in df.columns:
            id_col = candidate
            break
    if not id_col:
        raise HTTPException(400, "חסרה עמודת מ.א. בקובץ")

    date_cols = [c for c in df.columns if c != id_col]
    count = 0

    with get_db() as db:
        for _, row in df.iterrows():
            pid = str(row[id_col]).strip()
            if not pid or pid == "nan":
                continue
            # Verify person exists
            exists = db.execute("SELECT id FROM personnel WHERE id = ?", (pid,)).fetchone()
            if not exists:
                continue
            for col in date_cols:
                val = str(row.get(col, "") or "").strip()
                if not val or val == "nan":
                    continue
                # Parse "HH:MM-HH:MM" or "HH:MM" (entry only)
                parts = val.split("-")
                entry = parts[0].strip() if len(parts) >= 1 else ""
                exit_t = parts[1].strip() if len(parts) >= 2 else ""
                # col should be an ISO date or we try to parse it
                d = col.strip()
                db.execute(
                    "INSERT OR REPLACE INTO future_routine (person_id, date, entry_time, exit_time, on_shift) VALUES (?,?,?,?,?)",
                    (pid, d, entry, exit_t, 1 if entry else 0),
                )
                count += 1

    return {"ok": True, "count": count}


# ── Startup ──

@app.on_event("startup")
def startup():
    init_db()
    seed_if_empty()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=4001, reload=True)
