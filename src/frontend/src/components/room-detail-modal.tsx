"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Room, Personnel } from "@/lib/types";
import { unassignPerson, assignPersonToRoom, swapPeople, movePerson, setRoomDepartment } from "@/lib/api";
import { useAppData } from "./app-shell";
import { buildingHe, deptHe, genderHe, rankHe } from "@/lib/hebrew";
import { DEPT_COLORS, DEFAULT_DEPT_COLOR, Legend } from "./room-card";
import { IconUserMinus, IconUserPlus, IconSwap, IconMove, IconX, IconSearch } from "./icons";

interface RoomDetailModalProps {
  room: Room | null;
  onClose: () => void;
}

export function RoomDetailModal({ room, onClose }: RoomDetailModalProps) {
  const { rooms, personnel, auth } = useAppData();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [selectedBed, setSelectedBed] = useState<number | null>(null);

  const liveRoom = useMemo(() => {
    if (!room) return null;
    return rooms.find((r) => r.building_name === room.building_name && r.room_number === room.room_number) || null;
  }, [rooms, room]);

  useEffect(() => {
    if (!room) return;
    setSelectedBed(null);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [room, onClose]);

  if (!liveRoom) return null;

  const primaryDept = liveRoom.departments[0] || "";
  const deptColor = DEPT_COLORS[primaryDept] || DEFAULT_DEPT_COLOR;
  const isFull = liveRoom.available_beds === 0;
  const total = liveRoom.number_of_beds;
  const bedsPerRow = total <= 10 ? Math.ceil(total / 2) : Math.min(6, Math.ceil(total / Math.ceil(total / 6)));

  // Map bed index to occupant
  const bedOccupants = Array.from({ length: total }, (_, i) => {
    if (i < liveRoom.occupant_ids.length) {
      const personId = liveRoom.occupant_ids[i];
      return { personId, name: liveRoom.occupant_names?.[personId] || "" };
    }
    return null;
  });

  const selectedOccupant = selectedBed !== null ? bedOccupants[selectedBed] : null;
  const selectedBedIsEmpty = selectedBed !== null && !bedOccupants[selectedBed];

  return (
    <AnimatePresence>
      {room ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-6"
          style={{ background: "rgba(0, 0, 0, 0.4)", backdropFilter: "blur(4px)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            className="surface-card w-full max-w-[600px] max-h-[calc(100vh-40px)] overflow-hidden flex flex-col"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <header className="px-7 py-5 border-b flex items-center justify-between" style={{ borderColor: "var(--border)" }}>
              <div>
                <h2 className="text-[20px] font-bold" style={{ color: "var(--text-1)" }}>
                  חדר {liveRoom.room_number}
                </h2>
                <p className="text-[13px] mt-1" style={{ color: "var(--text-3)" }}>
                  {rankHe(liveRoom.room_rank)} · {liveRoom.departments.map(deptHe).join(", ") || "—"} · {genderHe(liveRoom.gender)} · {liveRoom.occupant_count}/{liveRoom.number_of_beds} תפוסה
                </p>
              </div>
              <button type="button" onClick={onClose} className="btn-ghost !min-h-[36px] !px-2" aria-label="סגור">
                <IconX size={18} />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto px-7 py-5 space-y-4">
              {/* Bed visualization */}
              <section className="surface-soft p-4">
                <p className="text-[11px] font-semibold mb-3 text-center" style={{ color: "var(--text-3)" }}>
                  לחץ על מיטה לפרטים
                </p>
                <div className="flex flex-col gap-2.5">
                  {Array.from({ length: Math.ceil(total / bedsPerRow) }, (_, rowIdx) => {
                    const start = rowIdx * bedsPerRow;
                    const end = Math.min(start + bedsPerRow, total);
                    return (
                      <div key={rowIdx} className="flex gap-2 justify-center">
                        {bedOccupants.slice(start, end).map((occ, i) => {
                          const bedIdx = start + i;
                          return (
                            <ClickableBed
                              key={bedIdx}
                              index={bedIdx}
                              occupied={!!occ}
                              selected={selectedBed === bedIdx}
                              deptColor={deptColor}
                              label={occ ? (occ.name || occ.personId.slice(-4)) : undefined}
                              onClick={() => setSelectedBed(selectedBed === bedIdx ? null : bedIdx)}
                            />
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center gap-4 mt-3 pt-2 border-t" style={{ borderColor: "var(--border)" }}>
                  <Legend color={deptColor.strong} label={liveRoom.departments.map(deptHe).join(", ") || "—"} />
                  <Legend color="var(--surface-3)" label="פנויה" dashed />
                </div>
              </section>

              {/* Department override (admin only) */}
              {auth.role === "admin" ? (
                <DepartmentOverride room={liveRoom} />
              ) : null}

              {/* Selected bed detail */}
              <AnimatePresence mode="wait">
                {selectedOccupant ? (
                  <motion.div
                    key={`occupant-${selectedBed}`}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <OccupantDetail
                      personId={selectedOccupant.personId}
                      name={selectedOccupant.name}
                      bedIndex={selectedBed! + 1}
                    />
                  </motion.div>
                ) : selectedBedIsEmpty ? (
                  <motion.div
                    key={`assign-${selectedBed}`}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <div className="surface-soft p-4">
                      <p className="text-[12px] font-semibold mb-2" style={{ color: "var(--text-3)" }}>
                        מיטה {selectedBed! + 1} — שיבוץ
                      </p>
                      <RoomAssignForm room={liveRoom} personnel={personnel} />
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>

            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function DepartmentOverride({ room }: { room: Room }) {
  const { personnel } = useAppData();
  const [loading, setLoading] = useState(false);

  const availableDepts = useMemo(() => {
    const depts = new Set<string>();
    for (const p of personnel) depts.add(p.department);
    return [...depts].sort();
  }, [personnel]);

  async function handleChange(value: string) {
    setLoading(true);
    try {
      const dept = value || null;
      const res = await setRoomDepartment(room.building_name, room.room_number, dept);
      if (res.ok) {
        toast.success(dept ? `זירה ${deptHe(dept)} הוגדרה לחדר` : "הגדרת זירה ידנית הוסרה");
      } else {
        toast.error(res.detail || "שגיאה בעדכון זירה");
      }
    } catch {
      toast.error("שגיאת חיבור");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 px-1">
      <div className="flex items-center gap-2">
        <p className="text-[12px] font-semibold" style={{ color: "var(--text-3)" }}>זירה מוגדרת:</p>
        {room.designated_department ? (
          <span className="badge badge-accent" style={{ padding: "2px 8px" }}>{deptHe(room.designated_department)}</span>
        ) : (
          <span className="text-[11px]" style={{ color: "var(--text-3)" }}>אוטומטי (לפי דיירים)</span>
        )}
      </div>
      <select
        value={room.designated_department || ""}
        onChange={(e) => handleChange(e.target.value)}
        disabled={loading}
        className="control-select text-[12px] !min-h-[28px] !py-0 !px-2 w-auto"
        style={{ maxWidth: 160 }}
      >
        <option value="">אוטומטי</option>
        {availableDepts.map((d) => (
          <option key={d} value={d}>{deptHe(d)}</option>
        ))}
      </select>
    </div>
  );
}

function ClickableBed({
  index,
  occupied,
  selected,
  deptColor,
  label,
  onClick,
}: {
  index: number;
  occupied: boolean;
  selected: boolean;
  deptColor: typeof DEFAULT_DEPT_COLOR;
  label?: string;
  onClick: () => void;
}) {
  const fill = occupied ? deptColor.bg : "var(--surface-1)";
  const stroke = occupied ? deptColor.strong : "var(--border)";

  return (
    <button
      type="button"
      onClick={onClick}
      className="relative flex-1 min-w-[52px] max-w-[80px] flex flex-col items-center cursor-pointer rounded-lg p-1 transition-all"
      style={{
        background: selected ? "var(--surface-3)" : "transparent",
        outline: selected ? `2px solid ${occupied ? deptColor.strong : "var(--accent)"}` : "none",
        outlineOffset: "1px",
      }}
      title={occupied ? `מיטה ${index + 1} - תפוסה` : `מיטה ${index + 1} - פנויה`}
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" className="w-full h-auto" style={{ opacity: occupied ? 1 : 0.4 }}>
        <g fill={fill} stroke={stroke} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
          <rect x="42" y="20" width="116" height="24" rx="6" />
          <rect x="50" y="36" width="100" height="144" rx="8" />
          <rect x="65" y="48" width="70" height="32" rx="10" />
          <path d="M 46 95 L 154 95 L 154 172 C 154 179.7 147.7 186 140 186 L 60 186 C 52.3 186 46 179.7 46 172 Z" />
          <rect x="46" y="85" width="108" height="20" rx="6" />
        </g>
        <g fill="none" stroke={stroke} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M 78 64 Q 100 68 122 64" />
          <path d="M 75 120 Q 85 145 75 170" />
          <path d="M 125 120 Q 115 145 125 170" />
        </g>
      </svg>
      <span className="text-[9px] font-bold mt-0.5 truncate max-w-full px-0.5" style={{ color: occupied ? deptColor.strong : "var(--text-3)" }}>
        {label || `מיטה ${index + 1}`}
      </span>
    </button>
  );
}

type OccupantAction = null | "swap" | "move";

function OccupantDetail({ personId, name, bedIndex }: { personId: string; name: string; bedIndex: number }) {
  const { personnel, rooms } = useAppData();
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState<OccupantAction>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const person = personnel.find((p) => p.person_id === personId);

  async function handleUnassign() {
    setLoading(true);
    try {
      await unassignPerson(personId);
      toast.success(`${displayName} הוסר מהחדר`);
    } catch (err) {
      toast.error("שגיאה בהסרה מהחדר");
    } finally {
      setLoading(false);
    }
  }

  const displayName = person?.full_name || name || personId;

  return (
    <div className="surface-soft p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="h-10 w-10 rounded-full flex items-center justify-center text-[14px] font-bold shrink-0"
            style={{ background: "var(--surface-3)", color: "var(--text-2)" }}
          >
            {displayName.charAt(0)}
          </div>
          <div className="min-w-0">
            <p className="text-[15px] font-semibold truncate" style={{ color: "var(--text-1)" }}>{displayName}</p>
            <p className="text-[11px]" style={{ color: "var(--text-3)" }}>מיטה {bedIndex}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setAction(action === "swap" ? null : "swap")}
            className="btn-ghost !min-h-[32px] !px-2.5 inline-flex items-center gap-1 text-[12px]"
            style={{ color: action === "swap" ? "var(--accent)" : "var(--text-2)" }}
          >
            <IconSwap size={13} />
            החלף
          </button>
          <button
            type="button"
            onClick={() => setAction(action === "move" ? null : "move")}
            className="btn-ghost !min-h-[32px] !px-2.5 inline-flex items-center gap-1 text-[12px]"
            style={{ color: action === "move" ? "var(--accent)" : "var(--text-2)" }}
          >
            <IconMove size={13} />
            העבר
          </button>
          <button
            type="button"
            onClick={() => {
              if (!window.confirm("האם להסיר את האדם מהחדר?")) return;
              handleUnassign();
            }}
            disabled={loading}
            className="btn-ghost !min-h-[32px] !px-2.5 inline-flex items-center gap-1 text-[12px]"
            style={{ color: "var(--danger)" }}
          >
            <IconUserMinus size={13} />
            הסר
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 pr-[52px]">
        <InfoRow label="מזהה" value={personId} />
        {person ? (
          <>
            <InfoRow label="זירה" value={deptHe(person.department)} />
            <InfoRow label="דרגה" value={rankHe(person.rank)} />
            <InfoRow label="מגדר" value={genderHe(person.gender)} />
          </>
        ) : null}
      </div>

      {error ? <p className="text-[12px] px-2 py-1.5 mt-2 rounded-md" style={{ color: "var(--danger)", background: "var(--danger-dim)" }}>{error}</p> : null}
      {success ? <p className="text-[12px] px-2 py-1.5 mt-2 rounded-md" style={{ color: "var(--success)", background: "var(--success-dim)" }}>{success}</p> : null}

      {action === "swap" ? (
        <InlineSwap
          personId={personId}
          personnel={personnel}
          rooms={rooms}
          onDone={(msg) => { setSuccess(msg); setAction(null); }}
          onError={setError}
        />
      ) : null}

      {action === "move" ? (
        <InlineMove
          personId={personId}
          rooms={rooms}
          onDone={(msg) => { setSuccess(msg); setAction(null); }}
          onError={setError}
        />
      ) : null}
    </div>
  );
}

function InlineSwap({
  personId,
  personnel,
  rooms,
  onDone,
  onError,
}: {
  personId: string;
  personnel: Personnel[];
  rooms: Room[];
  onDone: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [showList, setShowList] = useState(false);
  const [targetPerson, setTargetPerson] = useState<Personnel | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const assignedIds = useMemo(() => new Set(rooms.flatMap((r) => r.occupant_ids)), [rooms]);
  const roomMap = useMemo(() => {
    const map = new Map<string, Room>();
    for (const room of rooms) for (const id of room.occupant_ids) map.set(id, room);
    return map;
  }, [rooms]);

  const filtered = useMemo(() => {
    const list = personnel.filter((p) => p.person_id !== personId && assignedIds.has(p.person_id));
    if (!query.trim()) return list;
    const q = query.toLowerCase();
    return list.filter((p) => p.person_id.toLowerCase().includes(q) || p.full_name.toLowerCase().includes(q));
  }, [personnel, personId, assignedIds, query]);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (listRef.current && !listRef.current.contains(target) && inputRef.current && !inputRef.current.contains(target)) {
        setShowList(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  async function handleSwap() {
    if (!targetPerson) return;
    setLoading(true);
    onError("");
    try {
      const res = await swapPeople(personId, targetPerson.person_id);
      if (res.ok) {
        toast.success(`הוחלף עם ${targetPerson.full_name} בהצלחה`);
        onDone(`הוחלף עם ${targetPerson.full_name} בהצלחה`);
      } else {
        toast.error(res.detail || "ההחלפה נכשלה");
        onError(res.detail || "ההחלפה נכשלה");
      }
    } catch {
      toast.error("שגיאת חיבור");
      onError("שגיאת חיבור");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-3 pt-3 border-t space-y-2" style={{ borderColor: "var(--border)" }}>
      <p className="text-[12px] font-semibold" style={{ color: "var(--text-3)" }}>החלפה עם:</p>
      {targetPerson ? (
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold" style={{ color: "var(--text-1)" }}>{targetPerson.full_name}</span>
            <span className="text-[11px]" style={{ color: "var(--text-3)" }}>{targetPerson.person_id}</span>
            {(() => { const r = roomMap.get(targetPerson.person_id); return r ? <span className="badge" style={{ padding: "2px 6px" }}>מבנה {buildingHe(r.building_name)} חדר {r.room_number}</span> : null; })()}
          </div>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => setTargetPerson(null)} className="btn-ghost !min-h-[28px] !px-1.5" style={{ color: "var(--text-3)" }}><IconX size={12} /></button>
            <button type="button" onClick={handleSwap} disabled={loading} className="btn-primary text-[12px] !min-h-[28px] !px-3 inline-flex items-center gap-1">
              <IconSwap size={12} />
              {loading ? "מחליף..." : "החלף"}
            </button>
          </div>
        </div>
      ) : (
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setShowList(true); }}
            onFocus={() => setShowList(true)}
            className="control-input"
            placeholder="חפש אדם משובץ להחלפה"
            autoComplete="off"
          />
          {showList && filtered.length > 0 ? (
            <div ref={listRef} className="absolute z-10 left-0 right-0 mt-1 surface-card max-h-[160px] overflow-y-auto p-1">
              {filtered.slice(0, 15).map((p) => {
                const r = roomMap.get(p.person_id);
                return (
                  <button
                    key={p.person_id}
                    type="button"
                    onMouseDown={() => { setTargetPerson(p); setShowList(false); setQuery(""); }}
                    className="w-full text-right px-2.5 py-1.5 rounded-lg flex items-center gap-2 cursor-pointer transition-colors"
                    style={{ color: "var(--text-2)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-3)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <div className="min-w-0 flex-1">
                      <span className="text-[12px] font-semibold" style={{ color: "var(--text-1)" }}>{p.full_name}</span>
                      <span className="text-[11px] mr-1" style={{ color: "var(--text-3)" }}>{p.person_id}</span>
                    </div>
                    <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "var(--surface-3)", color: "var(--text-3)" }}>{deptHe(p.department)}</span>
                    {r ? <span className="text-[10px]" style={{ color: "var(--text-3)" }}>חדר {r.room_number}</span> : null}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function InlineMove({
  personId,
  rooms,
  onDone,
  onError,
}: {
  personId: string;
  rooms: Room[];
  onDone: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [targetBuilding, setTargetBuilding] = useState("");
  const [targetRoom, setTargetRoom] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const buildings = useMemo(() => [...new Set(rooms.map((r) => r.building_name))].sort(), [rooms]);
  const availableRooms = useMemo(() => {
    if (!targetBuilding) return [];
    return rooms
      .filter((r) => r.building_name === targetBuilding && r.available_beds > 0)
      .sort((a, b) => a.room_number - b.room_number);
  }, [rooms, targetBuilding]);

  async function handleMove() {
    if (!targetBuilding || targetRoom === null) return;
    setLoading(true);
    onError("");
    try {
      const res = await movePerson(personId, targetBuilding, targetRoom);
      if (res.ok) {
        toast.success(`הועבר למבנה ${buildingHe(targetBuilding)}, חדר ${targetRoom}`);
        onDone(`הועבר למבנה ${buildingHe(targetBuilding)}, חדר ${targetRoom}`);
      } else {
        toast.error(res.detail || "ההעברה נכשלה");
        onError(res.detail || "ההעברה נכשלה");
      }
    } catch {
      toast.error("שגיאת חיבור");
      onError("שגיאת חיבור");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-3 pt-3 border-t space-y-2" style={{ borderColor: "var(--border)" }}>
      <p className="text-[12px] font-semibold" style={{ color: "var(--text-3)" }}>העברה לחדר:</p>
      <div className="flex items-center gap-2">
        <select
          value={targetBuilding}
          onChange={(e) => { setTargetBuilding(e.target.value); setTargetRoom(null); }}
          className="control-input flex-1"
        >
          <option value="">מבנה</option>
          {buildings.map((b) => <option key={b} value={b}>מבנה {buildingHe(b)}</option>)}
        </select>
        <select
          value={targetRoom ?? ""}
          onChange={(e) => setTargetRoom(e.target.value ? Number(e.target.value) : null)}
          className="control-input flex-1"
          disabled={!targetBuilding}
        >
          <option value="">חדר</option>
          {availableRooms.map((r) => (
            <option key={r.room_number} value={r.room_number}>
              חדר {r.room_number} — {r.available_beds} פנויות
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleMove}
          disabled={loading || !targetBuilding || targetRoom === null}
          className="btn-primary text-[12px] !min-h-[36px] !px-3 inline-flex items-center gap-1 shrink-0"
        >
          <IconMove size={12} />
          {loading ? "מעביר..." : "העבר"}
        </button>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold" style={{ color: "var(--text-3)" }}>{label}</p>
      <p className="text-[13px]" style={{ color: "var(--text-2)" }}>{value}</p>
    </div>
  );
}

function RoomAssignForm({ room, personnel }: { room: Room; personnel: Personnel[] }) {
  const { rooms } = useAppData();
  const [personId, setPersonId] = useState("");
  const [selectedName, setSelectedName] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notInPersonnel, setNotInPersonnel] = useState(false);
  const [success, setSuccess] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const assignedIds = useMemo(() => new Set(rooms.flatMap((r) => r.occupant_ids)), [rooms]);

  const suggestions = useMemo(() => {
    if (!personId.trim()) return personnel;
    const q = personId.toLowerCase();
    return personnel.filter(
      (p) => p.person_id.toLowerCase().includes(q) || p.full_name.toLowerCase().includes(q),
    );
  }, [personId, personnel]);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (listRef.current && !listRef.current.contains(target) && inputRef.current && !inputRef.current.contains(target)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  function selectPerson(p: Personnel) {
    setPersonId(p.person_id);
    setSelectedName(p.full_name);
    setNotInPersonnel(false);
    setShowSuggestions(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedId = personId.trim();
    if (!trimmedId) return;
    setError("");
    setSuccess("");
    setNotInPersonnel(false);

    const found = personnel.find((p) => p.person_id === trimmedId);
    if (!found) {
      setNotInPersonnel(true);
      return;
    }

    setLoading(true);
    try {
      await assignPersonToRoom(room.building_name, room.room_number, room.occupant_ids, trimmedId);
      toast.success(`${selectedName || personId} שובץ בהצלחה`);
      setSuccess(`${selectedName || personId} שובץ בהצלחה`);
      setPersonId("");
      setSelectedName("");
      setShowSuggestions(false);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <input
            ref={inputRef}
            type="text"
            value={personId}
            onChange={(e) => { setPersonId(e.target.value); setSelectedName(""); setNotInPersonnel(false); setShowSuggestions(true); }}
            onFocus={() => setShowSuggestions(true)}
            className="control-input"
            placeholder="הקלד מזהה או שם לחיפוש"
            autoComplete="off"
          />
          {showSuggestions && suggestions.length > 0 ? (
            <div ref={listRef} className="absolute z-10 left-0 right-0 mt-1 surface-card max-h-[180px] overflow-y-auto p-1">
              {suggestions.slice(0, 20).map((p) => {
                const isAssigned = assignedIds.has(p.person_id);
                return (
                  <button
                    key={p.person_id}
                    type="button"
                    onMouseDown={() => selectPerson(p)}
                    className="w-full text-right px-2.5 py-2 rounded-lg flex items-center gap-2 cursor-pointer transition-colors"
                    style={{ color: "var(--text-2)", opacity: isAssigned ? 0.5 : 1 }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-3)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <div className="h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0" style={{ background: "var(--surface-3)", color: "var(--text-2)" }}>
                      {p.full_name ? p.full_name.charAt(0) : p.person_id.slice(-2)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-semibold truncate" style={{ color: "var(--text-1)" }}>{p.full_name}</p>
                      <p className="text-[11px] truncate" style={{ color: "var(--text-3)" }}>{p.person_id}</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {isAssigned ? <span className="text-[10px]" style={{ color: "var(--text-3)" }}>משובץ</span> : null}
                      <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "var(--surface-3)", color: "var(--text-3)" }}>{deptHe(p.department)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
        <button type="submit" disabled={loading || !personId.trim()} className="btn-primary inline-flex items-center gap-2 text-[13px] shrink-0">
          <IconUserPlus size={14} />
          {loading ? "משבץ..." : "שבץ לחדר"}
        </button>
      </div>

      {selectedName ? (
        <p className="text-[12px]" style={{ color: "var(--text-2)" }}>נבחר: {selectedName} ({personId})</p>
      ) : null}

      {notInPersonnel ? (
        <p className="text-[12px] px-2 py-1.5 rounded-md" style={{ color: "var(--danger)", background: "var(--danger-dim)" }}>
          המזהה לא נמצא ברשימת כוח האדם, יש לעשות צ׳ק אין בקישור{" "}
          <a href="#" className="underline font-semibold" style={{ color: "var(--danger)" }}>הבא</a>
        </p>
      ) : null}

      {error ? (
        <p className="text-[12px] px-2 py-1.5 rounded-md" style={{ color: "var(--danger)", background: "var(--danger-dim)" }}>{error}</p>
      ) : null}
      {success ? (
        <p className="text-[12px] px-2 py-1.5 rounded-md" style={{ color: "var(--success)", background: "var(--success-dim)" }}>{success}</p>
      ) : null}
    </form>
  );
}
