"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "react-toastify";
import { AppSettings, createPersonnel, getSettings, uploadPersonnelFile } from "@/lib/api";
import { deptHe, genderHe, rankHe } from "@/lib/hebrew";
import {
  IconAlertCircle,
  IconCheck,
  IconChevronDown,
  IconUpload,
  IconUserPlus,
  IconX,
} from "./icons";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Status = "idle" | "loading" | "success" | "error";
type View = "chooser" | "form" | "csv";

const TEMPLATE_COLUMNS = [
  { key: "person_id", label: "מספר אישי" },
  { key: "full_name", label: "שם מלא" },
  { key: "department", label: "זירה" },
  { key: "gender", label: "מגדר" },
  { key: "rank", label: "דרגה" },
] as const;

type TemplateKey = (typeof TEMPLATE_COLUMNS)[number]["key"];

const stepTransition = { duration: 0.15, ease: "easeOut" as const };

interface AddPersonnelModalProps {
  open: boolean;
  onClose: () => void;
  onUploaded?: () => Promise<void> | void;
  initialView?: View;
}

export function AddPersonnelModal({
  open,
  onClose,
  onUploaded,
  initialView = "chooser",
}: AddPersonnelModalProps) {
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
    setView(initialView);
    setStatus("idle");
    setMessage("");
    onClose();
  }, [initialView, onClose]);

  const goBack = useCallback(() => {
    setView("chooser");
    setStatus("idle");
    setMessage("");
  }, []);

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) handleClose();
      }}
    >
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
                {view === "chooser" ? "הוספת כוח אדם" : view === "form" ? "אדם חדש" : "טעינה מקובץ"}
              </DialogTitle>
              <DialogDescription className="sr-only">
                הוספת אדם חדש למערכת באופן ידני או מקובץ
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
                <PersonForm
                  settings={settings}
                  status={status}
                  message={message}
                  setStatus={setStatus}
                  setMessage={setMessage}
                  onDone={async () => {
                    if (onUploaded) await onUploaded();
                    handleClose();
                  }}
                />
              </motion.div>
            )}
            {view === "csv" && (
              <motion.div key="csv" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={stepTransition}>
                <PersonCSV
                  settings={settings}
                  status={status}
                  message={message}
                  setStatus={setStatus}
                  setMessage={setMessage}
                  onDone={async () => {
                    if (onUploaded) await onUploaded();
                    handleClose();
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* --- Chooser --- */

function Chooser({ onCSV, onForm }: { onCSV: () => void; onForm: () => void }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <button type="button" onClick={onForm} className="text-right">
        <Card className="cursor-pointer border-2 bg-card p-6 flex flex-col gap-4 transition-colors duration-150 hover:border-primary">
          <div className="h-11 w-11 rounded-xl flex items-center justify-center bg-primary/10 text-primary">
            <IconUserPlus size={22} />
          </div>
          <div>
            <p className="text-[15px] font-bold text-foreground">הוספה ידנית</p>
            <p className="text-xs mt-1 text-muted-foreground">מילוי טופס להוספת אדם בודד</p>
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
            <p className="text-xs mt-1 text-muted-foreground">העלאת CSV או Excel עם מספר אנשים</p>
          </div>
        </Card>
      </button>
    </div>
  );
}

/* --- Manual Person Form --- */

function PersonForm({
  status,
  message,
  setStatus,
  setMessage,
  onDone,
  settings,
}: {
  status: Status;
  message: string;
  setStatus: (s: Status) => void;
  setMessage: (m: string) => void;
  onDone: () => void;
  settings: AppSettings | null;
}) {
  const [personId, setPersonId] = useState("");
  const [fullName, setFullName] = useState("");
  const [department, setDepartment] = useState("");
  const [rank, setRank] = useState("");
  const [gender, setGender] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => { clearTimeout(timerRef.current); }, []);

  const departments = settings?.departments ?? [];
  const ranks = settings?.ranks_high_to_low ?? [];
  const genders = settings?.genders ?? [];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const trimmedId = personId.trim();

    if (!trimmedId) {
      setStatus("error"); setMessage("יש להזין מספר אישי"); return;
    }

    setStatus("loading"); setMessage("");
    const toVal = (v: string) => v === "__none__" ? "" : v;
    try {
      await createPersonnel({
        person_id: trimmedId,
        full_name: fullName.trim(),
        department: toVal(department),
        gender: toVal(gender),
        rank: toVal(rank),
      });
      setStatus("success"); setMessage("האדם נוסף בהצלחה");
      toast.success("האדם נוסף בהצלחה");
      timerRef.current = setTimeout(onDone, 1200);
    } catch (err) {
      setStatus("error"); setMessage(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <AlertBox status={status} message={message} />

      <div className="space-y-5">
        {/* ID & Name row */}
        <div className="grid grid-cols-2 gap-4">
          <FormField label="מספר אישי" htmlFor="personId">
            <Input id="personId" placeholder="לדוגמה: 5001" value={personId} onChange={(e) => setPersonId(e.target.value)} />
          </FormField>
          <FormField label="שם מלא" htmlFor="fullName">
            <Input id="fullName" placeholder="לדוגמה: ישראל ישראלי" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </FormField>
        </div>

        {/* Department */}
        <FormField label="זירה (אופציונלי)">
          {departments.length > 0 ? (
            <Select value={department} onValueChange={setDepartment}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="ללא" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">ללא</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d} value={d}>{deptHe(d)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input placeholder="לדוגמה: הנהלה" value={department} onChange={(e) => setDepartment(e.target.value)} />
          )}
        </FormField>

        {/* Rank & Gender row */}
        <div className="grid grid-cols-2 gap-4">
          <FormField label="דרגה (אופציונלי)">
            <Select value={rank} onValueChange={setRank}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="ללא" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">ללא</SelectItem>
                {ranks.map((r) => <SelectItem key={r} value={r}>{rankHe(r)}</SelectItem>)}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="מגדר (אופציונלי)">
            <Select value={gender} onValueChange={setGender}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="ללא" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">ללא</SelectItem>
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
          className="w-full max-w-[520px] gap-2"
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
            <>
              <IconUserPlus size={15} />
              הוסף אדם
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

/* --- CSV Upload --- */

function PersonCSV({
  settings,
  status,
  message,
  setStatus,
  setMessage,
  onDone,
}: {
  settings: AppSettings | null;
  status: Status;
  message: string;
  setStatus: (s: Status) => void;
  setMessage: (m: string) => void;
  onDone: () => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [showTemplate, setShowTemplate] = useState(true);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const templateRows = useMemo<Array<Record<TemplateKey, string>>>(() => {
    const depts = settings?.departments ?? [];
    const genders = settings?.genders ?? [];
    const ranks = settings?.ranks_high_to_low ?? [];
    return [
      {
        person_id: "5001",
        full_name: "אביגיל סער",
        department: deptHe(depts[0] || "הנהלה"),
        gender: genderHe(genders[0] || "בנות"),
        rank: rankHe(ranks[2] || "מנהל"),
      },
      {
        person_id: "5002",
        full_name: "דניאל רון",
        department: deptHe(depts[1] || "מכירות"),
        gender: genderHe(genders[Math.min(1, Math.max(genders.length - 1, 0))] || "בנים"),
        rank: rankHe(ranks[3] || "זוטר"),
      },
    ];
  }, [settings]);

  const processFile = useCallback((file: File) => {
    setSelectedFile(file);
    setStatus("idle");
    setMessage("");
  }, [setStatus, setMessage]);

  const handleUpload = useCallback(async () => {
    if (!selectedFile) {
      setStatus("error");
      setMessage("יש לבחור קובץ לפני טעינה.");
      return;
    }
    setStatus("loading");
    setMessage("");
    try {
      const result = await uploadPersonnelFile(selectedFile);
      setStatus("success");
      setMessage(`נטענו ${result.count} אנשי כוח אדם`);
      toast.success(`נטענו ${result.count} אנשי כוח אדם`);
      setTimeout(onDone, 700);
    } catch (error) {
      const nextMessage =
        error instanceof Error ? error.message : "שגיאה בטעינת כוח אדם";
      setStatus("error");
      setMessage(nextMessage);
      toast.error(nextMessage);
    }
  }, [onDone, selectedFile, setStatus, setMessage]);

  return (
    <>
      <DropZone
        isDragging={isDragging}
        fileName={selectedFile?.name || ""}
        fileRef={fileRef}
        accept=".csv,.xlsx,.xls"
        onFile={processFile}
        setIsDragging={setIsDragging}
      />

      {!selectedFile && status !== "error" ? (
        <div className="mb-4">
          <button
            type="button"
            onClick={() => setShowTemplate((current) => !current)}
            className="mb-2 flex w-full items-center justify-between rounded-xl border border-border/70 bg-background/70 px-3 py-2 text-right transition-colors hover:bg-accent/40"
          >
            <span className="text-xs font-semibold text-foreground">
              תבנית קובץ לדוגמה
            </span>
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
                          <TableHead
                            key={column.key}
                            className="text-right px-3 py-2 text-[11px]"
                          >
                            {column.label}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {templateRows.map((row, index) => (
                        <TableRow key={`example-${index}`}>
                          {TEMPLATE_COLUMNS.map((column) => (
                            <TableCell
                              key={column.key}
                              className="px-3 py-1.5 text-[11px] text-muted-foreground"
                            >
                              {row[column.key] ?? ""}
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
      ) : null}

      <AlertBox status={status} message={message} />

      {selectedFile ? (
        <div className="flex justify-center pt-4 border-t">
          <Button
            onClick={handleUpload}
            disabled={status === "loading"}
            className="w-full max-w-[520px]"
          >
            <IconUpload size={15} />
            {status === "loading" ? "טוען..." : "טען כוח אדם"}
          </Button>
        </div>
      ) : null}
    </>
  );
}

/* --- Shared sub-components --- */

function FormField({ label, htmlFor, children }: {
  label: string; htmlFor?: string; children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor} className="text-xs font-semibold text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

function AlertBox({ status, message }: { status: Status; message: string }) {
  if (status === "error" && message) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.15 }}
        className="rounded-lg px-4 py-3 text-[13px] flex items-start gap-2.5 mb-5 border border-destructive/30 bg-destructive/10 text-destructive"
      >
        <IconAlertCircle size={16} className="shrink-0 mt-0.5" />
        <span>{message}</span>
      </motion.div>
    );
  }
  if (status === "success" && message) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.15 }}
        className="rounded-lg px-4 py-3 text-[13px] flex items-start gap-2.5 mb-5 border border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400"
      >
        <IconCheck size={16} className="shrink-0 mt-0.5" />
        <span>{message}</span>
      </motion.div>
    );
  }
  return null;
}

function DropZone({
  isDragging,
  fileName,
  fileRef,
  accept,
  onFile,
  setIsDragging,
}: {
  isDragging: boolean;
  fileName: string;
  fileRef: React.RefObject<HTMLInputElement | null>;
  accept: string;
  onFile: (file: File) => void;
  setIsDragging: (value: boolean) => void;
}) {
  return (
    <label
      htmlFor="personnel-upload-input"
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
      onDragEnter={(event) => {
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        setIsDragging(false);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragging(false);
        const droppedFile = event.dataTransfer.files?.[0];
        if (droppedFile) onFile(droppedFile);
      }}
    >
      <input
        id="personnel-upload-input"
        ref={fileRef}
        type="file"
        accept={accept}
        onClick={(event) => {
          (event.currentTarget as HTMLInputElement).value = "";
        }}
        onChange={(event) => {
          const pickedFile = event.target.files?.[0];
          if (pickedFile) onFile(pickedFile);
        }}
        className="sr-only"
      />
      {fileName ? (
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.15 }}
          className="flex flex-col items-center"
        >
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
            <p className="text-sm font-semibold text-muted-foreground">
              גרור ושחרר קובץ כאן
            </p>
            <p className="text-xs mt-0.5 text-muted-foreground">CSV, XLSX, XLS</p>
          </div>
        </>
      )}
    </label>
  );
}
