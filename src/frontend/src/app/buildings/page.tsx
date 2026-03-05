"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell, useAppData } from "@/components/app-shell";
import { Breadcrumb } from "@/components/breadcrumb";
import { ColumnHeader, useColumnFilters } from "@/components/excel-filter";
import { RoomDetailModal } from "@/components/room-detail-modal";
import { StatCard } from "@/components/stat-card";
import { UploadRoomsModal } from "@/components/upload-rooms-modal";
import { exportToExcel } from "@/lib/export";
import { buildingHe, deptHe, genderHe, rankHe } from "@/lib/hebrew";
import { Room } from "@/lib/types";
import { IconBed, IconBedOff, IconDoor, IconDownload, IconPercent, IconZzz } from "@/components/icons";

export default function BuildingsPage() {
  return (
    <AppShell>
      <BuildingContent />
    </AppShell>
  );
}

type SortKey = "room_number" | "room_rank" | "gender" | "number_of_beds" | "occupant_count" | "available_beds";
type SortDir = "asc" | "desc";

const RANK_ORDER: Record<string, number> = { VP: 0, Director: 1, Manager: 2, Junior: 3 };

function BuildingContent() {
  const searchParams = useSearchParams();
  const buildingName = searchParams.get("name") ?? "";
  const { rooms, buildings, loading, auth } = useAppData();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("room_number");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [selectedRoomKey, setSelectedRoomKey] = useState<string | null>(null);
  const { filters, setColumnFilter, openFilter, setOpenFilter, clearAll, activeCount } = useColumnFilters();

  const building = buildings.find((b) => b.name === buildingName);
  const buildingRooms = useMemo(
    () => rooms.filter((r) => r.building_name === buildingName),
    [rooms, buildingName],
  );

  const filteredRooms = useMemo(() => {
    let result = buildingRooms.filter((room) => {
      for (const [col, allowed] of Object.entries(filters)) {
        if (allowed.size === 0) continue;
        const val = String(room[col as keyof Room]);
        if (!allowed.has(val)) return false;
      }
      return true;
    });

    result = [...result].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "room_rank") {
        cmp = (RANK_ORDER[a.room_rank] ?? 99) - (RANK_ORDER[b.room_rank] ?? 99);
      } else if (sortKey === "gender") {
        cmp = a[sortKey].localeCompare(b[sortKey]);
      } else {
        cmp = (a[sortKey] as number) - (b[sortKey] as number);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [buildingRooms, filters, sortKey, sortDir]);

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
      <div className="surface-card p-10 flex items-center justify-center gap-3">
        <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ background: "var(--accent-muted)", color: "var(--accent)" }}>
          <IconZzz size={20} />
        </div>
        <p className="text-[14px]" style={{ color: "var(--text-3)" }}>טוען נתוני מבנה...</p>
      </div>
    );
  }

  if (!building) {
    return (
      <div>
        <Breadcrumb items={[{ label: "לוח בקרה", href: "/" }, { label: `מבנה ${buildingHe(buildingName)}` }]} />
        <div className="surface-card p-12 text-center">
          <p className="text-[16px] font-semibold" style={{ color: "var(--text-1)" }}>
            מבנה &quot;{buildingHe(buildingName)}&quot; לא נמצא
          </p>
        </div>
      </div>
    );
  }

  const totalBeds = filteredRooms.reduce((sum, room) => sum + room.number_of_beds, 0);
  const occupiedBeds = filteredRooms.reduce((sum, room) => sum + room.occupant_count, 0);
  const occupancyRate = totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0;

  const uniqueValues: Record<string, { value: string; label: string }[]> = {
    room_number: [...new Set(buildingRooms.map((r) => String(r.room_number)))].sort((a, b) => Number(a) - Number(b)).map((v) => ({ value: v, label: v })),
    room_rank: [...new Set(buildingRooms.map((r) => r.room_rank))].map((v) => ({ value: v, label: rankHe(v) })),
    gender: [...new Set(buildingRooms.map((r) => r.gender))].map((v) => ({ value: v, label: genderHe(v) })),
    number_of_beds: [...new Set(buildingRooms.map((r) => String(r.number_of_beds)))].sort((a, b) => Number(a) - Number(b)).map((v) => ({ value: v, label: v })),
    occupant_count: [...new Set(buildingRooms.map((r) => String(r.occupant_count)))].sort((a, b) => Number(a) - Number(b)).map((v) => ({ value: v, label: v })),
  };

  return (
    <div>
      <Breadcrumb items={[{ label: "לוח בקרה", href: "/" }, { label: `מבנה ${buildingHe(buildingName)}` }]} />

      <section className="surface-card p-7 mb-6">
        <div className="flex items-center justify-between">
          <h2 className="section-title">מבנה {buildingHe(buildingName)}</h2>
          <button
            type="button"
            onClick={() => exportToExcel(
              `מבנה_${buildingHe(buildingName)}_חדרים`,
              ["חדר", "דרגה", "זירות", "מגדר", "מיטות", "תפוסים", "פנויים", "מצב"],
              filteredRooms.map((r) => [
                String(r.room_number),
                rankHe(r.room_rank),
                r.departments.map(deptHe).join(", ") || "—",
                genderHe(r.gender),
                String(r.number_of_beds),
                String(r.occupant_count),
                String(r.available_beds),
                r.available_beds === 0 ? "מלא" : "פנוי",
              ]),
            )}
            className="btn-ghost inline-flex items-center gap-1.5 text-[12px]"
          >
            <IconDownload size={14} />
            ייצוא לאקסל
          </button>
        </div>
      </section>

      <section className="grid grid-cols-5 gap-4 mb-6">
        <StatCard label="חדרים" value={buildingRooms.length} icon={<IconDoor size={17} />} />
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
        <div className="flex items-center gap-3 mb-3 px-1">
          <span className="text-[12px]" style={{ color: "var(--text-3)" }}>
            {filteredRooms.length} מתוך {buildingRooms.length} חדרים
          </span>
          <button type="button" className="text-[12px] font-semibold cursor-pointer" style={{ color: "var(--danger)" }} onClick={clearAll}>
            נקה סינון
          </button>
        </div>
      ) : null}

      <section className="surface-card overflow-visible">
        <table className="w-full text-[13px]" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <ColumnHeader label="חדר" sortKey="room_number" currentSort={sortKey} sortDir={sortDir} onSort={toggleSort} filterCol="room_number" filterOptions={uniqueValues.room_number} filters={filters} onFilter={setColumnFilter} openFilter={openFilter} setOpenFilter={setOpenFilter} />
              <ColumnHeader label="דרגה" sortKey="room_rank" currentSort={sortKey} sortDir={sortDir} onSort={toggleSort} filterCol="room_rank" filterOptions={uniqueValues.room_rank} filters={filters} onFilter={setColumnFilter} openFilter={openFilter} setOpenFilter={setOpenFilter} />
              <th className="px-4 py-3 text-right font-semibold" style={{ color: "var(--text-3)" }}>זירות</th>
              <ColumnHeader label="מגדר" sortKey="gender" currentSort={sortKey} sortDir={sortDir} onSort={toggleSort} filterCol="gender" filterOptions={uniqueValues.gender} filters={filters} onFilter={setColumnFilter} openFilter={openFilter} setOpenFilter={setOpenFilter} />
              <ColumnHeader label="מיטות" sortKey="number_of_beds" currentSort={sortKey} sortDir={sortDir} onSort={toggleSort} filterCol="number_of_beds" filterOptions={uniqueValues.number_of_beds} filters={filters} onFilter={setColumnFilter} openFilter={openFilter} setOpenFilter={setOpenFilter} />
              <ColumnHeader label="תפוסה" sortKey="occupant_count" currentSort={sortKey} sortDir={sortDir} onSort={toggleSort} filterCol="occupant_count" filterOptions={uniqueValues.occupant_count} filters={filters} onFilter={setColumnFilter} openFilter={openFilter} setOpenFilter={setOpenFilter} />
              <th className="px-4 py-3 text-right font-semibold" style={{ color: "var(--text-3)" }}>מצב</th>
            </tr>
          </thead>
          <tbody>
            {filteredRooms.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-[13px]" style={{ color: "var(--text-3)" }}>
                  אין חדרים התואמים למסננים שנבחרו
                </td>
              </tr>
            ) : (
              filteredRooms.map((room) => (
                <RoomRow
                  key={`${room.building_name}-${room.room_number}`}
                  room={room}
                  onClick={() => setSelectedRoomKey(`${room.building_name}-${room.room_number}`)}
                />
              ))
            )}
          </tbody>
        </table>
        {auth.role === "admin" ? (
          <div
            onClick={() => setUploadOpen(true)}
            className="border-t px-4 py-3 flex justify-center cursor-pointer text-[12px] font-semibold items-center gap-1.5"
            style={{ borderColor: "var(--border)", color: "var(--text-3)" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-1)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-3)")}
          >
            <span className="text-[16px] leading-none">+</span>
            הוסף חדר
          </div>
        ) : null}
      </section>

      <UploadRoomsModal open={uploadOpen} onClose={() => setUploadOpen(false)} />
      <RoomDetailModal room={selectedRoom} onClose={() => setSelectedRoomKey(null)} />
    </div>
  );
}

function RoomRow({ room, onClick }: { room: Room; onClick: () => void }) {
  const isFull = room.available_beds === 0;
  return (
    <tr
      onClick={onClick}
      className="cursor-pointer transition-colors"
      style={{ borderBottom: "1px solid var(--border)" }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <td className="px-4 py-3 font-semibold" style={{ color: "var(--text-1)" }}>{room.room_number}</td>
      <td className="px-4 py-3" style={{ color: "var(--text-2)" }}>{rankHe(room.room_rank)}</td>
      <td className="px-4 py-3" style={{ color: "var(--text-2)" }}>{room.departments.length > 0 ? room.departments.map(deptHe).join(", ") : "—"}</td>
      <td className="px-4 py-3" style={{ color: "var(--text-2)" }}>{genderHe(room.gender)}</td>
      <td className="px-4 py-3" style={{ color: "var(--text-2)" }}>{room.number_of_beds}</td>
      <td className="px-4 py-3" style={{ color: "var(--text-2)" }}>{room.occupant_count}/{room.number_of_beds}</td>
      <td className="px-4 py-3">
        <span
          className="text-[11px] font-semibold px-2.5 py-1 rounded-full"
          style={{
            color: isFull ? "var(--danger)" : "var(--success)",
            background: isFull ? "var(--danger-dim)" : "var(--success-dim)",
            border: `1px solid ${isFull ? "var(--danger-border)" : "var(--success-border)"}`,
          }}
        >
          {isFull ? "מלא" : `${room.available_beds} פנויות`}
        </span>
      </td>
    </tr>
  );
}
