"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { createRoom, loadRooms } from "@/lib/api";
import { downloadBase64Excel } from "@/lib/export";
import { parseFile, toRoomPayload } from "@/lib/parse";
import { RANK_HE, GENDER_HE } from "@/lib/hebrew";
import { IconAlertCircle, IconCheck, IconDoor, IconUpload, IconX } from "./icons";

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
          style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)" }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) handleClose(); }}
        >
          <motion.div
            ref={dialogRef} role="dialog" aria-modal="true"
            className="surface-card w-full max-w-[720px] max-h-[calc(100vh-40px)] overflow-hidden"
            initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }} transition={{ duration: 0.2 }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <ModalHeader
              title="הוספת חדר"
              subtitle={view === "chooser" ? "בחר אופן הוספה" : view === "csv" ? "העלאת קובץ CSV או Excel" : "מילוי טופס ידני"}
              onClose={handleClose}
              onBack={view !== "chooser" ? () => { setView("chooser"); setStatus("idle"); setMessage(""); } : undefined}
            />
            <div className="px-8 py-6 overflow-y-auto" style={{ maxHeight: "calc(100vh - 220px)" }}>
              {view === "chooser" && <Chooser onCSV={() => setView("csv")} onForm={() => setView("form")} csvLabel="העלאת קובץ CSV או Excel" formLabel="הוספת חדר ידנית" />}
              {view === "form" && <RoomForm status={status} message={message} setStatus={setStatus} setMessage={setMessage} onDone={handleClose} />}
              {view === "csv" && <RoomCSV status={status} message={message} setStatus={setStatus} setMessage={setMessage} />}
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
    <form onSubmit={handleSubmit} className="space-y-4">
      <AlertBox status={status} message={message} />
      <div className="grid grid-cols-2 gap-4">
        <Field label="שם מבנה">
          <input className="control-input" placeholder="לדוגמה: A" value={building} onChange={(e) => setBuilding(e.target.value)} />
        </Field>
        <Field label="מספר חדר">
          <input className="control-input" type="number" placeholder="101" value={roomNum} onChange={(e) => setRoomNum(e.target.value)} />
        </Field>
        <Field label="מספר מיטות">
          <input className="control-input" type="number" min={1} placeholder="4" value={beds} onChange={(e) => setBeds(e.target.value)} />
        </Field>
        <Field label="דרגת חדר">
          <select className="control-select" value={rank} onChange={(e) => setRank(e.target.value)}>
            {RANKS.map((r) => <option key={r} value={r}>{RANK_HE[r]}</option>)}
          </select>
        </Field>
        <Field label="מגדר">
          <select className="control-select" value={gender} onChange={(e) => setGender(e.target.value)}>
            {GENDERS.map((g) => <option key={g} value={g}>{GENDER_HE[g]}</option>)}
          </select>
        </Field>
      </div>
      <div className="flex justify-center mt-2">
        <button type="submit" disabled={status === "loading"} className="btn-primary inline-flex items-center gap-2"
          style={{ opacity: status === "loading" ? 0.5 : 1 }}>
          <IconDoor size={15} />
          {status === "loading" ? "שומר..." : "הוסף חדר"}
        </button>
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
        <div className="surface-soft p-4 rounded-lg text-[12px] mb-4" style={{ color: "var(--text-2)" }}>
          <p className="font-semibold mb-2">עמודות נדרשות בקובץ:</p>
          <div className="flex flex-wrap gap-1.5">
            {EXPECTED_COLUMNS.map((col) => <span key={col} className="badge" style={{ padding: "4px 8px" }}>{COLUMN_LABELS[col]} ({col})</span>)}
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
          <button type="button" onClick={handleSubmit} disabled={status === "loading"}
            className="btn-primary inline-flex items-center gap-2"
            style={{ opacity: status === "loading" ? 0.5 : 1 }}>
            <IconUpload size={15} />
            {status === "loading" ? "טוען..." : `טען ${rows.length} חדרים`}
          </button>
        </>
      )}
    </>
  );
}

/* ─── Shared sub-components ─── */

function ModalHeader({ title, subtitle, onClose, onBack }: { title: string; subtitle: string; onClose: () => void; onBack?: () => void }) {
  return (
    <header className="px-8 py-6 border-b flex items-center justify-between" style={{ borderColor: "var(--border)" }}>
      <div className="flex items-center gap-3">
        {onBack && (
          <button type="button" onClick={onBack} className="btn-ghost !min-h-[36px] !px-2" aria-label="חזור">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
          </button>
        )}
        <div>
          <h2 className="text-[24px] font-bold" style={{ color: "var(--text-1)" }}>{title}</h2>
          <p className="text-[12px] mt-1" style={{ color: "var(--text-3)" }}>{subtitle}</p>
        </div>
      </div>
      <button type="button" onClick={onClose} className="btn-ghost !min-h-[36px] !px-2" aria-label="סגור חלון"><IconX size={18} /></button>
    </header>
  );
}

function Chooser({ onCSV, onForm, csvLabel, formLabel }: { onCSV: () => void; onForm: () => void; csvLabel: string; formLabel: string }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <ChooserCard icon={<IconUpload size={28} />} label={csvLabel} desc="העלאת קובץ CSV או Excel עם מספר רשומות" onClick={onCSV} />
      <ChooserCard icon={<IconDoor size={28} />} label={formLabel} desc="מילוי טופס להוספה בודדת" onClick={onForm} />
    </div>
  );
}

function ChooserCard({ icon, label, desc, onClick }: { icon: React.ReactNode; label: string; desc: string; onClick: () => void }) {
  return (
    <motion.button type="button" onClick={onClick}
      className="surface-soft rounded-xl p-6 text-right flex flex-col gap-3 border cursor-pointer"
      style={{ borderColor: "var(--border)" }}
      whileHover={{ borderColor: "var(--text-3)", scale: 1.01 }}
      whileTap={{ scale: 0.98 }}>
      <span style={{ color: "var(--text-2)" }}>{icon}</span>
      <div>
        <p className="text-[15px] font-semibold" style={{ color: "var(--text-1)" }}>{label}</p>
        <p className="text-[12px] mt-1" style={{ color: "var(--text-3)" }}>{desc}</p>
      </div>
    </motion.button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[12px] font-semibold mb-1.5" style={{ color: "var(--text-2)" }}>{label}</label>
      {children}
    </div>
  );
}

function AlertBox({ status, message }: { status: Status; message: string }) {
  if (status === "error" && message) return (
    <div className="rounded-lg px-3 py-2.5 text-[13px] flex items-start gap-2 mb-4"
      style={{ color: "var(--danger)", background: "var(--danger-dim)", border: "1px solid var(--danger-border)" }}>
      <IconAlertCircle size={15} /><span>{message}</span>
    </div>
  );
  if (status === "success" && message) return (
    <div className="rounded-lg px-3 py-2.5 text-[13px] flex items-start gap-2 mb-4"
      style={{ color: "var(--success)", background: "var(--success-dim)", border: "1px solid var(--success-border)" }}>
      <IconCheck size={15} /><span>{message}</span>
    </div>
  );
  return null;
}

function DropZone({ isDragging, fileName, fileRef, accept, onFile, setIsDragging }: {
  isDragging: boolean; fileName: string; fileRef: React.RefObject<HTMLInputElement | null>; accept: string;
  onFile: (f: File) => void; setIsDragging: (v: boolean) => void;
}) {
  return (
    <motion.div
      className={`bg-gray-50 rounded-lg p-8 flex flex-col items-center justify-center space-y-3 border-2 border-dashed cursor-pointer mb-5 ${
        isDragging ? "border-gray-500" : fileName ? "border-gray-400" : "border-gray-300"
      }`}
      whileHover={{ boxShadow: "0 0 0 2px var(--accent-muted)", backgroundColor: "var(--surface-2)" }}
      onDragEnter={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files?.[0]; if (f) onFile(f); }}
      onClick={() => fileRef.current?.click()}
    >
      <input ref={fileRef} type="file" accept={accept} onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} className="hidden" />
      {fileName ? (
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex flex-col items-center">
          <span className="mb-2" style={{ color: "var(--text-1)" }}><IconUpload size={40} /></span>
          <p className="text-sm font-medium" style={{ color: "var(--text-2)" }}>{fileName}</p>
          <p className="text-xs" style={{ color: "var(--text-3)" }}>לחץ להחלפת קובץ</p>
        </motion.div>
      ) : (
        <>
          <span style={{ color: "var(--text-3)" }}><IconUpload size={36} /></span>
          <div className="text-center">
            <p className="text-sm font-medium" style={{ color: "var(--text-2)" }}>גרור ושחרר קובץ CSV או Excel כאן</p>
            <p className="text-xs mt-1" style={{ color: "var(--text-3)" }}>או לחץ לבחירת קובץ</p>
          </div>
        </>
      )}
    </motion.div>
  );
}
