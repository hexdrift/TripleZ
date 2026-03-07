"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "react-toastify";
import { AppSettings, getSettings, uploadPersonnelFile } from "@/lib/api";
import { deptHe, genderHe, rankHe } from "@/lib/hebrew";
import {
  IconAlertCircle,
  IconCheck,
  IconChevronDown,
  IconUpload,
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
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Status = "idle" | "loading" | "success" | "error";

const TEMPLATE_COLUMNS = [
  { key: "person_id", label: "מזהה" },
  { key: "full_name", label: "שם מלא" },
  { key: "department", label: "זירה" },
  { key: "gender", label: "מגדר" },
  { key: "rank", label: "דרגה" },
] as const;

type TemplateKey = (typeof TEMPLATE_COLUMNS)[number]["key"];

interface AddPersonnelModalProps {
  open: boolean;
  onClose: () => void;
  onUploaded?: () => Promise<void> | void;
}

export function AddPersonnelModal({
  open,
  onClose,
  onUploaded,
}: AddPersonnelModalProps) {
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [showTemplate, setShowTemplate] = useState(true);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

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
    setStatus("idle");
    setMessage("");
    setIsDragging(false);
    setShowTemplate(true);
    setSelectedFile(null);
    onClose();
  }, [onClose]);

  const templateRows = useMemo<Array<Record<TemplateKey, string>>>(() => {
    const departments = settings?.departments ?? [];
    const genders = settings?.genders ?? [];
    const ranks = settings?.ranks_high_to_low ?? [];
    return [
      {
        person_id: "5001",
        full_name: "אביגיל סער",
        department: deptHe(departments[0] || "הנהלה"),
        gender: genderHe(genders[0] || "בנות"),
        rank: rankHe(ranks[2] || "מנהל"),
      },
      {
        person_id: "5002",
        full_name: "דניאל רון",
        department: deptHe(departments[1] || "מכירות"),
        gender: genderHe(genders[Math.min(1, Math.max(genders.length - 1, 0))] || "בנים"),
        rank: rankHe(ranks[3] || "זוטר"),
      },
    ];
  }, [settings]);

  const processFile = useCallback((file: File) => {
    setSelectedFile(file);
    setStatus("idle");
    setMessage("");
  }, []);

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
      if (onUploaded) {
        await onUploaded();
      }
      setStatus("success");
      setMessage(`נטענו ${result.count} אנשי כוח אדם`);
      toast.success(`נטענו ${result.count} אנשי כוח אדם`);
      setTimeout(() => {
        handleClose();
      }, 700);
    } catch (error) {
      const nextMessage =
        error instanceof Error ? error.message : "שגיאה בטעינת כוח אדם";
      setStatus("error");
      setMessage(nextMessage);
      toast.error(nextMessage);
    }
  }, [handleClose, onUploaded, selectedFile]);

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
        <div className="px-6 pt-5 pb-3 flex items-start justify-between">
          <DialogHeader className="text-right gap-0">
            <DialogTitle className="text-xl font-bold text-foreground">
              טעינת כוח אדם
            </DialogTitle>
            <DialogDescription className="sr-only">
              העלאת קובץ כוח אדם בפורמט CSV או Excel
            </DialogDescription>
          </DialogHeader>
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

        <div className="px-6 py-5 overflow-y-auto max-h-[calc(100vh-220px)]">
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
        </div>
      </DialogContent>
    </Dialog>
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
