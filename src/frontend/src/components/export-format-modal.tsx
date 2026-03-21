"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { IconDownload } from "@/components/icons";
import { cn } from "@/lib/utils";

interface ExportFormatModalProps {
  open: boolean;
  onClose: () => void;
  onExportVisual: () => void;
  onExportFlat: () => void;
}

/** Small JSX illustration of the columnar visual format. */
function VisualPreview() {
  return (
    <div className="flex flex-col gap-[3px] w-full">
      <div className="h-[10px] rounded-[2px] bg-[#1F4E79]" />
      <div className="flex gap-[3px]">
        <div className="flex-1 h-[8px] rounded-[2px] bg-[#2E75B5]" />
        <div className="flex-1 h-[8px] rounded-[2px] bg-[#2E75B5]" />
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex gap-[3px]">
          <div className="flex-1 h-[7px] rounded-[1px] bg-[#D6E4F0]" />
          <div className="flex-1 h-[7px] rounded-[1px] bg-[#D6E4F0]" />
        </div>
      ))}
      <div className="h-[4px]" />
      <div className="h-[10px] rounded-[2px] bg-[#548235]" />
      <div className="h-[8px] rounded-[2px] bg-[#548235] opacity-70" />
      {[0, 1].map((i) => (
        <div key={i} className="h-[7px] rounded-[1px] bg-[#D9E8CB]" />
      ))}
    </div>
  );
}

/** Small JSX illustration of the flat data-table format. */
function FlatPreview() {
  return (
    <div className="flex flex-col gap-[2px] w-full">
      <div className="flex gap-[2px]">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex-1 h-[9px] rounded-[1px] bg-[#374151]" />
        ))}
      </div>
      {[0, 1, 2, 3, 4].map((r) => (
        <div key={r} className="flex gap-[2px]">
          {[0, 1, 2, 3, 4].map((c) => (
            <div key={c} className={cn("flex-1 h-[7px] rounded-[1px]", r % 2 === 0 ? "bg-gray-100 dark:bg-gray-800" : "bg-gray-200 dark:bg-gray-700")} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function ExportFormatModal({ open, onClose, onExportVisual, onExportFlat }: ExportFormatModalProps) {
  const [selected, setSelected] = useState<"visual" | "flat" | null>(null);

  function handleExport() {
    if (selected === "visual") onExportVisual();
    else if (selected === "flat") onExportFlat();
    setSelected(null);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) { setSelected(null); onClose(); } }}>
      <DialogContent className="sm:max-w-[460px] gap-0 p-0">
        <DialogHeader className="px-6 pt-5 pb-4">
          <DialogTitle>ייצוא לאקסל</DialogTitle>
        </DialogHeader>

        <div className="px-6 pb-2">
          <p className="text-sm text-muted-foreground mb-4">בחר את פורמט הייצוא:</p>
          <div className="grid grid-cols-2 gap-3">
            {/* Visual format card */}
            <button
              type="button"
              onClick={() => setSelected("visual")}
              className={cn(
                "flex flex-col items-center gap-3 rounded-lg border-2 p-4 text-center transition-colors cursor-pointer",
                selected === "visual"
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/40",
              )}
            >
              <div className="w-full px-2">
                <VisualPreview />
              </div>
              <div>
                <p className="text-sm font-semibold">תצוגה ויזואלית</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  מקובץ לפי מגדר ומבנה, צבעוני
                </p>
              </div>
            </button>

            {/* Flat format card */}
            <button
              type="button"
              onClick={() => setSelected("flat")}
              className={cn(
                "flex flex-col items-center gap-3 rounded-lg border-2 p-4 text-center transition-colors cursor-pointer",
                selected === "flat"
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/40",
              )}
            >
              <div className="w-full px-2">
                <FlatPreview />
              </div>
              <div>
                <p className="text-sm font-semibold">טבלת נתונים</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  שורה לכל חדר, ניתן להעלאה חזרה
                </p>
              </div>
            </button>
          </div>
        </div>

        <div className="px-6 py-4">
          <Button
            className="w-full"
            disabled={!selected}
            onClick={handleExport}
          >
            <IconDownload size={15} />
            ייצוא
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
