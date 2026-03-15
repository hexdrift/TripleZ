"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { useAppData } from "@/components/app-shell";
import { Breadcrumb } from "@/components/breadcrumb";
import { ColumnHeader, useColumnFilters } from "@/components/excel-filter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { getSettings } from "@/lib/api";
import { buildingHe, deptHe, genderHe, rankHe } from "@/lib/hebrew";
import { Room } from "@/lib/types";
import { IconDoor, IconPlus, IconSearch, IconZzz } from "@/components/icons";

const AddRoomModal = dynamic(
  () => import("@/components/add-room-modal").then((module) => module.AddRoomModal),
  { ssr: false },
);

const RoomDetailModal = dynamic(
  () => import("@/components/room-detail-modal").then((module) => module.RoomDetailModal),
  { ssr: false },
);

type SortKey =
  | "building_name"
  | "room_number"
  | "room_rank"
  | "department"
  | "gender"
  | "number_of_beds"
  | "occupant_count"
  | "status";
type SortDir = "asc" | "desc";
type RoomStatus = "full" | "partial" | "empty";

const STATUS_ORDER: Record<RoomStatus, number> = {
  full: 0,
  partial: 1,
  empty: 2,
};

function getRoomStatus(room: Room): RoomStatus {
  if (room.occupant_count === 0) return "empty";
  if (room.available_beds === 0) return "full";
  return "partial";
}

function roomStatusHe(room: Room) {
  const status = getRoomStatus(room);
  if (status === "full") return "מלא";
  if (status === "partial") return "חלקי";
  return "ריק";
}

function roomDepartmentsLabel(room: Room) {
  return room.departments.length > 0 ? room.departments.map(deptHe).join(", ") : "—";
}

export default function RoomsPage() {
  return <RoomsContent />;
}

function RoomsContent() {
  const { rooms, loading, auth } = useAppData();
  const [addRoomOpen, setAddRoomOpen] = useState(false);
  const [selectedRoomKey, setSelectedRoomKey] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("building_name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [rankOrder, setRankOrder] = useState<Record<string, number>>({});
  const { filters, setColumnFilter, openFilter, setOpenFilter, clearAll, activeCount } = useColumnFilters();

  useEffect(() => {
    let active = true;
    getSettings()
      .then((settings) => {
        if (!active) return;
        setRankOrder(Object.fromEntries(settings.ranks_high_to_low.map((rank, index) => [rank, index])));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const filteredRooms = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase("he");

    return rooms.filter((room) => {
      for (const [column, allowed] of Object.entries(filters)) {
        if (allowed.size === 0) continue;

        if (column === "department") {
          const hasMatch = room.departments.some((department) => allowed.has(department));
          if (!hasMatch) return false;
          continue;
        }

        if (column === "status") {
          if (!allowed.has(getRoomStatus(room))) return false;
          continue;
        }

        const value = String(room[column as keyof Room] ?? "");
        if (!allowed.has(value)) return false;
      }

      if (!query) return true;

      const searchableValues = [
        room.building_name,
        buildingHe(room.building_name),
        `${buildingHe(room.building_name)}`,
        String(room.room_number),
        room.room_rank,
        rankHe(room.room_rank),
        room.gender,
        genderHe(room.gender),
        roomStatusHe(room),
        ...room.departments,
        ...room.departments.map(deptHe),
        ...room.occupant_ids,
        ...Object.values(room.occupant_names || {}),
      ];

      return searchableValues.some((value) => value.toLocaleLowerCase("he").includes(query));
    });
  }, [filters, rooms, searchQuery]);

  const sortedRooms = useMemo(() => {
    return [...filteredRooms].sort((a, b) => {
      let comparison = 0;

      switch (sortKey) {
        case "building_name":
          comparison = buildingHe(a.building_name).localeCompare(buildingHe(b.building_name), "he");
          break;
        case "room_number":
          comparison = a.room_number - b.room_number;
          break;
        case "room_rank": {
          const rankComparison =
            (rankOrder[a.room_rank] ?? Number.MAX_SAFE_INTEGER) - (rankOrder[b.room_rank] ?? Number.MAX_SAFE_INTEGER);
          comparison = rankComparison !== 0 ? rankComparison : rankHe(a.room_rank).localeCompare(rankHe(b.room_rank), "he");
          break;
        }
        case "department":
          comparison = roomDepartmentsLabel(a).localeCompare(roomDepartmentsLabel(b), "he");
          break;
        case "gender":
          comparison = genderHe(a.gender).localeCompare(genderHe(b.gender), "he");
          break;
        case "number_of_beds":
          comparison = a.number_of_beds - b.number_of_beds;
          break;
        case "occupant_count":
          comparison = a.occupant_count - b.occupant_count;
          break;
        case "status":
          comparison = STATUS_ORDER[getRoomStatus(a)] - STATUS_ORDER[getRoomStatus(b)];
          break;
      }

      if (comparison === 0) {
        comparison =
          buildingHe(a.building_name).localeCompare(buildingHe(b.building_name), "he") ||
          a.room_number - b.room_number;
      }

      return sortDir === "asc" ? comparison : -comparison;
    });
  }, [filteredRooms, rankOrder, sortDir, sortKey]);

  const selectedRoom = useMemo(() => {
    if (!selectedRoomKey) return null;
    return rooms.find((room) => `${room.building_name}-${room.room_number}` === selectedRoomKey) || null;
  }, [rooms, selectedRoomKey]);

  const uniqueValues: Record<string, { value: string; label: string }[]> = useMemo(
    () => ({
      building_name: [...new Set(rooms.map((room) => room.building_name))]
        .sort((a, b) => buildingHe(a).localeCompare(buildingHe(b), "he"))
        .map((value) => ({ value, label: `${buildingHe(value)}` })),
      room_number: [...new Set(rooms.map((room) => String(room.room_number)))]
        .sort((a, b) => Number(a) - Number(b))
        .map((value) => ({ value, label: value })),
      room_rank: [...new Set(rooms.map((room) => room.room_rank))]
        .sort((a, b) => {
          const rankComparison =
            (rankOrder[a] ?? Number.MAX_SAFE_INTEGER) - (rankOrder[b] ?? Number.MAX_SAFE_INTEGER);
          return rankComparison !== 0 ? rankComparison : rankHe(a).localeCompare(rankHe(b), "he");
        })
        .map((value) => ({ value, label: rankHe(value) })),
      department: [...new Set(rooms.flatMap((room) => room.departments))]
        .sort((a, b) => deptHe(a).localeCompare(deptHe(b), "he"))
        .map((value) => ({ value, label: deptHe(value) })),
      gender: [...new Set(rooms.map((room) => room.gender))]
        .sort((a, b) => genderHe(a).localeCompare(genderHe(b), "he"))
        .map((value) => ({ value, label: genderHe(value) })),
      number_of_beds: [...new Set(rooms.map((room) => String(room.number_of_beds)))]
        .sort((a, b) => Number(a) - Number(b))
        .map((value) => ({ value, label: value })),
      occupant_count: [...new Set(rooms.map((room) => String(room.occupant_count)))]
        .sort((a, b) => Number(a) - Number(b))
        .map((value) => ({ value, label: value })),
      status: [
        { value: "full", label: "מלא" },
        { value: "partial", label: "חלקי" },
        { value: "empty", label: "ריק" },
      ],
    }),
    [rankOrder, rooms],
  );

  const showNoRoomsInSystem =
    rooms.length === 0 && activeCount === 0 && !searchQuery.trim();
  const showRoomsEmptyState = sortedRooms.length === 0;

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  if (auth.role !== "admin") {
    return (
      <div>
        <Breadcrumb items={[{ label: "לוח בקרה", href: "/" }, { label: "חדרים" }]} />
        <Card className="page-hero overflow-hidden border-border/70 bg-gradient-to-br from-card via-card to-background/80 p-12 text-center">
          <p className="text-[16px] font-semibold text-foreground">אין הרשאה לצפייה במסך זה</p>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <Card className="page-hero flex items-center justify-center gap-3 overflow-hidden border-border/70 bg-gradient-to-br from-card via-card to-background/80 p-10">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/15 bg-primary/10 text-primary shadow-[var(--shadow-inset)]">
          <IconZzz size={20} />
        </div>
        <p className="text-[14px] text-muted-foreground">טוען חדרים...</p>
      </Card>
    );
  }

  return (
    <div>
      <Breadcrumb items={[{ label: "לוח בקרה", href: "/" }, { label: "חדרים" }]} />

      <Card className="page-hero mb-6 overflow-hidden border-border/70 bg-gradient-to-br from-card via-card to-background/80 p-7">
        <div className="flex flex-col gap-4 px-0">
          <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[auto_minmax(360px,520px)_auto] lg:items-center">
            <div className="shrink-0 lg:justify-self-start">
              <h2 className="text-[22px] font-semibold tracking-[-0.04em] text-foreground">חדרים ({sortedRooms.length})</h2>
            </div>

            <div className="relative w-full lg:justify-self-center">
              <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                <IconSearch size={14} />
              </div>
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="חיפוש לפי מבנה, חדר, דרגה, זירה, מגדר, שם או מספר אישי"
                className="h-9 pr-9"
              />
            </div>

            <div className="flex lg:justify-self-end" />
          </div>
        </div>
      </Card>

      {activeCount > 0 || searchQuery.trim() ? (
        <div className="mb-3 flex items-center gap-3 px-1">
          <span className="text-[12px] text-muted-foreground">
            {sortedRooms.length} מתוך {rooms.length} חדרים
          </span>
          <Button
            type="button"
            variant="link"
            size="xs"
            className="text-destructive hover:text-destructive"
            onClick={() => {
              clearAll();
              setSearchQuery("");
            }}
          >
            נקה סינון
          </Button>
        </div>
      ) : null}

      {showRoomsEmptyState ? (
        <Card className="overflow-visible border-border/70 bg-card/90 p-0">
          <div className="py-14 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border/60 bg-background/75 text-muted-foreground shadow-[var(--shadow-inset)]">
              <IconDoor size={28} />
            </div>
            <p className="text-[14px] text-muted-foreground">
              {showNoRoomsInSystem
                ? "אין חדרים במערכת"
                : "אין חדרים התואמים למסננים שנבחרו"}
            </p>
            {showNoRoomsInSystem ? (
              <Button
                type="button"
                className="mx-auto mt-5 inline-flex h-10 w-full max-w-[360px] items-center justify-center gap-2"
                onClick={() => setAddRoomOpen(true)}
              >
                <IconPlus size={14} />
                הוספה או העלאת חדרים
              </Button>
            ) : null}
          </div>
        </Card>
      ) : (
        <Card className="overflow-visible border-border/70 bg-card/90 p-0">
          {auth.role === "admin" ? (
            <Button
              variant="ghost"
              className="w-full rounded-none border-b border-border/70 py-3 text-[12px] font-semibold text-muted-foreground hover:text-foreground"
              onClick={() => setAddRoomOpen(true)}
            >
              <span className="text-[16px] leading-none">+</span>
              הוספה או העלאת חדרים
            </Button>
          ) : null}
          <div className="overflow-x-auto">
            <Table className="text-[13px]">
              <TableHeader>
                <TableRow className="bg-background/50">
                <ColumnHeader
                  label="מבנה"
                  sortKey="building_name"
                  currentSort={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                  filterCol="building_name"
                  filterOptions={uniqueValues.building_name}
                  filters={filters}
                  onFilter={setColumnFilter}
                  openFilter={openFilter}
                  setOpenFilter={setOpenFilter}
                />
                <ColumnHeader
                  label="חדר"
                  sortKey="room_number"
                  currentSort={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                  filterCol="room_number"
                  filterOptions={uniqueValues.room_number}
                  filters={filters}
                  onFilter={setColumnFilter}
                  openFilter={openFilter}
                  setOpenFilter={setOpenFilter}
                />
                <ColumnHeader
                  label="דרגה"
                  sortKey="room_rank"
                  currentSort={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                  filterCol="room_rank"
                  filterOptions={uniqueValues.room_rank}
                  filters={filters}
                  onFilter={setColumnFilter}
                  openFilter={openFilter}
                  setOpenFilter={setOpenFilter}
                />
                <ColumnHeader
                  label="זירות"
                  sortKey="department"
                  currentSort={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                  filterCol="department"
                  filterOptions={uniqueValues.department}
                  filters={filters}
                  onFilter={setColumnFilter}
                  openFilter={openFilter}
                  setOpenFilter={setOpenFilter}
                />
                <ColumnHeader
                  label="מגדר"
                  sortKey="gender"
                  currentSort={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                  filterCol="gender"
                  filterOptions={uniqueValues.gender}
                  filters={filters}
                  onFilter={setColumnFilter}
                  openFilter={openFilter}
                  setOpenFilter={setOpenFilter}
                />
                <ColumnHeader
                  label="מיטות"
                  sortKey="number_of_beds"
                  currentSort={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                  filterCol="number_of_beds"
                  filterOptions={uniqueValues.number_of_beds}
                  filters={filters}
                  onFilter={setColumnFilter}
                  openFilter={openFilter}
                  setOpenFilter={setOpenFilter}
                />
                <ColumnHeader
                  label="תפוסה"
                  sortKey="occupant_count"
                  currentSort={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                  filterCol="occupant_count"
                  filterOptions={uniqueValues.occupant_count}
                  filters={filters}
                  onFilter={setColumnFilter}
                  openFilter={openFilter}
                  setOpenFilter={setOpenFilter}
                />
                <ColumnHeader
                  label="מצב"
                  sortKey="status"
                  currentSort={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                  filterCol="status"
                  filterOptions={uniqueValues.status}
                  filters={filters}
                  onFilter={setColumnFilter}
                  openFilter={openFilter}
                  setOpenFilter={setOpenFilter}
                />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedRooms.map((room) => (
                  <RoomRow
                    key={`${room.building_name}-${room.room_number}`}
                    room={room}
                    onClick={() => setSelectedRoomKey(`${room.building_name}-${room.room_number}`)}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {addRoomOpen ? (
        <AddRoomModal open={addRoomOpen} onClose={() => setAddRoomOpen(false)} initialView="chooser" />
      ) : null}
      {selectedRoom ? <RoomDetailModal room={selectedRoom} onClose={() => setSelectedRoomKey(null)} /> : null}
    </div>
  );
}

function RoomRow({ room, onClick }: { room: Room; onClick: () => void }) {
  const isFull = room.available_beds === 0;

  return (
    <TableRow
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
      tabIndex={0}
      role="button"
      aria-label={`פתח פרטי חדר ${room.room_number}`}
      className="cursor-pointer transition-colors hover:bg-accent/[0.45]"
    >
      <TableCell className="px-4 py-3 font-semibold text-foreground">{buildingHe(room.building_name)}</TableCell>
      <TableCell className="px-4 py-3 font-semibold text-foreground">{room.room_number}</TableCell>
      <TableCell className="px-4 py-3 text-muted-foreground">{rankHe(room.room_rank)}</TableCell>
      <TableCell className="px-4 py-3 text-muted-foreground whitespace-normal max-w-[180px]">{roomDepartmentsLabel(room)}</TableCell>
      <TableCell className="px-4 py-3 text-muted-foreground">{genderHe(room.gender)}</TableCell>
      <TableCell className="px-4 py-3 text-muted-foreground">{room.number_of_beds}</TableCell>
      <TableCell className="px-4 py-3 text-muted-foreground">{room.occupant_count}/{room.number_of_beds}</TableCell>
      <TableCell className="px-4 py-3">
        {isFull ? (
          <Badge variant="destructive">מלא</Badge>
        ) : room.occupant_count === 0 ? (
          <Badge className="border-border/70 bg-muted/60 text-muted-foreground">ריק</Badge>
        ) : (
          <Badge className="border-emerald-500/20 bg-emerald-500/10 text-emerald-500">{room.available_beds} פנויות</Badge>
        )}
      </TableCell>
    </TableRow>
  );
}
