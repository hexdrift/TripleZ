"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "react-toastify";
import { Room, Personnel } from "@/lib/types";
import {
  unassignPerson,
  assignPersonToRoom,
  swapPeople,
  movePerson,
  updateRoomMetadata,
  getAuthContext,
} from "@/lib/api";
import { useAppData } from "./app-shell";
import { buildingHe, deptHe, genderHe, rankHe } from "@/lib/hebrew";
import { DEPT_COLORS, DEFAULT_DEPT_COLOR, Legend } from "./room-card";
import { ConfirmationDialog } from "./confirmation-dialog";
import {
  IconUserMinus,
  IconUserPlus,
  IconSwap,
  IconMove,
  IconX,
  IconChevronRight,
  IconBed,
  IconBuilding,
} from "./icons";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

interface RoomDetailModalProps {
  room: Room | null;
  onClose: () => void;
}

type ModalView = "chooser" | "assignments" | "detail" | "metadata";

const slideVariants = {
  enter: (dir: number) => ({
    opacity: 0,
    x: dir > 0 ? -40 : 40,
  }),
  center: { opacity: 1, x: 0 },
  exit: (dir: number) => ({
    opacity: 0,
    x: dir > 0 ? 40 : -40,
  }),
};

const slideTrans = { duration: 0.18, ease: [0.25, 0.1, 0.25, 1] as const };

function roomCompatibleForPerson(
  person: Pick<Personnel, "gender" | "rank"> | null,
  room: Pick<Room, "gender" | "room_rank"> | null,
  ranksHighToLow: string[],
): boolean {
  void ranksHighToLow;
  if (!person || !room) return false;
  if (String(person.gender) !== String(room.gender)) return false;
  return true;
}

export function RoomDetailModal({ room, onClose }: RoomDetailModalProps) {
  const { rooms, personnel, auth } = useAppData();
  const [selectedBed, setSelectedBed] = useState<number | null>(null);
  const [view, setView] = useState<ModalView>(
    auth.role === "admin" ? "chooser" : "assignments",
  );
  const [direction, setDirection] = useState(1);

  const liveRoom = useMemo(() => {
    if (!room) return null;
    return (
      rooms.find(
        (r) =>
          r.building_name === room.building_name &&
          r.room_number === room.room_number,
      ) || null
    );
  }, [rooms, room]);

  useEffect(() => {
    if (!room) return;
    setSelectedBed(null);
    setView(auth.role === "admin" ? "chooser" : "assignments");
  }, [auth.role, room]);

  const handleBedClick = useCallback((bedIdx: number) => {
    setDirection(1);
    setSelectedBed(bedIdx);
    setView("detail");
  }, []);

  const handleBack = useCallback(() => {
    setDirection(-1);
    if (view === "detail") {
      setView("assignments");
      return;
    }
    if (auth.role === "admin") {
      setView("chooser");
      return;
    }
    setView("assignments");
  }, [auth.role, view]);

  if (!liveRoom) return null;

  const primaryDept = liveRoom.departments[0] || "";
  const deptColor = DEPT_COLORS[primaryDept] || DEFAULT_DEPT_COLOR;
  const total = liveRoom.number_of_beds;
  const bedsPerRow =
    total <= 10
      ? Math.ceil(total / 2)
      : Math.min(6, Math.ceil(total / Math.ceil(total / 6)));

  const bedOccupants = Array.from({ length: total }, (_, i) => {
    if (i < liveRoom.occupant_ids.length) {
      const personId = liveRoom.occupant_ids[i];
      return { personId, name: liveRoom.occupant_names?.[personId] || "" };
    }
    return null;
  });

  const selectedOccupant =
    selectedBed !== null ? bedOccupants[selectedBed] : null;
  const selectedBedIsEmpty = selectedBed !== null && !bedOccupants[selectedBed];
  const isAdmin = auth.role === "admin";
  const showBack = view === "detail" || (isAdmin && view !== "chooser");

  const modalTitle =
    view === "detail" && selectedBed !== null
      ? selectedOccupant
        ? selectedOccupant.name || `מיטה ${selectedBed + 1}`
        : `מיטה ${selectedBed + 1} — שיבוץ`
      : view === "metadata"
      ? `עריכת חדר ${liveRoom.room_number}`
      : view === "assignments"
      ? `ניהול חדר ${liveRoom.room_number}`
      : `חדר ${liveRoom.room_number}`;

  const modalDescription =
    view === "chooser"
      ? ""
      : view === "detail" && selectedOccupant
      ? `מיטה ${selectedBed! + 1} · חדר ${liveRoom.room_number}`
      : view === "metadata"
      ? ""
      : view === "assignments"
      ? ""
      : `${rankHe(liveRoom.room_rank)} · ${liveRoom.departments.map(deptHe).join(", ") || "—"} · ${genderHe(liveRoom.gender)} · ${liveRoom.occupant_count}/${liveRoom.number_of_beds} תפוסה`;

  return (
    <Dialog
      open={!!room}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-[640px] max-h-[calc(100vh-40px)] overflow-hidden gap-0 p-0"
      >
        {/* Header */}
        <header className="px-6 pt-5 pb-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              {showBack && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={handleBack}
                  aria-label="חזור"
                  className="shrink-0 rounded-xl"
                >
                  <IconChevronRight size={18} />
                </Button>
              )}
              <DialogHeader className="min-w-0 gap-0.5 text-right">
                  <DialogTitle className="truncate text-lg font-bold text-foreground sm:text-xl">
                    {modalTitle}
                  </DialogTitle>
                  {modalDescription ? (
                    <DialogDescription className="truncate text-[12px] text-muted-foreground sm:text-[13px]">
                      {modalDescription}
                    </DialogDescription>
                  ) : null}
              </DialogHeader>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onClose}
                aria-label="סגור"
                className="rounded-lg text-muted-foreground hover:text-foreground"
              >
                <IconX size={18} />
              </Button>
            </div>
          </div>
        </header>
        <Separator />

        {/* Animated body */}
        <div className="relative flex-1 overflow-hidden">
          <AnimatePresence mode="wait" custom={direction} initial={false}>
            {view === "chooser" ? (
              <motion.div
                key="chooser"
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={slideTrans}
                className="scrollbar-subtle h-full overflow-y-auto px-6 py-5 max-h-[calc(100vh-220px)]"
              >
                <ModeChooser
                  onAssignments={() => {
                    setDirection(1);
                    setSelectedBed(null);
                    setView("assignments");
                  }}
                  onMetadata={() => {
                    setDirection(1);
                    setSelectedBed(null);
                    setView("metadata");
                  }}
                />
              </motion.div>
            ) : view === "assignments" ? (
              <motion.div
                key="assignments"
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={slideTrans}
                className="scrollbar-subtle h-full overflow-y-auto px-6 py-5 max-h-[calc(100vh-220px)]"
              >
                {/* Bed visualization */}
                <section className="rounded-2xl border border-border/70 bg-gradient-to-b from-muted/40 via-background to-background p-4 sm:p-5">
                  <p className="mb-3 text-center text-[11px] font-semibold text-muted-foreground">
                    לחץ על מיטה לפרטים
                  </p>
                  <div className="flex flex-col gap-2.5">
                    {Array.from(
                      { length: Math.ceil(total / bedsPerRow) },
                      (_, rowIdx) => {
                        const start = rowIdx * bedsPerRow;
                        const end = Math.min(start + bedsPerRow, total);
                        return (
                          <div
                            key={rowIdx}
                            className="flex justify-center gap-2"
                          >
                            {bedOccupants.slice(start, end).map((occ, i) => {
                              const bedIdx = start + i;
                              return (
                                <ClickableBed
                                  key={bedIdx}
                                  index={bedIdx}
                                  occupied={!!occ}
                                  selected={false}
                                  deptColor={deptColor}
                                  label={
                                    occ
                                      ? occ.name || occ.personId.slice(-4)
                                      : undefined
                                  }
                                  onClick={() => handleBedClick(bedIdx)}
                                />
                              );
                            })}
                          </div>
                        );
                      },
                    )}
                  </div>
                  <div className="mt-3 flex items-center gap-4 border-t pt-2">
                    <Legend
                      color={deptColor.strong}
                      label={
                        liveRoom.departments.map(deptHe).join(", ") || "—"
                      }
                    />
                    <Legend color="var(--surface-3)" label="פנויה" dashed />
                  </div>
                </section>
              </motion.div>
            ) : view === "metadata" ? (
              <motion.div
                key="metadata"
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={slideTrans}
                className="scrollbar-subtle h-full overflow-y-auto px-6 py-5 max-h-[calc(100vh-220px)]"
              >
                <RoomMetadataEditor room={liveRoom} />
              </motion.div>
            ) : (
              <motion.div
                key="detail"
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={slideTrans}
                className="scrollbar-subtle h-full overflow-y-auto px-6 py-5 max-h-[calc(100vh-220px)]"
              >
                {selectedOccupant ? (
                  <OccupantDetail
                    personId={selectedOccupant.personId}
                    name={selectedOccupant.name}
                    bedIndex={selectedBed! + 1}
                  />
                ) : selectedBedIsEmpty ? (
                  <div className="space-y-3">
                    {auth.role === "manager" ? (
                      <p className="text-xs text-muted-foreground">
                        ניתן לשבץ כאן רק אנשים מזירת{" "}
                        {deptHe(auth.department || "")}.
                      </p>
                    ) : null}
                    <RoomAssignForm room={liveRoom} personnel={personnel} />
                  </div>
                ) : null}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ModeChooser({
  onAssignments,
  onMetadata,
}: {
  onAssignments: () => void;
  onMetadata: () => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <button type="button" onClick={onAssignments} className="text-right">
          <Card className="rounded-[24px] border-2 border-border/80 bg-card p-6 text-card-foreground shadow-[var(--shadow-card)] backdrop-blur-xl transition-colors duration-150 ease-out cursor-pointer flex flex-col gap-4 hover:border-primary">
            <div className="h-11 w-11 rounded-xl flex items-center justify-center bg-primary/10 text-primary">
              <IconBed size={22} />
            </div>
            <div>
              <p className="text-[15px] font-bold text-foreground">
                ניהול שיבוצים
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                בחירת מיטה, שיבוץ ידני, העברה והחלפה בתוך החדר.
              </p>
            </div>
          </Card>
      </button>

      <button type="button" onClick={onMetadata} className="text-right">
          <Card className="rounded-[24px] border-2 border-border/80 bg-card p-6 text-card-foreground shadow-[var(--shadow-card)] backdrop-blur-xl transition-colors duration-150 ease-out cursor-pointer flex flex-col gap-4 hover:border-primary">
            <div className="h-11 w-11 rounded-xl flex items-center justify-center bg-primary/10 text-primary">
              <IconBuilding size={22} />
            </div>
            <div>
              <p className="text-[15px] font-bold text-foreground">
                עריכת מטא־דאטה
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                עדכון זירה, דרגה, מגדר וקיבולת לשיבוץ האוטומטי.
              </p>
            </div>
          </Card>
      </button>
    </div>
  );
}

function RoomMetadataEditor({ room }: { room: Room }) {
  const { dataVersion } = useAppData();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [bedCount, setBedCount] = useState(String(room.number_of_beds));
  const [rank, setRank] = useState(room.room_rank);
  const [gender, setGender] = useState(room.gender);
  const [department, setDepartment] = useState(room.designated_department || "__auto__");
  const [availableDepts, setAvailableDepts] = useState<string[]>([]);
  const [availableRanks, setAvailableRanks] = useState<string[]>([]);
  const [availableGenders, setAvailableGenders] = useState<string[]>([]);

  useEffect(() => {
    setBedCount(String(room.number_of_beds));
    setRank(room.room_rank);
    setGender(room.gender);
    setDepartment(room.designated_department || "__auto__");
    setError("");
    setSuccess("");
  }, [room]);

  useEffect(() => {
    let active = true;
    getAuthContext()
      .then((context) => {
        if (!active) return;
        setAvailableDepts(context.departments ?? []);
        setAvailableRanks(context.ranks_high_to_low ?? []);
        setAvailableGenders(context.genders ?? []);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  async function handleSave() {
    const nextBeds = Number(bedCount);
    if (!Number.isFinite(nextBeds) || nextBeds < room.occupant_count || nextBeds < 1) {
      setError(`מספר המיטות חייב להיות מספר תקין שלפחות שווה לתפוסה הנוכחית (${room.occupant_count}).`);
      setSuccess("");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");
    try {
      await updateRoomMetadata(
        {
          building_name: room.building_name,
          room_number: room.room_number,
          number_of_beds: nextBeds,
          room_rank: rank,
          gender,
          designated_department: department === "__auto__" ? null : department,
        },
        dataVersion,
      );
      const successMessage = "מטא־דאטת החדר עודכנה.";
      setSuccess(successMessage);
      toast.success(successMessage);
    } catch (err) {
      const message = err instanceof Error ? err.message : "שגיאה בעדכון החדר";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  const effectiveDepts = Array.from(new Set([
    ...(availableDepts.length > 0 ? availableDepts : room.departments),
    ...(room.designated_department ? [room.designated_department] : []),
  ]));
  const effectiveRanks = Array.from(new Set([...(availableRanks.length > 0 ? availableRanks : [room.room_rank]), room.room_rank]));
  const effectiveGenders = Array.from(new Set([...(availableGenders.length > 0 ? availableGenders : [room.gender]), room.gender]));

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl border border-border/70 bg-background/80 p-4 sm:p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="room-beds" className="text-[12px] font-semibold text-muted-foreground">
              מספר מיטות
            </Label>
            <Input
              id="room-beds"
              type="number"
              min={Math.max(room.occupant_count, 1)}
              value={bedCount}
              onChange={(e) => setBedCount(e.target.value)}
              dir="ltr"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-[12px] font-semibold text-muted-foreground">
              דרגת חדר
            </Label>
            <Select value={rank} onValueChange={setRank}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {effectiveRanks.map((value) => (
                  <SelectItem key={value} value={value}>
                    {rankHe(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[12px] font-semibold text-muted-foreground">
              מגדר
            </Label>
            <Select value={gender} onValueChange={setGender}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {effectiveGenders.map((value) => (
                  <SelectItem key={value} value={value}>
                    {genderHe(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[12px] font-semibold text-muted-foreground">
              זירה מועדפת
            </Label>
            <Select value={department} onValueChange={setDepartment}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__auto__">ללא זירה ידנית</SelectItem>
                {effectiveDepts.map((value) => (
                  <SelectItem key={value} value={value}>
                    {deptHe(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <Card className="rounded-2xl border border-border/70 bg-muted/20 p-4">
        {error ? (
          <p className="mb-3 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        ) : null}
        {success ? (
          <p className="mb-3 rounded-md bg-[var(--success-dim)] px-3 py-2 text-xs text-[var(--success)]">
            {success}
          </p>
        ) : null}

        <Button
          type="button"
          onClick={handleSave}
          disabled={loading}
          className="h-10 w-full rounded-xl"
        >
          {loading ? "שומר..." : "שמור מטא־דאטה"}
        </Button>
      </Card>
    </div>
  );
}

function ClickableBedLegacy({
  index,
  occupied,
  selected,
  deptColor,
  label,
  onClick,
}: {
  index: number;
  occupied: boolean;
  selected: boolean;
  deptColor: typeof DEFAULT_DEPT_COLOR;
  label?: string;
  onClick: () => void;
}) {
  const fill = occupied ? deptColor.bg : "var(--surface-1)";
  const stroke = occupied ? deptColor.strong : "var(--border)";
  const hoverBg = occupied ? deptColor.bg : "var(--color-muted)";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative flex min-w-[52px] max-w-[80px] flex-1 cursor-pointer select-none flex-col items-center rounded-lg p-1 transform-gpu transition-[transform,background-color,box-shadow,ring-color,opacity] duration-75 ease-out active:scale-[0.93] motion-reduce:transform-none motion-reduce:transition-none",
        selected && "ring-2 ring-offset-1",
      )}
      style={{
        backgroundColor: selected
          ? occupied
            ? deptColor.bg
            : "var(--color-muted)"
          : undefined,
        ...(selected
          ? ({
              "--tw-ring-color": occupied ? deptColor.strong : "var(--ring)",
            } as React.CSSProperties)
          : {}),
      }}
      onMouseEnter={(e) => {
        if (!selected) e.currentTarget.style.backgroundColor = hoverBg;
      }}
      onMouseLeave={(e) => {
        if (!selected) e.currentTarget.style.backgroundColor = "";
      }}
      title={
        occupied ? `מיטה ${index + 1} - תפוסה` : `מיטה ${index + 1} - פנויה`
      }
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 200 200"
        className={cn("h-auto w-full", occupied ? "opacity-100" : "opacity-40")}
      >
        <g
          fill={fill}
          stroke={stroke}
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="42" y="20" width="116" height="24" rx="6" />
          <rect x="50" y="36" width="100" height="144" rx="8" />
          <rect x="65" y="48" width="70" height="32" rx="10" />
          <path d="M 46 95 L 154 95 L 154 172 C 154 179.7 147.7 186 140 186 L 60 186 C 52.3 186 46 179.7 46 172 Z" />
          <rect x="46" y="85" width="108" height="20" rx="6" />
        </g>
        <g
          fill="none"
          stroke={stroke}
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M 78 64 Q 100 68 122 64" />
          <path d="M 75 120 Q 85 145 75 170" />
          <path d="M 125 120 Q 115 145 125 170" />
        </g>
      </svg>
      <span
        className={cn(
          "mt-0.5 max-w-full truncate px-0.5 text-[9px] font-bold",
          !occupied && "text-muted-foreground",
        )}
        style={occupied ? { color: deptColor.strong } : undefined}
      >
        {label || `מיטה ${index + 1}`}
      </span>
    </button>
  );
}

type OccupantActionLegacy = null | "swap" | "move";

function OccupantDetailLegacy({
  personId,
  name,
  bedIndex,
}: {
  personId: string;
  name: string;
  bedIndex: number;
}) {
  const { personnel, rooms, auth, dataVersion } = useAppData();
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState<OccupantActionLegacy>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false);
  const [rankOrder, setRankOrder] = useState<string[]>([]);

  const person = personnel.find((p) => p.person_id === personId);
  const effectiveRankOrder = useMemo(
    () =>
      rankOrder.length > 0
        ? rankOrder
        : Array.from(new Set(personnel.map((entry) => String(entry.rank || "").trim()).filter(Boolean))),
    [personnel, rankOrder],
  );

  useEffect(() => {
    let active = true;
    getAuthContext()
      .then((context) => {
        if (!active) return;
        setRankOrder((context.ranks_high_to_low ?? []).map((value) => String(value || "").trim()).filter(Boolean));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  async function handleUnassign() {
    setLoading(true);
    try {
      await unassignPerson(personId, dataVersion);
      toast.success(`${displayName} הוסר מהחדר`);
    } catch (err) {
      toast.error("שגיאה בהסרה מהחדר");
    } finally {
      setLoading(false);
    }
  }

  const displayName = person?.full_name || name || personId;

  function toggleAction(nextAction: OccupantActionLegacy) {
    setError("");
    setSuccess("");
    setAction((current) => (current === nextAction ? null : nextAction));
  }

  return (
    <div className="space-y-4">
      {/* Person info card */}
      <div className="rounded-md border bg-muted/50 p-4">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold text-muted-foreground">
            {displayName.charAt(0)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-foreground">
              {displayName}
            </p>
            <p className="text-[11px] text-muted-foreground">
              מיטה {bedIndex}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          <InfoRow label="מזהה" value={personId} />
          {person ? (
            <>
              <InfoRow label="זירה" value={deptHe(person.department)} />
              <InfoRow label="דרגה" value={rankHe(person.rank)} />
              <InfoRow label="מגדר" value={genderHe(person.gender)} />
            </>
          ) : null}
        </div>
      </div>

      {/* Action buttons */}
      <div className={cn("grid gap-2", auth.role === "admin" ? "grid-cols-3" : "grid-cols-2")}>
        <ActionButtonLegacy
          active={action === "swap"}
          icon={<IconSwap size={14} />}
          label="החלף"
          onClick={() => toggleAction("swap")}
        />
        <ActionButtonLegacy
          active={action === "move"}
          icon={<IconMove size={14} />}
          label="העבר"
          onClick={() => toggleAction("move")}
        />
        {auth.role === "admin" ? (
          <ActionButtonLegacy
            active={false}
            icon={<IconUserMinus size={14} />}
            label="הסר"
            variant="destructive"
            onClick={() => setConfirmRemoveOpen(true)}
            disabled={loading}
          />
        ) : null}
      </div>

      {error ? (
        <p className="rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="rounded-md bg-[var(--success-dim)] px-2 py-1.5 text-xs text-[var(--success)]">
          {success}
        </p>
      ) : null}

      <AnimatePresence mode="wait">
        {action === "swap" ? (
          <motion.div
            key="swap"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <InlineSwapLegacy
              personId={personId}
              personnel={personnel}
              rooms={rooms}
              onDone={(msg) => {
                setSuccess(msg);
                setAction(null);
              }}
              onError={setError}
            />
          </motion.div>
        ) : action === "move" ? (
          <motion.div
            key="move"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <InlineMove
              personId={personId}
              rooms={rooms}
              rankOrder={effectiveRankOrder}
              onDone={(msg) => {
                setSuccess(msg);
                setAction(null);
              }}
              onError={setError}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>

      <ConfirmationDialog
        open={confirmRemoveOpen}
        title="להסיר מהחדר?"
        description={`${displayName} יוסר מהחדר הנוכחי.`}
        confirmLabel="הסר"
        onOpenChange={setConfirmRemoveOpen}
        onConfirm={() => {
          setConfirmRemoveOpen(false);
          handleUnassign();
        }}
      />
    </div>
  );
}

function ActionButtonLegacy({
  active,
  icon,
  label,
  variant,
  onClick,
  disabled,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  variant?: "destructive";
  onClick: () => void;
  disabled?: boolean;
}) {
  const isDestructive = variant === "destructive";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-2.5 text-[12px] font-medium transform-gpu transition-[transform,background-color,color,border-color,box-shadow] duration-75 ease-out active:scale-[0.95] disabled:pointer-events-none disabled:opacity-50",
        isDestructive
          ? "border-destructive/30 text-destructive hover:bg-destructive/10 active:bg-destructive/15"
          : active
            ? "border-foreground bg-foreground text-background shadow-sm"
            : "border-border/70 bg-background text-foreground hover:border-foreground/40 hover:bg-muted/50 active:bg-muted/70",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function InlineSwapLegacy({
  personId,
  personnel,
  rooms,
  onDone,
  onError,
}: {
  personId: string;
  personnel: Personnel[];
  rooms: Room[];
  onDone: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const { dataVersion } = useAppData();
  const [query, setQuery] = useState("");
  const [showList, setShowList] = useState(false);
  const [targetPerson, setTargetPerson] = useState<Personnel | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const assignedIds = useMemo(
    () => new Set(rooms.flatMap((r) => r.occupant_ids)),
    [rooms],
  );
  const roomMap = useMemo(() => {
    const map = new Map<string, Room>();
    for (const room of rooms)
      for (const id of room.occupant_ids) map.set(id, room);
    return map;
  }, [rooms]);
  const currentRoom = roomMap.get(personId) || null;
  const currentRoomKey = currentRoom
    ? `${currentRoom.building_name}-${currentRoom.room_number}`
    : "";

  const filtered = useMemo(() => {
    const list = personnel.filter((p) => {
      if (p.person_id === personId || !assignedIds.has(p.person_id))
        return false;
      const room = roomMap.get(p.person_id);
      if (!room) return false;
      return `${room.building_name}-${room.room_number}` !== currentRoomKey;
    });
    if (!query.trim()) return list;
    const q = query.toLowerCase();
    return list.filter(
      (p) =>
        p.person_id.toLowerCase().includes(q) ||
        p.full_name.toLowerCase().includes(q),
    );
  }, [assignedIds, currentRoomKey, personId, personnel, query, roomMap]);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (
        listRef.current &&
        !listRef.current.contains(target) &&
        inputRef.current &&
        !inputRef.current.contains(target)
      ) {
        setShowList(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  async function handleSwap() {
    if (!targetPerson) return;
    setLoading(true);
    onError("");
    try {
      const res = await swapPeople(personId, targetPerson.person_id, dataVersion);
      if (res.ok) {
        toast.success(`הוחלף עם ${targetPerson.full_name} בהצלחה`);
        onDone(`הוחלף עם ${targetPerson.full_name} בהצלחה`);
      } else {
        toast.error(res.detail || "ההחלפה נכשלה");
        onError(res.detail || "ההחלפה נכשלה");
      }
    } catch {
      toast.error("שגיאת חיבור");
      onError("שגיאת חיבור");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2 rounded-md border bg-muted/50 p-3">
      <p className="text-xs font-semibold text-muted-foreground">החלפה עם:</p>
      {targetPerson ? (
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[13px] font-semibold text-foreground">
              {targetPerson.full_name}
            </span>
            {(() => {
              const r = roomMap.get(targetPerson.person_id);
              return r ? (
                <Badge variant="secondary" className="shrink-0 text-[10px]">
                  חדר {r.room_number}
                </Badge>
              ) : null;
            })()}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setTargetPerson(null)}
            >
              <IconX size={12} />
            </Button>
            <Button size="sm" onClick={handleSwap} disabled={loading}>
              <IconSwap size={12} />
              {loading ? "מחליף..." : "החלף"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <Input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShowList(true);
            }}
            onFocus={() => setShowList(true)}
            placeholder="חפש אדם משובץ להחלפה"
            autoComplete="off"
          />
          {showList ? (
            filtered.length > 0 ? (
              <div className="overflow-hidden rounded-xl border border-border/70 bg-popover/95 shadow-lg backdrop-blur-sm">
                <div className="flex items-center justify-between border-b border-border/60 px-3 py-2 text-[11px]">
                  <span className="font-semibold text-foreground">אנשים משובצים זמינים להחלפה</span>
                  <span className="text-muted-foreground">{filtered.length}</span>
                </div>
                <div
                  ref={listRef}
                  className="scrollbar-subtle max-h-[168px] overflow-y-auto p-1.5"
                >
                  {filtered.slice(0, 15).map((p) => {
                    const r = roomMap.get(p.person_id);
                    return (
                      <button
                        key={p.person_id}
                        type="button"
                        onMouseDown={() => {
                          setTargetPerson(p);
                          setShowList(false);
                          setQuery("");
                        }}
                        className="flex w-full cursor-pointer items-center justify-between rounded-lg px-2 py-1.5 text-right text-[12px] hover:bg-accent"
                      >
                        <span className="truncate">{p.full_name}</span>
                        {r ? (
                          <span className="shrink-0 text-muted-foreground">
                            חדר {r.room_number}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : query.trim() ? (
              <div className="rounded-md border bg-popover px-3 py-2 text-[11px] text-muted-foreground">
                אין אנשים תואמים לחיפוש
              </div>
            ) : null
          ) : null}
        </div>
      )}
    </div>
  );
}

function ClickableBed({
  index,
  occupied,
  selected,
  deptColor,
  label,
  onClick,
}: {
  index: number;
  occupied: boolean;
  selected: boolean;
  deptColor: typeof DEFAULT_DEPT_COLOR;
  label?: string;
  onClick: () => void;
}) {
  const fill = occupied ? deptColor.bg : "var(--surface-1)";
  const stroke = occupied ? deptColor.strong : "var(--border)";
  const hoverBg = occupied ? deptColor.bg : "var(--color-muted)";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative flex min-w-[52px] max-w-[80px] flex-1 cursor-pointer select-none flex-col items-center rounded-lg p-1 transform-gpu transition-[transform,background-color,box-shadow,ring-color,opacity] duration-75 ease-out active:scale-[0.93] motion-reduce:transform-none motion-reduce:transition-none",
        selected && "ring-2 ring-offset-1",
      )}
      style={{
        backgroundColor: selected
          ? occupied
            ? deptColor.bg
            : "var(--color-muted)"
          : undefined,
        ...(selected
          ? ({
              "--tw-ring-color": occupied ? deptColor.strong : "var(--ring)",
            } as React.CSSProperties)
          : {}),
      }}
      onMouseEnter={(e) => {
        if (!selected) e.currentTarget.style.backgroundColor = hoverBg;
      }}
      onMouseLeave={(e) => {
        if (!selected) e.currentTarget.style.backgroundColor = "";
      }}
      title={
        occupied ? `מיטה ${index + 1} - תפוסה` : `מיטה ${index + 1} - פנויה`
      }
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 200 200"
        className={cn("h-auto w-full", occupied ? "opacity-100" : "opacity-40")}
      >
        <g
          fill={fill}
          stroke={stroke}
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="42" y="20" width="116" height="24" rx="6" />
          <rect x="50" y="36" width="100" height="144" rx="8" />
          <rect x="65" y="48" width="70" height="32" rx="10" />
          <path d="M 46 95 L 154 95 L 154 172 C 154 179.7 147.7 186 140 186 L 60 186 C 52.3 186 46 179.7 46 172 Z" />
          <rect x="46" y="85" width="108" height="20" rx="6" />
        </g>
        <g
          fill="none"
          stroke={stroke}
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M 78 64 Q 100 68 122 64" />
          <path d="M 75 120 Q 85 145 75 170" />
          <path d="M 125 120 Q 115 145 125 170" />
        </g>
      </svg>
      <span
        className={cn(
          "mt-0.5 max-w-full truncate px-0.5 text-[9px] font-bold",
          !occupied && "text-muted-foreground",
        )}
        style={occupied ? { color: deptColor.strong } : undefined}
      >
        {label || `מיטה ${index + 1}`}
      </span>
    </button>
  );
}

type OccupantAction = null | "swap" | "move";

function OccupantDetail({
  personId,
  name,
  bedIndex,
}: {
  personId: string;
  name: string;
  bedIndex: number;
}) {
  const { personnel, rooms, auth, dataVersion } = useAppData();
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState<OccupantAction>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false);
  const [rankOrder, setRankOrder] = useState<string[]>([]);

  const person = personnel.find((p) => p.person_id === personId);
  const effectiveRankOrder = useMemo(
    () =>
      rankOrder.length > 0
        ? rankOrder
        : Array.from(new Set(personnel.map((entry) => String(entry.rank || "").trim()).filter(Boolean))),
    [personnel, rankOrder],
  );

  useEffect(() => {
    let active = true;
    getAuthContext()
      .then((context) => {
        if (!active) return;
        setRankOrder((context.ranks_high_to_low ?? []).map((value) => String(value || "").trim()).filter(Boolean));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  async function handleUnassign() {
    setLoading(true);
    try {
      await unassignPerson(personId, dataVersion);
      toast.success(`${displayName} הוסר מהחדר`);
    } catch (err) {
      toast.error("שגיאה בהסרה מהחדר");
    } finally {
      setLoading(false);
    }
  }

  const displayName = person?.full_name || name || personId;

  function toggleAction(nextAction: OccupantAction) {
    setError("");
    setSuccess("");
    setAction((current) => (current === nextAction ? null : nextAction));
  }

  return (
    <div className="space-y-4">
      {/* Person info card */}
      <div className="rounded-md border bg-muted/50 p-4">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold text-muted-foreground">
            {displayName.charAt(0)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-foreground">
              {displayName}
            </p>
            <p className="text-[11px] text-muted-foreground">
              מיטה {bedIndex}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          <InfoRow label="מזהה" value={personId} />
          {person ? (
            <>
              <InfoRow label="זירה" value={deptHe(person.department)} />
              <InfoRow label="דרגה" value={rankHe(person.rank)} />
              <InfoRow label="מגדר" value={genderHe(person.gender)} />
            </>
          ) : null}
        </div>
      </div>

      {/* Action buttons */}
      <div className={cn("grid gap-2", auth.role === "admin" ? "grid-cols-3" : "grid-cols-2")}>
        <ActionButton
          active={action === "swap"}
          icon={<IconSwap size={14} />}
          label="החלף"
          onClick={() => toggleAction("swap")}
        />
        <ActionButton
          active={action === "move"}
          icon={<IconMove size={14} />}
          label="העבר"
          onClick={() => toggleAction("move")}
        />
        {auth.role === "admin" ? (
          <ActionButton
            active={false}
            icon={<IconUserMinus size={14} />}
            label="הסר"
            variant="destructive"
            onClick={() => setConfirmRemoveOpen(true)}
            disabled={loading}
          />
        ) : null}
      </div>

      {error ? (
        <p className="rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="rounded-md bg-[var(--success-dim)] px-2 py-1.5 text-xs text-[var(--success)]">
          {success}
        </p>
      ) : null}

      <AnimatePresence mode="wait">
        {action === "swap" ? (
          <motion.div
            key="swap"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <InlineSwap
              personId={personId}
              personnel={personnel}
              rooms={rooms}
              rankOrder={effectiveRankOrder}
              onDone={(msg) => {
                setSuccess(msg);
                setAction(null);
              }}
              onError={setError}
            />
          </motion.div>
        ) : action === "move" ? (
          <motion.div
            key="move"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <InlineMove
              personId={personId}
              rooms={rooms}
              rankOrder={effectiveRankOrder}
              onDone={(msg) => {
                setSuccess(msg);
                setAction(null);
              }}
              onError={setError}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>

      <ConfirmationDialog
        open={confirmRemoveOpen}
        title="להסיר מהחדר?"
        description={`${displayName} יוסר מהחדר הנוכחי.`}
        confirmLabel="הסר"
        onOpenChange={setConfirmRemoveOpen}
        onConfirm={() => {
          setConfirmRemoveOpen(false);
          handleUnassign();
        }}
      />
    </div>
  );
}

function ActionButton({
  active,
  icon,
  label,
  variant,
  onClick,
  disabled,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  variant?: "destructive";
  onClick: () => void;
  disabled?: boolean;
}) {
  const isDestructive = variant === "destructive";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-2.5 text-[12px] font-medium transform-gpu transition-[transform,background-color,color,border-color,box-shadow] duration-75 ease-out active:scale-[0.95] disabled:pointer-events-none disabled:opacity-50",
        isDestructive
          ? "border-destructive/30 text-destructive hover:bg-destructive/10 active:bg-destructive/15"
          : active
            ? "border-foreground bg-foreground text-background shadow-sm"
            : "border-border/70 bg-background text-foreground hover:border-foreground/40 hover:bg-muted/50 active:bg-muted/70",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function InlineSwap({
  personId,
  personnel,
  rooms,
  rankOrder,
  onDone,
  onError,
}: {
  personId: string;
  personnel: Personnel[];
  rooms: Room[];
  rankOrder: string[];
  onDone: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const { dataVersion } = useAppData();
  const [query, setQuery] = useState("");
  const [showList, setShowList] = useState(false);
  const [targetPerson, setTargetPerson] = useState<Personnel | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const assignedIds = useMemo(
    () => new Set(rooms.flatMap((r) => r.occupant_ids)),
    [rooms],
  );
  const roomMap = useMemo(() => {
    const map = new Map<string, Room>();
    for (const room of rooms)
      for (const id of room.occupant_ids) map.set(id, room);
    return map;
  }, [rooms]);
  const currentRoom = roomMap.get(personId) || null;
  const currentRoomKey = currentRoom
    ? `${currentRoom.building_name}-${currentRoom.room_number}`
    : "";
  const sourcePerson = useMemo(
    () => personnel.find((entry) => entry.person_id === personId) || null,
    [personId, personnel],
  );

  const filtered = useMemo(() => {
    const list = personnel.filter((p) => {
      if (p.person_id === personId || !assignedIds.has(p.person_id))
        return false;
      const room = roomMap.get(p.person_id);
      if (!room) return false;
      if (`${room.building_name}-${room.room_number}` === currentRoomKey) return false;
      return (
        roomCompatibleForPerson(sourcePerson, room, rankOrder)
        && roomCompatibleForPerson(p, currentRoom, rankOrder)
      );
    });
    if (!query.trim()) return list;
    const q = query.toLowerCase();
    return list.filter(
      (p) =>
        p.person_id.toLowerCase().includes(q) ||
        p.full_name.toLowerCase().includes(q),
    );
  }, [assignedIds, currentRoom, currentRoomKey, personId, personnel, query, rankOrder, roomMap, sourcePerson]);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (
        listRef.current &&
        !listRef.current.contains(target) &&
        inputRef.current &&
        !inputRef.current.contains(target)
      ) {
        setShowList(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  async function handleSwap() {
    if (!targetPerson) return;
    const targetRoom = roomMap.get(targetPerson.person_id) || null;
    const compatible =
      roomCompatibleForPerson(sourcePerson, targetRoom, rankOrder)
      && roomCompatibleForPerson(targetPerson, currentRoom, rankOrder);
    if (!compatible) {
      onError("ניתן לבצע החלפה רק בין אנשים מאותו מגדר.");
      return;
    }
    setLoading(true);
    onError("");
    try {
      const res = await swapPeople(personId, targetPerson.person_id, dataVersion);
      if (res.ok) {
        toast.success(`הוחלף עם ${targetPerson.full_name} בהצלחה`);
        onDone(`הוחלף עם ${targetPerson.full_name} בהצלחה`);
      } else {
        toast.error(res.detail || "ההחלפה נכשלה");
        onError(res.detail || "ההחלפה נכשלה");
      }
    } catch {
      toast.error("שגיאת חיבור");
      onError("שגיאת חיבור");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2 rounded-md border bg-muted/50 p-3">
      <p className="text-xs font-semibold text-muted-foreground">החלפה עם:</p>
      {targetPerson ? (
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[13px] font-semibold text-foreground">
              {targetPerson.full_name}
            </span>
            {(() => {
              const r = roomMap.get(targetPerson.person_id);
              return r ? (
                <Badge variant="secondary" className="shrink-0 text-[10px]">
                  חדר {r.room_number}
                </Badge>
              ) : null;
            })()}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setTargetPerson(null)}
            >
              <IconX size={12} />
            </Button>
            <Button size="sm" onClick={handleSwap} disabled={loading}>
              <IconSwap size={12} />
              {loading ? "מחליף..." : "החלף"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <Input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShowList(true);
            }}
            onFocus={() => setShowList(true)}
            placeholder="חפש אדם משובץ להחלפה"
            autoComplete="off"
          />
          {showList ? (
            filtered.length > 0 ? (
              <div className="overflow-hidden rounded-xl border border-border/70 bg-popover/95 shadow-lg backdrop-blur-sm">
                <div className="flex items-center justify-between border-b border-border/60 px-3 py-2 text-[11px]">
                  <span className="font-semibold text-foreground">אנשים משובצים זמינים להחלפה</span>
                  <span className="text-muted-foreground">{filtered.length}</span>
                </div>
                <div
                  ref={listRef}
                  className="scrollbar-subtle max-h-[168px] overflow-y-auto p-1.5"
                >
                  {filtered.slice(0, 15).map((p) => {
                    const r = roomMap.get(p.person_id) || null;
                    return (
                      <button
                        key={p.person_id}
                        type="button"
                        onMouseDown={() => {
                          setTargetPerson(p);
                          setShowList(false);
                          setQuery("");
                        }}
                        className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-right transition-[background-color,transform] duration-75 hover:bg-accent active:bg-accent/70"
                      >
                        <div className="min-w-0 flex-1">
                          <span className="text-xs font-semibold text-foreground">
                            {p.full_name}
                          </span>
                          <span className="mr-1 text-[11px] text-muted-foreground">
                            {p.person_id}
                          </span>
                        </div>
                        <Badge variant="secondary" className="text-[10px]">
                          {deptHe(p.department)}
                        </Badge>
                        {r ? (
                          <span className="text-[10px] text-muted-foreground">
                            חדר {r.room_number}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-border/70 bg-popover/95 px-3 py-3 text-[11px] text-muted-foreground shadow-lg backdrop-blur-sm">
                <p className="font-semibold text-foreground">לא נמצאו תוצאות</p>
                <p className="mt-1 leading-5">אפשר לחפש לפי שם, מזהה או חדר נוכחי.</p>
              </div>
            )
          ) : null}
        </div>
      )}
    </div>
  );
}

function InlineMove({
  personId,
  rooms,
  rankOrder,
  onDone,
  onError,
}: {
  personId: string;
  rooms: Room[];
  rankOrder: string[];
  onDone: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const { personnel, dataVersion } = useAppData();
  const [targetBuilding, setTargetBuilding] = useState("");
  const [targetRoom, setTargetRoom] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const person = useMemo(
    () => personnel.find((entry) => entry.person_id === personId) || null,
    [personId, personnel],
  );
  const currentRoom = useMemo(
    () => rooms.find((room) => room.occupant_ids.includes(personId)) || null,
    [personId, rooms],
  );
  const currentRoomKey = currentRoom
    ? `${currentRoom.building_name}-${currentRoom.room_number}`
    : "";

  const buildings = useMemo(
    () =>
      [...new Set(
        rooms
          .filter((room) => {
            if (!person) return false;
            if (room.available_beds <= 0) return false;
            if (`${room.building_name}-${room.room_number}` === currentRoomKey) return false;
            if (!roomCompatibleForPerson(person, room, rankOrder)) return false;
            return true;
          })
          .map((room) => room.building_name),
      )].sort(),
    [currentRoomKey, person, rankOrder, rooms],
  );
  const availableRooms = useMemo(() => {
    if (!targetBuilding || !person) return [];
    return rooms
      .filter(
        (r) =>
          r.building_name === targetBuilding
          && r.available_beds > 0
          && roomCompatibleForPerson(person, r, rankOrder),
      )
      .filter((r) => `${r.building_name}-${r.room_number}` !== currentRoomKey)
      .sort((a, b) => a.room_number - b.room_number);
  }, [currentRoomKey, person, rankOrder, rooms, targetBuilding]);

  async function handleMove() {
    if (!targetBuilding || targetRoom === null) return;
    setLoading(true);
    onError("");
    try {
      const res = await movePerson(personId, targetBuilding, targetRoom, dataVersion);
      if (res.ok) {
        toast.success(
          `הועבר למבנה ${buildingHe(targetBuilding)}, חדר ${targetRoom}`,
        );
        onDone(`הועבר למבנה ${buildingHe(targetBuilding)}, חדר ${targetRoom}`);
      } else {
        toast.error(res.detail || "ההעברה נכשלה");
        onError(res.detail || "ההעברה נכשלה");
      }
    } catch {
      toast.error("שגיאת חיבור");
      onError("שגיאת חיבור");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2.5 rounded-xl border border-border/70 bg-muted/50 p-3.5 shadow-[var(--shadow-inset)]">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-muted-foreground">
            העברה לחדר:
          </p>
          {targetBuilding ? (
            <Badge variant="secondary" className="text-[10px]">
              מבנה {buildingHe(targetBuilding)}
            </Badge>
          ) : null}
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {buildings.map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => {
                setTargetBuilding(b);
                setTargetRoom(null);
              }}
              className={cn(
                "h-9 rounded-xl border text-[12px] font-medium cursor-pointer transform-gpu transition-[transform,background-color,color,border-color,box-shadow] duration-75 ease-out active:scale-[0.95] motion-reduce:transform-none motion-reduce:transition-none",
                targetBuilding === b
                  ? "border-foreground bg-foreground text-background shadow-sm"
                  : "border-border/70 bg-background text-foreground hover:border-foreground/40 hover:bg-muted/50",
              )}
            >
              מבנה {buildingHe(b)}
            </button>
          ))}
        </div>
        <AnimatePresence mode="wait">
          {targetBuilding && (
            <motion.div
              key={targetBuilding}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.12, ease: "easeOut" }}
              className="space-y-2.5"
            >
              <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                {availableRooms.map((r) => (
                  <button
                    key={`${r.building_name}-${r.room_number}`}
                    type="button"
                    onClick={() => setTargetRoom(r.room_number)}
                    className={cn(
                      "relative flex flex-col items-center gap-0.5 rounded-xl border px-2 py-1.5 text-center cursor-pointer transform-gpu transition-[transform,background-color,color,border-color,box-shadow] duration-75 ease-out active:scale-[0.95] motion-reduce:transform-none motion-reduce:transition-none",
                      targetRoom === r.room_number
                        ? "border-foreground bg-foreground text-background shadow-sm"
                        : "border-border/70 bg-background text-foreground hover:border-foreground/40 hover:bg-muted/50",
                    )}
                  >
                    <span className="text-[12px] font-semibold">
                      חדר {r.room_number}
                    </span>
                    <span
                      className={cn(
                        "text-[10px]",
                        targetRoom === r.room_number
                          ? "text-background/70"
                          : "text-muted-foreground",
                      )}
                    >
                      {r.available_beds} פנויות
                    </span>
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {targetRoom !== null ? (
        <div className="mx-auto w-full max-w-[560px]">
          <Button
            size="sm"
            onClick={handleMove}
            disabled={loading}
            className="h-9 w-full gap-1.5 rounded-lg px-3 has-[>svg]:px-2.5"
          >
            <IconMove size={12} />
            {loading
              ? "מעביר..."
              : `העבר למבנה ${buildingHe(targetBuilding)} חדר ${targetRoom}`}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-muted-foreground">
        {label}
      </p>
      <p className="text-[13px] text-foreground/80">{value}</p>
    </div>
  );
}

function RoomAssignForm({
  room,
  personnel,
}: {
  room: Room;
  personnel: Personnel[];
}) {
  const { rooms, auth, dataVersion } = useAppData();
  const [personId, setPersonId] = useState("");
  const [selectedName, setSelectedName] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notInPersonnel, setNotInPersonnel] = useState(false);
  const [success, setSuccess] = useState("");
  const [personnelUrl, setPersonnelUrl] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const assignedIds = useMemo(
    () => new Set(rooms.flatMap((r) => r.occupant_ids)),
    [rooms],
  );
  const availablePersonnel = useMemo(
    () =>
      personnel.filter((person) => {
        if (assignedIds.has(person.person_id)) return false;
        if (person.gender !== room.gender) return false;
        return true;
      }),
    [assignedIds, personnel, room.gender],
  );

  const suggestions = useMemo(() => {
    if (!personId.trim()) return availablePersonnel;
    const q = personId.toLowerCase();
    return availablePersonnel.filter(
      (p) =>
        p.person_id.toLowerCase().includes(q) ||
        p.full_name.toLowerCase().includes(q),
    );
  }, [availablePersonnel, personId]);
  const hasQuery = personId.trim().length > 0;
  const assignmentEmptyMessage =
    availablePersonnel.length === 0
      ? "אין כרגע אנשים פנויים לשיבוץ. להעברה מחדר אחר השתמש בהעברה או בהחלפה."
      : hasQuery
        ? "לא נמצאו אנשים פנויים התואמים לחיפוש."
        : "אפשר לבחור מהרשימה או להתחיל להקליד כדי לסנן.";

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (
        listRef.current &&
        !listRef.current.contains(target) &&
        inputRef.current &&
        !inputRef.current.contains(target)
      ) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  useEffect(() => {
    let active = true;
    getAuthContext()
      .then((context) => {
        if (active) setPersonnelUrl(context.personnel_url.trim());
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  function selectPerson(p: Personnel) {
    setPersonId(p.person_id);
    setSelectedName(p.full_name);
    setError("");
    setSuccess("");
    setNotInPersonnel(false);
    setShowSuggestions(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedId = personId.trim();
    if (!trimmedId) return;
    setError("");
    setSuccess("");
    setNotInPersonnel(false);

    const found = personnel.find((p) => p.person_id === trimmedId);
    if (!found) {
      setNotInPersonnel(true);
      return;
    }
    if (assignedIds.has(trimmedId)) {
      setError("האדם כבר משובץ בחדר אחר. השתמש בהעברה או בהחלפה.");
      return;
    }

    setLoading(true);
    try {
      const res = await assignPersonToRoom(
        room.building_name,
        room.room_number,
        trimmedId,
        dataVersion,
      );
      if (!res.ok) {
        throw new Error(res.detail || "שגיאה בשיבוץ לחדר");
      }
      toast.success(`${selectedName || personId} שובץ בהצלחה`);
      setSuccess(`${selectedName || personId} שובץ בהצלחה`);
      setPersonId("");
      setSelectedName("");
      setShowSuggestions(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
        <div className="flex min-w-0 flex-col gap-1.5">
          <Input
            ref={inputRef}
            type="text"
            value={personId}
            onChange={(e) => {
              setPersonId(e.target.value);
              setSelectedName("");
              setError("");
              setSuccess("");
              setNotInPersonnel(false);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            placeholder="הקלד מזהה או שם לחיפוש"
            autoComplete="off"
          />
          {showSuggestions ? (
            suggestions.length > 0 ? (
              <div className="overflow-hidden rounded-xl border border-border/70 bg-popover/95 shadow-lg backdrop-blur-sm">
                <div className="flex items-center justify-between border-b border-border/60 px-3 py-2 text-[11px]">
                  <span className="font-semibold text-foreground">
                    {hasQuery ? "תוצאות זמינות לשיבוץ" : "אנשים פנויים לשיבוץ"}
                  </span>
                  <span className="text-muted-foreground">
                    {suggestions.length} / {availablePersonnel.length}
                  </span>
                </div>
                <div
                  ref={listRef}
                  className="scrollbar-subtle max-h-[192px] overflow-y-auto p-1.5"
                >
                  {suggestions.slice(0, 20).map((p) => {
                    return (
                      <button
                        key={p.person_id}
                        type="button"
                        onMouseDown={() => selectPerson(p)}
                        className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-right transition-[background-color,transform] duration-75 hover:bg-accent active:bg-accent/70"
                      >
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
                          {p.full_name
                            ? p.full_name.charAt(0)
                            : p.person_id.slice(-2)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold text-foreground">
                            {p.full_name}
                          </p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {p.person_id}
                          </p>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <Badge variant="secondary" className="text-[10px]">
                            {deptHe(p.department)}
                          </Badge>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-border/70 bg-popover/95 px-3 py-3 text-[11px] text-muted-foreground shadow-lg backdrop-blur-sm">
                <p className="font-semibold text-foreground">אין כרגע תוצאות להצגה</p>
                <p className="mt-1 leading-5">{assignmentEmptyMessage}</p>
              </div>
            )
          ) : null}
        </div>
        <Button
          type="submit"
          disabled={loading || !personId.trim()}
          className="shrink-0"
        >
          <IconUserPlus size={14} />
          {loading ? "משבץ..." : "שבץ לחדר"}
        </Button>
      </div>

      {selectedName ? (
        <p className="text-xs text-foreground/80">
          נבחר: {selectedName} ({personId})
        </p>
      ) : null}

      {notInPersonnel ? (
        <p className="rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
          {auth.role === "manager"
            ? `המזהה לא נמצא ברשימת כוח האדם של זירת ${deptHe(auth.department || "")}.`
            : "המזהה לא נמצא ברשימת כוח האדם."}
          {personnelUrl ? (
            <>
              {" "}
              יש לבצע צ׳ק אין{" "}
              <a
                href={personnelUrl}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-destructive underline"
              >
                בקישור זה
              </a>
            </>
          ) : auth.role === "manager" ? (
            " אם האדם שייך לזירה אחרת, יש לפנות למנהל הזירה המתאים."
          ) : (
            " יש להגדיר קישור כוח אדם במסך ההגדרות."
          )}
        </p>
      ) : null}

      {error ? (
        <p className="rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="rounded-md bg-[var(--success-dim)] px-2 py-1.5 text-xs text-[var(--success)]">
          {success}
        </p>
      ) : null}
    </form>
  );
}
