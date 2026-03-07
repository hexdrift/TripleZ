"use client";

import { IconArrowDown, IconArrowUp, IconArrowUpDown } from "./icons";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  color?: string;
  icon?: React.ReactNode;
  tone?: "neutral" | "accent" | "warning" | "danger";
  trend?: { label: string; direction: "up" | "down" | "flat" };
}

const toneClasses: Record<NonNullable<StatCardProps["tone"]>, { value: string; iconContainer: string; glow: string; border: string }> = {
  neutral: {
    value: "text-foreground",
    iconContainer: "bg-muted/80 text-muted-foreground",
    glow: "from-slate-500/10 via-slate-500/0",
    border: "border-border/70",
  },
  accent: {
    value: "text-primary",
    iconContainer: "bg-primary/[0.12] text-primary",
    glow: "from-primary/15 via-primary/0",
    border: "border-primary/15",
  },
  warning: {
    value: "text-amber-500",
    iconContainer: "bg-amber-500/[0.12] text-amber-500",
    glow: "from-amber-500/15 via-amber-500/0",
    border: "border-amber-500/20",
  },
  danger: {
    value: "text-destructive",
    iconContainer: "bg-destructive/[0.12] text-destructive",
    glow: "from-destructive/15 via-destructive/0",
    border: "border-destructive/20",
  },
};

export function StatCard({ label, value, subtitle, color, icon, tone = "neutral", trend }: StatCardProps) {
  const selectedTone = toneClasses[tone];

  return (
    <Card className={cn("page-hero overflow-hidden border-border/70 bg-gradient-to-br from-card via-card to-background/80", selectedTone.border)}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2">
            <span className="inline-flex rounded-full border border-border/60 bg-background/80 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground shadow-[var(--shadow-inset)]">
              {label}
            </span>
            <p className={cn("text-[30px] font-bold leading-none tracking-[-0.04em]", color ? undefined : selectedTone.value)} style={color ? { color } : undefined}>
              {value}
            </p>
            {subtitle && (
              <p className="max-w-[24ch] text-xs leading-5 text-muted-foreground">
                {subtitle}
              </p>
            )}
          </div>

          {icon ? (
            <div
              className={cn(
                "h-12 w-12 rounded-2xl flex items-center justify-center shrink-0 border border-border/60 shadow-[var(--shadow-inset)]",
                selectedTone.iconContainer,
              )}
            >
              {icon}
            </div>
          ) : null}
        </div>

        {trend ? (
          <div className={cn("mt-5 inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/75 px-3 py-1.5 text-xs font-semibold shadow-[var(--shadow-inset)]", trendClass(trend.direction))}>
            <TrendIcon direction={trend.direction} />
            {trend.label}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function TrendIcon({ direction }: { direction: "up" | "down" | "flat" }) {
  if (direction === "up") return <IconArrowUp size={14} />;
  if (direction === "down") return <IconArrowDown size={14} />;
  return <IconArrowUpDown size={14} />;
}

function trendClass(direction: "up" | "down" | "flat") {
  if (direction === "up") return "text-emerald-500";
  if (direction === "down") return "text-destructive";
  return "text-muted-foreground";
}
