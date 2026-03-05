"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { swapPeople, movePerson } from "@/lib/api";
import { useAppData } from "./app-shell";
import { buildingHe, deptHe, rankHe } from "@/lib/hebrew";
import { Personnel, Room } from "@/lib/types";
import { IconAlertCircle, IconCheck, IconSearch, IconSwap, IconMove, IconX } from "./icons";

interface SwapModalProps {
  open: boolean;
  onClose: () => void;
}

type Tab = "swap" | "move";

export function SwapModal({ open, onClose }: SwapModalProps) {
  const [tab, setTab] = useState<Tab>("swap");
  const dialogRef = useRef<HTMLDivElement>(null);

  const handleClose = useCallback(() => {
    setTab("swap");
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); handleClose(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [handleClose, open]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-6"
          style={{ background: "rgba(0, 0, 0, 0.4)", backdropFilter: "blur(4px)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) handleClose(); }}
        >
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            className="surface-card w-full max-w-[640px] max-h-[calc(100vh-40px)] overflow-hidden"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <header className="px-8 py-6 border-b flex items-center justify-between" style={{ borderColor: "var(--border)" }}>
              <div>
                <h2 className="text-[24px] font-bold" style={{ color: "var(--text-1)" }}>החלפות והעברות</h2>
                <p className="text-[12px] mt-1" style={{ color: "var(--text-3)" }}>החלפת אנשים בין חדרים או העברה לחדר אחר</p>
              </div>
              <button type="button" onClick={handleClose} className="btn-ghost !min-h-[36px] !px-2" aria-label="סגור">
                <IconX size={18} />
              </button>
            </header>

            <div className="px-8 pt-4 border-b" style={{ borderColor: "var(--border)" }}>
              <div className="flex items-center gap-2">
                {(["swap", "move"] as Tab[]).map((t) => {
                  const selected = tab === t;
                  return (
                    <button
                      key={t}
                      onClick={() => setTab(t)}
                      className="px-4 py-2 rounded-t-lg border border-b-0 text-[13px] font-semibold cursor-pointer transition-colors"
                      style={{
                        color: selected ? "var(--accent)" : "var(--text-2)",
                        borderColor: selected ? "var(--accent)" : "transparent",
                        background: selected ? "var(--accent-muted)" : "transparent",
                      }}
                    >
                      {t === "swap" ? "החלפה" : "העברה"}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="px-8 py-6 overflow-y-auto" style={{ maxHeight: "calc(100vh - 220px)" }}>
              {tab === "swap" ? <SwapTab /> : <MoveTab />}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function SwapTab() {
  const { rooms, personnel } = useAppData();
  const [personA, setPersonA] = useState<Personnel | null>(null);
  const [personB, setPersonB] = useState<Personnel | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const roomMap = useMemo(() => {
    const map = new Map<string, Room>();
    for (const room of rooms) {
      for (const id of room.occupant_ids) map.set(id, room);
    }
    return map;
  }, [rooms]);

  async function handleSwap() {
    if (!personA || !personB) return;
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      const res = await swapPeople(personA.person_id, personB.person_id);
      if (res.ok) {
        const msg = `${personA.full_name} ו${personB.full_name} הוחלפו בהצלחה`;
        setSuccess(msg);
        toast.success(msg);
        setPersonA(null);
        setPersonB(null);
      } else {
        setError(res.detail || "ההחלפה נכשלה");
        toast.error(res.detail || "ההחלפה נכשלה");
      }
    } catch {
      setError("שגיאת חיבור");
      toast.error("שגיאת חיבור");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <p className="text-[13px]" style={{ color: "var(--text-3)" }}>
        בחר שני אנשים משובצים כדי להחליף ביניהם את החדרים
      </p>

      <div>
        <FieldLabel>אדם א׳</FieldLabel>
        <PersonPicker
          personnel={personnel}
          selected={personA}
          onSelect={setPersonA}
          excludeId={personB?.person_id}
          onlyAssigned
          roomMap={roomMap}
        />
        {personA ? <RoomInfo room={roomMap.get(personA.person_id)} /> : null}
      </div>

      <div className="flex justify-center">
        <div className="h-8 w-8 rounded-full flex items-center justify-center" style={{ background: "var(--surface-3)", color: "var(--text-3)" }}>
          <IconSwap size={16} />
        </div>
      </div>

      <div>
        <FieldLabel>אדם ב׳</FieldLabel>
        <PersonPicker
          personnel={personnel}
          selected={personB}
          onSelect={setPersonB}
          excludeId={personA?.person_id}
          onlyAssigned
          roomMap={roomMap}
        />
        {personB ? <RoomInfo room={roomMap.get(personB.person_id)} /> : null}
      </div>

      {error ? <AlertBox type="error">{error}</AlertBox> : null}
      {success ? <AlertBox type="success">{success}</AlertBox> : null}

      <div className="pt-2 flex justify-center">
        <button
          type="button"
          onClick={handleSwap}
          disabled={loading || !personA || !personB}
          className="btn-primary inline-flex items-center gap-2"
        >
          <IconSwap size={14} />
          {loading ? "מחליף..." : "בצע החלפה"}
        </button>
      </div>
    </div>
  );
}

function MoveTab() {
  const { rooms, personnel } = useAppData();
  const [person, setPerson] = useState<Personnel | null>(null);
  const [targetBuilding, setTargetBuilding] = useState("");
  const [targetRoom, setTargetRoom] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const roomMap = useMemo(() => {
    const map = new Map<string, Room>();
    for (const room of rooms) {
      for (const id of room.occupant_ids) map.set(id, room);
    }
    return map;
  }, [rooms]);

  const buildings = useMemo(() => {
    return [...new Set(rooms.map((r) => r.building_name))].sort();
  }, [rooms]);

  const availableRooms = useMemo(() => {
    if (!targetBuilding) return [];
    return rooms
      .filter((r) => r.building_name === targetBuilding && r.available_beds > 0)
      .sort((a, b) => a.room_number - b.room_number);
  }, [rooms, targetBuilding]);

  async function handleMove() {
    if (!person || !targetBuilding || targetRoom === null) return;
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      const res = await movePerson(person.person_id, targetBuilding, targetRoom);
      if (res.ok) {
        const msg = `${person.full_name} הועבר/ה למבנה ${buildingHe(targetBuilding)}, חדר ${targetRoom}`;
        setSuccess(msg);
        toast.success(msg);
        setPerson(null);
        setTargetBuilding("");
        setTargetRoom(null);
      } else {
        setError(res.detail || "ההעברה נכשלה");
        toast.error(res.detail || "ההעברה נכשלה");
      }
    } catch {
      setError("שגיאת חיבור");
      toast.error("שגיאת חיבור");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <p className="text-[13px]" style={{ color: "var(--text-3)" }}>
        בחר אדם משובץ והעבר אותו לחדר אחר עם מיטה פנויה
      </p>

      <div>
        <FieldLabel>אדם</FieldLabel>
        <PersonPicker
          personnel={personnel}
          selected={person}
          onSelect={(p) => { setPerson(p); setTargetBuilding(""); setTargetRoom(null); }}
          onlyAssigned
          roomMap={roomMap}
        />
        {person ? <RoomInfo room={roomMap.get(person.person_id)} label="חדר נוכחי" /> : null}
      </div>

      {person ? (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <FieldLabel>מבנה יעד</FieldLabel>
            <select
              value={targetBuilding}
              onChange={(e) => { setTargetBuilding(e.target.value); setTargetRoom(null); }}
              className="control-input"
            >
              <option value="">בחר מבנה</option>
              {buildings.map((b) => (
                <option key={b} value={b}>מבנה {buildingHe(b)}</option>
              ))}
            </select>
          </div>
          <div>
            <FieldLabel>חדר יעד</FieldLabel>
            <select
              value={targetRoom ?? ""}
              onChange={(e) => setTargetRoom(e.target.value ? Number(e.target.value) : null)}
              className="control-input"
              disabled={!targetBuilding}
            >
              <option value="">בחר חדר</option>
              {availableRooms.map((r) => (
                <option key={r.room_number} value={r.room_number}>
                  חדר {r.room_number} — {r.available_beds} פנויות ({rankHe(r.room_rank)}{r.departments.length > 0 ? `, ${r.departments.map(deptHe).join("/")}` : ""})
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : null}

      {error ? <AlertBox type="error">{error}</AlertBox> : null}
      {success ? <AlertBox type="success">{success}</AlertBox> : null}

      <div className="pt-2 flex justify-center">
        <button
          type="button"
          onClick={handleMove}
          disabled={loading || !person || !targetBuilding || targetRoom === null}
          className="btn-primary inline-flex items-center gap-2"
        >
          <IconMove size={14} />
          {loading ? "מעביר..." : "בצע העברה"}
        </button>
      </div>
    </div>
  );
}

function PersonPicker({
  personnel,
  selected,
  onSelect,
  excludeId,
  onlyAssigned,
  roomMap,
}: {
  personnel: Personnel[];
  selected: Personnel | null;
  onSelect: (p: Personnel | null) => void;
  excludeId?: string;
  onlyAssigned?: boolean;
  roomMap: Map<string, Room>;
}) {
  const [query, setQuery] = useState("");
  const [showList, setShowList] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    let list = personnel;
    if (onlyAssigned) list = list.filter((p) => roomMap.has(p.person_id));
    if (excludeId) list = list.filter((p) => p.person_id !== excludeId);
    if (!query.trim()) return list;
    const q = query.toLowerCase();
    return list.filter(
      (p) => p.person_id.toLowerCase().includes(q) || p.full_name.toLowerCase().includes(q)
    );
  }, [personnel, query, excludeId, onlyAssigned, roomMap]);

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

  if (selected) {
    return (
      <div
        className="flex items-center justify-between px-3 py-2.5 rounded-xl"
        style={{ background: "var(--surface-2)", border: "1px solid var(--accent)" }}
      >
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: "var(--surface-3)", color: "var(--text-2)" }}>
            {selected.full_name.charAt(0)}
          </div>
          <div>
            <span className="text-[13px] font-semibold" style={{ color: "var(--text-1)" }}>{selected.full_name}</span>
            <span className="text-[11px] mr-2" style={{ color: "var(--text-3)" }}>{selected.person_id}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => { onSelect(null); setQuery(""); }}
          className="btn-ghost !min-h-[28px] !px-1.5"
          style={{ color: "var(--text-3)" }}
        >
          <IconX size={14} />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-3)" }}>
        <IconSearch size={14} />
      </div>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setShowList(true); }}
        onFocus={() => setShowList(true)}
        className="control-input pr-10"
        placeholder="הקלד מזהה או שם לחיפוש"
        autoComplete="off"
      />
      {showList && filtered.length > 0 ? (
        <div ref={listRef} className="absolute z-10 left-0 right-0 mt-1 surface-card max-h-[220px] overflow-y-auto p-1">
          {filtered.slice(0, 30).map((p) => (
            <button
              key={p.person_id}
              type="button"
              onMouseDown={() => { onSelect(p); setShowList(false); setQuery(""); }}
              className="w-full text-right px-2.5 py-2 rounded-lg flex items-center gap-2 cursor-pointer transition-colors"
              style={{ color: "var(--text-2)" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-3)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <div className="h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0" style={{ background: "var(--surface-3)", color: "var(--text-2)" }}>
                {p.full_name ? p.full_name.charAt(0) : p.person_id.slice(-2)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-semibold truncate" style={{ color: "var(--text-1)" }}>{p.full_name}</p>
                <p className="text-[11px] truncate" style={{ color: "var(--text-3)" }}>{p.person_id}</p>
              </div>
              <span className="badge" style={{ padding: "3px 6px" }}>{deptHe(p.department)}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function RoomInfo({ room, label }: { room?: Room; label?: string }) {
  if (!room) return <p className="text-[12px] mt-1.5" style={{ color: "var(--text-3)" }}>לא משובץ בחדר</p>;
  return (
    <div className="flex gap-1.5 mt-1.5 flex-wrap">
      {label ? <span className="text-[11px]" style={{ color: "var(--text-3)" }}>{label}:</span> : null}
      <span className="badge" style={{ padding: "3px 6px" }}>מבנה {buildingHe(room.building_name)}</span>
      <span className="badge" style={{ padding: "3px 6px" }}>חדר {room.room_number}</span>
      <span className="badge" style={{ padding: "3px 6px" }}>{rankHe(room.room_rank)}</span>
      {room.departments.map((d) => <span key={d} className="badge" style={{ padding: "3px 6px" }}>{deptHe(d)}</span>)}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[12px] font-semibold mb-1.5" style={{ color: "var(--text-2)" }}>
      {children}
    </label>
  );
}

function AlertBox({ type, children }: { type: "error" | "success"; children: React.ReactNode }) {
  const isError = type === "error";
  return (
    <div
      className="rounded-lg px-3 py-2.5 text-[13px] flex items-start gap-2"
      style={{
        color: isError ? "var(--danger)" : "var(--success)",
        background: isError ? "var(--danger-dim)" : "var(--success-dim)",
        border: `1px solid ${isError ? "var(--danger-border)" : "var(--success-border)"}`,
      }}
    >
      {isError ? <IconAlertCircle size={15} /> : <IconCheck size={15} />}
      <span>{children}</span>
    </div>
  );
}
