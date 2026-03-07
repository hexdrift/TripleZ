type DeptColor = { bg: string; border: string; strong: string };

export const DEPT_COLORS: Record<
  string,
  DeptColor
> = {
  "R&D": {
    bg: "rgba(99, 102, 241, 0.12)",
    border: "rgba(99, 102, 241, 0.25)",
    strong: "#6366F1",
  },
  'מו"פ': {
    bg: "rgba(99, 102, 241, 0.12)",
    border: "rgba(99, 102, 241, 0.25)",
    strong: "#6366F1",
  },
  Sales: {
    bg: "rgba(16, 185, 129, 0.12)",
    border: "rgba(16, 185, 129, 0.25)",
    strong: "#10B981",
  },
  מכירות: {
    bg: "rgba(16, 185, 129, 0.12)",
    border: "rgba(16, 185, 129, 0.25)",
    strong: "#10B981",
  },
  Exec: {
    bg: "rgba(168, 85, 247, 0.12)",
    border: "rgba(168, 85, 247, 0.25)",
    strong: "#A855F7",
  },
  הנהלה: {
    bg: "rgba(168, 85, 247, 0.12)",
    border: "rgba(168, 85, 247, 0.25)",
    strong: "#A855F7",
  },
  IT: {
    bg: "rgba(75, 85, 99, 0.12)",
    border: "rgba(75, 85, 99, 0.25)",
    strong: "#4B5563",
  },
  "מערכות מידע": {
    bg: "rgba(75, 85, 99, 0.12)",
    border: "rgba(75, 85, 99, 0.25)",
    strong: "#4B5563",
  },
  QA: {
    bg: "rgba(245, 158, 11, 0.12)",
    border: "rgba(245, 158, 11, 0.25)",
    strong: "#F59E0B",
  },
  "בקרת איכות": {
    bg: "rgba(245, 158, 11, 0.12)",
    border: "rgba(245, 158, 11, 0.25)",
    strong: "#F59E0B",
  },
  Ops: {
    bg: "rgba(236, 72, 153, 0.12)",
    border: "rgba(236, 72, 153, 0.25)",
    strong: "#EC4899",
  },
  תפעול: {
    bg: "rgba(236, 72, 153, 0.12)",
    border: "rgba(236, 72, 153, 0.25)",
    strong: "#EC4899",
  },
};
export const DEFAULT_DEPT_COLOR = {
  bg: "rgba(107, 114, 128, 0.12)",
  border: "rgba(107, 114, 128, 0.25)",
  strong: "#6B7280",
};

export function Legend({
  color,
  label,
  dashed = false,
}: {
  color: string;
  label: string;
  dashed?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <div
        className="w-3 h-3 rounded-sm"
        style={{
          background: color,
          border: dashed
            ? "1px dashed var(--border)"
            : "1px solid var(--accent)",
        }}
      />
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </div>
  );
}
