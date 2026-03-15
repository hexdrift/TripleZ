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
  releaseSavedAssignment,
  deleteRoom,
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
  IconCrown,
  IconGender,
  IconCheck,
  IconTrash,
  IconRefresh,
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
import {
  isRoomAssignableByManager,
  isHighestRankRoom,
  getOccupantDepartment,
} from "@/lib/room-utils";

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
  _rankOrder?: string[],
): boolean {
  if (!person || !room) return false;
  const pg = (person.gender || "").trim();
  if (pg && pg !== String(room.gender)) return false;
  return true;
}

export function RoomDetailModal({ room, onClose }: RoomDetailModalProps) {
  const { rooms, personnel, auth, dataVersion } = useAppData();
  const [selectedBed, setSelectedBed] = useState<number | null>(null);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [view, setView] = useState<ModalView>(
    auth.role === "admin" ? "chooser" : "assignments",
  );
  const [direction, setDirection] = useState(1);
  const [highestRank, setHighestRank] = useState<string | null>(null);

  const personnelMap = useMemo(
    () => new Map(personnel.map((p) => [p.person_id, p])),
    [personnel],
  );

  useEffect(() => {
    let active = true;
    getAuthContext()
      .then((ctx) => { if (active) setHighestRank(ctx.ranks_high_to_low[0] ?? null); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  const roomKey = room ? `${room.building_name}-${room.room_number}` : null;

  const liveRoom = useMemo(() => {
    if (!roomKey) return null;
    return rooms.find(
      (r) => `${r.building_name}-${r.room_number}` === roomKey,
    ) || null;
  }, [rooms, roomKey]);

  useEffect(() => {
    if (!roomKey) return;
    setSelectedBed(null);
    setView(auth.role === "admin" ? "chooser" : "assignments");
  }, [auth.role, roomKey]);

  // Reset selection if SSE update makes the selected bed index out of bounds
  useEffect(() => {
    if (selectedBed !== null && liveRoom && selectedBed >= liveRoom.number_of_beds) {
      setSelectedBed(null);
      setView(auth.role === "admin" ? "chooser" : "assignments");
    }
  }, [liveRoom, selectedBed, auth.role]);

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

  async function handleResetRoom() {
    if (!liveRoom) return;
    setResetting(true);
    try {
      const idsToUnassign = isManager
        ? liveRoom.occupant_ids.filter((id) => {
            const p = personnelMap.get(id);
            return p?.department === managerDept;
          })
        : [...liveRoom.occupant_ids];
      const reservedToRelease = isManager
        ? (liveRoom.reserved_persons || []).filter((rp) => rp.department === managerDept)
        : (liveRoom.reserved_persons || []);

      for (const pid of idsToUnassign) {
        await unassignPerson(pid);
      }
      for (const rp of reservedToRelease) {
        await releaseSavedAssignment(rp.person_id);
      }
      toast.success(`חדר ${liveRoom.room_number} אופס בהצלחה`);
      setSelectedBed(null);
    } catch {
      toast.error("שגיאה באיפוס החדר");
    } finally {
      setResetting(false);
    }
  }

  async function handleDeleteRoom() {
    if (!liveRoom) return;
    try {
      await deleteRoom(liveRoom.building_name, liveRoom.room_number);
      toast.success(`חדר ${liveRoom.room_number} נמחק`);
      onClose();
    } catch {
      toast.error("שגיאה במחיקת החדר");
    }
  }

  if (!liveRoom) return null;

  const primaryDept = liveRoom.departments[0] || "";
  const deptColor = DEPT_COLORS[primaryDept] || DEFAULT_DEPT_COLOR;
  const total = liveRoom.number_of_beds;
  const bedsPerRow =
    total <= 10
      ? Math.ceil(total / 2)
      : Math.min(6, Math.ceil(total / Math.ceil(total / 6)));

  const reservedPersons = liveRoom.reserved_persons || [];
  const bedOccupants = Array.from({ length: total }, (_, i) => {
    if (i < liveRoom.occupant_ids.length) {
      const personId = liveRoom.occupant_ids[i];
      return { personId, name: liveRoom.occupant_names?.[personId] || "", reserved: false as const };
    }
    const reservedIdx = i - liveRoom.occupant_ids.length;
    if (reservedIdx >= 0 && reservedIdx < reservedPersons.length) {
      const rp = reservedPersons[reservedIdx];
      return { personId: rp.person_id, name: rp.full_name, reserved: true as const, department: rp.department, rank: rp.rank, savedAt: rp.saved_at };
    }
    return null;
  });

  const selectedBedData = selectedBed !== null ? bedOccupants[selectedBed] : null;
  const selectedOccupant = selectedBedData && !selectedBedData.reserved ? selectedBedData : null;
  const selectedReserved = selectedBedData?.reserved ? selectedBedData : null;
  const selectedBedIsEmpty = selectedBed !== null && !selectedBedData;
  const isAdmin = auth.role === "admin";
  const isManager = !isAdmin;
  const managerDept = auth.department || "";
  const roomIsHighestRank = isManager && isHighestRankRoom(liveRoom, highestRank);
  const roomIsAssignable = isManager
    ? isRoomAssignableByManager(liveRoom, managerDept, personnelMap)
    : true;
  const hasOccupantsOrReserved = liveRoom.occupant_ids.length > 0 || (liveRoom.reserved_persons?.length ?? 0) > 0;
  const allOccupantsAreDept = isManager && liveRoom.occupant_ids.length > 0 && liveRoom.occupant_ids.every((id) => {
    const p = personnelMap.get(id);
    return p?.department === managerDept;
  });
  const canReset = hasOccupantsOrReserved && (isAdmin || (isManager && (roomIsAssignable || allOccupantsAreDept)));
  const showBack = view === "detail" || (isAdmin && view !== "chooser");

  const modalTitle =
    view === "detail" && selectedBed !== null
      ? selectedOccupant
        ? selectedOccupant.name || `מיטה ${selectedBed + 1}`
        : selectedReserved
        ? `מיטה ${selectedBed + 1} — שמורה`
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
              {isAdmin && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setConfirmDeleteOpen(true)}
                  aria-label="מחיקת חדר"
                  className="rounded-lg text-muted-foreground hover:text-destructive"
                >
                  <IconTrash size={16} />
                </Button>
              )}
              {canReset && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setConfirmResetOpen(true)}
                  disabled={resetting}
                  aria-label="איפוס חדר"
                  className="rounded-lg text-muted-foreground hover:text-destructive"
                >
                  <IconRefresh size={18} />
                </Button>
              )}
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
                              // Manager scoping: mask other-dept beds, hide empty in non-assignable rooms
                              const isOtherDept = isManager && occ && !occ.reserved
                                && getOccupantDepartment(occ.personId, personnelMap) !== managerDept;
                              const hideEmptyBed = isManager && !occ && !roomIsAssignable;
                              if (hideEmptyBed) {
                                return (
                                  <ClickableBed
                                    key={bedIdx}
                                    index={bedIdx}
                                    occupied={false}
                                    reserved={false}
                                    selected={false}
                                    deptColor={deptColor}
                                    disabled
                                  />
                                );
                              }
                              return (
                                <ClickableBed
                                  key={bedIdx}
                                  index={bedIdx}
                                  occupied={!!occ && !occ.reserved}
                                  reserved={!!occ?.reserved}
                                  selected={false}
                                  deptColor={isOtherDept ? DEFAULT_DEPT_COLOR : deptColor}
                                  label={
                                    isOtherDept
                                      ? "זירה אחרת"
                                      : occ
                                        ? occ.reserved
                                          ? occ.name || "שמורה"
                                          : occ.name || occ.personId.slice(-4)
                                        : undefined
                                  }
                                  onClick={isOtherDept ? undefined : () => handleBedClick(bedIdx)}
                                  disabled={!!isOtherDept}
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
                    {reservedPersons.length > 0 && (
                      <Legend color="#F59E0B" label="שמורה" />
                    )}
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
                    disableActions={roomIsHighestRank}
                    managerDept={isManager ? managerDept : null}
                  />
                ) : selectedReserved ? (
                  <ReservedBedDetail
                    personId={selectedReserved.personId}
                    name={selectedReserved.name}
                    department={selectedReserved.department}
                    rank={selectedReserved.rank}
                    savedAt={selectedReserved.savedAt}
                    bedIndex={selectedBed! + 1}
                  />
                ) : selectedBedIsEmpty ? (
                  <div className="space-y-3">
                    {roomIsHighestRank ? (
                      <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                        חדרי {rankHe(highestRank || "")} מנוהלים על ידי מנהל מערכת בלבד.
                      </p>
                    ) : isManager && !roomIsAssignable ? (
                      <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                        ניתן לשבץ רק לחדרים שתפוסים ברובם על ידי אנשי הזירה שלך.
                      </p>
                    ) : (
                      <>
                        {isManager ? (
                          <p className="text-xs text-muted-foreground">
                            ניתן לשבץ כאן רק אנשים מזירת{" "}
                            {deptHe(managerDept)}.
                          </p>
                        ) : null}
                        <RoomAssignForm
                          room={liveRoom}
                          personnel={isManager
                            ? personnel.filter((p) => p.department === managerDept)
                            : personnel}
                        />
                      </>
                    )}
                  </div>
                ) : null}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
      <ConfirmationDialog
        open={confirmResetOpen}
        title="לאפס את החדר?"
        description={`כל השיבוצים והשמירות בחדר ${liveRoom.room_number} יוסרו.`}
        confirmLabel="אפס"
        confirmIcon={<IconRefresh size={14} />}
        onOpenChange={setConfirmResetOpen}
        onConfirm={() => {
          setConfirmResetOpen(false);
          handleResetRoom();
        }}
      />
      <ConfirmationDialog
        open={confirmDeleteOpen}
        title="למחוק את החדר?"
        description={`חדר ${liveRoom.room_number} במבנה ${buildingHe(liveRoom.building_name)} יימחק לצמיתות כולל כל השיבוצים בו.`}
        confirmLabel="מחק"
        confirmIcon={<IconTrash size={14} />}
        onOpenChange={setConfirmDeleteOpen}
        onConfirm={() => {
          setConfirmDeleteOpen(false);
          handleDeleteRoom();
        }}
      />
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
                עריכת פרטי חדר
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
      const successMessage = "פרטי החדר עודכנו.";
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
    <div className="space-y-5">
      {error ? (
        <p className="rounded-lg bg-destructive/10 border border-destructive/30 px-4 py-3 text-[13px] text-destructive">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="rounded-lg bg-[var(--success-dim)] border border-[var(--success)]/30 px-4 py-3 text-[13px] text-[var(--success)]">
          {success}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="room-beds" className="text-xs font-semibold text-muted-foreground gap-1.5">
            <span className="text-muted-foreground/70"><IconBed size={15} /></span>
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

        <div className="space-y-2">
          <Label className="text-xs font-semibold text-muted-foreground gap-1.5">
            <span className="text-muted-foreground/70"><IconCrown size={15} /></span>
            דרגת חדר
          </Label>
          <Select value={rank} onValueChange={setRank}>
            <SelectTrigger className="w-full">
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

        <div className="space-y-2">
          <Label className="text-xs font-semibold text-muted-foreground gap-1.5">
            <span className="text-muted-foreground/70"><IconGender size={15} /></span>
            מגדר
          </Label>
          <Select value={gender} onValueChange={setGender}>
            <SelectTrigger className="w-full">
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

        <div className="space-y-2">
          <Label className="text-xs font-semibold text-muted-foreground gap-1.5">
            <span className="text-muted-foreground/70"><IconBuilding size={15} /></span>
            זירה מועדפת
          </Label>
          <Select value={department} onValueChange={setDepartment}>
            <SelectTrigger className="w-full">
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

      <div className="flex justify-center border-t pt-5">
        <Button
          onClick={handleSave}
          disabled={loading}
          className="w-full max-w-[520px] gap-2"
        >
          <IconCheck size={15} />
          {loading ? "שומר..." : "שמור פרטי חדר"}
        </Button>
      </div>
    </div>
  );
}

function ClickableBed({
  index,
  occupied,
  reserved = false,
  selected,
  deptColor,
  label,
  onClick,
  disabled = false,
}: {
  index: number;
  occupied: boolean;
  reserved?: boolean;
  selected: boolean;
  deptColor: typeof DEFAULT_DEPT_COLOR;
  label?: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const fill = reserved
    ? "rgba(245, 158, 11, 0.15)"
    : occupied
    ? deptColor.bg
    : "var(--surface-1)";
  const stroke = reserved
    ? "#F59E0B"
    : occupied
    ? deptColor.strong
    : "var(--border)";
  const hoverBg = reserved
    ? "rgba(245, 158, 11, 0.22)"
    : occupied
    ? deptColor.bg
    : "var(--color-muted)";

  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={cn(
        "relative flex min-w-[52px] max-w-[80px] flex-1 select-none flex-col items-center rounded-lg p-1 transform-gpu transition-[transform,background-color,box-shadow,ring-color,opacity] duration-75 ease-out motion-reduce:transform-none motion-reduce:transition-none",
        disabled ? "cursor-default opacity-50" : "cursor-pointer active:scale-[0.93]",
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
        if (!selected && !disabled) e.currentTarget.style.backgroundColor = hoverBg;
      }}
      onMouseLeave={(e) => {
        if (!selected && !disabled) e.currentTarget.style.backgroundColor = "";
      }}
      title={
        reserved
          ? `מיטה ${index + 1} - שמורה`
          : occupied
          ? `מיטה ${index + 1} - תפוסה`
          : `מיטה ${index + 1} - פנויה`
      }
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 200 200"
        className={cn("h-auto w-full", (occupied || reserved) ? "opacity-100" : "opacity-40")}
        style={{ color: reserved ? "#F59E0B" : occupied ? stroke : undefined }}
      >
        <g fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
          <rect x="42" y="20" width="116" height="24" rx="6" />
          <rect x="50" y="36" width="100" height="144" rx="8" />
          <rect x="65" y="48" width="70" height="32" rx="10" />
          <path d="M 46 95 L 154 95 L 154 172 C 154 179.7 147.7 186 140 186 L 60 186 C 52.3 186 46 179.7 46 172 Z" />
          <rect x="46" y="85" width="108" height="20" rx="6" />
        </g>
        <g fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M 78 64 Q 100 68 122 64" />
          <path d="M 75 120 Q 85 145 75 170" />
          <path d="M 125 120 Q 115 145 125 170" />
        </g>
        {reserved && (
          <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
            <path d="M 86 97 V 85 A 14 14 0 0 1 114 85 V 97" strokeWidth="3" />
            <rect x="76" y="97" width="48" height="34" rx="6" strokeWidth="3.5" />
            <circle cx="100" cy="110" r="3" strokeWidth="2.5" />
            <path d="M 100 113 L 96 121 H 104 Z" strokeWidth="2.5" />
          </g>
        )}
      </svg>
      <span
        className={cn(
          "mt-0.5 max-w-full truncate px-0.5 text-[9px] font-bold",
          !occupied && !reserved && "text-muted-foreground",
        )}
        style={
          reserved
            ? { color: "#F59E0B" }
            : occupied
            ? { color: deptColor.strong }
            : undefined
        }
      >
        {label || `מיטה ${index + 1}`}
      </span>
    </button>
  );
}

function ReservedBedDetail({
  personId,
  name,
  department,
  rank,
  savedAt,
  bedIndex,
}: {
  personId: string;
  name: string;
  department: string;
  rank: string;
  savedAt: string;
  bedIndex: number;
}) {
  const { auth } = useAppData();
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const formattedDate = savedAt
    ? new Date(savedAt).toLocaleDateString("he-IL", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "";

  async function handleRelease() {
    setLoading(true);
    try {
      await releaseSavedAssignment(personId);
      toast.success("שמירת המיטה שוחררה");
    } catch {
      toast.error("שגיאה בשחרור השמירה");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="space-y-3 p-4 border-amber-300/50 bg-amber-50/30 dark:bg-amber-950/20">
      <div className="flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        <span className="text-sm font-semibold" style={{ color: "#D97706" }}>
          מיטה {bedIndex} — שמורה
        </span>
      </div>
      <Separator />
      <div className="grid grid-cols-2 gap-y-2 text-xs">
        <span className="text-muted-foreground">שם</span>
        <span className="font-medium">{name || "—"}</span>
        <span className="text-muted-foreground">זירה</span>
        <span className="font-medium">{department || "—"}</span>
        <span className="text-muted-foreground">דרגה</span>
        <span className="font-medium">{rank || "—"}</span>
        {formattedDate && (
          <>
            <span className="text-muted-foreground">נשמר בתאריך</span>
            <span className="font-medium">{formattedDate}</span>
          </>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        מיטה זו שמורה עבור אדם זה. כשיופיע בעדכון כוח אדם הבא, הוא ישובץ חזרה אוטומטית.
      </p>
      {(auth.role === "admin" || (auth.role === "manager" && department === auth.department)) && (
        <Button
          variant="outline"
          size="sm"
          className="w-full border-amber-400/50 text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/40"
          disabled={loading}
          onClick={() => setConfirmOpen(true)}
        >
          שחרר שמירה
        </Button>
      )}
      <ConfirmationDialog
        open={confirmOpen}
        title="לשחרר שמירת מיטה?"
        description={`המיטה תשוחרר ו${name || personId} לא ישובץ אוטומטית בעדכון הבא.`}
        confirmLabel="שחרר"
        confirmIcon={<IconTrash size={14} />}
        onOpenChange={setConfirmOpen}
        onConfirm={() => {
          setConfirmOpen(false);
          handleRelease();
        }}
      />
    </Card>
  );
}

type OccupantAction = null | "swap" | "move";

function OccupantDetail({
  personId,
  name,
  bedIndex,
  disableActions = false,
  managerDept = null,
}: {
  personId: string;
  name: string;
  bedIndex: number;
  disableActions?: boolean;
  managerDept?: string | null;
}) {
  const { personnel, rooms, auth, dataVersion } = useAppData();
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState<OccupantAction>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false);
  const [rankOrder, setRankOrder] = useState<string[]>([]);

  const person = personnel.find((p) => p.person_id === personId);
  const pMap = useMemo(
    () => new Map(personnel.map((p) => [p.person_id, p])),
    [personnel],
  );
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
      setError("שגיאה בהסרה מהחדר");
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
          <InfoRow label="מספר אישי" value={personId} />
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
      {disableActions ? (
        <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          חדר זה מנוהל על ידי מנהל מערכת בלבד — לא ניתן לבצע פעולות.
        </p>
      ) : (
        <div className={cn("grid gap-2", (auth.role === "admin" || (auth.role === "manager" && person?.department === managerDept)) ? "grid-cols-3" : "grid-cols-2")}>
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
          {(auth.role === "admin" || (auth.role === "manager" && person?.department === managerDept)) ? (
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
      )}

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
              personnel={managerDept ? personnel.filter((p) => p.department === managerDept) : personnel}
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
              rooms={managerDept
                ? rooms.filter((r) => isRoomAssignableByManager(r, managerDept, pMap))
                : rooms}
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
        confirmIcon={<IconUserMinus size={14} />}
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
                <p className="mt-1 leading-5">אפשר לחפש לפי שם, מספר אישי או חדר נוכחי.</p>
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
              {buildingHe(targetBuilding)}
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
              {buildingHe(b)}
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
        const pg = (person.gender || "").trim();
        if (pg && pg !== room.gender) return false;
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
            placeholder="הקלד מספר אישי או שם לחיפוש"
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
            ? `המספר האישי לא נמצא ברשימת כוח האדם של זירת ${deptHe(auth.department || "")}.`
            : "המספר האישי לא נמצא ברשימת כוח האדם."}
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
