"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Pie,
  PieChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { IconBed, IconClock, IconCrown, IconSignal, IconUsers } from "./icons";

type CapacityItem = {
  label: string;
  occupied: number;
  available: number;
  total: number;
  rate: number;
  helper?: string;
};

type DistributionItem = {
  label: string;
  value: number;
};

type AssignmentGapItem = {
  label: string;
  assigned: number;
  waiting: number;
  total: number;
  rate: number;
};

type RankItem = {
  label: string;
  occupied: number;
  total: number;
  rate: number;
};

type RoomStatus = {
  full: number;
  partial: number;
  empty: number;
};

type TooltipEntry = {
  color?: string;
  dataKey?: string;
  name?: string;
  value?: number | string;
  payload?: Record<string, unknown>;
};

type CapacityView = "beds" | "rate";
type ChartSize = { width: number; height: number };

const CHART_CARD_CLASS = "overflow-hidden rounded-2xl border-border/70 bg-card pb-5 pt-0 shadow-[0_1px_2px_rgba(15,23,42,0.04)]";
const GRID_CLASS = "stroke-border/70";
const TOOLTIP_Z: React.CSSProperties = { zIndex: 10 };
const TICK_STYLE = { fill: "var(--muted-foreground)", fontSize: 12 };
const AXIS_LABEL_STYLE = { fill: "var(--muted-foreground)", fontSize: 11, fontWeight: 500 };

export function DashboardAnalytics({
  capacityTitle,
  capacityDescription,
  capacityItems,
  distributionTitle,
  distributionDescription,
  distributionItems,
  assignmentGapTitle,
  assignmentGapDescription,
  assignmentGapItems,
  waitingTotal,
  rankItems,
  roomStatus,
  totalAssigned,
  totalBeds,
}: {
  capacityTitle: string;
  capacityDescription: string;
  capacityItems: CapacityItem[];
  distributionTitle: string;
  distributionDescription: string;
  distributionItems: DistributionItem[];
  assignmentGapTitle: string;
  assignmentGapDescription: string;
  assignmentGapItems: AssignmentGapItem[];
  waitingTotal: number;
  rankItems: RankItem[];
  roomStatus: RoomStatus;
  totalAssigned: number;
  totalBeds: number;
}) {
  const [chartsReady, setChartsReady] = useState(false);

  useEffect(() => {
    let active = true;
    const frame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (active) setChartsReady(true);
      });
    });

    return () => {
      active = false;
      window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <section className="mb-7 space-y-3">
      <h3 className="text-[18px] font-semibold tracking-[-0.03em] text-foreground">אנליטיקה מצטברת</h3>

      <PrimaryCapacityCard
        title={capacityTitle}
        description={capacityDescription}
        items={capacityItems}
        totalAssigned={totalAssigned}
        totalBeds={totalBeds}
        ready={chartsReady}
      />

      <div className="grid grid-cols-12 items-stretch gap-4 auto-rows-fr">
        <div className="col-span-12 flex min-w-0 sm:col-span-6 lg:col-span-4">
          <DistributionCard
            title={distributionTitle}
            description={distributionDescription}
            items={distributionItems}
            totalAssigned={totalAssigned}
            ready={chartsReady}
            className="h-full w-full"
          />
        </div>

        <div className="col-span-12 flex min-w-0 sm:col-span-6 lg:col-span-4">
          <RoomStatusCard roomStatus={roomStatus} ready={chartsReady} className="h-full w-full" />
        </div>

        <div className="col-span-12 flex min-w-0 sm:col-span-12 lg:col-span-4">
          <RankPressureCard items={rankItems} ready={chartsReady} className="h-full w-full" />
        </div>
      </div>

      <AssignmentGapCard
        title={assignmentGapTitle}
        description={assignmentGapDescription}
        items={assignmentGapItems}
        waitingTotal={waitingTotal}
        ready={chartsReady}
      />
    </section>
  );
}

function PrimaryCapacityCard({
  title,
  description,
  items,
  totalAssigned,
  totalBeds,
  ready,
}: {
  title: string;
  description: string;
  items: CapacityItem[];
  totalAssigned: number;
  totalBeds: number;
  ready: boolean;
}) {
  const [view, setView] = useState<CapacityView>("rate");

  const chartData = useMemo(
    () =>
      items.map((item) => ({
        ...item,
        shortLabel: item.label.replace(/^מבנה\s+/, ""),
      })),
    [items],
  );

  const topOccupied = chartData[0];
  const mostAvailable = [...chartData].sort((a, b) => b.available - a.available || a.rate - b.rate)[0];
  const averageRate = chartData.length > 0 ? Math.round(chartData.reduce((sum, item) => sum + item.rate, 0) / chartData.length) : 0;

  return (
    <Card className={CHART_CARD_CLASS}>
      <CardHeader className="border-b border-border/70 py-5">
        <div>
          <CardTitle className="flex items-center gap-2 text-[15px]">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/70 bg-muted/30 text-foreground">
              <IconSignal size={15} />
            </span>
            {title}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>

        <CardAction className="flex items-center gap-3">
          <QuietPill label="סה״כ מיטות" value={totalBeds} />
          <SegmentedControl
            value={view}
            options={[
              { value: "rate", label: "אחוז תפוסה" },
              { value: "beds", label: "מיטות" },
            ]}
            onChange={(nextValue) => setView(nextValue as CapacityView)}
          />
        </CardAction>
      </CardHeader>

      <CardContent className="pt-5">
        <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <InlineMetric label="מיטות תפוסות" value={totalAssigned} helper={totalBeds > 0 ? `${Math.round((totalAssigned / totalBeds) * 100)}% מהקיבולת` : "אין קיבולת"} />
          <InlineMetric label="מיטות פנויות" value={Math.max(totalBeds - totalAssigned, 0)} helper="זמינות לשיבוץ מיידי" />
          <InlineMetric label="מבנים פעילים" value={chartData.length} helper="מוצגים לפי עומס קיים" />
        </div>

        <ChartSurface className="h-[340px] min-w-0">
          {(size) =>
            !ready ? (
              <ChartPlaceholder />
            ) : view === "rate" ? (
              <AreaChart width={size.width} height={size.height} data={chartData} margin={{ top: 8, right: 12, left: 8, bottom: 24 }}>
                <defs>
                  <linearGradient id="capacity-rate-area" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-chart-2)" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="var(--color-chart-2)" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" className={GRID_CLASS} />
                <XAxis dataKey="shortLabel" tickLine={false} axisLine={false} tickMargin={10} tick={TICK_STYLE} label={{ value: "מבנה", position: "insideBottom", offset: -16, style: AXIS_LABEL_STYLE }} />
                <YAxis
                  domain={[0, 100]}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={10}
                  tick={TICK_STYLE}
                  tickFormatter={(value: number) => `${value}%`}
                  label={{ value: "אחוז תפוסה", angle: -90, position: "insideLeft", offset: 4, style: AXIS_LABEL_STYLE }}
                />
                <Tooltip content={<CapacityRateTooltip />} wrapperStyle={TOOLTIP_Z} cursor={{ stroke: "var(--border)", strokeDasharray: "4 4" }} />
                <Area
                  type="natural"
                  dataKey="rate"
                  name="אחוז תפוסה"
                  stroke="var(--color-chart-1)"
                  strokeWidth={2.5}
                  fill="url(#capacity-rate-area)"
                  isAnimationActive={false}
                  activeDot={{ r: 4, fill: "var(--color-chart-1)", stroke: "var(--background)", strokeWidth: 2 }}
                />
              </AreaChart>
            ) : (
              <BarChart width={size.width} height={size.height} data={chartData} margin={{ top: 8, right: 12, left: 8, bottom: 24 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" className={GRID_CLASS} />
                <XAxis dataKey="shortLabel" tickLine={false} axisLine={false} tickMargin={10} tick={TICK_STYLE} label={{ value: "מבנה", position: "insideBottom", offset: -16, style: AXIS_LABEL_STYLE }} />
                <YAxis tickLine={false} axisLine={false} tickMargin={10} tick={TICK_STYLE} label={{ value: "מיטות", angle: -90, position: "insideLeft", offset: 4, style: AXIS_LABEL_STYLE }} />
                <Tooltip content={<CapacityBedsTooltip />} wrapperStyle={TOOLTIP_Z} cursor={{ fill: "color-mix(in srgb, var(--muted) 45%, transparent)" }} />
                <Bar
                  dataKey="occupied"
                  name="מיטות תפוסות"
                  stackId="beds"
                  radius={[0, 0, 10, 10]}
                  fill="var(--color-chart-1)"
                  maxBarSize={56}
                  isAnimationActive={false}
                />
                <Bar
                  dataKey="available"
                  name="מיטות פנויות"
                  stackId="beds"
                  radius={[10, 10, 0, 0]}
                  fill="var(--color-chart-4)"
                  maxBarSize={56}
                  isAnimationActive={false}
                />
              </BarChart>
            )
          }
        </ChartSurface>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3 border-t border-border/70 pt-4 pb-2">
          <FooterHighlight
            label="העומס הגבוה ביותר"
            title={topOccupied?.label ?? "—"}
            detail={topOccupied ? `${topOccupied.rate}% תפוסה` : "אין נתונים"}
          />
          <FooterHighlight
            label="הכי הרבה זמינות"
            title={mostAvailable?.label ?? "—"}
            detail={mostAvailable ? `${mostAvailable.available} מיטות פנויות` : "אין נתונים"}
          />
          <FooterHighlight
            label="ממוצע מבני"
            title={`${averageRate}%`}
            detail="אחוז תפוסה ממוצע בין המבנים"
          />
        </div>
      </CardContent>
    </Card>
  );
}

function DistributionCard({
  title,
  description,
  items,
  totalAssigned,
  ready,
  className,
}: {
  title: string;
  description: string;
  items: DistributionItem[];
  totalAssigned: number;
  ready: boolean;
  className?: string;
}) {
  const chartData = items.map((item, index) => ({
    ...item,
    fill: getChartTone(index),
    percentage: totalAssigned > 0 ? Math.round((item.value / totalAssigned) * 100) : 0,
  }));
  const visibleItems = chartData.slice(0, 4);

  return (
    <Card className={cn(CHART_CARD_CLASS, className)}>
      <CardHeader className="border-b border-border/70 py-5">
        <div>
          <CardTitle className="flex items-center gap-2 text-[15px]">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/70 bg-muted/30 text-foreground">
              <IconUsers size={15} />
            </span>
            {title}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>

        <CardAction>
          <QuietPill label="פלחים" value={chartData.length} />
        </CardAction>
      </CardHeader>

      <CardContent className="pt-5">
        <div className="relative min-w-0">
          <ChartSurface className="h-[220px]">
            {(size) => ready ? (
              <PieChart width={size.width} height={size.height}>
                <Tooltip content={<DistributionTooltip />} wrapperStyle={TOOLTIP_Z} />
                <Pie
                  data={chartData}
                  dataKey="value"
                  nameKey="label"
                  innerRadius={64}
                  outerRadius={88}
                  stroke="var(--background)"
                  strokeWidth={4}
                  paddingAngle={2}
                  isAnimationActive={false}
                >
                  {chartData.map((entry) => (
                    <Cell key={entry.label} fill={entry.fill} />
                  ))}
                </Pie>
              </PieChart>
            ) : (
              <ChartPlaceholder className="h-full" />
            )}
          </ChartSurface>

          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[30px] font-semibold tracking-[-0.04em] text-foreground">{totalAssigned}</span>
            <span className="text-[11px] font-medium text-muted-foreground">משובצים פעילים</span>
          </div>
        </div>

        <div className="space-y-2.5">
          {chartData.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
              אין מספיק נתונים להצגת פילוח.
            </div>
          ) : (
            visibleItems.map((item) => (
              <div key={item.label} className="rounded-xl border border-border/70 bg-muted/[0.18] px-3 py-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <LegendDot color={item.fill} />
                    <span className="truncate text-sm font-medium text-foreground">{item.label}</span>
                  </div>
                  <span className="text-sm font-semibold text-foreground">{item.value}</span>
                </div>
                <div className="mb-1 h-2 overflow-hidden rounded-full bg-muted/70">
                  <div className="h-full rounded-full" style={{ width: `${item.percentage}%`, backgroundColor: item.fill }} />
                </div>
                <div className="text-[11px] text-muted-foreground">{item.percentage}% מכלל המשובצים</div>
              </div>
            ))
          )}
        </div>

      </CardContent>
    </Card>
  );
}

function RoomStatusCard({ roomStatus, ready, className }: { roomStatus: RoomStatus; ready: boolean; className?: string }) {
  const items = [
    { label: "מלאים", value: roomStatus.full, fill: "var(--color-chart-1)" },
    { label: "חלקיים", value: roomStatus.partial, fill: "var(--color-chart-2)" },
    { label: "ריקים", value: roomStatus.empty, fill: "var(--color-chart-4)" },
  ];
  const total = items.reduce((sum, item) => sum + item.value, 0);

  return (
    <Card className={cn(CHART_CARD_CLASS, className)}>
      <CardHeader className="border-b border-border/70 py-5">
        <div>
          <CardTitle className="flex items-center gap-2 text-[15px]">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/70 bg-muted/30 text-foreground">
              <IconBed size={15} />
            </span>
            מצב חדרים
          </CardTitle>
          <CardDescription>התפלגות החדרים בין תפוסה מלאה, חלקית וריקה.</CardDescription>
        </div>

        <CardAction>
          <QuietPill label="חדרים" value={total} />
        </CardAction>
      </CardHeader>

      <CardContent className="pt-5">
        <ChartSurface className="h-[220px] min-w-0">
          {(size) => ready ? (
              <BarChart width={size.width} height={size.height} data={items} layout="vertical" margin={{ top: 4, right: 18, left: 18, bottom: 20 }} barCategoryGap={20}>
                <CartesianGrid horizontal={false} strokeDasharray="3 3" className={GRID_CLASS} />
                <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} tick={TICK_STYLE} label={{ value: "מספר חדרים", position: "insideBottom", offset: -12, style: AXIS_LABEL_STYLE }} />
                <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} tickMargin={14} tick={TICK_STYLE} width={52} />
                <Tooltip content={<RoomStatusTooltip total={total} />} wrapperStyle={TOOLTIP_Z} cursor={{ fill: "color-mix(in srgb, var(--muted) 45%, transparent)" }} />
                <Bar dataKey="value" radius={[8, 8, 8, 8]} maxBarSize={26} isAnimationActive={false}>
                  {items.map((entry) => (
                    <Cell key={entry.label} fill={entry.fill} />
                  ))}
                  <LabelList dataKey="value" position="right" offset={12} className="fill-foreground text-[12px] font-semibold" />
                </Bar>
              </BarChart>
            ) : (
              <ChartPlaceholder className="h-full" />
            )}
        </ChartSurface>

        <div className="mt-4 space-y-2">
          {items.map((item) => {
            const percentage = total > 0 ? Math.round((item.value / total) * 100) : 0;
            return (
              <div key={item.label} className="flex items-center justify-between rounded-xl border border-border/70 bg-muted/[0.18] px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <LegendDot color={item.fill} />
                  <div>
                    <div className="text-sm font-medium text-foreground">{item.label}</div>
                    <div className="text-[11px] text-muted-foreground">{item.value} חדרים</div>
                  </div>
                </div>
                <div className="text-sm font-semibold text-foreground">{percentage}%</div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function RankPressureCard({ items, ready, className }: { items: RankItem[]; ready: boolean; className?: string }) {
  const topRank = items[0];

  return (
    <Card className={cn(CHART_CARD_CLASS, className)}>
      <CardHeader className="border-b border-border/70 py-5">
        <div>
          <CardTitle className="flex items-center gap-2 text-[15px]">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/70 bg-muted/30 text-foreground">
              <IconCrown size={15} />
            </span>
            עומס לפי דרגת חדר
          </CardTitle>
          <CardDescription>איפה נוצר לחץ תפוסה גבוה יותר בין דרגות החדרים.</CardDescription>
        </div>

        <CardAction>
          <QuietPill label="שיא עומס" value={topRank ? `${topRank.rate}%` : "—"} />
        </CardAction>
      </CardHeader>

      <CardContent className="pt-5">
        <ChartSurface className="h-[220px] min-w-0">
          {(size) => ready ? (
              <BarChart width={size.width} height={size.height} data={items} layout="vertical" margin={{ top: 4, right: 18, left: 18, bottom: 20 }} barCategoryGap={18}>
                <CartesianGrid horizontal={false} strokeDasharray="3 3" className={GRID_CLASS} />
                <XAxis
                  type="number"
                  domain={[0, 100]}
                  tickLine={false}
                  axisLine={false}
                  tick={TICK_STYLE}
                  tickFormatter={(value: number) => `${value}%`}
                  label={{ value: "אחוז תפוסה", position: "insideBottom", offset: -12, style: AXIS_LABEL_STYLE }}
                />
                <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} tickMargin={14} tick={TICK_STYLE} width={90} />
                <Tooltip content={<RankTooltip />} wrapperStyle={TOOLTIP_Z} cursor={{ fill: "color-mix(in srgb, var(--muted) 45%, transparent)" }} />
                <Bar dataKey="rate" radius={[8, 8, 8, 8]} fill="var(--color-chart-1)" maxBarSize={24} isAnimationActive={false}>
                  <LabelList
                    dataKey="rate"
                    position="right"
                    offset={12}
                    formatter={(value) => `${value ?? 0}%`}
                    className="fill-foreground text-[12px] font-semibold"
                  />
                </Bar>
              </BarChart>
            ) : (
              <ChartPlaceholder className="h-full" />
            )}
        </ChartSurface>

        <div className="mt-4 space-y-2">
          {items.slice(0, 3).map((item, index) => (
            <div key={item.label} className="flex items-center justify-between rounded-xl border border-border/70 bg-muted/[0.18] px-3 py-2.5">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-background text-[11px] font-semibold text-muted-foreground">
                  {index + 1}
                </span>
                <div>
                  <div className="text-sm font-medium text-foreground">{item.label}</div>
                  <div className="text-[11px] text-muted-foreground">{item.occupied}/{item.total} מיטות תפוסות</div>
                </div>
              </div>
              <div className="text-sm font-semibold text-foreground">{item.rate}%</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function AssignmentGapCard({
  title,
  description,
  items,
  waitingTotal,
  ready,
}: {
  title: string;
  description: string;
  items: AssignmentGapItem[];
  waitingTotal: number;
  ready: boolean;
}) {
  const totalPeople = items.reduce((sum, item) => sum + item.total, 0);
  const assignedPeople = items.reduce((sum, item) => sum + item.assigned, 0);
  const leadingWaitingGroup = items.find((item) => item.waiting > 0) ?? items[0];
  const overallRate = totalPeople > 0 ? Math.round((assignedPeople / totalPeople) * 100) : 0;

  return (
    <Card className={CHART_CARD_CLASS}>
      <CardHeader className="border-b border-border/70 py-5">
        <div>
          <CardTitle className="flex items-center gap-2 text-[15px]">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/70 bg-muted/30 text-foreground">
              <IconClock size={15} />
            </span>
            {title}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>

      </CardHeader>

      <CardContent className="pt-5">
        <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <InlineMetric label="שובצו" value={assignedPeople} helper={totalPeople > 0 ? `${overallRate}% מכלל הרשומות` : "אין רשומות"} />
          <InlineMetric label="ממתינים לשיבוץ" value={waitingTotal} helper={waitingTotal > 0 ? "דורש טיפול תפעולי" : "אין עומס פתוח"} />
          <InlineMetric
            label="הקבוצה הדחופה ביותר"
            value={leadingWaitingGroup?.label ?? "—"}
            helper={leadingWaitingGroup ? `${leadingWaitingGroup.waiting} ממתינים כרגע` : "אין נתונים"}
          />
        </div>

        <ChartSurface className="h-[260px] min-w-0">
          {(size) => ready ? (
              <BarChart width={size.width} height={size.height} data={items} layout="vertical" margin={{ top: 4, right: 24, left: 24, bottom: 20 }} barCategoryGap={18}>
                <CartesianGrid horizontal={false} strokeDasharray="3 3" className={GRID_CLASS} />
                <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} tick={TICK_STYLE} label={{ value: "מספר אנשים", position: "insideBottom", offset: -12, style: AXIS_LABEL_STYLE }} />
                <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} tickMargin={14} tick={TICK_STYLE} width={96} />
                <Tooltip content={<AssignmentGapTooltip />} wrapperStyle={TOOLTIP_Z} cursor={{ fill: "color-mix(in srgb, var(--muted) 45%, transparent)" }} />
                <Bar dataKey="assigned" stackId="assignment-gap" fill="var(--color-chart-4)" radius={[0, 0, 0, 0]} maxBarSize={28} isAnimationActive={false} />
                <Bar dataKey="waiting" stackId="assignment-gap" fill="var(--color-chart-1)" radius={[8, 8, 8, 8]} maxBarSize={28} isAnimationActive={false} />
              </BarChart>
            ) : (
              <ChartPlaceholder className="h-full" />
            )}
        </ChartSurface>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {items.slice(0, 3).map((item) => (
            <div key={item.label} className="rounded-xl border border-border/70 bg-muted/[0.18] px-4 py-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="text-sm font-medium text-foreground">{item.label}</div>
                <div className="text-sm font-semibold text-foreground">{item.rate}%</div>
              </div>
              <div className="mb-2 h-2 overflow-hidden rounded-full bg-muted/70">
                <div className="h-full rounded-full bg-[var(--color-chart-1)]" style={{ width: `${Math.max(item.rate, item.total > 0 ? 6 : 0)}%` }} />
              </div>
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>{item.waiting} ממתינים</span>
                <span>{item.assigned}/{item.total} שובצו</span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function InlineMetric({ label, value, helper }: { label: string; value: string | number; helper: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-muted/[0.18] px-4 py-3">
      <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 text-[26px] font-semibold tracking-[-0.04em] text-foreground">{value}</div>
      <div className="mt-1 text-[11px] text-muted-foreground">{helper}</div>
    </div>
  );
}

function FooterHighlight({ label, title, detail }: { label: string; title: string; detail: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-muted/[0.16] px-4 py-3.5">
      <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-semibold text-foreground">{title}</div>
      <div className="mt-1 text-[11px] text-muted-foreground">{detail}</div>
    </div>
  );
}

function QuietPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 bg-muted/[0.18] px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground">
      <span>{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}

function SegmentedControl({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="inline-flex items-center rounded-lg border border-border/70 bg-muted/[0.22] p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            value === option.value
              ? "bg-background text-foreground shadow-[0_1px_2px_rgba(15,23,42,0.06)]"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function TooltipCard({
  label,
  lines,
}: {
  label?: string;
  lines: { label: string; value: string | number; color?: string }[];
}) {
  return (
    <div className="min-w-[180px] rounded-xl border border-border/70 bg-background/95 px-3 py-2.5 shadow-[0_10px_30px_-18px_rgba(15,23,42,0.35)] backdrop-blur">
      {label ? <div className="mb-2 text-center text-[12px] font-semibold text-foreground">{label}</div> : null}
      <div className="space-y-1.5">
        {lines.map((line) => (
          <div key={line.label} className="flex items-center justify-between gap-4 text-[11px]">
            <span className="font-semibold text-foreground">{line.value}</span>
            <div className="flex items-center gap-2 text-muted-foreground">
              <span>{line.label}</span>
              {line.color ? <LegendDot color={line.color} /> : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CapacityBedsTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
}) {
  const record = payload?.[0]?.payload as CapacityItem | undefined;
  if (!active || !record) return null;

  return (
    <TooltipCard
      label={label}
      lines={[
        { label: "מיטות תפוסות", value: record.occupied, color: "var(--color-chart-1)" },
        { label: "מיטות פנויות", value: record.available, color: "var(--color-chart-4)" },
        { label: "קיבולת כוללת", value: record.total },
        { label: "אחוז תפוסה", value: `${record.rate}%` },
      ]}
    />
  );
}

function CapacityRateTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
}) {
  const record = payload?.[0]?.payload as CapacityItem | undefined;
  if (!active || !record) return null;

  return (
    <TooltipCard
      label={label}
      lines={[
        { label: "אחוז תפוסה", value: `${record.rate}%`, color: "var(--color-chart-1)" },
        { label: "מיטות תפוסות", value: record.occupied },
        { label: "מיטות פנויות", value: record.available },
      ]}
    />
  );
}

function DistributionTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
}) {
  const record = payload?.[0]?.payload as (DistributionItem & { percentage?: number; fill?: string }) | undefined;
  if (!active || !record) return null;

  return (
    <TooltipCard
      label={record.label}
      lines={[
        { label: "משובצים", value: record.value, color: record.fill },
        { label: "חלק יחסי", value: `${record.percentage ?? 0}%` },
      ]}
    />
  );
}

function RoomStatusTooltip({
  active,
  payload,
  total,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  total: number;
}) {
  const record = payload?.[0]?.payload as { label: string; value: number; fill: string } | undefined;
  if (!active || !record) return null;

  const percentage = total > 0 ? Math.round((record.value / total) * 100) : 0;

  return (
    <TooltipCard
      label={record.label}
      lines={[
        { label: "מספר חדרים", value: record.value, color: record.fill },
        { label: "שיעור מהמערכת", value: `${percentage}%` },
      ]}
    />
  );
}

function RankTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
}) {
  const record = payload?.[0]?.payload as RankItem | undefined;
  if (!active || !record) return null;

  return (
    <TooltipCard
      label={record.label}
      lines={[
        { label: "אחוז תפוסה", value: `${record.rate}%`, color: "var(--color-chart-1)" },
        { label: "מיטות תפוסות", value: record.occupied },
        { label: "קיבולת כוללת", value: record.total },
      ]}
    />
  );
}

function AssignmentGapTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
}) {
  const record = payload?.[0]?.payload as AssignmentGapItem | undefined;
  if (!active || !record) return null;

  return (
    <TooltipCard
      label={record.label}
      lines={[
        { label: "שובצו", value: record.assigned, color: "var(--color-chart-4)" },
        { label: "ממתינים", value: record.waiting, color: "var(--color-chart-1)" },
        { label: "סה״כ אנשים", value: record.total },
        { label: "שיעור שיבוץ", value: `${record.rate}%` },
      ]}
    />
  );
}

function LegendDot({ color }: { color: string }) {
  return <span className="inline-flex h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />;
}

function ChartPlaceholder({ className }: { className?: string }) {
  return <div className={cn("skeleton h-full w-full rounded-2xl", className)} />;
}

function ChartSurface({
  className,
  children,
}: {
  className?: string;
  children: (size: ChartSize) => React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<ChartSize>({ width: 0, height: 0 });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const update = () => {
      const nextWidth = Math.floor(element.clientWidth);
      const nextHeight = Math.floor(element.clientHeight);
      setSize((current) =>
        current.width === nextWidth && current.height === nextHeight
          ? current
          : { width: nextWidth, height: nextHeight },
      );
    };

    update();

    const observer = new ResizeObserver(() => {
      update();
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={cn("min-w-0", className)} style={{ direction: "ltr" }}>
      {size.width > 0 && size.height > 0 ? children(size) : <ChartPlaceholder className="h-full" />}
    </div>
  );
}

function getChartTone(index: number) {
  const palette = [
    "var(--color-chart-1)",
    "var(--color-chart-2)",
    "var(--color-chart-3)",
    "var(--color-chart-4)",
    "var(--color-chart-5)",
  ];

  return palette[index % palette.length];
}
