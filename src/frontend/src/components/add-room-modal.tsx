"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { createRoom, loadRooms } from "@/lib/api";
import { downloadBase64Excel } from "@/lib/export";
import { parseFile, toRoomPayload } from "@/lib/parse";
import { RANK_HE, GENDER_HE } from "@/lib/hebrew";
import { IconAlertCircle, IconBed, IconBuilding, IconCheck, IconCrown, IconDoor, IconGender, IconHash, IconUpload, IconX } from "./icons";

const RANKS = Object.keys(RANK_HE);
const GENDERS = Object.keys(GENDER_HE);

const EXPECTED_COLUMNS = [
  "building_name", "room_number", "number_of_beds", "room_rank", "gender", "occupant_ids",
] as const;

const COLUMN_LABELS: Record<string, string> = {
  building_name: "שם מבנה", room_number: "מספר חדר", number_of_beds: "מספר מיטות",
  room_rank: "דרגת חדר", gender: "מגדר", occupant_ids: "מזהי דיירים",
};

interface Props { open: boolean; onClose: () => void; }
type View = "chooser" | "form" | "csv";
type Status = "idle" | "loading" | "success" | "error";

export function AddRoomModal({ open, onClose }: Props) {
  const [view, setView] = useState<View>("chooser");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);

  const handleClose = useCallback(() => {
    setView("chooser"); setStatus("idle"); setMessage("");
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); handleClose(); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, handleClose]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="backdrop"
          className="fixed inset-0 z-50 flex items-center justify-center p-6"
          style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)" }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) handleClose(); }}
        >
          <motion.div
            ref={dialogRef} role="dialog" aria-modal="true"
            className="surface-card w-full max-w-[640px] max-h-[calc(100vh-40px)] overflow-hidden"
            style={{ boxShadow: "0 25px 60px rgba(0,0,0,0.4)" }}
            initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }} transition={{ duration: 0.2 }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-7 pt-6 pb-5 flex items-start justify-between">
              <div className="flex items-center gap-3">
                {view !== "chooser" && (
                  <motion.button
                    type="button" onClick={() => { setView("chooser"); setStatus("idle"); setMessage(""); }}
                    className="h-9 w-9 rounded-xl flex items-center justify-center transition-colors"
                    style={{ background: "var(--surface-2)", color: "var(--text-2)" }}
                    whileHover={{ background: "var(--surface-3)" }}
                    whileTap={{ scale: 0.95 }}
                    aria-label="חזור"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
                  </motion.button>
                )}
                <div>
                  <h2 className="text-[20px] font-bold" style={{ color: "var(--text-1)" }}>
                    {view === "chooser" ? "הוספת חדר" : view === "form" ? "חדר חדש" : "טעינה מקובץ"}
                  </h2>
                  <p className="text-[12px] mt-0.5" style={{ color: "var(--text-3)" }}>
                    {view === "chooser" ? "בחר אופן הוספה" : view === "form" ? "מלא את פרטי החדר" : "העלאת קובץ CSV או Excel"}
                  </p>
                </div>
              </div>
              <button type="button" onClick={handleClose}
                className="h-8 w-8 rounded-lg flex items-center justify-center transition-colors"
                style={{ color: "var(--text-3)" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-2)"; e.currentTarget.style.color = "var(--text-1)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-3)"; }}
                aria-label="סגור"
              >
                <IconX size={16} />
              </button>
            </div>

            <div className="border-t" style={{ borderColor: "var(--border)" }} />

            {/* Body */}
            <div className="px-7 py-6 overflow-y-auto" style={{ maxHeight: "calc(100vh - 220px)" }}>
              <AnimatePresence mode="wait">
                {view === "chooser" && (
                  <motion.div key="chooser" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} transition={{ duration: 0.15 }}>
                    <Chooser onCSV={() => setView("csv")} onForm={() => setView("form")} />
                  </motion.div>
                )}
                {view === "form" && (
                  <motion.div key="form" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.15 }}>
                    <RoomForm status={status} message={message} setStatus={setStatus} setMessage={setMessage} onDone={handleClose} />
                  </motion.div>
                )}
                {view === "csv" && (
                  <motion.div key="csv" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.15 }}>
                    <RoomCSV status={status} message={message} setStatus={setStatus} setMessage={setMessage} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function RoomForm({ status, message, setStatus, setMessage, onDone }: {
  status: Status; message: string; setStatus: (s: Status) => void; setMessage: (m: string) => void; onDone: () => void;
}) {
  const [building, setBuilding] = useState("");
  const [roomNum, setRoomNum] = useState("");
  const [beds, setBeds] = useState("");
  const [rank, setRank] = useState(RANKS[0]);
  const [gender, setGender] = useState(GENDERS[0]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!building.trim() || !roomNum.trim() || !beds.trim()) {
      setStatus("error"); setMessage("יש למלא את כל השדות"); return;
    }
    setStatus("loading"); setMessage("");
    try {
      await createRoom({
        building_name: building.trim(), room_number: Number(roomNum),
        number_of_beds: Number(beds), room_rank: rank, gender,
      });
      setStatus("success"); setMessage("החדר נוסף בהצלחה");
      toast.success("החדר נוסף בהצלחה");
      setTimeout(onDone, 1200);
    } catch (err) {
      setStatus("error"); setMessage(String(err));
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <AlertBox status={status} message={message} />

      <div className="space-y-5">
        {/* Building & Room Number row */}
        <div className="grid grid-cols-2 gap-4">
          <FormField label="שם מבנה" icon={<IconBuilding size={15} />}>
            <input className="control-input" placeholder="לדוגמה: A" value={building} onChange={(e) => setBuilding(e.target.value)} />
          </FormField>
          <FormField label="מספר חדר" icon={<IconHash size={15} />}>
            <input className="control-input" type="number" placeholder="101" value={roomNum} onChange={(e) => setRoomNum(e.target.value)} />
          </FormField>
        </div>

        {/* Beds */}
        <FormField label="מספר מיטות" icon={<IconBed size={15} />}>
          <input className="control-input" type="number" min={1} placeholder="4" value={beds} onChange={(e) => setBeds(e.target.value)} />
        </FormField>

        {/* Rank & Gender row */}
        <div className="grid grid-cols-2 gap-4">
          <FormField label="דרגת חדר" icon={<IconCrown size={15} />}>
            <select className="control-select" value={rank} onChange={(e) => setRank(e.target.value)}>
              {RANKS.map((r) => <option key={r} value={r}>{RANK_HE[r]}</option>)}
            </select>
          </FormField>
          <FormField label="מגדר" icon={<IconGender size={15} />}>
            <select className="control-select" value={gender} onChange={(e) => setGender(e.target.value)}>
              {GENDERS.map((g) => <option key={g} value={g}>{GENDER_HE[g]}</option>)}
            </select>
          </FormField>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-7 pt-5 border-t" style={{ borderColor: "var(--border)" }}>
        <p className="text-[11px]" style={{ color: "var(--text-3)" }}>כל השדות נדרשים</p>
        <motion.button
          type="submit" disabled={status === "loading"}
          className="px-5 py-2.5 rounded-xl text-white font-semibold text-[14px] inline-flex items-center gap-2"
          style={{
            background: status === "loading" ? "var(--text-3)" : "var(--accent)",
            cursor: status === "loading" ? "not-allowed" : "pointer",
          }}
          whileHover={status !== "loading" ? { scale: 1.02 } : {}}
          whileTap={status !== "loading" ? { scale: 0.98 } : {}}
        >
          {status === "loading" ? (
            <>
              <motion.div
                className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white"
                animate={{ rotate: 360 }}
                transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
              />
              שומר...
            </>
          ) : (
            <>
              <IconCheck size={16} />
              הוסף חדר
            </>
          )}
        </motion.button>
      </div>
    </form>
  );
}

function RoomCSV({ status, message, setStatus, setMessage }: {
  status: Status; message: string; setStatus: (s: Status) => void; setMessage: (m: string) => void;
}) {
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [fileName, setFileName] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function processFile(file: File) {
    setStatus("idle"); setMessage(""); setFileName(file.name);
    try {
      const parsed = await parseFile(file);
      if (parsed.length === 0) { setMessage("הקובץ ריק או לא בפורמט תקין"); setStatus("error"); return; }
      const headers = Object.keys(parsed[0]);
      const missing = EXPECTED_COLUMNS.filter((col) => !headers.includes(col));
      if (missing.length > 0) { setMessage(`עמודות חסרות: ${missing.map((c) => COLUMN_LABELS[c] || c).join(", ")}`); setStatus("error"); return; }
      setRows(parsed);
    } catch { setMessage("שגיאה בקריאת הקובץ"); setStatus("error"); }
  }

  async function handleSubmit() {
    setStatus("loading"); setMessage("");
    try {
      const result = await loadRooms(rows.map(toRoomPayload));
      setStatus("success"); setMessage(`${rows.length} חדרים נטענו בהצלחה`); setRows([]);
      toast.success(`${rows.length} חדרים נטענו בהצלחה`);

      if (result.warnings?.unknown_personnel?.length) {
        toast.error(result.warnings.message, {
          duration: 10000,
          action: {
            label: "הורד רשימה",
            onClick: () => downloadBase64Excel(result.warnings!.excel_base64, "אנשים_לא_מזוהים"),
          },
        });
      }
    } catch (err) { setStatus("error"); setMessage(String(err)); toast.error("שגיאה בטעינת חדרים"); }
  }

  return (
    <>
      <DropZone isDragging={isDragging} fileName={fileName} fileRef={fileRef} accept=".csv,.xlsx,.xls"
        onFile={processFile} setIsDragging={setIsDragging} />
      {rows.length === 0 && status !== "error" && (
        <div className="mb-4">
          <p className="text-[12px] font-semibold mb-2" style={{ color: "var(--text-2)" }}>תבנית קובץ לדוגמה:</p>
          <div className="table-shell overflow-x-auto">
            <table className="w-full text-[11px]" style={{ borderCollapse: "collapse" }}>
              <thead><tr>
                {EXPECTED_COLUMNS.map((col) => <th key={col} className="table-head-cell text-right px-3 py-2">{COLUMN_LABELS[col]}</th>)}
              </tr></thead>
              <tbody>
                <tr className="table-row">
                  <td className="px-3 py-1.5" style={{ color: "var(--text-3)" }}>א</td>
                  <td className="px-3 py-1.5" style={{ color: "var(--text-3)" }}>101</td>
                  <td className="px-3 py-1.5" style={{ color: "var(--text-3)" }}>4</td>
                  <td className="px-3 py-1.5" style={{ color: "var(--text-3)" }}>בכיר</td>
                  <td className="px-3 py-1.5" style={{ color: "var(--text-3)" }}>זכר</td>
                  <td className="px-3 py-1.5" style={{ color: "var(--text-3)" }}>101,102</td>
                </tr>
                <tr className="table-row">
                  <td className="px-3 py-1.5" style={{ color: "var(--text-3)" }}>ב</td>
                  <td className="px-3 py-1.5" style={{ color: "var(--text-3)" }}>202</td>
                  <td className="px-3 py-1.5" style={{ color: "var(--text-3)" }}>3</td>
                  <td className="px-3 py-1.5" style={{ color: "var(--text-3)" }}>זוטר</td>
                  <td className="px-3 py-1.5" style={{ color: "var(--text-3)" }}>נקבה</td>
                  <td className="px-3 py-1.5" style={{ color: "var(--text-3)" }}></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
      <AlertBox status={status} message={message} />
      {rows.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[13px] font-semibold" style={{ color: "var(--text-1)" }}>תצוגה מקדימה</p>
            <span className="badge badge-accent">{rows.length} שורות</span>
          </div>
          <div className="table-shell overflow-x-auto mb-4" style={{ maxHeight: 360, overflowY: "auto" }}>
            <table className="w-full text-[12px]" style={{ borderCollapse: "collapse" }}>
              <thead><tr><th className="table-head-cell text-right px-3 py-2">#</th>
                {EXPECTED_COLUMNS.map((col) => <th key={col} className="table-head-cell text-right px-3 py-2">{COLUMN_LABELS[col]}</th>)}
              </tr></thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={idx} className="table-row">
                    <td className="px-3 py-2" style={{ color: "var(--text-3)" }}>{idx + 1}</td>
                    {EXPECTED_COLUMNS.map((col) => <td key={col} className="px-3 py-2" style={{ color: "var(--text-2)" }}>{row[col] ?? ""}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end pt-4 border-t" style={{ borderColor: "var(--border)" }}>
            <motion.button type="button" onClick={handleSubmit} disabled={status === "loading"}
              className="px-5 py-2.5 rounded-xl text-white font-semibold text-[14px] inline-flex items-center gap-2"
              style={{
                background: status === "loading" ? "var(--text-3)" : "var(--accent)",
                cursor: status === "loading" ? "not-allowed" : "pointer",
              }}
              whileHover={status !== "loading" ? { scale: 1.02 } : {}}
              whileTap={status !== "loading" ? { scale: 0.98 } : {}}
            >
              <IconUpload size={15} />
              {status === "loading" ? "טוען..." : `טען ${rows.length} חדרים`}
            </motion.button>
          </div>
        </>
      )}
    </>
  );
}

/* ─── Shared sub-components ─── */

function Chooser({ onCSV, onForm }: { onCSV: () => void; onForm: () => void }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <motion.button type="button" onClick={onForm}
        className="rounded-xl p-6 text-right flex flex-col gap-4 border-2 cursor-pointer group"
        style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
        whileHover={{ borderColor: "var(--accent)", scale: 1.01 }}
        whileTap={{ scale: 0.98 }}
      >
        <div className="h-11 w-11 rounded-xl flex items-center justify-center"
          style={{ background: "var(--accent-muted)", color: "var(--accent)" }}>
          <IconDoor size={22} />
        </div>
        <div>
          <p className="text-[15px] font-bold" style={{ color: "var(--text-1)" }}>הוספה ידנית</p>
          <p className="text-[12px] mt-1" style={{ color: "var(--text-3)" }}>מילוי טופס להוספת חדר בודד</p>
        </div>
      </motion.button>
      <motion.button type="button" onClick={onCSV}
        className="rounded-xl p-6 text-right flex flex-col gap-4 border-2 cursor-pointer group"
        style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
        whileHover={{ borderColor: "var(--accent)", scale: 1.01 }}
        whileTap={{ scale: 0.98 }}
      >
        <div className="h-11 w-11 rounded-xl flex items-center justify-center"
          style={{ background: "var(--accent-muted)", color: "var(--accent)" }}>
          <IconUpload size={22} />
        </div>
        <div>
          <p className="text-[15px] font-bold" style={{ color: "var(--text-1)" }}>טעינה מקובץ</p>
          <p className="text-[12px] mt-1" style={{ color: "var(--text-3)" }}>העלאת CSV או Excel עם מספר חדרים</p>
        </div>
      </motion.button>
    </div>
  );
}

function FormField({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-[12px] font-semibold mb-2" style={{ color: "var(--text-2)" }}>
        <span style={{ color: "var(--text-3)" }}>{icon}</span>
        {label}
      </label>
      {children}
    </div>
  );
}

function AlertBox({ status, message }: { status: Status; message: string }) {
  if (status === "error" && message) return (
    <motion.div
      initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-xl px-4 py-3 text-[13px] flex items-start gap-2.5 mb-5"
      style={{ color: "var(--danger)", background: "var(--danger-dim)", border: "1px solid var(--danger-border)" }}>
      <IconAlertCircle size={16} className="shrink-0 mt-0.5" /><span>{message}</span>
    </motion.div>
  );
  if (status === "success" && message) return (
    <motion.div
      initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-xl px-4 py-3 text-[13px] flex items-start gap-2.5 mb-5"
      style={{ color: "var(--success)", background: "var(--success-dim)", border: "1px solid var(--success-border)" }}>
      <IconCheck size={16} className="shrink-0 mt-0.5" /><span>{message}</span>
    </motion.div>
  );
  return null;
}

function DropZone({ isDragging, fileName, fileRef, accept, onFile, setIsDragging }: {
  isDragging: boolean; fileName: string; fileRef: React.RefObject<HTMLInputElement | null>; accept: string;
  onFile: (f: File) => void; setIsDragging: (v: boolean) => void;
}) {
  return (
    <motion.div
      className="rounded-xl p-8 flex flex-col items-center justify-center space-y-3 border-2 border-dashed cursor-pointer mb-5"
      style={{
        borderColor: isDragging ? "var(--accent)" : fileName ? "var(--text-3)" : "var(--border)",
        background: isDragging ? "var(--accent-muted)" : "var(--surface-2)",
      }}
      whileHover={{ borderColor: "var(--accent)", background: "var(--accent-muted)" }}
      onDragEnter={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files?.[0]; if (f) onFile(f); }}
      onClick={() => fileRef.current?.click()}
    >
      <input ref={fileRef} type="file" accept={accept} onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} className="hidden" />
      {fileName ? (
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex flex-col items-center">
          <div className="h-12 w-12 rounded-xl flex items-center justify-center mb-2"
            style={{ background: "var(--accent-muted)", color: "var(--accent)" }}>
            <IconUpload size={24} />
          </div>
          <p className="text-[14px] font-semibold" style={{ color: "var(--text-1)" }}>{fileName}</p>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--text-3)" }}>לחץ להחלפת קובץ</p>
        </motion.div>
      ) : (
        <>
          <div className="h-12 w-12 rounded-xl flex items-center justify-center"
            style={{ background: "var(--surface-3)", color: "var(--text-3)" }}>
            <IconUpload size={24} />
          </div>
          <div className="text-center">
            <p className="text-[14px] font-semibold" style={{ color: "var(--text-2)" }}>גרור ושחרר קובץ כאן</p>
            <p className="text-[12px] mt-0.5" style={{ color: "var(--text-3)" }}>CSV, XLSX, XLS</p>
          </div>
        </>
      )}
    </motion.div>
  );
}
