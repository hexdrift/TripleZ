"use client";

import { useId, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Room } from "@/lib/types";
import { unassignPerson } from "@/lib/api";
import { deptHe, genderHe, rankHe } from "@/lib/hebrew";
import { IconChevronDown, IconUserMinus } from "./icons";

export const RANK_COLORS: Record<string, { color: string; bg: string; border: string }> = {
  VP: { color: "var(--danger)", bg: "var(--danger-dim)", border: "var(--danger-border)" },
  Director: { color: "var(--warning)", bg: "var(--warning-dim)", border: "var(--warning-border)" },
  Manager: { color: "var(--accent)", bg: "var(--accent-muted)", border: "var(--accent)" },
  Junior: { color: "var(--text-2)", bg: "var(--surface-3)", border: "var(--border)" },
};

export const DEPT_COLORS: Record<string, { bg: string; border: string; strong: string }> = {
  "R&D":   { bg: "rgba(99, 102, 241, 0.12)",  border: "rgba(99, 102, 241, 0.25)",  strong: "#6366F1" },
  "Sales": { bg: "rgba(16, 185, 129, 0.12)",   border: "rgba(16, 185, 129, 0.25)",  strong: "#10B981" },
  "Exec":  { bg: "rgba(168, 85, 247, 0.12)",   border: "rgba(168, 85, 247, 0.25)",  strong: "#A855F7" },
  "IT":    { bg: "rgba(75, 85, 99, 0.12)",       border: "rgba(75, 85, 99, 0.25)",    strong: "#4B5563" },
  "QA":    { bg: "rgba(245, 158, 11, 0.12)",    border: "rgba(245, 158, 11, 0.25)",  strong: "#F59E0B" },
  "Ops":   { bg: "rgba(236, 72, 153, 0.12)",    border: "rgba(236, 72, 153, 0.25)",  strong: "#EC4899" },
};
export const DEFAULT_DEPT_COLOR = { bg: "rgba(107, 114, 128, 0.12)", border: "rgba(107, 114, 128, 0.25)", strong: "#6B7280" };

export function RoomCard({ room }: { room: Room }) {
  const [expanded, setExpanded] = useState(false);
  const [loadingPerson, setLoadingPerson] = useState<string | null>(null);
  const occupantsPanelId = useId();

  const rankTone = RANK_COLORS[room.room_rank] || RANK_COLORS.Junior;
  const primaryDept = room.departments[0] || "";
  const deptColor = DEPT_COLORS[primaryDept] || DEFAULT_DEPT_COLOR;
  const occupancyRate = Math.round((room.occupant_count / room.number_of_beds) * 100);
  const isFull = room.available_beds === 0;

  async function handleUnassign(personId: string) {
    setLoadingPerson(personId);
    try {
      await unassignPerson(personId);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingPerson(null);
    }
  }

  return (
    <article className="surface-card p-4">
      <header className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <div
            className="h-10 w-10 rounded-xl flex items-center justify-center font-bold text-[14px]"
            style={{ background: "var(--surface-3)", color: "var(--text-2)", border: "1px solid var(--border)" }}
          >
            {room.room_number}
          </div>
          <div>
            <h4 className="text-[18px] font-bold leading-tight" style={{ color: "var(--text-1)" }}>
              חדר {room.room_number}
            </h4>
            <p className="text-[12px] font-semibold" style={{ color: rankTone.color }}>{rankHe(room.room_rank)}</p>
          </div>
        </div>

        <div className="text-left">
          <p className="text-[24px] font-bold leading-none" style={{ color: isFull ? "var(--danger)" : "var(--accent)" }}>
            {room.occupant_count}/{room.number_of_beds}
          </p>
          <p className="text-[11px]" style={{ color: "var(--text-3)" }}>תפוסה {occupancyRate}%</p>
        </div>
      </header>

      <div className="surface-soft p-3 mb-3">
        <div className="flex flex-col gap-2.5">
          {(() => {
            const total = room.number_of_beds;
            const perRow = total <= 10 ? Math.ceil(total / 2) : Math.min(6, Math.ceil(total / Math.ceil(total / 6)));
            const beds = Array.from({ length: total }, (_, i) => i < room.occupant_count);
            const rows = Array.from({ length: Math.ceil(total / perRow) }, (_, r) => beds.slice(r * perRow, Math.min((r + 1) * perRow, total)));
            return rows.map((row, rowIdx) => (
              <div key={rowIdx} className="flex gap-2 justify-center">
                {row.map((occupied, i) => (
                  <BedTopView key={rowIdx * perRow + i} occupied={occupied} index={rowIdx * perRow + i + 1} deptColor={deptColor} />
                ))}
              </div>
            ));
          })()}
        </div>

        <div className="flex items-center gap-4 mt-3 pt-2 border-t" style={{ borderColor: "var(--border)" }}>
          <Legend color={deptColor.strong} label={room.departments.map(deptHe).join(", ") || "—"} />
          <Legend color="var(--surface-3)" label="פנויה" dashed />
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {room.departments.map((d) => <Badge key={d} label={deptHe(d)} />)}
        <Badge label={genderHe(room.gender)} />
        <Badge
          label={isFull ? "מלא" : `${room.available_beds} פנויות`}
          color={isFull ? "var(--danger)" : "var(--accent)"}
          bg={isFull ? "var(--danger-dim)" : "var(--accent-muted)"}
          border={isFull ? "var(--danger-border)" : "var(--accent)"}
        />
      </div>

      {room.occupant_ids.length > 0 ? (
        <section className="border-t pt-2" style={{ borderColor: "var(--border)" }}>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-controls={occupantsPanelId}
            className="w-full flex items-center justify-between py-1 text-[12px] font-semibold cursor-pointer"
            style={{ color: "var(--text-2)" }}
          >
            <span>{room.occupant_ids.length} דיירים</span>
            <IconChevronDown size={14} className={`transition-transform ${expanded ? "rotate-180" : ""}`} />
          </button>

          <AnimatePresence initial={false}>
            {expanded ? (
              <motion.div
                id={occupantsPanelId}
                className="mt-2 space-y-1.5 overflow-hidden"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                {room.occupant_ids.map((personId) => {
                  const name = room.occupant_names?.[personId] || "";
                  return (
                    <div key={personId} className="surface-soft py-2 px-2.5 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-bold" style={{ background: "var(--accent-muted)", color: "var(--accent)" }}>
                          {name ? name.charAt(0) : personId.slice(-2)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[12px] font-semibold truncate" style={{ color: "var(--text-1)" }}>{name || personId}</p>
                          {name ? (
                            <p className="text-[11px] truncate" style={{ color: "var(--text-3)" }}>{personId}</p>
                          ) : null}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                      if (!window.confirm("האם להסיר את האדם מהחדר?")) return;
                      handleUnassign(personId);
                    }}
                        disabled={loadingPerson === personId}
                        className="btn-ghost !min-h-[30px] !px-2.5 inline-flex items-center gap-1.5 text-[11px]"
                        style={{ color: "var(--danger)" }}
                      >
                        <IconUserMinus size={12} />
                        {loadingPerson === personId ? "מסיר..." : "הסר"}
                      </button>
                    </div>
                  );
                })}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </section>
      ) : (
        <p className="text-[12px] italic border-t pt-2" style={{ color: "var(--text-3)", borderColor: "var(--border)" }}>החדר פנוי</p>
      )}
    </article>
  );
}

export function BedTopView({ occupied, index, deptColor }: { occupied: boolean; index: number; deptColor: typeof DEFAULT_DEPT_COLOR }) {
  const fill = occupied ? deptColor.bg : "var(--surface-1)";
  const stroke = occupied ? deptColor.strong : "var(--border)";
  return (
    <div
      className="relative flex-1 min-w-[44px] max-w-[64px] flex flex-col items-center"
      title={occupied ? `מיטה ${index} - תפוסה` : `מיטה ${index} - פנויה`}
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" className="w-full h-auto" style={{ opacity: occupied ? 1 : 0.4 }}>
        <g fill={fill} stroke={stroke} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
          <rect x="42" y="20" width="116" height="24" rx="6" />
          <rect x="50" y="36" width="100" height="144" rx="8" />
          <rect x="65" y="48" width="70" height="32" rx="10" />
          <path d="M 46 95 L 154 95 L 154 172 C 154 179.7 147.7 186 140 186 L 60 186 C 52.3 186 46 179.7 46 172 Z" />
          <rect x="46" y="85" width="108" height="20" rx="6" />
        </g>
        <g fill="none" stroke={stroke} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M 78 64 Q 100 68 122 64" />
          <path d="M 75 120 Q 85 145 75 170" />
          <path d="M 125 120 Q 115 145 125 170" />
        </g>
      </svg>
      <span className="text-[8px] font-bold mt-0.5" style={{ color: occupied ? deptColor.strong : "var(--text-3)" }}>
        {index}
      </span>
    </div>
  );
}

export function Legend({ color, label, dashed = false }: { color: string; label: string; dashed?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-3 h-3 rounded-sm" style={{ background: color, border: dashed ? "1px dashed var(--border)" : "1px solid var(--accent)" }} />
      <span className="text-[10px]" style={{ color: "var(--text-3)" }}>{label}</span>
    </div>
  );
}

export function Badge({ label, color, bg, border }: { label: string; color?: string; bg?: string; border?: string }) {
  return (
    <span
      className="text-[11px] font-semibold px-2.5 py-1 rounded-full"
      style={{
        color: color || "var(--text-2)",
        background: bg || "var(--surface-3)",
        border: `1px solid ${border || "var(--border)"}`,
      }}
    >
      {label}
    </span>
  );
}
