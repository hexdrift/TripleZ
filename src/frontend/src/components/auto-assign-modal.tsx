"use client";

import { useCallback, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { autoAssignUnassigned, type AutoAssignFilters } from "@/lib/api";
import { deptHe, genderHe, rankHe } from "@/lib/hebrew";
import { IconCheck, IconSearch, IconUsers, IconX } from "@/components/icons";
import type { Personnel } from "@/lib/types";

interface AutoAssignModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** All unassigned personnel (already scoped for managers) */
  waitingPersonnel: Personnel[];
  /** All unique departments among waiting personnel */
  departments: string[];
  /** All unique genders among waiting personnel */
  genders: string[];
  /** All unique ranks among waiting personnel */
  ranks: string[];
  /** Current data version for optimistic locking */
  dataVersion: number;
  /** Whether user is a manager (hides department filter) */
  isManager: boolean;
  /** Callback with result info */
  onResult: (result: { assigned: number; failed: number; message: string }) => void;
}

type FilterMode = "all" | "department" | "gender" | "rank" | "custom";

export function AutoAssignModal({
  open,
  onOpenChange,
  waitingPersonnel,
  departments,
  genders,
  ranks,
  dataVersion,
  isManager,
  onResult,
}: AutoAssignModalProps) {
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [selectedDepartment, setSelectedDepartment] = useState<string | null>(null);
  const [selectedGender, setSelectedGender] = useState<string | null>(null);
  const [selectedRank, setSelectedRank] = useState<string | null>(null);
  const [selectedPersonIds, setSelectedPersonIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);

  const resetFilters = useCallback(() => {
    setFilterMode("all");
    setSelectedDepartment(null);
    setSelectedGender(null);
    setSelectedRank(null);
    setSelectedPersonIds(new Set());
    setSearchQuery("");
  }, []);

  // Personnel filtered by the active filter chips (for display in custom mode)
  const filteredPersonnel = useMemo(() => {
    let list = waitingPersonnel;
    if (selectedDepartment) list = list.filter((p) => p.department === selectedDepartment);
    if (selectedGender) list = list.filter((p) => p.gender === selectedGender);
    if (selectedRank) list = list.filter((p) => p.rank === selectedRank);
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLocaleLowerCase("he");
      list = list.filter((p) => p.full_name.toLocaleLowerCase("he").includes(q));
    }
    return list;
  }, [waitingPersonnel, selectedDepartment, selectedGender, selectedRank, searchQuery]);

  // Count of people that will be assigned based on current filter
  const targetCount = useMemo(() => {
    if (filterMode === "custom") return selectedPersonIds.size;
    return filteredPersonnel.length;
  }, [filterMode, filteredPersonnel.length, selectedPersonIds.size]);

  function togglePerson(id: string) {
    setSelectedPersonIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllVisible() {
    setSelectedPersonIds((prev) => {
      const next = new Set(prev);
      for (const p of filteredPersonnel) next.add(p.person_id);
      return next;
    });
  }

  function deselectAllVisible() {
    setSelectedPersonIds((prev) => {
      const next = new Set(prev);
      for (const p of filteredPersonnel) next.delete(p.person_id);
      return next;
    });
  }

  async function handleAssign() {
    setLoading(true);
    try {
      const filters: AutoAssignFilters = { expectedVersion: dataVersion };
      if (filterMode === "custom") {
        filters.person_ids = Array.from(selectedPersonIds);
      } else {
        if (selectedDepartment) filters.department = selectedDepartment;
        if (selectedGender) filters.gender = selectedGender;
        if (selectedRank) filters.rank = selectedRank;
      }
      const result = await autoAssignUnassigned(filters);
      onResult({
        assigned: result.assigned_count,
        failed: result.failed_count,
        message: result.message,
      });
      onOpenChange(false);
      resetFilters();
    } catch (error) {
      onResult({
        assigned: 0,
        failed: 0,
        message: error instanceof Error ? error.message : "שגיאה בשיבוץ אוטומטי",
      });
    } finally {
      setLoading(false);
    }
  }

  function handleTabChange(value: string) {
    const mode = value as FilterMode;
    setFilterMode(mode);
    if (mode !== "department") setSelectedDepartment(null);
    if (mode !== "gender") setSelectedGender(null);
    if (mode !== "rank") setSelectedRank(null);
  }

  const allVisibleSelected = filteredPersonnel.length > 0 && filteredPersonnel.every((p) => selectedPersonIds.has(p.person_id));

  // Build tab options dynamically
  const tabs: { value: FilterMode; label: string }[] = [
    { value: "all", label: `הכל (${waitingPersonnel.length})` },
  ];
  if (!isManager && departments.length > 1) tabs.push({ value: "department", label: "זירה" });
  if (genders.length > 1) tabs.push({ value: "gender", label: "מגדר" });
  if (ranks.length > 1) tabs.push({ value: "rank", label: "דרגה" });
  tabs.push({ value: "custom", label: "בחירה ידנית" });

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) resetFilters();
        onOpenChange(v);
      }}
    >
      <DialogContent className="flex max-h-[85vh] max-w-[520px] flex-col gap-0 overflow-hidden p-0">
        {/* Header */}
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle className="flex items-center gap-2.5 text-lg font-semibold">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <IconUsers size={16} className="text-primary" />
            </div>
            שיבוץ אוטומטי
          </DialogTitle>
        </DialogHeader>

        {/* Filter Tabs */}
        <div className="border-b px-5 py-3">
          <Tabs value={filterMode} onValueChange={handleTabChange}>
            <TabsList className="w-full">
              {tabs.map((tab) => (
                <TabsTrigger key={tab.value} value={tab.value} className="min-w-0 flex-1 px-2 text-[12px]">
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {/* Filter Options */}
        <div className="flex-1 overflow-y-auto">
          {filterMode === "department" ? (
            <div className="px-5 py-4">
              <div className="grid grid-cols-2 gap-2">
                {departments.map((dept) => {
                  const count = waitingPersonnel.filter((p) => p.department === dept).length;
                  return (
                    <OptionCard
                      key={dept}
                      selected={selectedDepartment === dept}
                      onClick={() => setSelectedDepartment(selectedDepartment === dept ? null : dept)}
                    >
                      <span className="font-medium">{deptHe(dept)}</span>
                      <Badge variant="secondary" className="text-[11px]">{count}</Badge>
                    </OptionCard>
                  );
                })}
              </div>
            </div>
          ) : null}

          {filterMode === "gender" ? (
            <div className="px-5 py-4">
              <div className="grid grid-cols-2 gap-2">
                {genders.map((g) => {
                  const count = waitingPersonnel.filter((p) => p.gender === g).length;
                  return (
                    <OptionCard
                      key={g}
                      selected={selectedGender === g}
                      onClick={() => setSelectedGender(selectedGender === g ? null : g)}
                    >
                      <span className="font-medium">{genderHe(g)}</span>
                      <Badge variant="secondary" className="text-[11px]">{count}</Badge>
                    </OptionCard>
                  );
                })}
              </div>
            </div>
          ) : null}

          {filterMode === "rank" ? (
            <div className="px-5 py-4">
              <div className="grid grid-cols-2 gap-2">
                {ranks.map((r) => {
                  const count = waitingPersonnel.filter((p) => p.rank === r).length;
                  return (
                    <OptionCard
                      key={r}
                      selected={selectedRank === r}
                      onClick={() => setSelectedRank(selectedRank === r ? null : r)}
                    >
                      <span className="font-medium">{rankHe(r)}</span>
                      <Badge variant="secondary" className="text-[11px]">{count}</Badge>
                    </OptionCard>
                  );
                })}
              </div>
            </div>
          ) : null}

          {filterMode === "custom" ? (
            <div className="flex flex-col px-5 py-4">
              {/* Search + select all */}
              <div className="mb-3 flex items-center gap-2">
                <div className="relative flex-1">
                  <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                    <IconSearch size={13} />
                  </div>
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="חיפוש לפי שם..."
                    className="h-8 pr-8 text-[13px]"
                  />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-[12px] text-muted-foreground hover:text-foreground"
                  onClick={allVisibleSelected ? deselectAllVisible : selectAllVisible}
                >
                  {allVisibleSelected ? "הסר הכל" : "בחר הכל"}
                </Button>
              </div>
              {/* Personnel list */}
              <div className="max-h-[280px] space-y-1 overflow-y-auto rounded-lg border bg-muted/30 p-2">
                {filteredPersonnel.length === 0 ? (
                  <p className="py-6 text-center text-[13px] text-muted-foreground">לא נמצאו אנשים</p>
                ) : (
                  filteredPersonnel.map((person) => {
                    const selected = selectedPersonIds.has(person.person_id);
                    return (
                      <button
                        key={person.person_id}
                        type="button"
                        onClick={() => togglePerson(person.person_id)}
                        className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-right text-[13px] transition-colors ${
                          selected
                            ? "bg-primary/10 text-foreground ring-1 ring-primary/20"
                            : "text-foreground/80 hover:bg-muted"
                        }`}
                      >
                        <div
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                            selected ? "border-primary bg-primary text-primary-foreground" : "border-border"
                          }`}
                        >
                          {selected ? <IconCheck size={10} /> : null}
                        </div>
                        <span className="flex-1 truncate font-medium">{person.full_name}</span>
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {rankHe(person.rank)} · {genderHe(person.gender)}
                          {!isManager ? ` · ${deptHe(person.department)}` : ""}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
              {selectedPersonIds.size > 0 ? (
                <p className="mt-2 text-[12px] text-muted-foreground">
                  נבחרו {selectedPersonIds.size} אנשים
                </p>
              ) : null}
            </div>
          ) : null}

          {filterMode === "all" ? (
            <div className="px-5 py-6">
              <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 p-5 text-center">
                <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                  <IconUsers size={18} className="text-primary" />
                </div>
                <p className="text-[14px] font-medium text-foreground">
                  שיבוץ כל הממתינים
                </p>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  {waitingPersonnel.length} אנשים ישובצו אוטומטית לפי דרגה, מגדר וזירה.
                </p>
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer — cancel right (first in RTL), assign left (second in RTL) */}
        <DialogFooter className="grid grid-cols-2 gap-2 border-t px-5 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading} className="gap-2">
            <IconX size={14} />
            ביטול
          </Button>
          <Button
            onClick={handleAssign}
            disabled={loading || targetCount === 0}
            className="gap-2"
          >
            {loading ? (
              <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
            ) : (
              <IconUsers size={14} />
            )}
            {loading ? "משבץ..." : "שבץ"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Small sub-components ── */

function OptionCard({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-between rounded-lg border px-4 py-3 text-[13px] transition-all ${
        selected
          ? "border-primary bg-primary/5 text-foreground ring-1 ring-primary/20"
          : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-muted/50"
      }`}
    >
      {children}
    </button>
  );
}
