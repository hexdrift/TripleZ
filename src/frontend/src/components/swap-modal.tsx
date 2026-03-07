"use client";

import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "react-toastify";
import { movePerson, swapPeople } from "@/lib/api";
import { buildingHe, deptHe, rankHe } from "@/lib/hebrew";
import { cn } from "@/lib/utils";
import { Personnel, Room } from "@/lib/types";
import { useAppData } from "./app-shell";
import {
  IconAlertCircle,
  IconCheck,
  IconMove,
  IconSearch,
  IconSwap,
  IconX,
} from "./icons";

import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface SwapModalProps {
  open: boolean;
  onClose: () => void;
}

const panelTransition = { duration: 0.15, ease: "easeOut" as const };

function isGenderCompatible(person: Pick<Personnel, "gender"> | null | undefined, room: Pick<Room, "gender"> | null | undefined) {
  if (!person || !room) return false;
  return String(person.gender) === String(room.gender);
}

function isSwapPairCompatible(
  personA: Personnel | null,
  roomA: Room | undefined,
  personB: Personnel | null,
  roomB: Room | undefined,
) {
  if (!personA || !personB || !roomA || !roomB) return false;
  return isGenderCompatible(personA, roomB) && isGenderCompatible(personB, roomA);
}

export function SwapModal({ open, onClose }: SwapModalProps) {
  const [tab, setTab] = useState<"swap" | "move">("swap");

  const handleClose = useCallback(() => {
    setTab("swap");
    onClose();
  }, [onClose]);

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) handleClose();
      }}
    >
      <DialogContent
        className="max-h-[calc(100vh-32px)] gap-0 rounded-3xl border-border/70 bg-background p-0 shadow-2xl shadow-black/10 sm:max-w-[860px]"
        showCloseButton={false}
      >
        {/* Header: title + close + tabs */}
        <div className="px-6 pt-5 pb-3">
          <DialogDescription className="sr-only">
            החלפה בין משובצים או העברה לחדר אחר
          </DialogDescription>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg font-semibold tracking-tight text-foreground">
              החלפות והעברות
            </DialogTitle>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleClose}
              aria-label="סגור"
              className="rounded-xl text-muted-foreground hover:text-foreground"
            >
              <IconX size={16} />
            </Button>
          </div>
        </div>

        {/* Tabs - full width */}
        <div className="grid grid-cols-2 border-b border-border/70">
          <TabButton
            active={tab === "swap"}
            onClick={() => setTab("swap")}
            icon={<IconSwap size={15} />}
            label="החלפה"
          />
          <TabButton
            active={tab === "move"}
            onClick={() => setTab("move")}
            icon={<IconMove size={15} />}
            label="העברה"
          />
        </div>

        {/* Content */}
        <div className="max-h-[calc(100vh-180px)] overflow-y-auto overflow-x-hidden px-8 pt-6 pb-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={panelTransition}
            >
              {tab === "swap" ? <SwapTab /> : <MoveTab />}
            </motion.div>
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative flex select-none items-center justify-center gap-2 py-3.5 text-[13px] font-semibold cursor-pointer transform-gpu transition-[transform,color,opacity] duration-120 ease-[cubic-bezier(0.2,0.8,0.2,1)] active:translate-y-[0.5px] motion-reduce:transform-none motion-reduce:transition-none",
        active
          ? "text-foreground"
          : "text-muted-foreground hover:text-foreground/70",
      )}
    >
      {icon}
      {label}
      {active && (
        <motion.div
          layoutId="swap-tab-indicator"
          className="absolute inset-x-0 bottom-0 h-[2px] bg-foreground"
          transition={{ duration: 0.16, ease: "easeOut" }}
        />
      )}
    </button>
  );
}

function SwapTab() {
  const { rooms, personnel, dataVersion } = useAppData();
  const [personA, setPersonA] = useState<Personnel | null>(null);
  const [personB, setPersonB] = useState<Personnel | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const roomMap = useMemo(() => {
    const map = new Map<string, Room>();
    for (const room of rooms) {
      for (const id of room.occupant_ids) map.set(id, room);
    }
    return map;
  }, [rooms]);

  const roomA = personA ? roomMap.get(personA.person_id) : undefined;
  const roomB = personB ? roomMap.get(personB.person_id) : undefined;
  const sameRoom =
    !!roomA &&
    !!roomB &&
    roomA.building_name === roomB.building_name &&
    roomA.room_number === roomB.room_number;
  const compatiblePair = isSwapPairCompatible(personA, roomA, personB, roomB);

  async function handleSwap() {
    if (!personA || !personB || sameRoom) return;
    if (!compatiblePair) {
      const message = "ניתן לבצע החלפה רק בין אנשים מאותו מגדר.";
      setError(message);
      toast.error(message);
      return;
    }
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      const res = await swapPeople(personA.person_id, personB.person_id, dataVersion);
      if (res.ok) {
        const msg = `${personA.full_name} ו${personB.full_name} הוחלפו בהצלחה`;
        setSuccess(msg);
        toast.success(msg);
        setPersonA(null);
        setPersonB(null);
      } else {
        setError(res.detail || "ההחלפה נכשלה");
        toast.error(res.detail || "ההחלפה נכשלה");
      }
    } catch {
      setError("שגיאת חיבור");
      toast.error("שגיאת חיבור");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <PickerSection label="אדם א׳">
          <PersonPicker
            personnel={personnel}
            selected={personA}
            onSelect={(p) => {
              setPersonA(p);
              if (p && personB) {
                const personBRoom = roomMap.get(personB.person_id);
                const personARoom = roomMap.get(p.person_id);
                if (!isSwapPairCompatible(p, personARoom, personB, personBRoom)) {
                  setPersonB(null);
                }
              }
              setError("");
              setSuccess("");
            }}
            excludeId={personB?.person_id}
            onlyAssigned
            roomMap={roomMap}
            isSelectable={(candidate, candidateRoom) => {
              if (!personB) return true;
              const roomOfB = roomMap.get(personB.person_id);
              return isSwapPairCompatible(candidate, candidateRoom, personB, roomOfB);
            }}
          />
        </PickerSection>

        <PickerSection label="אדם ב׳">
          <PersonPicker
            personnel={personnel}
            selected={personB}
            onSelect={(p) => {
              setPersonB(p);
              if (p && personA) {
                const personARoom = roomMap.get(personA.person_id);
                const personBRoom = roomMap.get(p.person_id);
                if (!isSwapPairCompatible(personA, personARoom, p, personBRoom)) {
                  setPersonA(null);
                }
              }
              setError("");
              setSuccess("");
            }}
            excludeId={personA?.person_id}
            onlyAssigned
            roomMap={roomMap}
            isSelectable={(candidate, candidateRoom) => {
              if (!personA) return true;
              const roomOfA = roomMap.get(personA.person_id);
              return isSwapPairCompatible(personA, roomOfA, candidate, candidateRoom);
            }}
          />
        </PickerSection>
      </div>

      {sameRoom && <AlertBox type="error">שני האנשים כבר באותו חדר.</AlertBox>}

      {personA && personB && !sameRoom && (
        <div className="rounded-2xl border border-border/70 bg-muted/10 p-4">
          <div className="space-y-3">
            <SummaryRow person={personA} fromRoom={roomA} toRoom={roomB} />
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-border/60" />
              <span className="text-muted-foreground">
                <IconSwap size={14} />
              </span>
              <div className="h-px flex-1 bg-border/60" />
            </div>
            <SummaryRow person={personB} fromRoom={roomB} toRoom={roomA} />
          </div>
        </div>
      )}

      {error && !sameRoom ? <AlertBox type="error">{error}</AlertBox> : null}
      {success ? <AlertBox type="success">{success}</AlertBox> : null}

      <Button
        onClick={handleSwap}
        disabled={loading || !personA || !personB || sameRoom || !compatiblePair}
        className="w-full rounded-xl"
      >
        <IconSwap size={15} />
        {loading ? "מחליף..." : "בצע החלפה"}
      </Button>
    </div>
  );
}

function MoveTab() {
  const { rooms, personnel, dataVersion } = useAppData();
  const [person, setPerson] = useState<Personnel | null>(null);
  const [targetBuilding, setTargetBuilding] = useState("");
  const [targetRoom, setTargetRoom] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const roomMap = useMemo(() => {
    const map = new Map<string, Room>();
    for (const room of rooms) {
      for (const id of room.occupant_ids) map.set(id, room);
    }
    return map;
  }, [rooms]);

  const currentRoom = person ? roomMap.get(person.person_id) : undefined;

  const buildings = useMemo(() => {
    if (!person) return [];
    return [...new Set(
      rooms
        .filter((room) => {
          if (room.available_beds <= 0) return false;
          if (!isGenderCompatible(person, room)) return false;
          if (!currentRoom) return true;
          return !(
            room.building_name === currentRoom.building_name
            && room.room_number === currentRoom.room_number
          );
        })
        .map((room) => room.building_name),
    )].sort();
  }, [rooms, person, currentRoom]);

  const availableRooms = useMemo(() => {
    if (!targetBuilding || !person) return [];
    return rooms
      .filter((room) => {
        if (room.building_name !== targetBuilding || room.available_beds <= 0)
          return false;
        if (!isGenderCompatible(person, room)) return false;
        if (!currentRoom) return true;
        return !(
          room.building_name === currentRoom.building_name &&
          room.room_number === currentRoom.room_number
        );
      })
      .sort((a, b) => a.room_number - b.room_number);
  }, [rooms, targetBuilding, currentRoom, person]);

  const targetRoomDetails = availableRooms.find(
    (room) => String(room.room_number) === targetRoom,
  );

  async function handleMove() {
    if (!person || !targetBuilding || !targetRoom) return;
    const roomNumber = Number(targetRoom);
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      const res = await movePerson(
        person.person_id,
        targetBuilding,
        roomNumber,
        dataVersion,
      );
      if (res.ok) {
        const msg = `${person.full_name} הועבר/ה למבנה ${buildingHe(targetBuilding)}, חדר ${roomNumber}`;
        setSuccess(msg);
        toast.success(msg);
        setPerson(null);
        setTargetBuilding("");
        setTargetRoom("");
      } else {
        setError(res.detail || "ההעברה נכשלה");
        toast.error(res.detail || "ההעברה נכשלה");
      }
    } catch {
      setError("שגיאת חיבור");
      toast.error("שגיאת חיבור");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <PickerSection label="אדם להעברה">
        <PersonPicker
          personnel={personnel}
          selected={person}
          onSelect={(p) => {
            setPerson(p);
            setTargetBuilding("");
            setTargetRoom("");
            setError("");
            setSuccess("");
          }}
          onlyAssigned
          roomMap={roomMap}
        />
      </PickerSection>

      {person && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="space-y-3"
        >
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">מבנה יעד</Label>
            <div className="grid grid-cols-4 gap-1.5">
              {buildings.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => {
                    setTargetBuilding(b);
                    setTargetRoom("");
                    setError("");
                    setSuccess("");
                  }}
                  className={cn(
                    "relative h-10 rounded-xl border text-[13px] font-medium cursor-pointer transform-gpu transition-[transform,background-color,color,border-color,box-shadow] duration-120 ease-[cubic-bezier(0.2,0.8,0.2,1)] active:translate-y-[0.5px] active:scale-[0.99] motion-reduce:transform-none motion-reduce:transition-none",
                    targetBuilding === b
                      ? "border-foreground bg-foreground text-background shadow-sm"
                      : "border-border/70 bg-background text-foreground hover:border-foreground/30 hover:bg-muted/40",
                  )}
                >
                  מבנה {buildingHe(b)}
                </button>
              ))}
            </div>
          </div>

          <AnimatePresence mode="wait">
            {targetBuilding && (
              <motion.div
                key={targetBuilding}
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.12, ease: "easeOut" }}
                className="overflow-hidden"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">
                      חדר יעד
                    </Label>
                    <span className="text-[11px] text-muted-foreground">
                      {availableRooms.length} פנויים
                    </span>
                  </div>
                  {availableRooms.length > 0 ? (
                    <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                      {availableRooms.map((room) => (
                        <button
                          key={`${room.building_name}-${room.room_number}`}
                          type="button"
                          onClick={() => {
                            setTargetRoom(String(room.room_number));
                            setError("");
                            setSuccess("");
                          }}
                          className={cn(
                            "relative flex flex-col items-center gap-0.5 rounded-xl border px-2 py-2 text-center cursor-pointer transform-gpu transition-[transform,background-color,color,border-color,box-shadow] duration-120 ease-[cubic-bezier(0.2,0.8,0.2,1)] active:translate-y-[0.5px] active:scale-[0.99] motion-reduce:transform-none motion-reduce:transition-none",
                            targetRoom === String(room.room_number)
                              ? "border-foreground bg-foreground text-background shadow-sm"
                              : "border-border/70 bg-background text-foreground hover:border-foreground/30 hover:bg-muted/40",
                          )}
                        >
                          <span className="text-sm font-semibold">
                            חדר {room.room_number}
                          </span>
                          <span
                            className={cn(
                              "text-[10px]",
                              targetRoom === String(room.room_number)
                                ? "text-background/70"
                                : "text-muted-foreground",
                            )}
                          >
                            {room.available_beds} פנויות ·{" "}
                            {rankHe(room.room_rank)}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-border/70 px-4 py-3 text-center text-sm text-muted-foreground">
                      אין חדרים פנויים במבנה זה
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}

      {person && targetRoomDetails && (
        <div className="rounded-2xl border border-border/70 bg-muted/10 p-4">
          <SummaryRow
            person={person}
            fromRoom={currentRoom}
            toRoom={targetRoomDetails}
          />
        </div>
      )}

      {error ? <AlertBox type="error">{error}</AlertBox> : null}
      {success ? <AlertBox type="success">{success}</AlertBox> : null}

      <Button
        onClick={handleMove}
        disabled={loading || !person || !targetBuilding || !targetRoom}
        className="w-full rounded-xl"
      >
        <IconMove size={15} />
        {loading ? "מעביר..." : "בצע העברה"}
      </Button>
    </div>
  );
}

function PickerSection({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

function PersonPicker({
  personnel,
  selected,
  onSelect,
  excludeId,
  onlyAssigned,
  roomMap,
  isSelectable,
}: {
  personnel: Personnel[];
  selected: Personnel | null;
  onSelect: (person: Personnel | null) => void;
  excludeId?: string;
  onlyAssigned?: boolean;
  roomMap: Map<string, Room>;
  isSelectable?: (person: Personnel, room: Room | undefined) => boolean;
}) {
  const [query, setQuery] = useState("");
  const [showList, setShowList] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    let list = personnel;
    if (onlyAssigned)
      list = list.filter((person) => roomMap.has(person.person_id));
    if (excludeId)
      list = list.filter((person) => person.person_id !== excludeId);
    if (isSelectable) {
      list = list.filter((person) => isSelectable(person, roomMap.get(person.person_id)));
    }
    if (!query.trim()) return list;
    const normalizedQuery = query.toLowerCase();
    return list.filter(
      (person) =>
        person.person_id.toLowerCase().includes(normalizedQuery) ||
        person.full_name.toLowerCase().includes(normalizedQuery),
    );
  }, [personnel, query, excludeId, onlyAssigned, roomMap, isSelectable]);

  const visibleResults = filtered.slice(0, 6);
  const selectedRoom = selected ? roomMap.get(selected.person_id) : undefined;

  useEffect(() => {
    function onMouseDown(event: MouseEvent) {
      const target = event.target as Node;
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

  if (selected) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-background p-3">
        <PersonAvatar person={selected} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold text-foreground">
              {selected.full_name}
            </p>
            <span className="text-[11px] text-muted-foreground">
              {selected.person_id}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {deptHe(selected.department)} · {rankHe(selected.rank)}
            {selectedRoom ? ` · ${roomLocationLabel(selectedRoom)}` : ""}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => {
            onSelect(null);
            setQuery("");
            setShowList(false);
          }}
          className="shrink-0 rounded-lg text-muted-foreground hover:text-foreground"
        >
          <IconX size={14} />
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground">
          <IconSearch size={15} />
        </div>

        <Input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setShowList(true);
          }}
          onFocus={() => setShowList(true)}
          className="h-11 rounded-xl border-border/70 bg-background pr-10 shadow-none"
          placeholder="חפש לפי שם או מזהה"
          autoComplete="off"
        />
      </div>

      {showList ? (
        <div
          ref={listRef}
          className="mt-1 overflow-hidden rounded-xl border border-border/70 bg-background shadow-lg"
        >
          {visibleResults.length > 0 ? (
            <div className="max-h-[220px] overflow-y-auto overscroll-contain p-1">
              {visibleResults.map((person) => {
                const room = roomMap.get(person.person_id);
                return (
                  <button
                    key={person.person_id}
                    type="button"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      onSelect(person);
                      setShowList(false);
                      setQuery("");
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-right transition-colors hover:bg-muted/60"
                  >
                    <PersonAvatar person={person} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-foreground">
                        {person.full_name}
                        <span className="mr-1.5 text-[11px] font-normal text-muted-foreground">
                          {person.person_id}
                        </span>
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {deptHe(person.department)} · {rankHe(person.rank)}
                        {room ? ` · חדר ${room.room_number}` : ""}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="px-3 py-4 text-center text-sm text-muted-foreground">
              לא נמצאו התאמות.
            </div>
          )}
          {filtered.length > visibleResults.length && (
            <div className="border-t border-border/50 px-3 py-1.5 text-center text-[11px] text-muted-foreground">
              +{filtered.length - visibleResults.length} נוספים — חפש לסינון
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function SummaryRow({
  person,
  fromRoom,
  toRoom,
}: {
  person: Personnel;
  fromRoom?: Room;
  toRoom?: Room;
}) {
  return (
    <div className="flex items-center gap-3">
      <PersonAvatar person={person} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">
          {person.full_name}
        </p>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>{roomShortLabel(fromRoom)}</span>
          <span className="text-muted-foreground/60">←</span>
          <span className="font-medium text-foreground">
            {roomShortLabel(toRoom)}
          </span>
        </div>
      </div>
    </div>
  );
}

function roomShortLabel(room?: Room) {
  if (!room) return "ללא שיבוץ";
  return `${buildingHe(room.building_name)} · חדר ${room.room_number}`;
}

function PersonAvatar({
  person,
  size = "default",
}: {
  person: Personnel;
  size?: "default" | "sm";
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg border border-border/70 bg-muted/40 font-semibold text-foreground",
        size === "sm" ? "size-7 text-[10px]" : "size-9 text-xs rounded-xl",
      )}
    >
      {personMonogram(person)}
    </div>
  );
}

function personMonogram(person: Personnel) {
  const parts = person.full_name.trim().split(/\s+/).filter(Boolean);
  const monogram = parts
    .slice(0, 2)
    .map((part) => part[0])
    .join("");
  return monogram || person.person_id.slice(-2);
}

function roomLocationLabel(room?: Room) {
  if (!room) return "ללא שיבוץ";
  return `מבנה ${buildingHe(room.building_name)} · חדר ${room.room_number}`;
}

function AlertBox({
  type,
  children,
}: {
  type: "error" | "success";
  children: ReactNode;
}) {
  const isError = type === "error";

  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm",
        isError
          ? "border border-destructive/20 bg-destructive/10 text-destructive"
          : "border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/25 dark:text-emerald-300",
      )}
    >
      {isError ? <IconAlertCircle size={14} /> : <IconCheck size={14} />}
      <span>{children}</span>
    </div>
  );
}
