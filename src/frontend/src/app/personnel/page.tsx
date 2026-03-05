"use client";

import { useMemo, useState } from "react";
import { AppShell, useAppData } from "@/components/app-shell";
import { Breadcrumb } from "@/components/breadcrumb";
import { ColumnHeader, useColumnFilters } from "@/components/excel-filter";
import { exportToExcel } from "@/lib/export";
import { buildingHe, deptHe, genderHe, rankHe } from "@/lib/hebrew";
import { IconDownload, IconUsers } from "@/components/icons";

type SortKey = "person_id" | "full_name" | "building_name" | "room_number" | "room_rank" | "department" | "gender";
type SortDir = "asc" | "desc";

type OccupantRow = {
  person_id: string;
  full_name: string;
  building_name: string;
  room_number: number;
  room_rank: string;
  department: string;
  gender: string;
};

export default function PersonnelPage() {
  return (
    <AppShell>
      <PersonnelContent />
    </AppShell>
  );
}

function PersonnelContent() {
  const { rooms, personnel: allPersonnel, loading } = useAppData();
  const [sortKey, setSortKey] = useState<SortKey>("person_id");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const { filters, setColumnFilter, openFilter, setOpenFilter, clearAll, activeCount } = useColumnFilters();

  const personnelMap = useMemo(() => {
    const map = new Map<string, { department: string; gender: string }>();
    for (const p of allPersonnel) map.set(p.person_id, { department: p.department, gender: p.gender });
    return map;
  }, [allPersonnel]);

  const allOccupants = useMemo<OccupantRow[]>(() => {
    return rooms.flatMap((room) =>
      room.occupant_ids.map((personId) => {
        const person = personnelMap.get(personId);
        return {
          person_id: personId,
          full_name: room.occupant_names?.[personId] || "",
          building_name: room.building_name,
          room_number: room.room_number,
          room_rank: room.room_rank,
          department: person?.department || "",
          gender: person?.gender || room.gender,
        };
      })
    );
  }, [rooms, personnelMap]);

  const filtered = useMemo(() => {
    return allOccupants.filter((person) => {
      for (const [col, allowed] of Object.entries(filters)) {
        if (allowed.size === 0) continue;
        const val = String(person[col as keyof OccupantRow]);
        if (!allowed.has(val)) return false;
      }
      return true;
    });
  }, [allOccupants, filters]);

  const sortedRows = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const factor = sortDir === "asc" ? 1 : -1;
      switch (sortKey) {
        case "person_id":
          return a.person_id.localeCompare(b.person_id, "he") * factor;
        case "full_name":
          return (a.full_name || a.person_id).localeCompare(b.full_name || b.person_id, "he") * factor;
        case "building_name":
          return buildingHe(a.building_name).localeCompare(buildingHe(b.building_name), "he") * factor;
        case "room_number":
          return (a.room_number - b.room_number) * factor;
        case "room_rank":
          return rankHe(a.room_rank).localeCompare(rankHe(b.room_rank), "he") * factor;
        case "department":
          return deptHe(a.department).localeCompare(deptHe(b.department), "he") * factor;
        case "gender":
          return genderHe(a.gender).localeCompare(genderHe(b.gender), "he") * factor;
        default:
          return 0;
      }
    });
  }, [filtered, sortDir, sortKey]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  // Unique values for filterable columns
  const uniqueValues: Record<string, { value: string; label: string }[]> = {
    person_id: [...new Set(allOccupants.map((p) => p.person_id))].sort((a, b) => a.localeCompare(b, "he")).map((v) => ({ value: v, label: v })),
    full_name: [...new Set(allOccupants.map((p) => p.full_name).filter(Boolean))].sort((a, b) => a.localeCompare(b, "he")).map((v) => ({ value: v, label: v })),
    building_name: [...new Set(allOccupants.map((p) => p.building_name))].map((v) => ({ value: v, label: `מבנה ${buildingHe(v)}` })),
    room_number: [...new Set(allOccupants.map((p) => String(p.room_number)))].sort((a, b) => Number(a) - Number(b)).map((v) => ({ value: v, label: v })),
    room_rank: [...new Set(allOccupants.map((p) => p.room_rank))].map((v) => ({ value: v, label: rankHe(v) })),
    department: [...new Set(allOccupants.map((p) => p.department))].map((v) => ({ value: v, label: deptHe(v) })),
    gender: [...new Set(allOccupants.map((p) => p.gender))].map((v) => ({ value: v, label: genderHe(v) })),
  };

  return (
    <div>
      <Breadcrumb items={[{ label: "לוח בקרה", href: "/" }, { label: "כוח אדם" }]} />

      <section className="surface-card p-7 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="section-title">כוח אדם</h2>
            <p className="section-subtitle mt-1">{allOccupants.length} אנשים משובצים בחדרים</p>
          </div>
          <button
            type="button"
            onClick={() => exportToExcel(
              "כוח_אדם",
              ["מזהה", "שם", "מבנה", "חדר", "דרגה", "זירה", "מגדר"],
              sortedRows.map((p) => [
                p.person_id,
                p.full_name || "",
                `מבנה ${buildingHe(p.building_name)}`,
                String(p.room_number),
                rankHe(p.room_rank),
                deptHe(p.department),
                genderHe(p.gender),
              ]),
            )}
            className="btn-ghost inline-flex items-center gap-1.5 text-[12px]"
          >
            <IconDownload size={14} />
            ייצוא לאקסל
          </button>
        </div>
      </section>

      {activeCount > 0 ? (
        <div className="flex items-center gap-3 mb-3 px-1">
          <span className="text-[12px]" style={{ color: "var(--text-3)" }}>
            {sortedRows.length} מתוך {allOccupants.length} אנשים
          </span>
          <button type="button" className="text-[12px] font-semibold cursor-pointer" style={{ color: "var(--danger)" }} onClick={clearAll}>
            נקה סינון
          </button>
        </div>
      ) : null}

      <section className="surface-card overflow-visible">
        {loading ? (
          <div className="py-14 text-center" style={{ color: "var(--text-3)" }}>טוען כוח אדם...</div>
        ) : sortedRows.length === 0 && activeCount === 0 ? (
          <div className="py-14 text-center">
            <IconUsers size={30} className="mx-auto mb-3" />
            <p className="text-[14px]" style={{ color: "var(--text-3)" }}>אין כוח אדם משובץ</p>
          </div>
        ) : (
          <div>
            <table className="w-full text-[13px]" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "var(--surface-3)" }}>
                  <ColumnHeader label="מזהה" sortKey="person_id" currentSort={sortKey} sortDir={sortDir} onSort={toggleSort} filterCol="person_id" filterOptions={uniqueValues.person_id} filters={filters} onFilter={setColumnFilter} openFilter={openFilter} setOpenFilter={setOpenFilter} />
                  <ColumnHeader label="שם" sortKey="full_name" currentSort={sortKey} sortDir={sortDir} onSort={toggleSort} filterCol="full_name" filterOptions={uniqueValues.full_name} filters={filters} onFilter={setColumnFilter} openFilter={openFilter} setOpenFilter={setOpenFilter} />
                  <ColumnHeader label="מבנה" sortKey="building_name" currentSort={sortKey} sortDir={sortDir} onSort={toggleSort} filterCol="building_name" filterOptions={uniqueValues.building_name} filters={filters} onFilter={setColumnFilter} openFilter={openFilter} setOpenFilter={setOpenFilter} />
                  <ColumnHeader label="חדר" sortKey="room_number" currentSort={sortKey} sortDir={sortDir} onSort={toggleSort} filterCol="room_number" filterOptions={uniqueValues.room_number} filters={filters} onFilter={setColumnFilter} openFilter={openFilter} setOpenFilter={setOpenFilter} />
                  <ColumnHeader label="דרגה" sortKey="room_rank" currentSort={sortKey} sortDir={sortDir} onSort={toggleSort} filterCol="room_rank" filterOptions={uniqueValues.room_rank} filters={filters} onFilter={setColumnFilter} openFilter={openFilter} setOpenFilter={setOpenFilter} />
                  <ColumnHeader label="זירה" sortKey="department" currentSort={sortKey} sortDir={sortDir} onSort={toggleSort} filterCol="department" filterOptions={uniqueValues.department} filters={filters} onFilter={setColumnFilter} openFilter={openFilter} setOpenFilter={setOpenFilter} />
                  <ColumnHeader label="מגדר" sortKey="gender" currentSort={sortKey} sortDir={sortDir} onSort={toggleSort} filterCol="gender" filterOptions={uniqueValues.gender} filters={filters} onFilter={setColumnFilter} openFilter={openFilter} setOpenFilter={setOpenFilter} />
                </tr>
              </thead>
              <tbody>
                {sortedRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-[13px]" style={{ color: "var(--text-3)" }}>
                      אין אנשים התואמים למסננים שנבחרו
                    </td>
                  </tr>
                ) : (
                  sortedRows.map((person, index) => {
                    return (
                      <tr key={`${person.person_id}-${person.room_number}-${index}`} style={{ borderBottom: "1px solid var(--border)" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                      >
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: "var(--surface-3)", color: "var(--text-2)" }}>
                              {person.full_name ? person.full_name.charAt(0) : person.person_id.slice(-2)}
                            </div>
                            <span className="font-semibold text-[13px]" style={{ color: "var(--text-1)" }}>{person.person_id}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-[14px] font-semibold" style={{ color: "var(--text-1)" }}>{person.full_name || "—"}</td>
                        <td className="px-4 py-2.5 text-[13px]" style={{ color: "var(--text-2)" }}>מבנה {buildingHe(person.building_name)}</td>
                        <td className="px-4 py-2.5 text-[13px]" style={{ color: "var(--text-2)" }}>חדר {person.room_number}</td>
                        <td className="px-4 py-2.5 text-[13px]" style={{ color: "var(--text-2)" }}>{rankHe(person.room_rank)}</td>
                        <td className="px-4 py-2.5 text-[13px]" style={{ color: "var(--text-2)" }}>{deptHe(person.department)}</td>
                        <td className="px-4 py-2.5 text-[13px]" style={{ color: "var(--text-2)" }}>{genderHe(person.gender)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
