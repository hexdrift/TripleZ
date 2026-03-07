"use client";

import Link from "next/link";
import { DepartmentSummary } from "@/lib/types";
import { buildingHe, deptHe } from "@/lib/hebrew";
import { IconBed, IconBedOff, IconUsers } from "./icons";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function DepartmentCard({ department }: { department: DepartmentSummary }) {
  const pct = Math.round(department.occupancyRate * 100);
  const statusClass =
    pct > 80
      ? "from-destructive/[0.14] to-transparent text-destructive border-destructive/20"
      : pct > 50
        ? "from-amber-500/[0.14] to-transparent text-amber-600 dark:text-amber-400 border-amber-500/20"
        : "from-primary/[0.14] to-transparent text-primary border-primary/15";
  const progressClass = pct > 80 ? "bg-destructive" : pct > 50 ? "bg-amber-500" : "bg-primary";

  return (
    <Link
      href={`/buildings?department=${encodeURIComponent(department.name)}`}
      className="group block"
      aria-label={`פתח את זירת ${deptHe(department.name)}`}
    >
      <Card className="page-hero gap-0 overflow-hidden border-border/70 bg-gradient-to-br from-card via-card to-background/80 p-5 transition-[transform,box-shadow,border-color,background-color] duration-150 hover:-translate-y-0.5 hover:border-foreground/15 hover:from-card hover:via-background hover:to-muted/45 hover:shadow-[var(--shadow-hover)] active:translate-y-0">
        <CardContent className="p-0">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/15 bg-primary/10 text-primary shadow-[var(--shadow-inset)] transition-[transform,background-color,color,border-color,box-shadow] duration-150 group-hover:-translate-y-px group-hover:border-primary/25 group-hover:bg-primary group-hover:text-primary-foreground group-hover:shadow-sm">
                <IconUsers size={19} />
              </div>
              <div>
                <h3 className="text-[20px] font-bold leading-tight tracking-[-0.03em] text-foreground transition-colors duration-150 group-hover:text-foreground">
                  {deptHe(department.name)}
                </h3>
                <p className="text-[12px] text-muted-foreground transition-colors duration-150 group-hover:text-foreground/72">
                  {department.totalRooms} חדרים · {department.buildings.map((b) => `מבנה ${buildingHe(b)}`).join(", ")}
                </p>
              </div>
            </div>

            <Badge className={`bg-gradient-to-r transition-[border-color,box-shadow,transform] duration-150 group-hover:-translate-y-px group-hover:border-foreground/15 group-hover:shadow-sm ${statusClass}`}>
              {pct}% תפוסה
            </Badge>
          </div>

          <div className="mb-5 rounded-[20px] border border-border/60 bg-background/70 p-3 shadow-[var(--shadow-inset)] transition-[border-color,background-color,box-shadow] duration-150 group-hover:border-foreground/10 group-hover:bg-background group-hover:shadow-sm">
            <div className="mb-2 flex items-center justify-between text-[11px] font-semibold text-muted-foreground transition-colors duration-150 group-hover:text-foreground/72">
              <span>פריסת הזירה</span>
              <span>{department.occupiedBeds} מתוך {department.totalBeds} מיטות</span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-muted/80">
              <div
                className={`occupancy-progress h-full rounded-full ${progressClass}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <MiniStat icon={<IconBed size={13} />} label="מיטות" value={department.totalBeds} />
            <MiniStat icon={<IconBedOff size={13} />} label="תפוסים" value={department.occupiedBeds} tone="warning" />
            <MiniStat icon={<IconBed size={13} />} label="פנויים" value={department.availableBeds} tone="accent" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function MiniStat({ icon, label, value, tone = "neutral" }: { icon: React.ReactNode; label: string; value: number; tone?: "neutral" | "accent" | "warning" }) {
  const colorClass = tone === "accent" ? "text-primary" : tone === "warning" ? "text-amber-500" : "text-muted-foreground";
  return (
    <div className="rounded-2xl border border-border/60 bg-background/[0.72] px-3 py-3 text-center shadow-[var(--shadow-inset)] transition-[border-color,background-color,transform,box-shadow] duration-150 group-hover:-translate-y-px group-hover:border-foreground/10 group-hover:bg-background group-hover:shadow-sm">
      <div className={`flex items-center justify-center gap-1 mb-1 ${colorClass}`}>
        {icon}
        <span className="text-[18px] font-bold leading-none tracking-[-0.03em]">{value}</span>
      </div>
      <p className="text-[11px] font-semibold text-muted-foreground">{label}</p>
    </div>
  );
}
