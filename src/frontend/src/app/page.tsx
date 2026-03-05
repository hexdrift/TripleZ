"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AppShell, useAppData } from "@/components/app-shell";
import { AddRoomModal } from "@/components/add-room-modal";
import { BuildingCard } from "@/components/building-card";
import { DepartmentCard } from "@/components/department-card";
import { GroupCard } from "@/components/group-card";
import { SwapModal } from "@/components/swap-modal";
import { StatCard } from "@/components/stat-card";
import { departmentSummaries, genderSummaries, rankSummaries } from "@/lib/api";
import { exportToExcel } from "@/lib/export";
import { buildingHe, deptHe, genderHe, rankHe } from "@/lib/hebrew";
import { ViewMode } from "@/lib/types";
import { IconBed, IconBedOff, IconBuilding, IconCrown, IconDoor, IconDownload, IconGender, IconSwap, IconUsers } from "@/components/icons";

export default function Home() {
  return (
    <AppShell>
      <DashboardContent />
    </AppShell>
  );
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
  const { rooms, buildings, loading, auth, viewMode, setViewMode } = useAppData();
  const [addRoomOpen, setAddRoomOpen] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);

  const departments = useMemo(() => departmentSummaries(rooms), [rooms]);
  const genders = useMemo(() => genderSummaries(rooms), [rooms]);
  const ranks = useMemo(() => rankSummaries(rooms), [rooms]);

  const metrics = useMemo(() => {
    const totalBeds = rooms.reduce((s, r) => s + r.number_of_beds, 0);
    const occupied = rooms.reduce((s, r) => s + r.occupant_count, 0);
    const available = Math.max(totalBeds - occupied, 0);
    const occupancyRate = totalBeds > 0 ? Math.round((occupied / totalBeds) * 100) : 0;
    return { totalBeds, occupied, available, occupancyRate };
  }, [rooms]);

  if (loading) return <DashboardSkeleton />;

  const currentCount =
    viewMode === "buildings" ? buildings.length :
    viewMode === "departments" ? departments.length :
    viewMode === "gender" ? genders.length :
    ranks.length;

  return (
    <>
      <section className="surface-card p-8 mb-7">
        <div className="flex items-start justify-between gap-8">
          <div>
            <h2 className="section-title">לוח בקרה</h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => exportToExcel(
                "נתונים_מלאים",
                ["מבנה", "חדר", "דרגה", "זירות", "מגדר", "מיטות", "תפוסים", "פנויים", "מצב", "דיירים"],
                rooms.map((r) => [
                  `מבנה ${buildingHe(r.building_name)}`,
                  String(r.room_number),
                  rankHe(r.room_rank),
                  r.departments.map(deptHe).join(", ") || "—",
                  genderHe(r.gender),
                  String(r.number_of_beds),
                  String(r.occupant_count),
                  String(r.available_beds),
                  r.available_beds === 0 ? "מלא" : "פנוי",
                  r.occupant_ids.map((id) => r.occupant_names?.[id] || id).join(" | "),
                ]),
              )}
              className="btn-ghost inline-flex items-center gap-1.5 text-[12px]"
            >
              <IconDownload size={14} />
              ייצוא לאקסל
            </button>
            <button onClick={() => setSwapOpen(true)} className="btn-secondary inline-flex items-center gap-2">
              <IconSwap size={15} />
              החלפות והעברות
            </button>
            {auth.role === "admin" ? (
              <button onClick={() => setAddRoomOpen(true)} className="btn-secondary inline-flex items-center gap-2">
                <IconDoor size={15} />
                הוספת חדר
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-4 gap-4 mb-7">
        <StatCard
          label="מבנים"
          value={buildings.length}
          tone="neutral"
          icon={<IconBuilding size={18} />}
        />
        <StatCard
          label='סה"כ חדרים'
          value={rooms.length}
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

      <section>
        <div className="flex items-end justify-between mb-4">
          <div className="flex items-center gap-3">
            <ViewToggle viewMode={viewMode} onChange={setViewMode} />
          </div>
          <span className="badge">
            {currentCount} {VIEW_COUNT_LABELS[viewMode]}
          </span>
        </div>

        {viewMode === "buildings" ? (
          buildings.length === 0 ? (
            auth.role === "admin" ? (
              <EmptyState onUploadRooms={() => setAddRoomOpen(true)} />
            ) : (
              <div className="surface-card p-12 text-center">
                <p className="text-[16px] font-semibold" style={{ color: "var(--text-1)" }}>אין חדרים בזירה שלך</p>
                <p className="text-[13px] mt-1" style={{ color: "var(--text-3)" }}>פנה למנהל מערכת להוספת חדרים</p>
              </div>
            )
          ) : (
            <AnimatePresence mode="wait">
              <div className="grid grid-cols-3 gap-4">
                {buildings.map((b, i) => (
                  <motion.div
                    key={b.name}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.2, delay: i * 0.05 }}
                  >
                    <BuildingCard building={b} />
                  </motion.div>
                ))}
              </div>
            </AnimatePresence>
          )
        ) : viewMode === "departments" ? (
          departments.length === 0 ? (
            <div className="surface-card p-12 text-center">
              <p className="text-[16px] font-semibold" style={{ color: "var(--text-1)" }}>אין זירות</p>
            </div>
          ) : (
            <AnimatePresence mode="wait">
              <div className="grid grid-cols-3 gap-4">
                {departments.map((d, i) => (
                  <motion.div
                    key={d.name}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.2, delay: i * 0.05 }}
                  >
                    <DepartmentCard department={d} />
                  </motion.div>
                ))}
              </div>
            </AnimatePresence>
          )
        ) : viewMode === "gender" ? (
          <AnimatePresence mode="wait">
            <div className="grid grid-cols-3 gap-4">
              {genders.map((g, i) => (
                <motion.div
                  key={g.name}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.2, delay: i * 0.05 }}
                >
                  <GroupCard
                    icon={<IconGender size={19} />}
                    title={genderHe(g.name)}
                    subtitle={`${g.totalRooms} חדרים`}
                    totalBeds={g.totalBeds}
                    occupiedBeds={g.occupiedBeds}
                    availableBeds={g.availableBeds}
                    occupancyRate={g.occupancyRate}
                  />
                </motion.div>
              ))}
            </div>
          </AnimatePresence>
        ) : (
          <AnimatePresence mode="wait">
            <div className="grid grid-cols-3 gap-4">
              {ranks.map((r, i) => (
                <motion.div
                  key={r.name}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.2, delay: i * 0.05 }}
                >
                  <GroupCard
                    icon={<IconCrown size={19} />}
                    title={rankHe(r.name)}
                    subtitle={`${r.totalRooms} חדרים`}
                    totalBeds={r.totalBeds}
                    occupiedBeds={r.occupiedBeds}
                    availableBeds={r.availableBeds}
                    occupancyRate={r.occupancyRate}
                  />
                </motion.div>
              ))}
            </div>
          </AnimatePresence>
        )}
      </section>

      <AddRoomModal open={addRoomOpen} onClose={() => setAddRoomOpen(false)} />
      <SwapModal open={swapOpen} onClose={() => setSwapOpen(false)} />
    </>
  );
}

function ViewToggle({ viewMode, onChange }: { viewMode: ViewMode; onChange: (mode: ViewMode) => void }) {
  return (
    <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: "var(--border)" }}>
      {VIEW_OPTIONS.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className="px-4 py-2 text-[13px] font-semibold cursor-pointer transition-colors"
          style={{
            background: viewMode === key ? "var(--accent)" : "transparent",
            color: viewMode === key ? "#fff" : "var(--text-2)",
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div>
      <div className="surface-card p-8 mb-7">
        <div className="skeleton h-8 w-40 rounded-lg mb-3" />
        <div className="skeleton h-4 w-80 rounded-lg" />
      </div>
      <div className="grid grid-cols-4 gap-4 mb-7">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="surface-card p-5">
            <div className="skeleton h-4 w-16 rounded-md mb-4" />
            <div className="skeleton h-8 w-28 rounded-md mb-3" />
            <div className="skeleton h-3 w-20 rounded-md" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="surface-card p-5">
            <div className="skeleton h-6 w-full rounded-lg mb-3" />
            <div className="skeleton h-20 w-full rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyState({ onUploadRooms }: { onUploadRooms: () => void }) {
  return (
    <div className="surface-card p-12 text-center">
      <IconDoor size={34} className="mx-auto mb-3" />
      <p className="text-[16px] font-semibold mb-1" style={{ color: "var(--text-1)" }}>לא נטענו נתונים</p>
      <p className="text-[13px] mb-6" style={{ color: "var(--text-3)" }}>כדי להתחיל, יש לטעון קובץ חדרים</p>
      <div className="flex items-center justify-center gap-3">
        <button onClick={onUploadRooms} className="btn-secondary inline-flex items-center gap-2">
          <IconDoor size={15} />
          טעינת חדרים
        </button>
      </div>
    </div>
  );
}
