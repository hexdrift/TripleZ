"use client";

import { useMemo, useState } from "react";
import { useAppData } from "@/components/app-shell";
import { Breadcrumb } from "@/components/breadcrumb";
import { ColumnHeader, useColumnFilters } from "@/components/excel-filter";
import { exportToExcel } from "@/lib/export";
import { buildingHe, deptHe, genderHe, rankHe } from "@/lib/hebrew";
import { IconDownload, IconPlus, IconSearch, IconUsers } from "@/components/icons";
import { AddPersonnelModal } from "@/components/add-personnel-modal";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";

type SortKey = "person_id" | "full_name" | "building_name" | "room_number" | "room_rank" | "department" | "gender" | "assignment_status";
type SortDir = "asc" | "desc";

type PersonnelRow = {
  person_id: string;
  full_name: string;
  building_name: string;
  room_number: number | null;
  room_rank: string;
  department: string;
  gender: string;
  assignment_status: "משובץ" | "בבית";
};

export default function PersonnelPage() {
  return <PersonnelContent />;
}

function PersonnelContent() {
  const { rooms, personnel: allPersonnel, loading, auth, refreshPersonnel } = useAppData();
  const [sortKey, setSortKey] = useState<SortKey>("person_id");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [searchQuery, setSearchQuery] = useState("");
  const [personnelModalOpen, setPersonnelModalOpen] = useState(false);
  const { filters, setColumnFilter, openFilter, setOpenFilter, clearAll, activeCount } = useColumnFilters();
  const isManager = auth.role === "manager";
  const departmentLabel = deptHe(auth.department || "");

  const assignmentMap = useMemo(() => {
    const map = new Map<string, { building_name: string; room_number: number; room_rank: string; full_name?: string }>();
    for (const room of rooms) {
      for (const personId of room.occupant_ids) {
        map.set(personId, {
          building_name: room.building_name,
          room_number: room.room_number,
          room_rank: room.room_rank,
          full_name: room.occupant_names?.[personId],
        });
      }
    }
    return map;
  }, [rooms]);

  const allRows = useMemo<PersonnelRow[]>(() => {
    return allPersonnel.map((person) => {
      const assignment = assignmentMap.get(person.person_id);
      return {
        person_id: person.person_id,
        full_name: person.full_name || assignment?.full_name || "",
        building_name: assignment?.building_name || "",
        room_number: assignment?.room_number ?? null,
        room_rank: person.rank,
        department: person.department,
        gender: person.gender,
        assignment_status: assignment ? "משובץ" : "בבית",
      };
    });
  }, [allPersonnel, assignmentMap]);

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase("he");

    return allRows.filter((person) => {
      for (const [col, allowed] of Object.entries(filters)) {
        if (allowed.size === 0) continue;
        const val = String(person[col as keyof PersonnelRow] ?? "");
        if (!allowed.has(val)) return false;
      }

      if (!query) return true;

      const searchableValues = [
        person.person_id,
        person.full_name,
        person.building_name,
        ...(person.building_name ? [`${buildingHe(person.building_name)}`] : []),
        ...(person.room_number != null ? [String(person.room_number)] : []),
        person.room_rank,
        rankHe(person.room_rank),
        person.department,
        deptHe(person.department),
        person.gender,
        genderHe(person.gender),
        person.assignment_status,
      ];

      return searchableValues.some((value) => value.toLocaleLowerCase("he").includes(query));
    });
  }, [allRows, filters, searchQuery]);

  const sortedRows = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const factor = sortDir === "asc" ? 1 : -1;
      switch (sortKey) {
        case "person_id":
          return a.person_id.localeCompare(b.person_id, "he") * factor;
        case "full_name":
          return (a.full_name || a.person_id).localeCompare(b.full_name || b.person_id, "he") * factor;
        case "building_name":
          return (buildingHe(a.building_name || "תתת") || "תתת").localeCompare(buildingHe(b.building_name || "תתת") || "תתת", "he") * factor;
        case "room_number":
          return ((a.room_number ?? Number.MAX_SAFE_INTEGER) - (b.room_number ?? Number.MAX_SAFE_INTEGER)) * factor;
        case "room_rank":
          return rankHe(a.room_rank).localeCompare(rankHe(b.room_rank), "he") * factor;
        case "department":
          return deptHe(a.department).localeCompare(deptHe(b.department), "he") * factor;
        case "gender":
          return genderHe(a.gender).localeCompare(genderHe(b.gender), "he") * factor;
        case "assignment_status":
          return a.assignment_status.localeCompare(b.assignment_status, "he") * factor;
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
    person_id: [...new Set(allRows.map((p) => p.person_id))].sort((a, b) => a.localeCompare(b, "he")).map((v) => ({ value: v, label: v })),
    full_name: [...new Set(allRows.map((p) => p.full_name).filter(Boolean))].sort((a, b) => a.localeCompare(b, "he")).map((v) => ({ value: v, label: v })),
    building_name: [...new Set(allRows.map((p) => p.building_name).filter(Boolean))].map((v) => ({ value: v, label: `${buildingHe(v)}` })),
    room_number: [...new Set(allRows.map((p) => p.room_number).filter((v): v is number => v != null).map(String))].sort((a, b) => Number(a) - Number(b)).map((v) => ({ value: v, label: v })),
    room_rank: [...new Set(allRows.map((p) => p.room_rank))].map((v) => ({ value: v, label: rankHe(v) })),
    department: [...new Set(allRows.map((p) => p.department))].map((v) => ({ value: v, label: deptHe(v) })),
    gender: [...new Set(allRows.map((p) => p.gender))].map((v) => ({ value: v, label: genderHe(v) })),
    assignment_status: [...new Set(allRows.map((p) => p.assignment_status))].map((v) => ({ value: v, label: v })),
  };

  return (
    <div>
      <Breadcrumb items={[{ label: "לוח בקרה", href: "/" }, { label: "כוח אדם" }]} />

      <Card className="page-hero mb-6 overflow-hidden border-border/70 bg-gradient-to-br from-card via-card to-background/80 p-7">
        <div className="flex flex-col gap-4 px-0">
          <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[auto_minmax(360px,520px)_auto] lg:items-center">
            <div className="shrink-0 lg:justify-self-start">
              <h2 className="text-[22px] font-semibold tracking-[-0.04em] text-foreground">כוח אדם</h2>
            </div>

            <div className="relative w-full lg:justify-self-center">
              <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                <IconSearch size={14} />
              </div>
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={isManager ? "חיפוש לפי מזהה, שם, מבנה או חדר" : "חיפוש לפי מזהה, שם, מבנה, חדר או זירה"}
                className="h-9 pr-9"
              />
            </div>

            <div className="flex lg:justify-self-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => exportToExcel(
                  isManager ? `כוח_אדם_${departmentLabel}` : "כוח_אדם",
                  (isManager ? ["מזהה", "שם", "סטטוס", "מבנה", "חדר", "דרגה", "מגדר"] : ["מזהה", "שם", "סטטוס", "מבנה", "חדר", "דרגה", "זירה", "מגדר"]),
                  sortedRows.map((p) => [
                    p.person_id,
                    p.full_name || "",
                    p.assignment_status,
                    p.building_name ? `${buildingHe(p.building_name)}` : "",
                    p.room_number != null ? String(p.room_number) : "",
                    rankHe(p.room_rank),
                    ...(isManager ? [] : [deptHe(p.department)]),
                    genderHe(p.gender),
                  ]),
                )}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 text-[12px]"
              >
                <IconDownload size={14} />
                ייצוא לאקסל
              </Button>
            </div>
          </div>

          {isManager ? (
            <p className="text-sm leading-6 text-muted-foreground">
              {allRows.length} אנשי כוח אדם בזירת {departmentLabel}
            </p>
          ) : null}
        </div>
      </Card>

      {activeCount > 0 || searchQuery.trim() ? (
        <div className="mb-3 flex items-center gap-3 px-1">
          <span className="text-[12px] text-muted-foreground">
            {sortedRows.length} מתוך {allRows.length} אנשים
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

      <Card className="overflow-visible border-border/70 bg-card/90 p-0">
        {loading ? (
          <div className="py-14 text-center text-muted-foreground">טוען כוח אדם...</div>
        ) : allRows.length === 0 && activeCount === 0 && !searchQuery.trim() ? (
          <div className="py-14 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border/60 bg-background/75 text-muted-foreground shadow-[var(--shadow-inset)]">
              <IconUsers size={28} />
            </div>
            <p className="text-[14px] text-muted-foreground">אין כוח אדם במערכת</p>
            {!isManager ? (
              <Button
                type="button"
                className="mx-auto mt-5 inline-flex h-10 w-full max-w-[360px] items-center justify-center gap-2"
                onClick={() => setPersonnelModalOpen(true)}
              >
                <IconPlus size={14} />
                העלאת כוח אדם
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table className="text-[13px]">
              <TableHeader>
                <TableRow className="bg-background/50">
                  <ColumnHeader label="מזהה" sortKey="person_id" currentSort={sortKey} sortDir={sortDir} onSort={toggleSort} filterCol="person_id" filterOptions={uniqueValues.person_id} filters={filters} onFilter={setColumnFilter} openFilter={openFilter} setOpenFilter={setOpenFilter} />
                  <ColumnHeader label="שם" sortKey="full_name" currentSort={sortKey} sortDir={sortDir} onSort={toggleSort} filterCol="full_name" filterOptions={uniqueValues.full_name} filters={filters} onFilter={setColumnFilter} openFilter={openFilter} setOpenFilter={setOpenFilter} />
                  <ColumnHeader label="סטטוס" sortKey="assignment_status" currentSort={sortKey} sortDir={sortDir} onSort={toggleSort} filterCol="assignment_status" filterOptions={uniqueValues.assignment_status} filters={filters} onFilter={setColumnFilter} openFilter={openFilter} setOpenFilter={setOpenFilter} />
                  <ColumnHeader label="מבנה" sortKey="building_name" currentSort={sortKey} sortDir={sortDir} onSort={toggleSort} filterCol="building_name" filterOptions={uniqueValues.building_name} filters={filters} onFilter={setColumnFilter} openFilter={openFilter} setOpenFilter={setOpenFilter} />
                  <ColumnHeader label="חדר" sortKey="room_number" currentSort={sortKey} sortDir={sortDir} onSort={toggleSort} filterCol="room_number" filterOptions={uniqueValues.room_number} filters={filters} onFilter={setColumnFilter} openFilter={openFilter} setOpenFilter={setOpenFilter} />
                  <ColumnHeader label="דרגה" sortKey="room_rank" currentSort={sortKey} sortDir={sortDir} onSort={toggleSort} filterCol="room_rank" filterOptions={uniqueValues.room_rank} filters={filters} onFilter={setColumnFilter} openFilter={openFilter} setOpenFilter={setOpenFilter} />
                  {!isManager ? (
                    <ColumnHeader label="זירה" sortKey="department" currentSort={sortKey} sortDir={sortDir} onSort={toggleSort} filterCol="department" filterOptions={uniqueValues.department} filters={filters} onFilter={setColumnFilter} openFilter={openFilter} setOpenFilter={setOpenFilter} />
                  ) : null}
                  <ColumnHeader label="מגדר" sortKey="gender" currentSort={sortKey} sortDir={sortDir} onSort={toggleSort} filterCol="gender" filterOptions={uniqueValues.gender} filters={filters} onFilter={setColumnFilter} openFilter={openFilter} setOpenFilter={setOpenFilter} />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isManager ? 7 : 8} className="px-4 py-10 text-center text-[13px] text-muted-foreground">
                      {searchQuery.trim() || activeCount > 0
                        ? "אין אנשים התואמים לחיפוש או למסננים שנבחרו"
                        : "אין כוח אדם במערכת"}
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedRows.map((person, index) => {
                    return (
                      <TableRow key={`${person.person_id}-${person.room_number}-${index}`} className="transition-colors hover:bg-accent/[0.45]">
                        <TableCell className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full border border-border/60 bg-background/80 text-[10px] font-bold text-muted-foreground shadow-[var(--shadow-inset)]">
                              {person.full_name ? person.full_name.charAt(0) : person.person_id.slice(-2)}
                            </div>
                            <span className="font-semibold text-[13px] text-foreground">{person.person_id}</span>
                          </div>
                        </TableCell>
                        <TableCell className="px-4 py-2.5 text-[14px] font-semibold text-foreground">{person.full_name || "—"}</TableCell>
                        <TableCell className="px-4 py-2.5 text-[13px] text-muted-foreground">{person.assignment_status}</TableCell>
                        <TableCell className="px-4 py-2.5 text-[13px] text-muted-foreground">
                          {person.building_name ? `${buildingHe(person.building_name)}` : "—"}
                        </TableCell>
                        <TableCell className="px-4 py-2.5 text-[13px] text-muted-foreground">
                          {person.room_number != null ? `חדר ${person.room_number}` : "—"}
                        </TableCell>
                        <TableCell className="px-4 py-2.5 text-[13px] text-muted-foreground">{rankHe(person.room_rank)}</TableCell>
                        {!isManager ? (
                          <TableCell className="px-4 py-2.5 text-[13px] text-muted-foreground">{deptHe(person.department)}</TableCell>
                        ) : null}
                        <TableCell className="px-4 py-2.5 text-[13px] text-muted-foreground">{genderHe(person.gender)}</TableCell>
                      </TableRow>
                    );
                  })
                )}
                {!isManager ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={8} className="p-0">
                      <Button
                        type="button"
                        variant="ghost"
                        size="default"
                        className="h-11 w-full justify-center rounded-none border-0 bg-transparent text-black shadow-none hover:bg-accent/[0.35] hover:text-black dark:text-foreground dark:hover:text-foreground"
                        onClick={() => setPersonnelModalOpen(true)}
                      >
                        <IconPlus size={14} />
                        העלאת כוח אדם
                      </Button>
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {!isManager ? (
        <AddPersonnelModal
          open={personnelModalOpen}
          onClose={() => setPersonnelModalOpen(false)}
          onUploaded={async () => {
            await refreshPersonnel(true);
          }}
        />
      ) : null}
    </div>
  );
}
