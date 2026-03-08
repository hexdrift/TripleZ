"use client";

import { type ReactNode, useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { BuildingSummary, Room, ViewMode } from "@/lib/types";
import { buildingHe, deptHe, genderHe, rankHe } from "@/lib/hebrew";
import { departmentSummaries, genderSummaries, rankSummaries } from "@/lib/api";
import { useTheme } from "next-themes";
import {
  IconBed,
  IconBuilding,
  IconChevronLeft,
  IconChevronRight,
  IconClipboardList,
  IconCrown,
  IconGender,
  IconLayoutDashboard,
  IconLogout,
  IconMenu,
  IconMoon,
  IconSettings,
  IconSun,
  IconUsers,
  IconX,
  IconZzz,
} from "./icons";
import { useAppData } from "./app-shell";
import { useAuth, roleLabelHe } from "./auth-provider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { VisuallyHidden } from "radix-ui";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "לוח בקרה", icon: IconLayoutDashboard, role: "all" as const },
  { href: "/personnel", label: "כוח אדם", icon: IconUsers, role: "all" as const },
  { href: "/buildings", label: "חדרים", icon: IconBed, role: "manager" as const },
  { href: "/rooms", label: "חדרים", icon: IconBed, role: "admin" as const },
  { href: "/audit", label: "יומן פעולות", icon: IconClipboardList, role: "admin" as const },
  { href: "/settings", label: "הגדרות", icon: IconSettings, role: "admin" as const },
];

interface SidebarProps {
  buildings: BuildingSummary[];
  viewMode: ViewMode;
  rooms: Room[];
  collapsed: boolean;
  onToggleCollapse: () => void;
}

const VIEW_LABELS: Record<ViewMode, string> = {
  buildings: "מבנים",
  departments: "זירות",
  gender: "מגדר",
  rank: "דרגה",
};

export function Sidebar({ buildings, viewMode, rooms, collapsed, onToggleCollapse }: SidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const normalizedPathname = useMemo(() => normalizeSidebarHref(pathname), [pathname]);
  const currentUrl = searchParams.toString() ? `${pathname}?${searchParams.toString()}` : pathname;
  const normalizedCurrentUrl = useMemo(() => normalizeSidebarHref(currentUrl), [currentUrl]);
  const { theme, setTheme } = useTheme();
  const { lastUpdatedAt, connectionState } = useAppData();
  const { auth, logout } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [relativeTime, setRelativeTime] = useState("");

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname, searchParams]);

  useEffect(() => {
    function update() {
      if (!lastUpdatedAt) {
        setRelativeTime("");
        return;
      }

      const sec = Math.floor((Date.now() - lastUpdatedAt) / 1000);
      if (sec < 5) setRelativeTime("עודכן עכשיו");
      else if (sec < 60) setRelativeTime(`עודכן לפני ${sec} שניות`);
      else if (sec < 3600) setRelativeTime(`עודכן לפני ${Math.floor(sec / 60)} דקות`);
      else setRelativeTime(`עודכן לפני ${Math.floor(sec / 3600)} שעות`);
    }

    update();
    const id = window.setInterval(update, 5000);
    return () => window.clearInterval(id);
  }, [lastUpdatedAt]);

  const sidebarItems = useMemo(() => {
    if (viewMode === "buildings") {
      return buildings.map((b) => ({
        key: b.name,
        href: `/buildings?name=${encodeURIComponent(b.name)}`,
        icon: <IconBuilding size={15} />,
        label: buildingHe(b.name),
        pct: Math.round(b.occupancyRate * 100),
      }));
    }

    if (viewMode === "departments") {
      const departments = departmentSummaries(rooms);
      return departments.map((d) => ({
        key: d.name,
        href: `/buildings?department=${encodeURIComponent(d.name)}`,
        icon: <IconUsers size={15} />,
        label: deptHe(d.name),
        pct: Math.round(d.occupancyRate * 100),
      }));
    }

    if (viewMode === "gender") {
      const genders = genderSummaries(rooms);
      return genders.map((g) => ({
        key: g.name,
        href: `/buildings?gender=${encodeURIComponent(g.name)}`,
        icon: <IconGender size={15} />,
        label: genderHe(g.name),
        pct: Math.round(g.occupancyRate * 100),
      }));
    }

    const ranks = rankSummaries(rooms);
    return ranks.map((r) => ({
      key: r.name,
      href: `/buildings?rank=${encodeURIComponent(r.name)}`,
      icon: <IconCrown size={15} />,
      label: rankHe(r.name),
      pct: Math.round(r.occupancyRate * 100),
    }));
  }, [viewMode, buildings, rooms]);

  const sectionLabel = VIEW_LABELS[viewMode];

  return (
    <>
      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <IconZzz size={18} />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Triple Z</p>
              <p className="text-xs text-muted-foreground">{roleLabelHe(auth)}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {mounted ? (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                aria-label={theme === "dark" ? "עבור למצב בהיר" : "עבור למצב כהה"}
              >
                {theme === "dark" ? <IconSun size={16} /> : <IconMoon size={16} />}
              </Button>
            ) : null}
            <Button variant="outline" size="icon-sm" onClick={() => setMobileOpen(true)} aria-label="פתח תפריט">
              <IconMenu size={16} />
            </Button>
          </div>
        </div>
      </div>

      {/* Desktop sidebar */}
      <aside
        className="fixed bottom-0 right-0 top-0 z-20 hidden border-l border-sidebar-border bg-sidebar/92 backdrop-blur-xl lg:flex"
        style={{ width: collapsed ? "5rem" : "18.75rem", contain: "layout paint" }}
      >
        <SidebarPane
          authLabel={roleLabelHe(auth)}
          currentUrl={currentUrl}
          normalizedCurrentUrl={normalizedCurrentUrl}
          normalizedPathname={normalizedPathname}
          mounted={mounted}
          navItems={sidebarItems}
          onLogout={logout}
          onThemeToggle={() => setTheme(theme === "dark" ? "light" : "dark")}
          pathname={pathname}
          sectionLabel={sectionLabel}
          theme={theme}
          connectionState={connectionState}
          relativeTime={relativeTime}
          isMobile={false}
          collapsed={collapsed}
          onToggleCollapse={onToggleCollapse}
        />
      </aside>

      {/* Mobile sheet */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="right" showCloseButton={false} className="w-[320px] max-w-[90vw] p-0" aria-describedby={undefined}>
          <VisuallyHidden.Root>
            <SheetTitle>תפריט ניווט</SheetTitle>
          </VisuallyHidden.Root>
          <SidebarPane
            authLabel={roleLabelHe(auth)}
            currentUrl={currentUrl}
            normalizedCurrentUrl={normalizedCurrentUrl}
            normalizedPathname={normalizedPathname}
            mounted={mounted}
            navItems={sidebarItems}
            onClose={() => setMobileOpen(false)}
            onLogout={logout}
            onThemeToggle={() => setTheme(theme === "dark" ? "light" : "dark")}
            pathname={pathname}
            sectionLabel={sectionLabel}
            theme={theme}
            connectionState={connectionState}
            relativeTime={relativeTime}
            isMobile
            collapsed={false}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}

function SidebarPane({
  authLabel,
  currentUrl,
  normalizedCurrentUrl,
  normalizedPathname,
  mounted,
  navItems,
  onClose,
  onLogout,
  onThemeToggle,
  onToggleCollapse,
  pathname,
  sectionLabel,
  theme,
  connectionState,
  relativeTime,
  isMobile,
  collapsed,
}: {
  authLabel: string;
  currentUrl: string;
  normalizedCurrentUrl: string;
  normalizedPathname: string;
  mounted: boolean;
  navItems: Array<{ key: string; href: string; icon: ReactNode; label: string; pct: number }>;
  onClose?: () => void;
  onLogout: () => void;
  onThemeToggle: () => void;
  onToggleCollapse?: () => void;
  pathname: string;
  sectionLabel: string;
  theme?: string;
  connectionState: "connecting" | "connected" | "error";
  relativeTime: string;
  isMobile: boolean;
  collapsed: boolean;
}) {
  const { auth } = useAuth();

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className={cn("border-b border-sidebar-border/80", collapsed ? "px-3 py-4" : "px-5 py-5")}>
        <div className="flex items-center justify-between gap-2">
          <div className={cn("flex items-center", collapsed ? "justify-center w-full" : "gap-3")}>
            <div className={cn(
              "flex items-center justify-center rounded-xl border border-primary/15 bg-primary text-primary-foreground shadow-sm",
              collapsed ? "h-10 w-10" : "h-10 w-10",
            )}>
              <IconZzz size={collapsed ? 16 : 17} />
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <h1 className="text-lg font-bold leading-tight tracking-[-0.03em] text-foreground">Triple Z</h1>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{authLabel}</p>
              </div>
            )}
          </div>

          {isMobile && onClose ? (
            <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="סגור תפריט">
              <IconX size={16} />
            </Button>
          ) : null}
        </div>
      </div>

      {/* Navigation */}
      <nav className={cn("flex-1 overflow-y-auto", collapsed ? "px-2 py-3" : "px-3 py-4")}>
        {!collapsed && (
          <p className="mb-1.5 px-2.5 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/70">
            ניווט
          </p>
        )}
        <div className={cn("space-y-1", collapsed ? "" : "mb-5")}>
          {navItemsForRole(auth.role).map((item) => {
            const active = normalizedPathname === normalizeSidebarHref(item.href);
            const linkContent = (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group relative flex items-center gap-2.5 overflow-hidden rounded-xl border px-3 py-2.5 text-[13px] font-medium transition-[background-color,color,border-color,box-shadow] duration-150",
                  collapsed && "justify-center px-0",
                  active
                    ? "border-border bg-card text-foreground shadow-[0_1px_2px_rgba(15,23,42,0.06)] before:absolute before:right-1.5 before:top-1/2 before:h-6 before:w-1 before:-translate-y-1/2 before:rounded-full before:bg-foreground"
                    : "border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-[background-color,color] duration-150",
                    active
                      ? "bg-foreground text-background"
                      : "text-muted-foreground group-hover:bg-background/80 group-hover:text-foreground",
                  )}
                >
                  <item.icon size={17} />
                </span>
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );

            return linkContent;
          })}
        </div>

        {/* Section items (buildings/departments/etc.) */}
        {!collapsed && (
          <div className="mb-1.5 flex items-center justify-between px-2.5">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/70">
              {sectionLabel}
            </p>
            <span className="rounded-full bg-muted/60 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
              {navItems.length}
            </span>
          </div>
        )}

        {collapsed && (
          <div className="my-2 border-t border-sidebar-border/60" />
        )}

        <div className="space-y-1">
          {navItems.map((item) => {
            const active = normalizedCurrentUrl === normalizeSidebarHref(item.href);

            if (collapsed) {
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group relative flex items-center justify-center overflow-hidden rounded-xl border p-2.5 transition-[background-color,border-color,box-shadow,transform] duration-150",
                    active
                      ? "border-border bg-card text-foreground shadow-[0_1px_2px_rgba(15,23,42,0.06)]"
                      : "border-transparent text-muted-foreground hover:-translate-y-px hover:border-foreground/10 hover:bg-card hover:text-foreground hover:shadow-sm",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-lg text-sm transition-[background-color,color,box-shadow,transform] duration-150",
                      active
                        ? "bg-foreground text-background"
                        : "text-muted-foreground group-hover:-translate-y-px group-hover:bg-background group-hover:text-foreground group-hover:shadow-xs",
                    )}
                  >
                    {item.icon}
                  </span>
                </Link>
              );
            }

            return (
              <Link
                key={item.key}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group relative block overflow-hidden rounded-xl border px-3 py-2.5 transition-[background-color,border-color,box-shadow,transform] duration-150",
                  active
                    ? "border-border bg-card shadow-[0_1px_2px_rgba(15,23,42,0.06)] before:absolute before:right-1.5 before:top-3 before:bottom-3 before:w-1 before:rounded-full before:bg-foreground"
                    : "border-sidebar-border/60 bg-background/40 hover:-translate-y-px hover:border-foreground/12 hover:bg-card hover:shadow-sm",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      "flex items-center gap-2 text-[13px] font-medium transition-colors duration-150",
                      active ? "text-foreground" : "text-muted-foreground group-hover:text-foreground",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-[background-color,color,box-shadow,transform] duration-150",
                        active
                          ? "bg-foreground text-background"
                          : "text-muted-foreground group-hover:-translate-y-px group-hover:bg-background group-hover:text-foreground group-hover:shadow-xs",
                      )}
                    >
                      {item.icon}
                    </span>
                    {item.label}
                  </span>
                  <OccupancyPill pct={item.pct} />
                </div>
                <div className="mt-2 h-1.5 w-full rounded-full bg-muted/60">
                  <div
                    className={cn("occupancy-progress h-full rounded-full", occupancyColorClass(item.pct))}
                    style={{ width: `${item.pct}%` }}
                  />
                </div>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Footer */}
      {mounted ? (
        <div className={cn("border-t border-sidebar-border/80", collapsed ? "px-2 py-3" : "px-3 py-3")}>
          {!collapsed && connectionState === "error" ? (
            <p className="mb-1.5 px-2.5 text-[11px] font-medium text-destructive">מנותק</p>
          ) : !collapsed && relativeTime ? (
            <p className="mb-1.5 px-2.5 text-[11px] text-muted-foreground">{relativeTime}</p>
          ) : null}

          {collapsed ? (
            <div className="space-y-1">
              <Button
                variant="ghost"
                onClick={onThemeToggle}
                className="h-10 w-full rounded-xl p-0"
              >
                {theme === "dark" ? <IconSun size={17} /> : <IconMoon size={17} />}
              </Button>
              <Button
                variant="ghost"
                onClick={onLogout}
                className="h-10 w-full rounded-xl p-0"
              >
                <IconLogout size={17} />
              </Button>
            </div>
          ) : (
            <div className="space-y-1">
              <Button
                variant="ghost"
                onClick={onThemeToggle}
                className="h-auto w-full justify-start gap-2.5 rounded-xl px-2.5 py-2.5 text-[13px] font-medium text-muted-foreground hover:text-foreground"
              >
                {theme === "dark" ? <IconSun size={17} /> : <IconMoon size={17} />}
                <span>{theme === "dark" ? "מצב בהיר" : "מצב כהה"}</span>
              </Button>

              <Button
                variant="ghost"
                onClick={onLogout}
                className="h-auto w-full justify-start gap-2.5 rounded-xl px-2.5 py-2.5 text-[13px] font-medium text-muted-foreground hover:text-foreground"
              >
                <IconLogout size={17} />
                <span>התנתק</span>
              </Button>
            </div>
          )}

          {/* Collapse toggle */}
          {!isMobile && onToggleCollapse && (
            <div className="mt-1 border-t border-sidebar-border/60 pt-2">
              <Button
                variant="ghost"
                onClick={onToggleCollapse}
                className={cn(
                  "h-9 w-full rounded-xl text-muted-foreground hover:text-foreground",
                  collapsed ? "p-0" : "justify-start gap-2.5 px-2.5 text-[12px]",
                )}
              >
                {collapsed ? <IconChevronLeft size={16} /> : <IconChevronRight size={16} />}
                {!collapsed && <span>כווץ תפריט</span>}
              </Button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function navItemsForRole(role: "admin" | "manager") {
  return navItems.filter((item) => item.role === "all" || item.role === role);
}

function normalizeSidebarHref(href: string) {
  const [path, query = ""] = href.split("?");
  const normalizedPath = path === "/" ? "/" : path.replace(/\/+$/, "");
  return query ? `${normalizedPath}?${query}` : normalizedPath;
}

function occupancyColorClass(pct: number): string {
  if (pct > 80) return "bg-destructive";
  if (pct > 50) return "bg-amber-500";
  return "bg-primary";
}

function OccupancyPill({ pct }: { pct: number }) {
  const variant = pct > 80 ? "destructive" : pct > 50 ? "secondary" : "default";
  return (
    <Badge
      variant={variant}
      className={cn(
        "text-[11px]",
        pct > 50 && pct <= 80 && "border-amber-500/20 bg-amber-500/[0.14] text-amber-600 dark:text-amber-400",
      )}
    >
      {pct}%
    </Badge>
  );
}
