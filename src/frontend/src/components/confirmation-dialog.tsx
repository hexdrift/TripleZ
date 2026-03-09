"use client";

import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { IconX } from "@/components/icons";

interface ConfirmationDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  confirmVariant?: "default" | "destructive";
  confirmIcon?: ReactNode;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
}

export function ConfirmationDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "ביטול",
  confirmVariant = "destructive",
  confirmIcon,
  onConfirm,
  onOpenChange,
}: ConfirmationDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[420px] p-0" showCloseButton={false}>
        <DialogHeader className="px-6 pt-6 text-right">
          <DialogTitle className="text-lg font-semibold text-foreground">{title}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground whitespace-pre-line">{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="grid grid-cols-2 gap-2 border-t px-5 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="gap-2">
            <IconX size={14} />
            {cancelLabel}
          </Button>
          <Button variant={confirmVariant} onClick={onConfirm} className="gap-2">
            {confirmIcon}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
