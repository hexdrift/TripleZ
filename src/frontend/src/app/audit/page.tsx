"use client";

import { useEffect, useState } from "react";
import { AuditLogEntry, getAuditLog, clearAuditLog, deleteAuditEntry, revertAuditEntry } from "@/lib/api";
import { Breadcrumb } from "@/components/breadcrumb";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  IconCheck,
  IconChevronDown,
  IconClipboardList,
  IconCopy,
  IconRefresh,
  IconSearch,
  IconUserMinus,
  IconUserPlus,
  IconTrash,
} from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "react-toastify";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { useAppData } from "@/components/app-shell";

const ACTION_LABELS: Record<string, string> = {
  personnel_sync: "סנכרון כוח אדם",
  personnel_sync_failed: "סנכרון נכשל",
  personnel_load: "טעינת כוח אדם",
  personnel_upload: "העלאת כוח אדם",
  personnel_create: "הוספת איש",
  rooms_load: "טעינת חדרים",
  rooms_upload: "העלאת חדרים",
  rooms_upsert: "עדכון חדר",
  room_designation_set: "שינוי ייעוד חדר",
  auto_assign: "שיבוץ אוטומטי",
  settings_update: "עדכון הגדרות",
  reset_all: "איפוס מערכת",
  reset_data: "איפוס נתונים",
  delete_person: "מחיקת איש",
  delete_room: "מחיקת חדר",
  unassign: "הסרה מחדר",
  swap: "החלפת חדרים",
  move: "העברה בין חדרים",
  assign_to_room: "שיבוץ ידני לחדר",
  setup_import: "ייבוא הגדרות",
  release_reservation: "שחרור שמירת מיטה",
};

const PUSH_ACTIONS = new Set([
  "personnel_sync",
  "personnel_load",
  "personnel_upload",
]);

const ROLE_LABELS: Record<string, string> = {
  admin: "מנהל",
  manager: "מחלקה",
  system: "מערכת",
};

const ENTITY_TYPE_LABELS: Record<string, string> = {
  personnel: "כוח אדם",
  rooms: "חדרים",
  settings: "הגדרות",
  room: "חדר",
  person: "אדם",
  saved_assignment: "שמירת מיטה",
};

const ENTITY_ID_LABELS: Record<string, string> = {
  runtime: "הגדרות ריצה",
  all: "הכל",
  bulk: "קבוצתי",
};

const DETAIL_KEY_LABELS: Record<string, string> = {
  count: 'כמות רשומות',
  changed: 'בוצע שינוי',
  room_state_changed: 'שינוי מצב חדרים',
  trigger: 'מקור',
  ok: 'הצלחה',
  assigned_count: 'שובצו',
  already_assigned_count: 'כבר משובצים',
  failed_count: 'נכשלו',
  failed: 'פרטי כשלון',
  message: 'הודעה',
  personnel_url_configured: 'כתובת מקור מוגדרת',
  sync_interval_seconds: 'תדירות סנכרון (שניות)',
  sync_paused: 'סנכרון מושהה',
  auto_assign_policy: 'מדיניות שיבוץ',
  integrity_report: 'דוח תקינות',
  warnings: 'אזהרות',
  bed_reservation_policy: 'מדיניות שמירת מיטות',
  scope: 'טווח',
  room_count: 'מספר חדרים',
  assigned: 'שובצו',
  already_assigned: 'כבר משובצים',
  removed_occupants: 'הוסרו משיבוץ',
  auto_reassigned: 'הוחזרו לשיבוץ',
  updated: 'עודכנו',
  added: 'נוספו',
  total_rooms: 'סה"כ חדרים',
  target_building: 'מבנה יעד',
  target_room_number: 'חדר יעד',
  person_id: 'מספר אישי',
  person_id_a: 'מספר אישי א',
  person_id_b: 'מספר אישי ב',
  building_name: 'מבנה',
  room_number: 'חדר',
  has_changes: 'בוצע שינוי',
  removed_personnel_count: 'הוסרו מכוח אדם',
  removed_room_count: 'חדרים שהוסרו',
  cleared_room_designations_count: 'ייעודי חדרים שנוקו',
  removed_unknown_occupants_count: 'שיבוצים לא ידועים שהוסרו',
  removed_incompatible_occupants_count: 'שיבוצים לא תואמים שהוסרו',
  removed_duplicate_assignments_count: 'שיבוצים כפולים שהוסרו',
  trimmed_over_capacity_count: 'חריגות קיבולת שתוקנו',
};

const DETAIL_VALUE_LABELS: Record<string, string> = {
  manual: 'ידני',
  auto: 'אוטומטי',
  api: 'ממשק תכנות',
  upload: 'העלאה',
  sync: 'סנכרון',
  all: 'הכל',
  reserve: 'שמורה',
  best_effort: 'לא שמורה',
  department_first: 'מחלקה קודם',
  true: 'כן',
  false: 'לא',
};

const TABLE_COL_LABELS: Record<string, string> = {
  person_id: 'מספר אישי',
  full_name: 'שם',
  department: 'מחלקה',
  gender: 'מגדר',
  rank: 'דרגה',
  building_name: 'מבנה',
  room_number: 'חדר',
  room_rank_used: 'דרגת חדר',
  error_code: 'קוד שגיאה',
  error_message: 'הודעת שגיאה',
};

const TABLE_VISIBLE_COLS: Record<string, string[]> = {
  assigned: ['full_name', 'department', 'building_name', 'room_number'],
  already_assigned: ['full_name', 'department', 'building_name', 'room_number'],
  failed: ['full_name', 'department', 'error_message'],
};

function actionLabel(action: string) {
  return ACTION_LABELS[action] || action;
}

function roleLabel(role: string) {
  return ROLE_LABELS[role] || role;
}

function entityTypeLabel(type: string) {
  return ENTITY_TYPE_LABELS[type] || type;
}

function entityIdLabel(id: string) {
  return ENTITY_ID_LABELS[id] || id;
}

function roleBadgeVariant(role: string): "default" | "secondary" | "destructive" {
  if (role === "admin") return "default";
  if (role === "system") return "secondary";
  return "secondary";
}

function formatTimestamp(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString("he-IL", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

function buildCopyText(entry: AuditLogEntry): string {
  const lines: string[] = [];
  lines.push(`פעולה: ${actionLabel(entry.action)}`);
  lines.push(`זמן: ${formatTimestamp(entry.created_at)}`);
  lines.push(`תפקיד: ${roleLabel(entry.actor_role)}${entry.actor_department ? ` / ${entry.actor_department}` : ""}`);
  lines.push(`הודעה: ${entry.message}`);
  if (entry.entity_type || entry.entity_id) {
    lines.push(`ישות: ${entityTypeLabel(entry.entity_type)}${entry.entity_id ? ` (${entityIdLabel(entry.entity_id)})` : ""}`);
  }
  const details = entry.details || {};
  const removed = (details.removed_occupants ?? []) as RemovedOccupant[];
  const reassigned = (details.auto_reassigned ?? []) as ReassignedEntry[];
  if (removed.length > 0) {
    lines.push("");
    lines.push(`הוסרו משיבוץ (${removed.length}):`);
    for (const p of removed) {
      lines.push(`  - ${p.full_name || p.person_id}${p.department ? ` (${p.department})` : ""} — מבנה ${p.building_name} חדר ${p.room_number}`);
    }
  }
  if (reassigned.length > 0) {
    lines.push("");
    lines.push(`הוחזרו לשיבוץ (${reassigned.length}):`);
    for (const p of reassigned) {
      lines.push(`  - ${p.full_name || p.person_id} — מבנה ${p.building_name} חדר ${p.room_number}`);
    }
  }
  const count = details.count as number | undefined;
  if (count !== undefined) {
    lines.push(`סה"כ רשומות: ${count}`);
  }
  return lines.join("\n");
}

export default function AuditPage() {
  const { auth } = useAppData();
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [spinning, setSpinning] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [revertTarget, setRevertTarget] = useState<AuditLogEntry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AuditLogEntry | null>(null);
  const isAdmin = auth.role === "admin";

  async function load() {
    setLoading(true);
    setSpinning(true);
    try {
      const data = await getAuditLog(200);
      setEntries(data.items);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
      setTimeout(() => setSpinning(false), 600);
    }
  }

  async function handleClearAll() {
    try {
      await clearAuditLog();
      setEntries([]);
      toast.success("היומן נוקה בהצלחה");
    } catch {
      toast.error("שגיאה בניקוי היומן");
    }
  }

  async function handleDeleteEntry(eventId: string) {
    try {
      await deleteAuditEntry(eventId);
      setEntries((prev) => prev.filter((e) => e.event_id !== eventId));
      toast.success("הרשומה נמחקה");
    } catch {
      toast.error("שגיאה במחיקת הרשומה");
    }
  }

  async function handleRevert(eventId: string) {
    try {
      const res = await revertAuditEntry(eventId);
      if (res.ok) {
        setEntries((prev) => prev.filter((e) => e.event_id !== eventId));
        toast.success("הפעולה בוטלה בהצלחה");
      } else {
        toast.error(res.detail || "שגיאה בביטול הפעולה");
      }
    } catch {
      toast.error("שגיאה בביטול הפעולה");
    }
  }

  function isRevertible(entry: AuditLogEntry): boolean {
    const details = entry.details || {};
    return details.previous_state != null || details.snapshot_event_id != null;
  }

  function isSnapshotRevert(entry: AuditLogEntry): boolean {
    return !!(entry.details || {}).snapshot_event_id;
  }

  function handleTrashClick(entry: AuditLogEntry) {
    if (isRevertible(entry)) {
      setRevertTarget(entry);
    } else {
      setDeleteTarget(entry);
    }
  }

  useEffect(() => { load(); }, []);

  const filtered = entries.filter((e) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      e.message.toLowerCase().includes(q) ||
      actionLabel(e.action).includes(q) ||
      e.action.toLowerCase().includes(q) ||
      roleLabel(e.actor_role).includes(q) ||
      e.actor_department.toLowerCase().includes(q) ||
      e.entity_id.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4">
      <Breadcrumb items={[{ label: "יומן פעולות", icon: <IconClipboardList size={15} /> }]} />

      <Card className="overflow-hidden border-border/70">
        {/* Toolbar */}
        <div className="flex items-center gap-2 sm:gap-3 border-b border-border/60 px-3 sm:px-4 py-3">
          <div className="relative flex-1 sm:max-w-xs">
            <IconSearch size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="חיפוש ביומן..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pr-8 text-sm"
            />
          </div>
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              const expandableIds = filtered.filter(e => Object.keys(e.details || {}).length > 0).map(e => e.event_id);
              if (expandedIds.size > 0) {
                setExpandedIds(new Set());
              } else {
                setExpandedIds(new Set(expandableIds));
              }
            }}
            className="shrink-0 h-8 w-8"
            title={expandedIds.size > 0 ? "כווץ הכל" : "הרחב הכל"}
          >
            <IconChevronDown size={15} className={cn("transition-transform duration-300", expandedIds.size > 0 && "rotate-180")} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={load}
            disabled={loading}
            className="shrink-0 h-8 w-8"
            title="רענן"
          >
            <IconRefresh size={15} className={cn("transition-transform duration-500", spinning && "animate-spin")} />
          </Button>
          {isAdmin && entries.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setConfirmClearOpen(true)}
              className="shrink-0 h-8 w-8 text-muted-foreground hover:text-destructive"
              title="נקה יומן"
            >
              <IconTrash size={15} />
            </Button>
          )}
        </div>

        {/* Results count */}
        {!loading && entries.length > 0 && (
          <div className="px-3 sm:px-4 py-2 border-b border-border/30 bg-muted/20">
            <span className="text-[11px] text-muted-foreground">
              {filtered.length === entries.length
                ? `${entries.length} רשומות`
                : `${filtered.length} מתוך ${entries.length} רשומות`}
            </span>
          </div>
        )}

        {/* Entries */}
        <div className="divide-y divide-border/40">
          {loading && entries.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
              טוען...
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
              {search ? "לא נמצאו תוצאות" : "אין רשומות ביומן"}
            </div>
          ) : (
            filtered.map((entry) => (
              <AuditRow
                key={entry.event_id}
                entry={entry}
                expanded={expandedIds.has(entry.event_id)}
                onToggle={() => setExpandedIds(prev => {
                  const next = new Set(prev);
                  if (next.has(entry.event_id)) next.delete(entry.event_id);
                  else next.add(entry.event_id);
                  return next;
                })}
                isAdmin={isAdmin}
                onTrashClick={() => handleTrashClick(entry)}
              />
            ))
          )}
        </div>
      </Card>
      <ConfirmationDialog
        open={confirmClearOpen}
        title="לנקות את היומן?"
        description="כל רשומות היומן יימחקו לצמיתות."
        confirmLabel="נקה"
        confirmIcon={<IconTrash size={14} />}
        onOpenChange={setConfirmClearOpen}
        onConfirm={() => {
          setConfirmClearOpen(false);
          handleClearAll();
        }}
      />
      {/* Revert confirmation dialog */}
      <ConfirmationDialog
        open={revertTarget !== null}
        title="לבטל פעולה זו?"
        description={
          revertTarget && isSnapshotRevert(revertTarget)
            ? `הפעולה "${actionLabel(revertTarget.action)}" תבוטל. המערכת תחזור למצב שהיה לפני הפעולה. שינויים שבוצעו לאחר מכן עלולים להיפגע.`
            : `הפעולה "${actionLabel(revertTarget?.action ?? "")}" תבוטל והרשומה תימחק מהיומן.`
        }
        confirmLabel="בטל פעולה"
        confirmIcon={<IconTrash size={14} />}
        onOpenChange={(open) => { if (!open) setRevertTarget(null); }}
        onConfirm={() => {
          if (revertTarget) handleRevert(revertTarget.event_id);
          setRevertTarget(null);
        }}
      />
      {/* Delete-only confirmation dialog (old entries without revert data) */}
      <ConfirmationDialog
        open={deleteTarget !== null}
        title="למחוק רשומה?"
        description="הרשומה תימחק מהיומן. הפעולה עצמה לא תבוטל (אין מידע לשחזור)."
        confirmLabel="מחק"
        confirmIcon={<IconTrash size={14} />}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        onConfirm={() => {
          if (deleteTarget) handleDeleteEntry(deleteTarget.event_id);
          setDeleteTarget(null);
        }}
      />
    </div>
  );
}

interface RemovedOccupant {
  person_id: string;
  full_name?: string;
  department?: string;
  building_name: string;
  room_number: number;
}

interface ReassignedEntry {
  person_id: string;
  full_name?: string;
  building_name: string;
  room_number: number;
}

function AuditRow({ entry, expanded, onToggle, isAdmin, onTrashClick }: { entry: AuditLogEntry; expanded: boolean; onToggle: () => void; isAdmin: boolean; onTrashClick: () => void }) {
  const [copied, setCopied] = useState(false);
  const details = entry.details || {};
  const removedOccupants = (details.removed_occupants ?? []) as RemovedOccupant[];
  const autoReassigned = (details.auto_reassigned ?? []) as ReassignedEntry[];
  const isPushEvent = PUSH_ACTIONS.has(entry.action);
  const hasDetails = Object.keys(details).length > 0;
  const hasPushDetails = removedOccupants.length > 0 || autoReassigned.length > 0;
  const count = (details.count as number) ?? null;
  const integrityReport = details.integrity_report as Record<string, unknown> | undefined;

  async function handleCopy(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(buildCopyText(entry));
      setCopied(true);
      toast.success("הועתק ללוח");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("שגיאה בהעתקה");
    }
  }

  return (
    <div
      className={cn(
        "px-3 sm:px-4 py-3 transition-colors",
        hasDetails && "cursor-pointer hover:bg-muted/30",
      )}
      onClick={() => hasDetails && onToggle()}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2 sm:gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            <Badge variant={roleBadgeVariant(entry.actor_role)} className="text-[10px]">
              {roleLabel(entry.actor_role)}
              {entry.actor_department ? ` / ${entry.actor_department}` : ""}
            </Badge>
            <span className="text-xs font-medium text-foreground">
              {actionLabel(entry.action)}
            </span>
            {isPushEvent && count !== null && (
              <span className="text-[10px] text-muted-foreground">{count} רשומות</span>
            )}
          </div>
          <p className="mt-1 text-[13px] text-muted-foreground leading-relaxed">{entry.message}</p>

          {/* Entity info for non-push events */}
          {entry.entity_id && !isPushEvent && (
            <p className="mt-0.5 text-[11px] text-muted-foreground/70">
              {entry.entity_type ? `${entityTypeLabel(entry.entity_type)}: ` : ""}{entityIdLabel(entry.entity_id)}
            </p>
          )}

          {/* Collapsed summary for push events with changes */}
          {isPushEvent && hasPushDetails && !expanded && (
            <div className="mt-1.5 flex items-center gap-3 text-[11px]">
              {removedOccupants.length > 0 && (
                <span className="flex items-center gap-1 text-destructive">
                  <IconUserMinus size={12} />
                  {removedOccupants.length} הוסרו
                </span>
              )}
              {autoReassigned.length > 0 && (
                <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                  <IconUserPlus size={12} />
                  {autoReassigned.length} הוחזרו
                </span>
              )}
              <span className="flex items-center gap-0.5 text-muted-foreground/60">
                <IconChevronDown size={11} />
                לחץ לפרטים
              </span>
            </div>
          )}

          {/* Expand indicator for non-push events */}
          {hasDetails && !isPushEvent && !expanded && (
            <div className="mt-1 flex items-center gap-0.5 text-[11px] text-muted-foreground/60">
              <IconChevronDown size={11} />
              לחץ לפרטים
            </div>
          )}
        </div>

        {/* Right side: timestamp + copy */}
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className="text-[11px] text-muted-foreground/70 tabular-nums">
            {formatTimestamp(entry.created_at)}
          </span>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={handleCopy}
              className="rounded-md p-1 text-muted-foreground/50 hover:text-foreground hover:bg-muted/50 transition-colors cursor-pointer"
              title="העתק רשומה"
            >
              {copied ? <IconCheck size={13} /> : <IconCopy size={13} />}
            </button>
            {isAdmin && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onTrashClick(); }}
                className="rounded-md p-1 text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                title="בטל פעולה"
              >
                <IconTrash size={13} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="mt-3 space-y-3">
          {/* Chevron up indicator */}
          <div className="flex items-center gap-0.5 text-[11px] text-muted-foreground/60">
            <IconChevronDown size={11} className="rotate-180" />
            לחץ לסגירה
          </div>

          {/* Removed occupants */}
          {removedOccupants.length > 0 && (
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3">
              <p className="text-[11px] font-semibold text-destructive mb-2 flex items-center gap-1.5">
                <IconUserMinus size={13} />
                הוסרו משיבוץ ({removedOccupants.length})
              </p>
              <div className="space-y-1.5">
                {removedOccupants.map((p, i) => (
                  <div key={i} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-0.5 text-[12px]">
                    <span className="text-foreground">
                      {p.full_name || p.person_id}
                      {p.department && <span className="text-muted-foreground mr-1">({p.department})</span>}
                    </span>
                    <span className="text-muted-foreground text-[11px]">
                      מבנה {p.building_name} חדר {p.room_number}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Auto-reassigned */}
          {autoReassigned.length > 0 && (
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
              <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 mb-2 flex items-center gap-1.5">
                <IconUserPlus size={13} />
                הוחזרו לשיבוץ ({autoReassigned.length})
              </p>
              <div className="space-y-1.5">
                {autoReassigned.map((p, i) => (
                  <div key={i} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-0.5 text-[12px]">
                    <span className="text-foreground">
                      {p.full_name || p.person_id}
                    </span>
                    <span className="text-muted-foreground text-[11px]">
                      מבנה {p.building_name} חדר {p.room_number}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Integrity report summary */}
          {isPushEvent && integrityReport && (
            <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
              <p className="text-[11px] font-semibold text-foreground mb-2">דוח תקינות</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px]">
                {integrityReport.has_changes !== undefined && (
                  <div>
                    <span className="text-muted-foreground">שינויים: </span>
                    <span className="text-foreground font-medium">{integrityReport.has_changes ? "כן" : "לא"}</span>
                  </div>
                )}
                {typeof integrityReport.unknown_occupants_stripped === "number" && (
                  <div>
                    <span className="text-muted-foreground">הוסרו מחדרים: </span>
                    <span className="text-foreground font-medium">{integrityReport.unknown_occupants_stripped as number}</span>
                  </div>
                )}
                {typeof integrityReport.gender_violations_fixed === "number" && (
                  <div>
                    <span className="text-muted-foreground">תיקוני מגדר: </span>
                    <span className="text-foreground font-medium">{integrityReport.gender_violations_fixed as number}</span>
                  </div>
                )}
                {typeof integrityReport.capacity_violations_fixed === "number" && (
                  <div>
                    <span className="text-muted-foreground">תיקוני קיבולת: </span>
                    <span className="text-foreground font-medium">{integrityReport.capacity_violations_fixed as number}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Generic details for non-push events */}
          {!isPushEvent && hasDetails && (
            <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
              <p className="text-[11px] font-semibold text-foreground mb-2">פרטים נוספים</p>
              <div className="space-y-1 text-[11px]">
                {Object.entries(details)
                  .filter(([, value]) => !Array.isArray(value) && typeof value !== "object")
                  .map(([key, value]) => (
                  <div key={key} className="flex gap-2">
                    <span className="text-muted-foreground shrink-0">{DETAIL_KEY_LABELS[key] || key}:</span>
                    <span className="text-foreground break-all">
                      {typeof value === "boolean"
                        ? (value ? "כן" : "לא")
                        : DETAIL_VALUE_LABELS[String(value)] || String(value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Array details as tables */}
          {Object.entries(details)
            .filter(([, value]) => Array.isArray(value) && (value as unknown[]).length > 0)
            .map(([key, value]) => {
              const rows = value as Record<string, unknown>[];
              const cols = TABLE_VISIBLE_COLS[key] || Object.keys(rows[0] || {}).filter(k => k !== "person_id");
              return (
                <div key={key} className="rounded-lg border border-border/50 bg-muted/30 p-3">
                  <p className="text-[11px] font-semibold text-foreground mb-2">
                    {DETAIL_KEY_LABELS[key] || key} ({rows.length})
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr className="border-b border-border/40">
                          {cols.map(col => (
                            <th key={col} className="text-right text-muted-foreground font-medium py-1 px-1.5">
                              {TABLE_COL_LABELS[col] || col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row, i) => (
                          <tr key={i} className="border-b border-border/20 last:border-0">
                            {cols.map(col => (
                              <td key={col} className="py-1 px-1.5 text-foreground">
                                {DETAIL_VALUE_LABELS[String(row[col] ?? "")] || String(row[col] ?? "")}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })
          }
        </div>
      )}
    </div>
  );
}
