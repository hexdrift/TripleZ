"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "react-toastify";
import { AppSettings, createRoom, getSettings, loadRooms } from "@/lib/api";
import { downloadBase64Excel } from "@/lib/export";
import { parseFile, toRoomPayload } from "@/lib/parse";
import { buildingHe, deptHe, genderHe, rankHe } from "@/lib/hebrew";
import {
  IconAlertCircle, IconBed, IconBuilding, IconCheck, IconCrown,
  IconChevronDown, IconDoor, IconGender, IconHash, IconUpload, IconX,
} from "./icons";

import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Card } from "@/components/ui/card";

const REQUIRED_COLUMNS = [
  "building_name", "room_number", "number_of_beds", "room_rank", "gender", "occupant_ids",
] as const;

const TEMPLATE_COLUMNS = [
  { key: "building_name", label: "שם מבנה", required: true },
  { key: "room_number", label: "מספר חדר", required: true },
  { key: "number_of_beds", label: "מספר מיטות", required: true },
  { key: "room_rank", label: "דרגת חדר", required: true },
  { key: "gender", label: "מגדר", required: true },
  { key: "occupant_ids", label: "מזהי דיירים", required: true },
  { key: "designated_department", label: "זירה ייעודית", required: false },
] as const;

const COLUMN_LABELS: Record<string, string> = Object.fromEntries(
  TEMPLATE_COLUMNS.map((column) => [column.key, column.label]),
);

function formatRoomCell(columnKey: string, value: string) {
  if (!value) return "";
  if (columnKey === "building_name") return buildingHe(value);
  if (columnKey === "room_rank") return rankHe(value);
  if (columnKey === "gender") return genderHe(value);
  if (columnKey === "designated_department") return deptHe(value);
  return value;
}

interface Props { open: boolean; onClose: () => void; initialView?: View; defaultBuilding?: string | null; }
type View = "chooser" | "form" | "csv";
type Status = "idle" | "loading" | "success" | "error";

const stepTransition = { duration: 0.15, ease: "easeOut" as const };

export function AddRoomModal({ open, onClose, initialView = "chooser", defaultBuilding = null }: Props) {
  const [view, setView] = useState<View>(initialView);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [settings, setSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    if (!open) return;
    setView(initialView);
  }, [initialView, open]);

  useEffect(() => {
    if (!open) return;
    let active = true;

    getSettings()
      .then((nextSettings) => {
        if (active) setSettings(nextSettings);
      })
      .catch(() => {
        if (active) setSettings(null);
      });

    return () => {
      active = false;
    };
  }, [open]);

  const handleClose = useCallback(() => {
    setView(initialView); setStatus("idle"); setMessage("");
    onClose();
  }, [initialView, onClose]);

  const goBack = useCallback(() => {
    setView("chooser"); setStatus("idle"); setMessage("");
  }, []);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleClose(); }}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-[640px] max-h-[calc(100vh-40px)] overflow-hidden gap-0 p-0"
      >
        {/* Header */}
        <div className="px-6 pt-5 pb-3 flex items-start justify-between">
          <div className="flex items-center gap-3">
            {view !== "chooser" && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={goBack}
                aria-label="חזור"
                className="rounded-xl"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
              </Button>
            )}
            <DialogHeader className="text-right gap-0">
              <DialogTitle className="text-xl font-bold text-foreground">
                {view === "chooser" ? "הוספת חדר" : view === "form" ? "חדר חדש" : "טעינה מקובץ"}
              </DialogTitle>
              <DialogDescription className="sr-only">
                הוספת חדר חדש למערכת באופן ידני או מקובץ
              </DialogDescription>
            </DialogHeader>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleClose}
            aria-label="סגור"
            className="rounded-lg text-muted-foreground hover:text-foreground"
          >
            <IconX size={16} />
          </Button>
        </div>

        <Separator />

        {/* Body */}
        <div className="px-6 py-5 overflow-y-auto max-h-[calc(100vh-220px)]">
          <AnimatePresence mode="wait">
            {view === "chooser" && (
              <motion.div key="chooser" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} transition={stepTransition}>
                <Chooser onCSV={() => setView("csv")} onForm={() => setView("form")} />
              </motion.div>
            )}
            {view === "form" && (
              <motion.div key="form" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={stepTransition}>
                <RoomForm
                  defaultBuilding={defaultBuilding}
                  settings={settings}
                  status={status}
                  message={message}
                  setStatus={setStatus}
                  setMessage={setMessage}
                  onDone={handleClose}
                />
              </motion.div>
            )}
            {view === "csv" && (
              <motion.div key="csv" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={stepTransition}>
                <RoomCSV settings={settings} status={status} message={message} setStatus={setStatus} setMessage={setMessage} onDone={handleClose} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RoomForm({
  status,
  message,
  setStatus,
  setMessage,
  onDone,
  settings,
  defaultBuilding,
}: {
  status: Status; message: string; setStatus: (s: Status) => void; setMessage: (m: string) => void; onDone: () => void;
  settings: AppSettings | null;
  defaultBuilding?: string | null;
}) {
  const [building, setBuilding] = useState("");
  const [roomNum, setRoomNum] = useState<string>("");
  const [beds, setBeds] = useState<string>("");
  const [rank, setRank] = useState("");
  const [gender, setGender] = useState("");

  const buildings = settings?.buildings ?? [];
  const ranks = settings?.ranks_high_to_low ?? [];
  const genders = settings?.genders ?? [];
  const selectedBuilding = building || (defaultBuilding && buildings.includes(defaultBuilding) ? defaultBuilding : buildings[0] || "");
  const selectedRank = rank || ranks[0] || "";
  const selectedGender = gender || genders[0] || "";

  useEffect(() => {
    if (!settings) return;

    setBuilding((current) => {
      const preferred = defaultBuilding?.trim() || "";
      if (preferred && settings.buildings.includes(preferred)) return preferred;
      if (current && settings.buildings.includes(current)) return current;
      return settings.buildings[0] || preferred || current;
    });
    setRank((current) => (current && settings.ranks_high_to_low.includes(current) ? current : settings.ranks_high_to_low[0] || ""));
    setGender((current) => (current && settings.genders.includes(current) ? current : settings.genders[0] || ""));
  }, [defaultBuilding, settings]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const trimmedBuilding = selectedBuilding.trim();
    const roomNumber = Number(roomNum);
    const bedCount = Number(beds);

    if (!trimmedBuilding || !roomNum.trim() || !beds.trim() || !selectedRank || !selectedGender) {
      setStatus("error"); setMessage("יש למלא את כל השדות"); return;
    }
    if (!Number.isInteger(roomNumber) || roomNumber <= 0) {
      setStatus("error"); setMessage("מספר חדר חייב להיות מספר שלם גדול מאפס"); return;
    }
    if (!Number.isInteger(bedCount) || bedCount <= 0) {
      setStatus("error"); setMessage("מספר מיטות חייב להיות מספר שלם גדול מאפס"); return;
    }
    setStatus("loading"); setMessage("");
    try {
      await createRoom({
        building_name: trimmedBuilding,
        room_number: roomNumber,
        number_of_beds: bedCount,
        room_rank: selectedRank,
        gender: selectedGender,
      });
      setStatus("success"); setMessage("החדר נוסף בהצלחה");
      toast.success("החדר נוסף בהצלחה");
      setTimeout(onDone, 1200);
    } catch (err) {
      setStatus("error"); setMessage(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <AlertBox status={status} message={message} />

      <div className="space-y-5">
        {/* Building & Room Number row */}
        <div className="grid grid-cols-2 gap-4">
          <FormField label="שם מבנה" icon={<IconBuilding size={15} />} htmlFor="building">
            {buildings.length > 0 ? (
              <Select value={selectedBuilding} onValueChange={setBuilding}>
                <SelectTrigger id="building" className="w-full">
                  <SelectValue placeholder="בחר מבנה" />
                </SelectTrigger>
                <SelectContent>
                  {buildings.map((item) => (
                    <SelectItem key={item} value={item}>
                      {buildingHe(item)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input id="building" placeholder="לדוגמה: A" value={building} onChange={(e) => setBuilding(e.target.value)} />
            )}
          </FormField>
          <FormField label="מספר חדר" icon={<IconHash size={15} />} htmlFor="roomNum">
            <Input id="roomNum" type="number" min={1} step={1} placeholder="101" value={roomNum} onChange={(e) => setRoomNum(e.target.value)} />
          </FormField>
        </div>

        {/* Beds */}
        <FormField label="מספר מיטות" icon={<IconBed size={15} />} htmlFor="beds">
          <Input id="beds" type="number" min={1} step={1} placeholder="4" value={beds} onChange={(e) => setBeds(e.target.value)} />
        </FormField>

        {/* Rank & Gender row */}
        <div className="grid grid-cols-2 gap-4">
          <FormField label="דרגת חדר" icon={<IconCrown size={15} />}>
            <Select value={selectedRank} onValueChange={setRank}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="בחר דרגת חדר" />
              </SelectTrigger>
              <SelectContent>
                {ranks.map((r) => <SelectItem key={r} value={r}>{rankHe(r)}</SelectItem>)}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="מגדר" icon={<IconGender size={15} />}>
            <Select value={selectedGender} onValueChange={setGender}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="בחר מגדר" />
              </SelectTrigger>
              <SelectContent>
                {genders.map((g) => <SelectItem key={g} value={g}>{genderHe(g)}</SelectItem>)}
              </SelectContent>
            </Select>
          </FormField>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-7 flex justify-center border-t pt-5">
        <Button
          type="submit"
          disabled={status === "loading"}
          className="w-full max-w-[520px]"
        >
          {status === "loading" ? (
            <>
              <motion.div
                className="h-4 w-4 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground"
                animate={{ rotate: 360 }}
                transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
              />
              שומר...
            </>
          ) : (
            "הוסף חדר"
          )}
        </Button>
      </div>
    </form>
  );
}

function RoomCSV({ settings, status, message, setStatus, setMessage, onDone }: {
  settings: AppSettings | null;
  status: Status; message: string; setStatus: (s: Status) => void; setMessage: (m: string) => void;
  onDone: () => void;
}) {
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [fileName, setFileName] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [showTemplate, setShowTemplate] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const exampleRows = useMemo<Array<Record<(typeof TEMPLATE_COLUMNS)[number]["key"], string>>>(() => {
    const sampleBuildings = settings?.buildings ?? [];
    const sampleRanks = settings?.ranks_high_to_low ?? [];
    const sampleGenders = settings?.genders ?? [];
    const sampleDepartments = settings?.departments ?? [];

    return [
      {
        building_name: buildingHe(sampleBuildings[0] || "A"),
        room_number: "101",
        number_of_beds: "4",
        room_rank: rankHe(sampleRanks[0] || "VP"),
        gender: genderHe(sampleGenders[0] || "M"),
        occupant_ids: "101,102",
        designated_department: deptHe(sampleDepartments[0] || ""),
      },
      {
        building_name: buildingHe(sampleBuildings[1] || sampleBuildings[0] || "B"),
        room_number: "202",
        number_of_beds: "3",
        room_rank: rankHe(sampleRanks[Math.max(sampleRanks.length - 1, 0)] || "Junior"),
        gender: genderHe(sampleGenders[Math.min(1, Math.max(sampleGenders.length - 1, 0))] || "F"),
        occupant_ids: "",
        designated_department: "",
      },
    ];
  }, [settings]);

  async function processFile(file: File) {
    setStatus("idle"); setMessage(""); setFileName(file.name);
    try {
      const parsed = await parseFile(file);
      if (parsed.length === 0) { setMessage("הקובץ ריק או לא בפורמט תקין"); setStatus("error"); return; }
      const headers = Object.keys(parsed[0]);
      const missing = REQUIRED_COLUMNS.filter((col) => !headers.includes(col));
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
        downloadBase64Excel(result.warnings.excel_base64, "אנשים_לא_מזוהים");
        toast.error(`${result.warnings.message} — קובץ אקסל עם הפרטים הורד אוטומטית`, {
          autoClose: 10000,
        });
      }
      setTimeout(onDone, 700);
    } catch (err) { setStatus("error"); setMessage(err instanceof Error ? err.message : String(err)); toast.error("שגיאה בטעינת חדרים"); }
  }

  return (
    <>
      <DropZone isDragging={isDragging} fileName={fileName} fileRef={fileRef} accept=".csv,.xlsx,.xls"
        onFile={processFile} setIsDragging={setIsDragging} />
      {rows.length === 0 && status !== "error" && (
        <div className="mb-4">
          <button
            type="button"
            onClick={() => setShowTemplate((current) => !current)}
            className="mb-2 flex w-full items-center justify-between rounded-xl border border-border/70 bg-background/70 px-3 py-2 text-right transition-colors hover:bg-accent/40"
          >
            <span className="text-xs font-semibold text-foreground">תבנית קובץ לדוגמה</span>
            <motion.span
              animate={{ rotate: showTemplate ? 180 : 0 }}
              transition={{ duration: 0.18 }}
              className="text-muted-foreground"
            >
              <IconChevronDown size={15} />
            </motion.span>
          </button>
          <AnimatePresence initial={false}>
            {showTemplate ? (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.14, ease: "easeOut" }}
                className="overflow-hidden"
              >
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {TEMPLATE_COLUMNS.map((column) => (
                          <TableHead key={column.key} className="text-right px-3 py-2 text-[11px]">
                            {column.label}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {exampleRows.map((row, index) => (
                        <TableRow key={`example-${index}`}>
                          {TEMPLATE_COLUMNS.map((column) => (
                            <TableCell key={column.key} className="px-3 py-1.5 text-[11px] text-muted-foreground">
                              {formatRoomCell(column.key, row[column.key] ?? "")}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      )}
      <AlertBox status={status} message={message} />
      {rows.length > 0 && (
        <div className="flex justify-center pt-4 border-t">
          <Button onClick={handleSubmit} disabled={status === "loading"} className="w-full max-w-[520px]">
            <IconUpload size={15} />
            {status === "loading" ? "טוען..." : `טען ${rows.length} חדרים`}
          </Button>
        </div>
      )}
    </>
  );
}

/* --- Shared sub-components --- */

function Chooser({ onCSV, onForm }: { onCSV: () => void; onForm: () => void }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <button type="button" onClick={onForm} className="text-right">
        <Card className="cursor-pointer border-2 bg-card p-6 flex flex-col gap-4 transition-colors duration-150 hover:border-primary">
          <div className="h-11 w-11 rounded-xl flex items-center justify-center bg-primary/10 text-primary">
            <IconDoor size={22} />
          </div>
          <div>
            <p className="text-[15px] font-bold text-foreground">הוספה ידנית</p>
            <p className="text-xs mt-1 text-muted-foreground">מילוי טופס להוספת חדר בודד</p>
          </div>
        </Card>
      </button>
      <button type="button" onClick={onCSV} className="text-right">
        <Card className="cursor-pointer border-2 bg-card p-6 flex flex-col gap-4 transition-colors duration-150 hover:border-primary">
          <div className="h-11 w-11 rounded-xl flex items-center justify-center bg-primary/10 text-primary">
            <IconUpload size={22} />
          </div>
          <div>
            <p className="text-[15px] font-bold text-foreground">טעינה מקובץ</p>
            <p className="text-xs mt-1 text-muted-foreground">העלאת CSV או Excel עם מספר חדרים</p>
          </div>
        </Card>
      </button>
    </div>
  );
}

function FormField({ label, icon, htmlFor, children }: {
  label: string; icon: React.ReactNode; htmlFor?: string; children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor} className="text-xs font-semibold text-muted-foreground gap-1.5">
        <span className="text-muted-foreground/70">{icon}</span>
        {label}
      </Label>
      {children}
    </div>
  );
}

function AlertBox({ status, message }: { status: Status; message: string }) {
  if (status === "error" && message) return (
    <motion.div
      initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15 }}
      className="rounded-lg px-4 py-3 text-[13px] flex items-start gap-2.5 mb-5 border border-destructive/30 bg-destructive/10 text-destructive"
    >
      <IconAlertCircle size={16} className="shrink-0 mt-0.5" /><span>{message}</span>
    </motion.div>
  );
  if (status === "success" && message) return (
    <motion.div
      initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15 }}
      className="rounded-lg px-4 py-3 text-[13px] flex items-start gap-2.5 mb-5 border border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400"
    >
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
    <label
      htmlFor="rooms-upload-input"
      role="button"
      tabIndex={0}
      className={`rounded-xl p-8 flex flex-col items-center justify-center space-y-3 border-2 border-dashed cursor-pointer mb-5 transition-colors duration-150 ${
        isDragging
          ? "border-primary bg-primary/5"
          : fileName
            ? "border-muted-foreground/40 bg-muted"
            : "border-border bg-muted hover:border-primary hover:bg-primary/5"
      }`}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          fileRef.current?.click();
        }
      }}
      onDragEnter={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files?.[0]; if (f) onFile(f); }}
    >
      <input
        id="rooms-upload-input"
        ref={fileRef}
        type="file"
        accept={accept}
        onClick={(event) => {
          (event.currentTarget as HTMLInputElement).value = "";
        }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
        className="sr-only"
      />
      {fileName ? (
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.15 }} className="flex flex-col items-center">
          <div className="h-12 w-12 rounded-xl flex items-center justify-center mb-2 bg-primary/10 text-primary">
            <IconUpload size={24} />
          </div>
          <p className="text-sm font-semibold text-foreground">{fileName}</p>
          <p className="text-xs mt-0.5 text-muted-foreground">לחץ להחלפת קובץ</p>
        </motion.div>
      ) : (
        <>
          <div className="h-12 w-12 rounded-xl flex items-center justify-center bg-muted text-muted-foreground">
            <IconUpload size={24} />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-muted-foreground">גרור ושחרר קובץ כאן</p>
            <p className="text-xs mt-0.5 text-muted-foreground">CSV, XLSX, XLS</p>
          </div>
        </>
      )}
    </label>
  );
}
