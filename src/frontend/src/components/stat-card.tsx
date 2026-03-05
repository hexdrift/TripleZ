"use client";

import { IconArrowDown, IconArrowUp, IconArrowUpDown } from "./icons";

interface StatCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  color?: string;
  icon?: React.ReactNode;
  tone?: "neutral" | "accent" | "warning" | "danger";
  trend?: { label: string; direction: "up" | "down" | "flat" };
}

const toneStyles: Record<NonNullable<StatCardProps["tone"]>, { valueColor: string; iconBg: string; iconColor: string }> = {
  neutral: {
    valueColor: "var(--text-1)",
    iconBg: "var(--surface-3)",
    iconColor: "var(--text-3)",
  },
  accent: {
    valueColor: "var(--accent)",
    iconBg: "var(--accent-muted)",
    iconColor: "var(--accent)",
  },
  warning: {
    valueColor: "var(--warning)",
    iconBg: "var(--warning-dim)",
    iconColor: "var(--warning)",
  },
  danger: {
    valueColor: "var(--danger)",
    iconBg: "var(--danger-dim)",
    iconColor: "var(--danger)",
  },
};

export function StatCard({ label, value, subtitle, color, icon, tone = "neutral", trend }: StatCardProps) {
  const selectedTone = toneStyles[tone];
  const valueColor = color || selectedTone.valueColor;

  return (
    <div className="surface-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[12px] font-semibold mb-2" style={{ color: "var(--text-3)" }}>
            {label}
          </p>
          <p className="text-[30px] font-bold leading-none" style={{ color: valueColor }}>
            {value}
          </p>
          {subtitle && (
            <p className="text-[12px] mt-2" style={{ color: "var(--text-3)" }}>
              {subtitle}
            </p>
          )}
        </div>

        {icon ? (
          <div
            className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0"
            style={{
              background: selectedTone.iconBg,
              color: selectedTone.iconColor,
              border: "1px solid var(--border)",
            }}
          >
            {icon}
          </div>
        ) : null}
      </div>

      {trend ? (
        <div className="mt-4 flex items-center gap-2 text-[12px] font-semibold" style={{ color: trendColor(trend.direction) }}>
          <TrendIcon direction={trend.direction} />
          {trend.label}
        </div>
      ) : null}
    </div>
  );
}

function TrendIcon({ direction }: { direction: "up" | "down" | "flat" }) {
  if (direction === "up") return <IconArrowUp size={14} />;
  if (direction === "down") return <IconArrowDown size={14} />;
  return <IconArrowUpDown size={14} />;
}

function trendColor(direction: "up" | "down" | "flat") {
  if (direction === "up") return "var(--success)";
  if (direction === "down") return "var(--danger)";
  return "var(--text-3)";
}
