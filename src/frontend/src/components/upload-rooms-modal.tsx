"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { loadRooms } from "@/lib/api";
import { downloadBase64Excel } from "@/lib/export";
import { parseFile, parseOccupantIds, toRoomPayload } from "@/lib/parse";
import { IconAlertCircle, IconCheck, IconHelpCircle, IconUpload, IconX } from "./icons";

const EXPECTED_COLUMNS = [
  "building_name",
  "room_number",
  "number_of_beds",
  "room_rank",
  "gender",
  "occupant_ids",
] as const;

const COLUMN_LABELS: Record<string, string> = {
  building_name: "שם מבנה",
  room_number: "מספר חדר",
  number_of_beds: "מספר מיטות",
  room_rank: "דרגת חדר",
  gender: "מגדר",
  occupant_ids: "מזהי דיירים",
};

interface UploadRoomsModalProps {
  open: boolean;
  onClose: () => void;
}

type Status = "idle" | "loading" | "success" | "error";

export function UploadRoomsModal({ open, onClose }: UploadRoomsModalProps) {
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [fileName, setFileName] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleClose = useCallback(() => {
    setRows([]);
    setStatus("idle");
    setMessage("");
    setFileName("");
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        handleClose();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, handleClose]);

  async function processFile(file: File) {
    setStatus("idle");
    setMessage("");
    setFileName(file.name);

    try {
      const parsed = await parseFile(file);
      if (parsed.length === 0) {
        setMessage("הקובץ ריק או לא בפורמט תקין");
        setStatus("error");
        return;
      }

      const headers = Object.keys(parsed[0]);
      const missing = EXPECTED_COLUMNS.filter((col) => !headers.includes(col));
      if (missing.length > 0) {
        setMessage(`עמודות חסרות: ${missing.map((c) => COLUMN_LABELS[c] || c).join(", ")}`);
        setStatus("error");
        return;
      }

      setRows(parsed);
    } catch {
      setMessage("שגיאה בקריאת הקובץ");
      setStatus("error");
    }
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) processFile(file);
  }

  function handleDragEnter(e: React.DragEvent) { e.preventDefault(); setIsDragging(true); }
  function handleDragLeave(e: React.DragEvent) { e.preventDefault(); setIsDragging(false); }
  function handleDragOver(e: React.DragEvent) { e.preventDefault(); }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }

  async function handleSubmit() {
    setStatus("loading");
    setMessage("");

    try {
      const payload = rows.map(toRoomPayload);
      const result = await loadRooms(payload);
      setStatus("success");
      setMessage(`${rows.length} חדרים נטענו בהצלחה`);
      toast.success(`${rows.length} חדרים נטענו בהצלחה`);
      setRows([]);

      if (result.warnings?.unknown_personnel?.length) {
        toast.error(result.warnings.message, {
          duration: 10000,
          action: {
            label: "הורד רשימה",
            onClick: () => downloadBase64Excel(result.warnings!.excel_base64, "אנשים_לא_מזוהים"),
          },
        });
      }
    } catch (err) {
      setStatus("error");
      setMessage(String(err));
      toast.error("שגיאה בטעינת חדרים");
    }
  }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="backdrop"
          className="fixed inset-0 z-50 flex items-center justify-center p-6"
          style={{ background: "rgba(0, 0, 0, 0.4)", backdropFilter: "blur(4px)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) handleClose();
          }}
        >
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="upload-modal-title"
            className="surface-card w-full max-w-[1080px] max-h-[calc(100vh-40px)] overflow-hidden"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            {/* Header */}
            <header
              className="px-8 py-6 border-b flex items-center justify-between"
              style={{ borderColor: "var(--border)" }}
            >
              <div>
                <h2
                  id="upload-modal-title"
                  className="text-[24px] font-bold"
                  style={{ color: "var(--text-1)" }}
                >
                  טעינת חדרים
                </h2>
                <p className="text-[12px] mt-1" style={{ color: "var(--text-3)" }}>
                  העלאת קובץ CSV או Excel עם נתוני חדרים
                </p>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="btn-ghost !min-h-[36px] !px-2"
                aria-label="סגור חלון"
              >
                <IconX size={18} />
              </button>
            </header>

            {/* Body */}
            <div className="px-8 py-6 overflow-y-auto" style={{ maxHeight: "calc(100vh - 220px)" }}>
              {/* Drag-and-drop zone */}
              <motion.div
                className={`bg-gray-50 rounded-lg p-8 flex flex-col items-center justify-center space-y-3 border-2 border-dashed cursor-pointer mb-5 ${
                  isDragging ? "border-gray-500" : fileName ? "border-gray-400" : "border-gray-300"
                }`}
                whileHover={{ boxShadow: "0 0 0 2px var(--accent-muted)", backgroundColor: "var(--surface-2)" }}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleFileChange} className="hidden" />

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

              {/* Expected columns hint */}
              {rows.length === 0 && status !== "error" ? (
                <div className="mb-4">
                  <button type="button" onClick={() => setShowHelp(!showHelp)}
                    className="inline-flex items-center gap-1.5 text-[12px] font-medium cursor-pointer"
                    style={{ color: "var(--text-3)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-2)")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-3)")}>
                    <IconHelpCircle size={15} />
                    <span>תבנית קובץ לדוגמה</span>
                  </button>
                  {showHelp && (
                    <div className="table-shell overflow-x-auto mt-2" style={{ direction: "ltr" }}>
                      <table className="w-full text-[11px]" style={{ borderCollapse: "collapse" }}>
                        <thead><tr>
                          {EXPECTED_COLUMNS.map((col) => <th key={col} className="table-head-cell text-left px-3 py-2">{col}</th>)}
                        </tr></thead>
                        <tbody>
                          <tr className="table-row"><td className="px-3 py-1.5" style={{ color: "var(--text-3)" }}>A</td><td className="px-3 py-1.5" style={{ color: "var(--text-3)" }}>1</td><td className="px-3 py-1.5" style={{ color: "var(--text-3)" }}>4</td><td className="px-3 py-1.5" style={{ color: "var(--text-3)" }}>manager</td><td className="px-3 py-1.5" style={{ color: "var(--text-3)" }}>male</td><td className="px-3 py-1.5" style={{ color: "var(--text-3)" }}>101,102</td></tr>
                          <tr className="table-row"><td className="px-3 py-1.5" style={{ color: "var(--text-3)" }}>B</td><td className="px-3 py-1.5" style={{ color: "var(--text-3)" }}>2</td><td className="px-3 py-1.5" style={{ color: "var(--text-3)" }}>3</td><td className="px-3 py-1.5" style={{ color: "var(--text-3)" }}>junior</td><td className="px-3 py-1.5" style={{ color: "var(--text-3)" }}>female</td><td className="px-3 py-1.5" style={{ color: "var(--text-3)" }}></td></tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ) : null}

              {/* Alert messages */}
              {status === "error" && message ? (
                <div
                  className="rounded-lg px-3 py-2.5 text-[13px] flex items-start gap-2 mb-4"
                  style={{
                    color: "var(--danger)",
                    background: "var(--danger-dim)",
                    border: "1px solid var(--danger-border)",
                  }}
                >
                  <IconAlertCircle size={15} />
                  <span>{message}</span>
                </div>
              ) : null}

              {status === "success" && message ? (
                <div
                  className="rounded-lg px-3 py-2.5 text-[13px] flex items-start gap-2 mb-4"
                  style={{
                    color: "var(--success)",
                    background: "var(--success-dim)",
                    border: "1px solid var(--success-border)",
                  }}
                >
                  <IconCheck size={15} />
                  <span>{message}</span>
                </div>
              ) : null}

              {/* Preview table */}
              {rows.length > 0 ? (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <p
                      className="text-[13px] font-semibold"
                      style={{ color: "var(--text-1)" }}
                    >
                      תצוגה מקדימה
                    </p>
                    <span className="badge badge-accent">{rows.length} שורות</span>
                  </div>

                  <div className="table-shell overflow-x-auto mb-4" style={{ maxHeight: "360px", overflowY: "auto" }}>
                    <table className="w-full text-[12px]" style={{ borderCollapse: "collapse" }}>
                      <thead>
                        <tr>
                          <th className="table-head-cell text-right px-3 py-2">#</th>
                          {EXPECTED_COLUMNS.map((col) => (
                            <th key={col} className="table-head-cell text-right px-3 py-2">
                              {COLUMN_LABELS[col]}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row, idx) => (
                          <tr key={idx} className="table-row">
                            <td
                              className="px-3 py-2"
                              style={{ color: "var(--text-3)" }}
                            >
                              {idx + 1}
                            </td>
                            {EXPECTED_COLUMNS.map((col) => (
                              <td
                                key={col}
                                className="px-3 py-2"
                                style={{ color: "var(--text-2)" }}
                              >
                                {row[col] ?? ""}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <motion.button
                    type="button"
                    onClick={handleSubmit}
                    disabled={status === "loading"}
                    whileHover={status !== "loading" ? { scale: 1.02 } : {}}
                    whileTap={status !== "loading" ? { scale: 0.98 } : {}}
                    className="px-4 py-2.5 rounded-md text-white font-medium text-sm flex items-center justify-center gap-2"
                    style={{
                      backgroundColor: "var(--text-1)",
                      opacity: status === "loading" ? 0.5 : 1,
                      cursor: status === "loading" ? "not-allowed" : "pointer",
                    }}
                  >
                    <IconUpload size={16} />
                    {status === "loading" ? "טוען..." : `טען ${rows.length} חדרים`}
                  </motion.button>
                </>
              ) : null}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
