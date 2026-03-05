"use client";

import { motion } from "framer-motion";
import { DepartmentSummary } from "@/lib/types";
import { buildingHe, deptHe } from "@/lib/hebrew";
import { IconBed, IconBedOff, IconUsers } from "./icons";

export function DepartmentCard({ department }: { department: DepartmentSummary }) {
  const pct = Math.round(department.occupancyRate * 100);
  const tone = pct > 80 ? "badge-danger" : pct > 50 ? "badge-warning" : "badge-accent";

  return (
    <motion.div
      className="surface-card interactive-card p-5"
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      transition={{ duration: 0.1 }}
    >
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl flex items-center justify-center" style={{ background: "var(--accent-muted)", color: "var(--accent)", border: "1px solid var(--accent-border)" }}>
            <IconUsers size={19} />
          </div>
          <div>
            <h3 className="text-[18px] font-bold leading-tight" style={{ color: "var(--text-1)" }}>
              {deptHe(department.name)}
            </h3>
            <p className="text-[12px]" style={{ color: "var(--text-3)" }}>
              {department.totalRooms} חדרים · {department.buildings.map((b) => `מבנה ${buildingHe(b)}`).join(", ")}
            </p>
          </div>
        </div>

        <span className={`badge ${tone}`}>{pct}% תפוסה</span>
      </div>

      <div className="w-full rounded-full h-2 mb-4" style={{ background: "var(--surface-3)" }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: occupancyColor(pct) }} />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <MiniStat icon={<IconBed size={13} />} label="מיטות" value={department.totalBeds} />
        <MiniStat icon={<IconBedOff size={13} />} label="תפוסים" value={department.occupiedBeds} tone="warning" />
        <MiniStat icon={<IconBed size={13} />} label="פנויים" value={department.availableBeds} tone="accent" />
      </div>
    </motion.div>
  );
}

function MiniStat({ icon, label, value, tone = "neutral" }: { icon: React.ReactNode; label: string; value: number; tone?: "neutral" | "accent" | "warning" }) {
  const color = tone === "accent" ? "var(--accent)" : tone === "warning" ? "var(--warning)" : "var(--text-2)";
  return (
    <div className="surface-soft px-3 py-2 text-center">
      <div className="flex items-center justify-center gap-1 mb-1" style={{ color }}>
        {icon}
        <span className="text-[16px] font-bold leading-none">{value}</span>
      </div>
      <p className="text-[11px] font-medium" style={{ color: "var(--text-3)" }}>{label}</p>
    </div>
  );
}

function occupancyColor(pct: number): string {
  if (pct > 80) return "var(--danger)";
  if (pct > 50) return "var(--warning)";
  return "var(--accent)";
}
