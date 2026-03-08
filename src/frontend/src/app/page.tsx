"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { useAppData } from "@/components/app-shell";
import { BuildingCard } from "@/components/building-card";
import { DepartmentCard } from "@/components/department-card";
import { GroupCard } from "@/components/group-card";
import { StatCard } from "@/components/stat-card";
import { buildingSummaries, departmentSummaries, genderSummaries, rankSummaries } from "@/lib/api";
import { exportToExcel } from "@/lib/export";
import { buildingHe, deptHe, genderHe, rankHe } from "@/lib/hebrew";
import { ViewMode } from "@/lib/types";
import { isRoomVisibleToManagerWithMap, deptBedCounts, adminDeptSummaries } from "@/lib/room-utils";
import { IconBed, IconBedOff, IconBuilding, IconCrown, IconDoor, IconDownload, IconFemale, IconGender, IconMale, IconSwap, IconUsers } from "@/components/icons";
import { toast } from "react-toastify";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AutoAssignModal } from "@/components/auto-assign-modal";

const DashboardAnalytics = dynamic(
  () => import("@/components/dashboard-analytics").then((module) => module.DashboardAnalytics),
  { ssr: false, loading: () => <AnalyticsLoadingBlock /> },
);

const AddRoomModal = dynamic(
  () => import("@/components/add-room-modal").then((module) => module.AddRoomModal),
  { ssr: false },
);

const AddPersonnelModal = dynamic(
  () => import("@/components/add-personnel-modal").then((module) => module.AddPersonnelModal),
  { ssr: false },
);

const SwapModal = dynamic(
  () => import("@/components/swap-modal").then((module) => module.SwapModal),
  { ssr: false },
);

export default function Home() {
  return <DashboardContent />;
}

const VIEW_OPTIONS: { key: ViewMode; label: string }[] = [
  { key: "buildings", label: "לפי מבנה" },
  { key: "departments", label: "לפי זירה" },
  { key: "gender", label: "לפי מגדר" },
  { key: "rank", label: "לפי דרגה" },
];

const VIEW_COUNT_LABELS: Record<ViewMode, string> = {
  buildings: "מבנים",
  departments: "זירות",
  gender: "קבוצות",
  rank: "דרגות",
};

function DashboardContent() {
  const { rooms, buildings: allBuildings, personnel, dataVersion, loading, auth, viewMode, setViewMode } = useAppData();
  const [addRoomOpen, setAddRoomOpen] = useState(false);
  const [addPersonnelOpen, setAddPersonnelOpen] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [autoAssignOpen, setAutoAssignOpen] = useState(false);

  const personnelMap = useMemo(
    () => new Map(personnel.map((person) => [person.person_id, person])),
    [personnel],
  );

  // For managers: scope rooms and personnel to their department
  const isManager = auth.role === "manager";
  const managerDept = auth.department || "";

  const scopedRooms = useMemo(() => {
    if (!isManager) return rooms;
    return rooms.filter((r) => isRoomVisibleToManagerWithMap(r, managerDept, personnelMap));
  }, [rooms, isManager, managerDept, personnelMap]);

  const scopedPersonnel = useMemo(() => {
    if (!isManager) return personnel;
    return personnel.filter((p) => p.department === managerDept);
  }, [personnel, isManager, managerDept]);

  const departments = useMemo(
    () => isManager ? departmentSummaries(scopedRooms) : adminDeptSummaries(scopedRooms, personnelMap),
    [scopedRooms, isManager, personnelMap],
  );
  const genders = useMemo(() => genderSummaries(scopedRooms), [scopedRooms]);
  const ranks = useMemo(() => rankSummaries(scopedRooms), [scopedRooms]);

  const buildings = useMemo(
    () => (isManager ? buildingSummaries(scopedRooms) : allBuildings),
    [isManager, scopedRooms, allBuildings],
  );

  const assignedIdSet = useMemo(
    () => new Set(scopedRooms.flatMap((room) => room.occupant_ids)),
    [scopedRooms],
  );

  const metrics = useMemo(() => {
    if (isManager) {
      let totalBeds = 0, occupied = 0, available = 0;
      for (const r of scopedRooms) {
        const c = deptBedCounts(r, managerDept, personnelMap);
        totalBeds += c.deptTotal;
        occupied += c.deptOccupied;
        available += c.deptAvailable;
      }
      const occupancyRate = totalBeds > 0 ? Math.round((occupied / totalBeds) * 100) : 0;
      return { totalBeds, occupied, available, occupancyRate };
    }
    const totalBeds = scopedRooms.reduce((s, r) => s + r.number_of_beds, 0);
    const occupied = scopedRooms.reduce((s, r) => s + r.occupant_count, 0);
    const available = scopedRooms.reduce((s, r) => s + r.available_beds, 0);
    const occupancyRate = totalBeds > 0 ? Math.round((occupied / totalBeds) * 100) : 0;
    return { totalBeds, occupied, available, occupancyRate };
  }, [scopedRooms, isManager, managerDept, personnelMap]);

  const roomStatus = useMemo(
    () =>
      scopedRooms.reduce(
        (summary, room) => {
          if (room.occupant_count === 0) summary.empty += 1;
          else if (room.available_beds === 0) summary.full += 1;
          else summary.partial += 1;
          return summary;
        },
        { full: 0, partial: 0, empty: 0 },
      ),
    [scopedRooms],
  );

  const departmentLabel = deptHe(managerDept);
  const viewOptions = useMemo(
    () => (isManager ? VIEW_OPTIONS.filter((option) => option.key !== "departments") : VIEW_OPTIONS),
    [isManager],
  );

  const assignedPeople = useMemo(
    () =>
      scopedRooms.flatMap((room) =>
        room.occupant_ids.map((personId) => {
          const person = personnelMap.get(personId);
          return {
            department: person?.department || room.designated_department || room.departments[0] || "לא משויך",
            gender: person?.gender || room.gender,
          };
        }),
      ),
    [scopedRooms, personnelMap],
  );

  const distributionItems = useMemo(() => {
    const counts = new Map<string, number>();

    for (const assignedPerson of assignedPeople) {
      const key = isManager ? assignedPerson.gender : assignedPerson.department;
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    return Array.from(counts.entries())
      .map(([key, value]) => ({
        label: isManager ? genderHe(key) : deptHe(key),
        value,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [assignedPeople, isManager]);

  const assignmentGapItems = useMemo(() => {
    const counts = new Map<string, { assigned: number; waiting: number; total: number }>();

    for (const person of scopedPersonnel) {
      const key = isManager ? person.rank : person.department;
      if (!key) continue;

      const current = counts.get(key) ?? { assigned: 0, waiting: 0, total: 0 };
      current.total += 1;

      if (assignedIdSet.has(person.person_id)) current.assigned += 1;
      else current.waiting += 1;

      counts.set(key, current);
    }

    return Array.from(counts.entries())
      .map(([key, value]) => ({
        label: isManager ? rankHe(key) : deptHe(key),
        assigned: value.assigned,
        waiting: value.waiting,
        total: value.total,
        rate: value.total > 0 ? Math.round((value.assigned / value.total) * 100) : 0,
      }))
      .sort((a, b) => b.waiting - a.waiting || b.total - a.total)
      .slice(0, 6);
  }, [assignedIdSet, isManager, scopedPersonnel]);

  const waitingPersonnel = useMemo(
    () => scopedPersonnel.filter((person) => !assignedIdSet.has(person.person_id)),
    [assignedIdSet, scopedPersonnel],
  );

  const waitingTotal = waitingPersonnel.length;

  const waitingDepartments = useMemo(
    () => Array.from(new Set(waitingPersonnel.map((p) => p.department).filter(Boolean))),
    [waitingPersonnel],
  );
  const waitingGenders = useMemo(
    () => Array.from(new Set(waitingPersonnel.map((p) => p.gender).filter(Boolean))),
    [waitingPersonnel],
  );
  const waitingRanks = useMemo(
    () => Array.from(new Set(waitingPersonnel.map((p) => p.rank).filter(Boolean))),
    [waitingPersonnel],
  );

  const capacityItems = useMemo(
    () =>
      [...buildings]
        .sort((a, b) => b.occupancyRate - a.occupancyRate || b.totalBeds - a.totalBeds)
        .map((building) => ({
          label: buildingHe(building.name),
          occupied: building.occupiedBeds,
          available: building.availableBeds,
          total: building.totalBeds,
          rate: Math.round(building.occupancyRate * 100),
          helper: `${building.totalRooms} חדרים`,
        })),
    [buildings],
  );

  const rankItems = useMemo(
    () =>
      [...ranks]
        .map((rank) => ({
          label: rankHe(rank.name),
          occupied: rank.occupiedBeds,
          total: rank.totalBeds,
          rate: Math.round(rank.occupancyRate * 100),
        }))
        .sort((a, b) => b.rate - a.rate || b.total - a.total),
    [ranks],
  );

  useEffect(() => {
    if (isManager && viewMode === "departments") {
      setViewMode("buildings");
    }
  }, [isManager, setViewMode, viewMode]);

  useEffect(() => {
    const win = window as Window & {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    let timeoutId: number | undefined;
    let idleId: number | undefined;

    if (win.requestIdleCallback) {
      idleId = win.requestIdleCallback(() => setShowAnalytics(true), { timeout: 300 });
    } else {
      timeoutId = window.setTimeout(() => setShowAnalytics(true), 120);
    }

    return () => {
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
      if (idleId !== undefined && win.cancelIdleCallback) {
        win.cancelIdleCallback(idleId);
      }
    };
  }, []);

  function handleAutoAssignResult(result: { assigned: number; failed: number; message: string }) {
    if (result.failed > 0 && result.assigned > 0) {
      toast.warn(`שובצו ${result.assigned} אנשים, אבל ${result.failed} עדיין ללא חדר תואם.`);
    } else if (result.failed > 0) {
      toast.warn(`${result.failed} אנשים ללא חדר תואם.`);
    } else if (result.assigned > 0) {
      toast.success(result.message);
    } else if (result.message.startsWith("שגיאה")) {
      toast.error(result.message);
    } else {
      toast.info(result.message);
    }
  }

  if (loading) return <DashboardSkeleton />;

  const currentCount =
    viewMode === "buildings" ? buildings.length :
    viewMode === "departments" ? departments.length :
    viewMode === "gender" ? genders.length :
    ranks.length;

  return (
    <>
      <Card className="page-hero mb-7 overflow-hidden border-border/70 bg-gradient-to-br from-card via-card to-background/80">
        <CardContent className="p-5 sm:p-8">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <h2 className="text-[22px] font-semibold tracking-[-0.04em] text-foreground">
                {isManager ? "לוח הזירה" : "לוח בקרה"}
              </h2>
              {isManager ? (
                <p className="mt-2 max-w-[48ch] text-sm leading-6 text-muted-foreground">
                  מוצגים רק חדרים, אנשים ושיבוצים של זירת {departmentLabel}.
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="default"
                size="sm"
                onClick={() => setAutoAssignOpen(true)}
                disabled={waitingTotal === 0 || scopedRooms.length === 0}
                className="inline-flex items-center gap-2"
              >
                <IconUsers size={15} />
                {waitingTotal > 0 ? `שיבוץ אוטומטי (${waitingTotal})` : "שיבוץ אוטומטי"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportToExcel(
                  "נתונים_מלאים",
                  ["מבנה", "חדר", "דרגה", "זירות", "מגדר", "מיטות", "תפוסות", "שמורות", "פנויות", "מצב", "דיירים"],
                  scopedRooms.map((r) => [
                    buildingHe(r.building_name),
                    String(r.room_number),
                    rankHe(r.room_rank),
                    r.departments.map(deptHe).join(", ") || "—",
                    genderHe(r.gender),
                    String(r.number_of_beds),
                    String(r.occupant_count),
                    String(r.reserved_beds || 0),
                    String(r.available_beds),
                    r.available_beds === 0 ? "מלא" : "פנוי",
                    r.occupant_ids.map((id) => r.occupant_names?.[id] || id).join(" | "),
                  ]),
                )}
                className="inline-flex items-center gap-1.5 text-xs"
              >
                <IconDownload size={14} />
                ייצוא לאקסל
              </Button>
              <Button variant="outline" size="sm" onClick={() => setSwapOpen(true)} className="inline-flex items-center gap-2">
                <IconSwap size={15} />
                {isManager ? "החלפות והעברות בזירה" : "החלפות והעברות"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <section className="mb-7 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
        <StatCard
          label={isManager ? "אנשים משובצים" : "מבנים"}
          value={isManager ? metrics.occupied : buildings.length}
          tone="neutral"
          icon={isManager ? <IconUsers size={18} /> : <IconBuilding size={18} />}
        />
        <StatCard
          label='סה"כ חדרים'
          value={scopedRooms.length}
          tone="neutral"
          icon={<IconDoor size={18} />}
        />
        <StatCard
          label="מיטות תפוסות"
          value={`${metrics.occupied}/${metrics.totalBeds}`}
          tone={metrics.occupancyRate > 80 ? "danger" : metrics.occupancyRate > 50 ? "warning" : "accent"}
          icon={<IconBedOff size={18} />}
        />
        <StatCard
          label="מיטות פנויות"
          value={metrics.available}
          tone="accent"
          icon={<IconBed size={18} />}
        />
      </section>

      <section className="mb-7">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <ViewToggle viewMode={viewMode} onChange={setViewMode} options={viewOptions} />
          <Badge variant="secondary" className="bg-background/75">
            {currentCount} {VIEW_COUNT_LABELS[viewMode]}
          </Badge>
        </div>

        {currentCount === 0 ? (
          <EmptyState isManager={isManager} departmentLabel={departmentLabel} onAddRooms={() => setAddRoomOpen(true)} onAddPersonnel={() => setAddPersonnelOpen(true)} />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {viewMode === "buildings"
              ? buildings.map((building) => <BuildingCard key={building.name} building={building} />)
              : viewMode === "departments"
                ? departments.map((department) => <DepartmentCard key={department.name} department={department} />)
                : viewMode === "gender"
                  ? genders.map((group) => (
                      <GroupCard
                        key={group.name}
                        icon={group.name.toUpperCase() === "M" ? <IconMale size={19} /> : group.name.toUpperCase() === "F" ? <IconFemale size={19} /> : <IconGender size={19} />}
                        title={genderHe(group.name)}
                        subtitle={`${group.totalRooms} חדרים`}
                        totalBeds={group.totalBeds}
                        occupiedBeds={group.occupiedBeds}
                        availableBeds={group.availableBeds}
                        occupancyRate={group.occupancyRate}
                        href={`/buildings?gender=${encodeURIComponent(group.name)}`}
                      />
                    ))
                  : ranks.map((rank) => (
                      <GroupCard
                        key={rank.name}
                        icon={<IconCrown size={19} />}
                        title={rankHe(rank.name)}
                        subtitle={`${rank.totalRooms} חדרים`}
                        totalBeds={rank.totalBeds}
                        occupiedBeds={rank.occupiedBeds}
                        availableBeds={rank.availableBeds}
                        occupancyRate={rank.occupancyRate}
                        href={`/buildings?rank=${encodeURIComponent(rank.name)}`}
                      />
                    ))}
          </div>
        )}
      </section>

      {scopedRooms.length > 0 ? (
        showAnalytics ? (
          <DashboardAnalytics
            capacityTitle={isManager ? "תפוסה לפי מבנה בזירה" : "תפוסה לפי מבנה"}
            capacityDescription={isManager ? "השוואת מיטות תפוסות ופנויות בכל מבנה שבו קיימת פעילות בזירה." : "השוואת מיטות תפוסות ופנויות בכל מבנה פעיל."}
            capacityItems={capacityItems}
            distributionTitle={isManager ? "פילוח משובצים לפי מגדר" : "פילוח משובצים לפי זירה"}
            distributionDescription={isManager ? "התפלגות האנשים המשובצים בזירה לפי מגדר." : "התפלגות האנשים המשובצים בין הזירות הפעילות."}
            distributionItems={distributionItems}
            assignmentGapTitle={isManager ? "סטטוס שיבוץ לפי דרגה בזירה" : "סטטוס שיבוץ לפי זירה"}
            assignmentGapDescription={isManager ? "כמה אנשים בזירה כבר שובצו וכמה עדיין ממתינים בכל דרגה." : "כמה אנשים שובצו וכמה עדיין ממתינים לשיבוץ בכל זירה."}
            assignmentGapItems={assignmentGapItems}
            waitingTotal={waitingTotal}
            rankItems={rankItems}
            roomStatus={roomStatus}
            totalAssigned={metrics.occupied}
            totalBeds={metrics.totalBeds}
          />
        ) : (
          <AnalyticsLoadingBlock />
        )
      ) : null}

      {addRoomOpen ? <AddRoomModal open={addRoomOpen} onClose={() => setAddRoomOpen(false)} /> : null}
      {addPersonnelOpen ? <AddPersonnelModal open={addPersonnelOpen} onClose={() => setAddPersonnelOpen(false)} /> : null}
      {swapOpen ? <SwapModal open={swapOpen} onClose={() => setSwapOpen(false)} /> : null}
      <AutoAssignModal
        open={autoAssignOpen}
        onOpenChange={setAutoAssignOpen}
        waitingPersonnel={waitingPersonnel}
        departments={waitingDepartments}
        genders={waitingGenders}
        ranks={waitingRanks}
        dataVersion={dataVersion}
        isManager={isManager}
        onResult={handleAutoAssignResult}
      />
    </>
  );
}

function ViewToggle({
  viewMode,
  onChange,
  options,
}: {
  viewMode: ViewMode;
  onChange: (mode: ViewMode) => void;
  options: { key: ViewMode; label: string }[];
}) {
  return (
    <Tabs value={viewMode} onValueChange={(v) => onChange(v as ViewMode)}>
      <TabsList className="bg-background/70">
        {options.map(({ key, label }) => (
          <TabsTrigger key={key} value={key} className="min-w-0 px-3 sm:min-w-[110px]">
            {label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

function DashboardSkeleton() {
  return (
    <div>
      <Card className="mb-7 overflow-hidden border-border/70 bg-gradient-to-br from-card via-card to-background/80">
        <CardContent className="p-8">
          <div className="skeleton mb-3 h-8 w-40 rounded-lg" />
          <div className="skeleton h-4 w-80 rounded-lg" />
        </CardContent>
      </Card>
      <div className="mb-7 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-5">
              <div className="skeleton mb-4 h-4 w-16 rounded-md" />
              <div className="skeleton mb-3 h-8 w-28 rounded-md" />
              <div className="skeleton h-3 w-20 rounded-md" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="mb-7 grid grid-cols-12 gap-5">
        <Card className="col-span-12 overflow-hidden rounded-2xl">
          <CardContent className="p-5">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <div className="skeleton mb-3 h-5 w-40 rounded-lg" />
                <div className="skeleton h-4 w-64 rounded-lg" />
              </div>
              <div className="skeleton h-10 w-44 rounded-lg" />
            </div>
            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="skeleton h-20 rounded-xl" />
              ))}
            </div>
            <div className="skeleton h-72 w-full rounded-2xl" />
          </CardContent>
        </Card>
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="col-span-12 sm:col-span-6 lg:col-span-4 overflow-hidden rounded-2xl">
            <CardContent className="p-5">
              <div className="skeleton mb-3 h-5 w-36 rounded-lg" />
              <div className="skeleton mb-4 h-4 w-44 rounded-lg" />
              <div className="skeleton h-60 w-full rounded-2xl" />
            </CardContent>
          </Card>
        ))}
        <Card className="col-span-12 overflow-hidden rounded-2xl">
          <CardContent className="p-5">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <div className="skeleton mb-3 h-5 w-44 rounded-lg" />
                <div className="skeleton h-4 w-72 rounded-lg" />
              </div>
              <div className="skeleton h-9 w-24 rounded-lg" />
            </div>
            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="skeleton h-20 rounded-xl" />
              ))}
            </div>
            <div className="skeleton h-60 w-full rounded-2xl" />
          </CardContent>
        </Card>
      </div>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-5">
              <div className="skeleton mb-3 h-6 w-full rounded-lg" />
              <div className="skeleton h-20 w-full rounded-lg" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function AnalyticsLoadingBlock() {
  return (
    <div className="mb-7 grid grid-cols-12 gap-5">
      <Card className="col-span-12 overflow-hidden rounded-2xl">
        <CardContent className="p-5">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <div className="skeleton mb-3 h-5 w-40 rounded-lg" />
              <div className="skeleton h-4 w-64 rounded-lg" />
            </div>
            <div className="skeleton h-10 w-44 rounded-lg" />
          </div>
          <div className="mb-4 grid grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="skeleton h-20 rounded-xl" />
            ))}
          </div>
          <div className="skeleton h-72 w-full rounded-2xl" />
        </CardContent>
      </Card>
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i} className={i === 3 ? "col-span-12 overflow-hidden rounded-2xl" : "col-span-12 sm:col-span-6 lg:col-span-4 overflow-hidden rounded-2xl"}>
          <CardContent className="p-5">
            <div className="skeleton mb-3 h-5 w-36 rounded-lg" />
            <div className="skeleton mb-4 h-4 w-44 rounded-lg" />
            <div className="skeleton h-60 w-full rounded-2xl" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function EmptyState({ isManager, departmentLabel, onAddRooms, onAddPersonnel }: { isManager: boolean; departmentLabel: string; onAddRooms: () => void; onAddPersonnel: () => void }) {
  return (
    <Card className="text-center overflow-hidden border-border/70 bg-gradient-to-br from-card via-card to-background/80">
      <CardContent className="p-12">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[22px] border border-border/60 bg-background/75 text-muted-foreground shadow-[var(--shadow-inset)]">
          <IconDoor size={32} />
        </div>
        <p className="text-base font-semibold mb-1 text-foreground">
          {isManager ? `אין כרגע חדרים בזירת ${departmentLabel}` : "לא נטענו נתונים"}
        </p>
        {isManager ? (
          <p className="text-sm text-muted-foreground">
            כאשר יוגדרו חדרים לזירה שלך הם יופיעו כאן.
          </p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mb-5">
              טען חדרים ואנשי כוח אדם כדי להתחיל
            </p>
            <div className="flex items-center justify-center gap-3">
              <Button onClick={onAddRooms} className="inline-flex items-center gap-2">
                <IconDoor size={15} />
                טעינת חדרים
              </Button>
              <Button variant="outline" onClick={onAddPersonnel} className="inline-flex items-center gap-2">
                <IconUsers size={15} />
                טעינת כוח אדם
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
