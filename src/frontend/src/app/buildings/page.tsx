"use client";

import dynamic from "next/dynamic";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAppData } from "@/components/app-shell";
import { Breadcrumb } from "@/components/breadcrumb";
import { ColumnHeader, useColumnFilters } from "@/components/excel-filter";
import { StatCard } from "@/components/stat-card";
import { exportToExcel } from "@/lib/export";
import { buildingHe, deptHe, genderHe, rankHe } from "@/lib/hebrew";
import { Room } from "@/lib/types";
import { getAuthContext } from "@/lib/api";
import { IconBed, IconBedOff, IconDoor, IconDownload, IconPercent, IconZzz } from "@/components/icons";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const AddRoomModal = dynamic(
  () => import("@/components/add-room-modal").then((module) => module.AddRoomModal),
  { ssr: false },
);

const RoomDetailModal = dynamic(
  () => import("@/components/room-detail-modal").then((module) => module.RoomDetailModal),
  { ssr: false },
);

export default function BuildingsPage() {
  return (
    <Suspense>
      <BuildingContent />
    </Suspense>
  );
}

type SortKey =
  | "building_name"
  | "room_number"
  | "room_rank"
  | "department"
  | "gender"
  | "number_of_beds"
  | "occupant_count"
  | "available_beds"
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

function usePageFilter() {
  const searchParams = useSearchParams();
  const name = searchParams.get("name");
  const gender = searchParams.get("gender");
  const rank = searchParams.get("rank");
  const department = searchParams.get("department");

  if (name) return { type: "building" as const, value: name, label: `מבנה ${buildingHe(name)}` };
  if (gender) return { type: "gender" as const, value: gender, label: genderHe(gender) };
  if (rank) return { type: "rank" as const, value: rank, label: rankHe(rank) };
  if (department) return { type: "department" as const, value: department, label: deptHe(department) };
  return { type: "all" as const, value: "", label: "כל החדרים" };
}

function BuildingContent() {
  const filter = usePageFilter();
  const { rooms, buildings, loading, auth } = useAppData();
  const [addRoomOpen, setAddRoomOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("room_number");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [selectedRoomKey, setSelectedRoomKey] = useState<string | null>(null);
  const [rankOrder, setRankOrder] = useState<Record<string, number>>({});
  const { filters, setColumnFilter, openFilter, setOpenFilter, clearAll, activeCount } = useColumnFilters();
  const isManager = auth.role === "manager";
  const departmentLabel = deptHe(auth.department || "");

  useEffect(() => {
    let active = true;
    getAuthContext()
      .then((context) => {
        if (!active) return;
        setRankOrder(
          Object.fromEntries(context.ranks_high_to_low.map((rank, index) => [rank, index])),
        );
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const baseRooms = useMemo(() => {
    switch (filter.type) {
      case "building":
        return rooms.filter((r) => r.building_name === filter.value);
      case "gender":
        return rooms.filter((r) => r.gender === filter.value);
      case "rank":
        return rooms.filter((r) => r.room_rank === filter.value);
      case "department":
        return rooms.filter((r) => r.departments.includes(filter.value));
      case "all":
        return rooms;
    }
  }, [rooms, filter.type, filter.value]);

  const filteredRooms = useMemo(() => {
    let result = baseRooms.filter((room) => {
      for (const [col, allowed] of Object.entries(filters)) {
        if (allowed.size === 0) continue;

        if (col === "department") {
          const hasMatch = room.departments.some((department) => allowed.has(department));
          if (!hasMatch) return false;
          continue;
        }

        if (col === "status") {
          if (!allowed.has(getRoomStatus(room))) return false;
          continue;
        }

        const val = String(room[col as keyof Room]);
        if (!allowed.has(val)) return false;
      }
      return true;
    });

    result = [...result].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "building_name") {
        cmp = buildingHe(a.building_name).localeCompare(buildingHe(b.building_name), "he");
      } else if (sortKey === "room_rank") {
        const rankCmp = (rankOrder[a.room_rank] ?? Number.MAX_SAFE_INTEGER) - (rankOrder[b.room_rank] ?? Number.MAX_SAFE_INTEGER);
        cmp = rankCmp !== 0 ? rankCmp : rankHe(a.room_rank).localeCompare(rankHe(b.room_rank), "he");
      } else if (sortKey === "department") {
        cmp = roomDepartmentsLabel(a).localeCompare(roomDepartmentsLabel(b), "he");
      } else if (sortKey === "gender") {
        cmp = genderHe(a.gender).localeCompare(genderHe(b.gender), "he");
      } else if (sortKey === "status") {
        cmp = STATUS_ORDER[getRoomStatus(a)] - STATUS_ORDER[getRoomStatus(b)];
      } else {
        cmp = (a[sortKey] as number) - (b[sortKey] as number);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [baseRooms, filters, rankOrder, sortKey, sortDir]);

  const selectedRoom = useMemo(() => {
    if (!selectedRoomKey) return null;
    return rooms.find((r) => `${r.building_name}-${r.room_number}` === selectedRoomKey) || null;
  }, [rooms, selectedRoomKey]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  if (loading) {
    return (
      <Card className="page-hero flex items-center justify-center gap-3 overflow-hidden border-border/70 bg-gradient-to-br from-card via-card to-background/80 p-10">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/15 bg-primary/10 text-primary shadow-[var(--shadow-inset)]">
          <IconZzz size={20} />
        </div>
        <p className="text-[14px] text-muted-foreground">טוען נתונים...</p>
      </Card>
    );
  }

  // For building view, check building exists
  if (filter.type === "building" && filter.value && !buildings.find((b) => b.name === filter.value)) {
    return (
      <div>
        <Breadcrumb items={[{ label: "לוח בקרה", href: "/" }, { label: filter.label }]} />
        <Card className="page-hero overflow-hidden border-border/70 bg-gradient-to-br from-card via-card to-background/80 p-12 text-center">
          <p className="text-[16px] font-semibold text-foreground">
            מבנה &quot;{buildingHe(filter.value)}&quot; לא נמצא
          </p>
        </Card>
      </div>
    );
  }

  const totalBeds = filteredRooms.reduce((sum, room) => sum + room.number_of_beds, 0);
  const occupiedBeds = filteredRooms.reduce((sum, room) => sum + room.occupant_count, 0);
  const occupancyRate = totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0;

  const uniqueValues: Record<string, { value: string; label: string }[]> = {
    building_name: [...new Set(baseRooms.map((r) => r.building_name))]
      .sort((a, b) => buildingHe(a).localeCompare(buildingHe(b), "he"))
      .map((v) => ({ value: v, label: `מבנה ${buildingHe(v)}` })),
    room_number: [...new Set(baseRooms.map((r) => String(r.room_number)))].sort((a, b) => Number(a) - Number(b)).map((v) => ({ value: v, label: v })),
    room_rank: [...new Set(baseRooms.map((r) => r.room_rank))].map((v) => ({ value: v, label: rankHe(v) })),
    department: [...new Set(baseRooms.flatMap((r) => r.departments))]
      .sort((a, b) => deptHe(a).localeCompare(deptHe(b), "he"))
      .map((v) => ({ value: v, label: deptHe(v) })),
    gender: [...new Set(baseRooms.map((r) => r.gender))].map((v) => ({ value: v, label: genderHe(v) })),
    number_of_beds: [...new Set(baseRooms.map((r) => String(r.number_of_beds)))].sort((a, b) => Number(a) - Number(b)).map((v) => ({ value: v, label: v })),
    occupant_count: [...new Set(baseRooms.map((r) => String(r.occupant_count)))].sort((a, b) => Number(a) - Number(b)).map((v) => ({ value: v, label: v })),
    status: [
      { value: "full", label: "מלא" },
      { value: "partial", label: "חלקי" },
      { value: "empty", label: "ריק" },
    ],
  };

  const breadcrumbLabel =
    filter.type === "building"
      ? `מבנה ${buildingHe(filter.value)}`
      : filter.type === "all" && isManager
        ? `חדרי ${departmentLabel}`
        : filter.label;
  const exportName =
    filter.type === "building"
      ? `מבנה_${buildingHe(filter.value)}_חדרים`
      : filter.type === "all" && isManager
        ? `חדרי_${departmentLabel}`
        : `${filter.label}_חדרים`;

  // Show building column when not filtering by building
  const showBuildingCol = filter.type !== "building" && (buildings.length > 1 || !isManager);
  const showDepartmentCol = !isManager;

  return (
    <div>
      <Breadcrumb items={[{ label: "לוח בקרה", href: "/" }, { label: breadcrumbLabel }]} />

      <Card className="page-hero mb-6 overflow-hidden border-border/70 bg-gradient-to-br from-card via-card to-background/80 p-7">
        <div className="flex flex-col gap-3 px-0 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <h2 className="text-[22px] font-semibold tracking-[-0.04em] text-foreground">{breadcrumbLabel}</h2>
            {isManager ? (
              <p className="text-sm leading-6 text-muted-foreground">
                מוצגים רק החדרים הרלוונטיים לזירת {departmentLabel}.
              </p>
            ) : null}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => exportToExcel(
              exportName,
              [showBuildingCol ? "מבנה" : null, "חדר", "דרגה", showDepartmentCol ? "זירות" : null, "מגדר", "מיטות", "תפוסים", "פנויים", "מצב"].filter(Boolean) as string[],
              filteredRooms.map((r) => [
                ...(showBuildingCol ? [`מבנה ${buildingHe(r.building_name)}`] : []),
                String(r.room_number),
                rankHe(r.room_rank),
                ...(showDepartmentCol ? [r.departments.map(deptHe).join(", ") || "—"] : []),
                genderHe(r.gender),
                String(r.number_of_beds),
                String(r.occupant_count),
                String(r.available_beds),
                roomStatusHe(r),
              ]),
            )}
            className="inline-flex items-center gap-1.5 text-[12px]"
          >
            <IconDownload size={14} />
            ייצוא לאקסל
          </Button>
        </div>
      </Card>

      <section className="mb-6 grid grid-cols-5 gap-5">
        <StatCard label="חדרים" value={baseRooms.length} icon={<IconDoor size={17} />} />
        <StatCard label='סה"כ מיטות' value={totalBeds} icon={<IconBed size={17} />} />
        <StatCard label="תפוסים" value={occupiedBeds} icon={<IconBedOff size={17} />} />
        <StatCard label="פנויים" value={Math.max(totalBeds - occupiedBeds, 0)} tone="accent" icon={<IconBed size={17} />} />
        <StatCard
          label="שיעור תפוסה"
          value={`${occupancyRate}%`}
          tone={occupancyRate > 80 ? "danger" : occupancyRate > 50 ? "warning" : "accent"}
          icon={<IconPercent size={17} />}
        />
      </section>

      {activeCount > 0 ? (
        <div className="mb-3 flex items-center gap-3 px-1">
          <span className="text-[12px] text-muted-foreground">
            {filteredRooms.length} מתוך {baseRooms.length} חדרים
          </span>
          <Button
            type="button"
            variant="link"
            size="xs"
            className="text-destructive hover:text-destructive"
            onClick={clearAll}
          >
            נקה סינון
          </Button>
        </div>
      ) : null}

      <Card className="overflow-visible border-border/70 bg-card/90 p-0">
        <div className="overflow-x-auto">
          <Table className="text-[13px]">
            <TableHeader>
              <TableRow className="bg-background/50">
                {showBuildingCol ? (
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
                ) : null}
                <ColumnHeader label="חדר" sortKey="room_number" currentSort={sortKey} sortDir={sortDir} onSort={toggleSort} filterCol="room_number" filterOptions={uniqueValues.room_number} filters={filters} onFilter={setColumnFilter} openFilter={openFilter} setOpenFilter={setOpenFilter} />
                <ColumnHeader label="דרגה" sortKey="room_rank" currentSort={sortKey} sortDir={sortDir} onSort={toggleSort} filterCol="room_rank" filterOptions={uniqueValues.room_rank} filters={filters} onFilter={setColumnFilter} openFilter={openFilter} setOpenFilter={setOpenFilter} />
                {showDepartmentCol ? (
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
                ) : null}
                <ColumnHeader label="מגדר" sortKey="gender" currentSort={sortKey} sortDir={sortDir} onSort={toggleSort} filterCol="gender" filterOptions={uniqueValues.gender} filters={filters} onFilter={setColumnFilter} openFilter={openFilter} setOpenFilter={setOpenFilter} />
                <ColumnHeader label="מיטות" sortKey="number_of_beds" currentSort={sortKey} sortDir={sortDir} onSort={toggleSort} filterCol="number_of_beds" filterOptions={uniqueValues.number_of_beds} filters={filters} onFilter={setColumnFilter} openFilter={openFilter} setOpenFilter={setOpenFilter} />
                <ColumnHeader label="תפוסה" sortKey="occupant_count" currentSort={sortKey} sortDir={sortDir} onSort={toggleSort} filterCol="occupant_count" filterOptions={uniqueValues.occupant_count} filters={filters} onFilter={setColumnFilter} openFilter={openFilter} setOpenFilter={setOpenFilter} />
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
              {filteredRooms.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={(showBuildingCol ? 1 : 0) + (showDepartmentCol ? 7 : 6)} className="px-4 py-10 text-center text-[13px] text-muted-foreground">
                    אין חדרים התואמים למסננים שנבחרו
                  </TableCell>
                </TableRow>
              ) : (
                filteredRooms.map((room) => (
                  <RoomRow
                    key={`${room.building_name}-${room.room_number}`}
                    room={room}
                    showBuilding={showBuildingCol}
                    onClick={() => setSelectedRoomKey(`${room.building_name}-${room.room_number}`)}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </div>
        {auth.role === "admin" ? (
          <Button
            variant="ghost"
            className="w-full rounded-none border-t border-border/70 py-3 text-[12px] font-semibold text-muted-foreground hover:text-foreground"
            onClick={() => setAddRoomOpen(true)}
          >
            <span className="text-[16px] leading-none">+</span>
            הוסף חדר
          </Button>
        ) : null}
      </Card>

      {addRoomOpen ? (
        <AddRoomModal
          open={addRoomOpen}
          onClose={() => setAddRoomOpen(false)}
          defaultBuilding={filter.type === "building" ? filter.value : null}
        />
      ) : null}
      {selectedRoom ? <RoomDetailModal room={selectedRoom} onClose={() => setSelectedRoomKey(null)} /> : null}
    </div>
  );
}

function RoomRow({ room, showBuilding, onClick }: { room: Room; showBuilding: boolean; onClick: () => void }) {
  const status = getRoomStatus(room);
  const { auth } = useAppData();
  const showDepartmentCol = auth.role === "admin";
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
      {showBuilding && <TableCell className="px-4 py-3 font-semibold text-foreground">מבנה {buildingHe(room.building_name)}</TableCell>}
      <TableCell className="px-4 py-3 font-semibold text-foreground">{room.room_number}</TableCell>
      <TableCell className="px-4 py-3 text-muted-foreground">{rankHe(room.room_rank)}</TableCell>
      {showDepartmentCol ? (
        <TableCell className="px-4 py-3 text-muted-foreground">{room.departments.length > 0 ? room.departments.map(deptHe).join(", ") : "—"}</TableCell>
      ) : null}
      <TableCell className="px-4 py-3 text-muted-foreground">{genderHe(room.gender)}</TableCell>
      <TableCell className="px-4 py-3 text-muted-foreground">{room.number_of_beds}</TableCell>
      <TableCell className="px-4 py-3 text-muted-foreground">{room.occupant_count}/{room.number_of_beds}</TableCell>
      <TableCell className="px-4 py-3">
        {status === "full" ? (
          <Badge variant="destructive">מלא</Badge>
        ) : status === "empty" ? (
          <Badge className="border-border/70 bg-muted/60 text-muted-foreground">ריק</Badge>
        ) : (
          <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">{room.available_beds} פנויות</Badge>
        )}
      </TableCell>
    </TableRow>
  );
}
