"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { BuildingSummary, Room, ViewMode } from "@/lib/types";
import { buildingHe, deptHe, genderHe, rankHe } from "@/lib/hebrew";
import { departmentSummaries, genderSummaries, rankSummaries } from "@/lib/api";
import { useTheme } from "next-themes";
import { IconBuilding, IconCrown, IconGender, IconLayoutDashboard, IconLogout, IconMoon, IconSettings, IconSun, IconUsers, IconZzz } from "./icons";
import { useAppData } from "./app-shell";
import { useAuth, roleLabelHe } from "./auth-provider";

const navItems = [
  { href: "/", label: "לוח בקרה", icon: IconLayoutDashboard, adminOnly: false },
  { href: "/personnel", label: "כוח אדם", icon: IconUsers, adminOnly: false },
  { href: "/settings", label: "הגדרות", icon: IconSettings, adminOnly: true },
];

interface SidebarProps {
  buildings: BuildingSummary[];
  viewMode: ViewMode;
  rooms: Room[];
}

const VIEW_LABELS: Record<ViewMode, string> = {
  buildings: "מבנים",
  departments: "זירות",
  gender: "מגדר",
  rank: "דרגה",
};

export function Sidebar({ buildings, viewMode, rooms }: SidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentUrl = searchParams.toString() ? `${pathname}?${searchParams.toString()}` : pathname;
  const { theme, setTheme } = useTheme();
  const { lastUpdatedAt, connectionState } = useAppData();
  const { auth, logout } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [relativeTime, setRelativeTime] = useState("");

  const departments = useMemo(() => departmentSummaries(rooms), [rooms]);
  const genders = useMemo(() => genderSummaries(rooms), [rooms]);
  const ranks = useMemo(() => rankSummaries(rooms), [rooms]);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    function update() {
      if (!lastUpdatedAt) { setRelativeTime(""); return; }
      const sec = Math.floor((Date.now() - lastUpdatedAt) / 1000);
      if (sec < 5) setRelativeTime("עודכן עכשיו");
      else if (sec < 60) setRelativeTime(`עודכן לפני ${sec} שניות`);
      else if (sec < 3600) setRelativeTime(`עודכן לפני ${Math.floor(sec / 60)} דקות`);
      else setRelativeTime(`עודכן לפני ${Math.floor(sec / 3600)} שעות`);
    }
    update();
    const id = setInterval(update, 5000);
    return () => clearInterval(id);
  }, [lastUpdatedAt]);

  const sidebarItems = useMemo(() => {
    if (viewMode === "buildings") {
      return buildings.map((b) => ({
        key: b.name,
        href: `/buildings?name=${b.name}`,
        icon: <IconBuilding size={15} />,
        label: `מבנה ${buildingHe(b.name)}`,
        pct: Math.round(b.occupancyRate * 100),
      }));
    }
    if (viewMode === "departments") {
      return departments.map((d) => ({
        key: d.name,
        href: `/buildings?name=${d.name}`,
        icon: <IconUsers size={15} />,
        label: deptHe(d.name),
        pct: Math.round(d.occupancyRate * 100),
      }));
    }
    if (viewMode === "gender") {
      return genders.map((g) => ({
        key: g.name,
        href: `/buildings?name=${g.name}`,
        icon: <IconGender size={15} />,
        label: genderHe(g.name),
        pct: Math.round(g.occupancyRate * 100),
      }));
    }
    return ranks.map((r) => ({
      key: r.name,
      href: `/buildings?name=${r.name}`,
      icon: <IconCrown size={15} />,
      label: rankHe(r.name),
      pct: Math.round(r.occupancyRate * 100),
    }));
  }, [viewMode, buildings, departments, genders, ranks]);

  const sectionLabel = VIEW_LABELS[viewMode];

  return (
    <aside
      className="fixed right-0 top-0 bottom-0 w-[292px] border-l flex flex-col z-20"
      style={{ background: "var(--surface-1)", borderColor: "var(--border)" }}
    >
      <div className="px-6 py-6 border-b" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center gap-3 mb-4">
          <div className="h-11 w-11 rounded-xl flex items-center justify-center" style={{ background: "var(--accent)", color: "white" }}>
            <IconZzz size={20} />
          </div>
          <div>
            <h1 className="text-[24px] font-bold leading-none" style={{ color: "var(--text-1)" }}>Triple Z</h1>
            <p className="text-[12px] mt-1" style={{ color: "var(--text-3)" }}>{roleLabelHe(auth)}</p>
          </div>
        </div>

      </div>

      <nav className="flex-1 overflow-y-auto px-4 py-5">
        <p className="px-3 mb-2 text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: "var(--text-3)" }}>
          ניווט
        </p>
        <div className="space-y-1 mb-7">
          {navItems.filter((item) => !item.adminOnly || auth.role === "admin").map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-[14px] font-semibold border transition-all"
                style={{
                  background: active ? "var(--accent-muted)" : "transparent",
                  color: active ? "var(--accent)" : "var(--text-2)",
                  borderColor: active ? "var(--accent)" : "transparent",
                }}
              >
                <item.icon size={17} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>

        <div className="flex items-center justify-between px-3 mb-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: "var(--text-3)" }}>
            {sectionLabel}
          </p>
          <span className="text-[11px] font-semibold" style={{ color: "var(--text-3)" }}>{sidebarItems.length}</span>
        </div>

        <div className="space-y-1">
          {sidebarItems.map((item) => {
            const active = currentUrl === item.href;
            return (
              <motion.div
                key={item.key}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                transition={{ duration: 0.1 }}
              >
                <Link
                  href={item.href}
                  className="rounded-xl border px-3 py-2.5 block transition-all"
                  style={{
                    background: active ? "var(--surface-3)" : "var(--surface-1)",
                    borderColor: active ? "var(--accent)" : "var(--border)",
                  }}
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="flex items-center gap-2 text-[13px] font-semibold" style={{ color: active ? "var(--accent)" : "var(--text-2)" }}>
                      {item.icon}
                      {item.label}
                    </span>
                    <OccupancyPill pct={item.pct} />
                  </div>
                  <div className="w-full rounded-full h-1.5" style={{ background: "var(--surface-3)" }}>
                    <div className="h-full rounded-full transition-all" style={{ width: `${item.pct}%`, background: occupancyColor(item.pct) }} />
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>
      </nav>

      {mounted && (
        <div className="px-4 py-4 border-t" style={{ borderColor: "var(--border)" }}>
          {connectionState === "error" ? (
            <p className="px-3 mb-2 text-[11px] font-medium" style={{ color: "var(--danger)" }}>מנותק</p>
          ) : relativeTime ? (
            <p className="px-3 mb-2 text-[11px]" style={{ color: "var(--text-3)" }}>{relativeTime}</p>
          ) : null}
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all"
            style={{ color: "var(--text-2)", background: "transparent" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            {theme === "dark" ? <IconSun size={17} /> : <IconMoon size={17} />}
            <span>{theme === "dark" ? "מצב בהיר" : "מצב כהה"}</span>
          </button>
          <button
            onClick={logout}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all"
            style={{ color: "var(--text-2)", background: "transparent" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <IconLogout size={17} />
            <span>התנתק</span>
          </button>
        </div>
      )}
    </aside>
  );
}

function occupancyColor(pct: number): string {
  if (pct > 80) return "var(--danger)";
  if (pct > 50) return "var(--warning)";
  return "var(--accent)";
}

function OccupancyPill({ pct }: { pct: number }) {
  const tone = pct > 80 ? "badge-danger" : pct > 50 ? "badge-warning" : "badge-accent";
  return <span className={`badge ${tone}`}>{pct}%</span>;
}
