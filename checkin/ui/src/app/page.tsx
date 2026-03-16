"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const API = "/api";

/* ── Types ── */
interface Personnel { id: string; name: string; rank: string; service_type: string; arena: string; branch: string; base: string; }
interface RoutineEntry { person_id: string; date: string; entry_time: string; exit_time: string; on_shift: number; }
interface PersonRecord { personnel: Personnel; current: RoutineEntry[]; future: RoutineEntry[]; dates: string[]; }
interface Config { ranks?: string[]; service_types?: string[]; arenas?: string[]; branches?: string[]; bases?: string[]; day_names?: string[]; }

const fmtDate = (d: string) => { const p = d.split("-"); return `${+p[2]}/${+p[1]}`; };

function dayLabel(date: string, idx: number, cfg: Config) {
  const names = cfg.day_names || [];
  return idx < names.length ? names[idx] : `יום +${idx}`;
}

/* ── API helpers ── */
async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(API + url, { headers: { "Content-Type": "application/json" }, ...opts });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/* ── Style constants ── */
const S = {
  truncate: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as React.CSSProperties,
  mono: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' } as React.CSSProperties,
};

/* ── Time input with validation ── */
function TimeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    let v = e.target.value.replace(/[^\d:]/g, "");
    const digits = v.replace(/:/g, "");
    if (digits.length >= 3 && !v.includes(":")) v = digits.slice(0, 2) + ":" + digits.slice(2);
    if (v.length > 5) v = v.slice(0, 5);
    const match = v.match(/^(\d{1,2}):?(\d{0,2})$/);
    if (match) {
      let h = match[1], m = match[2];
      if (h.length === 2 && +h > 23) h = "23";
      if (m.length === 2 && +m > 59) m = "59";
      v = m !== undefined && v.includes(":") ? h + ":" + m : h;
    }
    onChange(v);
  }
  const complete = /^\d{2}:\d{2}$/.test(value);
  const borderStyle: React.CSSProperties = value === ""
    ? { borderColor: 'var(--input)' }
    : complete
      ? { borderColor: '#6ee7b7', backgroundColor: '#ecfdf5' }
      : { borderColor: '#fbbf24', backgroundColor: '#fffbeb' };

  return (
    <input
      value={value}
      onChange={handleInput}
      placeholder="—"
      style={{ width: '64px', textAlign: 'center', borderRadius: '6px', border: '1px solid', padding: '4px', fontSize: '12px', lineHeight: '16px', transition: 'color 150ms, background-color 150ms, border-color 150ms', outline: 'none', ...borderStyle }}
    />
  );
}

/* ── Page ── */
export default function CheckinPage() {
  const [cfg, setCfg] = useState<Config>({});
  const [records, setRecords] = useState<PersonRecord[]>([]);
  const [dates, setDates] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [arena, setArena] = useState("הכל");
  const [statusFilter, setStatusFilter] = useState("הכל");
  const [activeOnly, setActiveOnly] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editOpen, setEditOpen] = useState(false);
  const [editIds, setEditIds] = useState<string[]>([]);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [cfgRes, dataRes] = await Promise.all([
        apiFetch<Config>("/config"),
        apiFetch<{ records: PersonRecord[]; dates: string[] }>("/data"),
      ]);
      setCfg(cfgRes);
      setRecords(dataRes.records);
      setDates(dataRes.dates);
    } catch { }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const arenaOptions = useMemo(() => ["הכל", ...new Set(records.map((r) => r.personnel.arena))], [records]);
  const serviceOptions = useMemo(() => ["הכל", ...(cfg.service_types || [])], [cfg]);

  const filtered = useMemo(() => {
    let list = records;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((r) => r.personnel.name.toLowerCase().includes(q) || r.personnel.id.includes(q));
    }
    if (arena !== "הכל") list = list.filter((r) => r.personnel.arena === arena);
    if (statusFilter !== "הכל") list = list.filter((r) => r.personnel.service_type === statusFilter);
    if (activeOnly) list = list.filter((r) => r.current[0]?.on_shift);
    if (dateFrom || dateTo) {
      list = list.filter((r) => r.future.some((f) => {
        if (dateFrom && f.date < dateFrom) return false;
        if (dateTo && f.date > dateTo) return false;
        return f.entry_time !== "";
      }));
    }
    return list;
  }, [records, search, arena, statusFilter, activeOnly, dateFrom, dateTo]);

  const allSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.personnel.id));
  const hasFilters = activeOnly || arena !== "הכל" || statusFilter !== "הכל" || dateFrom || dateTo || search;

  function toggleSelect(id: string) {
    setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(filtered.map((r) => r.personnel.id)));
  }
  function clearFilters() { setActiveOnly(false); setArena("הכל"); setStatusFilter("הכל"); setDateFrom(""); setDateTo(""); setSearch(""); }

  function handleDownload() {
    const XLSX = require("xlsx");
    const futH = dates.flatMap((d, i) => [`${dayLabel(d, i, cfg)} (${fmtDate(d)}) כניסה`, `${dayLabel(d, i, cfg)} (${fmtDate(d)}) יציאה`]);
    const headers = ["מ.א.", "שם מלא", "דרגה", "סוג שירות", "זירת אם", "ענף", "בסיס", `היום (${dates.length > 0 ? fmtDate(dates[0]) : ""}) כניסה`, `היום (${dates.length > 0 ? fmtDate(dates[0]) : ""}) יציאה`, ...futH];
    const rows = filtered.map((r) => [
      r.personnel.id, r.personnel.name, r.personnel.rank, r.personnel.service_type, r.personnel.arena, r.personnel.branch, r.personnel.base,
      r.current[0]?.entry_time || "", r.current[0]?.exit_time || "",
      ...dates.flatMap((_, i) => [r.future[i]?.entry_time || "", r.future[i]?.exit_time || ""]),
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "קמבצ");
    const today = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `דוח_קמבצ_משמרות_${today}.xlsx`);
  }

  function downloadTemplate() {
    const XLSX = require("xlsx");
    const headers = ["מ.א.", ...dates];
    const sampleIds = records.slice(0, 3).map((r) => r.personnel.id);
    const rows = sampleIds.map((id) => [id, ...dates.map(() => "07:00-17:00")]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws["!cols"] = headers.map(() => ({ wch: 14 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "תבנית");
    const today = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `תבנית_העלאת_משמרות_${today}.xlsx`);
  }

  async function handleUpload(file: File) {
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(API + "/upload-future", { method: "POST", body: form });
      if (!res.ok) throw new Error(await res.text());
      const result = await res.json();
      setUploadOpen(false);
      await loadData();
    } catch {}
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: 'var(--muted-foreground)' }}>טוען...</div>
  );

  return (
    <div style={{ padding: '16px' }}>
      <Card style={{ overflow: 'hidden', gap: 0 }}>
        {/* Toolbar Row 1 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid var(--border)', padding: '12px 16px' }}>
          <h1 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--foreground)', flexShrink: 0 }}>תצוגת קמב&quot;צ</h1>
          <div style={{ position: 'relative', flex: '1 1 0%', maxWidth: '20rem' }}>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="חיפוש לפי שם או מ.א."
              style={{ height: '32px', fontSize: '12px', paddingRight: '12px' }}
            />
          </div>
          <div style={{ marginRight: 'auto' }} />
          {selected.size > 0 && (
            <>
              <Badge variant="secondary" style={{ fontSize: '11px' }}>{selected.size} נבחרו</Badge>
              <Button variant="ghost" size="sm" style={{ fontSize: '11px' }} onClick={() => { setEditIds([...selected]); setEditOpen(true); }}>עריכה</Button>
            </>
          )}
          <span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>{filtered.length} רשומות</span>
          <div style={{ height: '16px', width: '1px', backgroundColor: 'var(--border)' }} />
          <Button variant="ghost" size="icon-sm" onClick={() => setUploadOpen(true)} title="העלאת משמרת עתידית">
            <svg style={{ height: '16px', width: '16px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={handleDownload} title="הורדה לאקסל">
            <svg style={{ height: '16px', width: '16px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
          </Button>
        </div>

        {/* Toolbar Row 2: Filter chips */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--border)', padding: '8px 16px', backgroundColor: 'color-mix(in srgb, var(--muted) 30%, transparent)' }}>
          <button
            onClick={() => setActiveOnly(!activeOnly)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px', borderRadius: '9999px', padding: '4px 12px', fontSize: '11px', fontWeight: 500, transition: 'all 150ms', cursor: 'pointer',
              border: activeOnly ? '1px solid #6ee7b7' : '1px solid var(--border)',
              backgroundColor: activeOnly ? '#ecfdf5' : 'var(--background)',
              color: activeOnly ? '#047857' : 'var(--muted-foreground)',
            }}
          >
            <span style={{ display: 'inline-block', height: '6px', width: '6px', borderRadius: '9999px', backgroundColor: activeOnly ? '#10b981' : 'color-mix(in srgb, var(--muted-foreground) 40%, transparent)' }} />
            משמרת פעילות
          </button>
          <FilterChip label="זירה" value={arena} options={arenaOptions} onChange={setArena} activeColor="blue" />
          <FilterChip label="שירות" value={statusFilter} options={serviceOptions} onChange={setStatusFilter} activeColor="purple" />
          <button
            onClick={() => setFilterOpen(true)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px', borderRadius: '9999px', padding: '4px 12px', fontSize: '11px', fontWeight: 500, cursor: 'pointer', transition: 'all 150ms',
              ...(dateFrom || dateTo
                ? { border: '1px solid #fdba74', backgroundColor: '#fff7ed', color: '#c2410c' }
                : { border: '1px solid var(--border)', backgroundColor: 'var(--background)', color: 'var(--muted-foreground)' }),
            }}
          >
            <svg style={{ height: '10px', width: '10px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
            {dateFrom || dateTo ? `${dateFrom ? fmtDate(dateFrom) : '...'} – ${dateTo ? fmtDate(dateTo) : '...'}` : 'תאריכים'}
          </button>
          {hasFilters && <button onClick={clearFilters} style={{ borderRadius: '9999px', padding: '4px 10px', fontSize: '11px', fontWeight: 500, color: 'var(--destructive)', backgroundColor: 'transparent', border: 'none', cursor: 'pointer' }}>נקה הכל</button>}
        </div>

        {/* Table */}
        <div style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 180px)' }}>
          <table style={{ width: '100%', tableLayout: 'fixed', fontSize: '11px', borderCollapse: 'collapse' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
              <tr style={{ backgroundColor: '#1e293b', color: 'white', fontSize: '10px' }}>
                <th colSpan={9} style={{ padding: '4px 0', textAlign: 'center', fontWeight: 600, borderLeft: '1px solid #475569' }}>פרטים אישיים</th>
                <th colSpan={1} style={{ padding: '4px 0', textAlign: 'center', fontWeight: 600, backgroundColor: '#1e40af', borderLeft: '1px solid #2563eb' }}>נוכחית</th>
                <th colSpan={dates.length} style={{ padding: '4px 0', textAlign: 'center', fontWeight: 600, backgroundColor: '#115e59' }}>משמרת עתידית</th>
              </tr>
              <tr style={{ backgroundColor: '#334155', color: 'white', fontSize: '10px' }}>
                <th style={{ width: '30px', padding: '6px 0', textAlign: 'center' }}>
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} style={{ height: '12px', width: '12px', cursor: 'pointer' }} />
                </th>
                <th style={{ width: '60px', padding: '6px 4px', textAlign: 'right', fontWeight: 600 }}>מ.א.</th>
                <th style={{ padding: '6px 4px', textAlign: 'right', fontWeight: 600 }}>שם מלא</th>
                <th style={{ width: '50px', padding: '6px 4px', textAlign: 'right', fontWeight: 600 }}>דרגה</th>
                <th style={{ width: '45px', padding: '6px 4px', textAlign: 'right', fontWeight: 600 }}>שירות</th>
                <th style={{ width: '42px', padding: '6px 4px', textAlign: 'right', fontWeight: 600 }}>זירה</th>
                <th style={{ width: '50px', padding: '6px 4px', textAlign: 'right', fontWeight: 600 }}>ענף</th>
                <th style={{ width: '48px', padding: '6px 4px', textAlign: 'right', fontWeight: 600 }}>בסיס</th>
                <th style={{ width: '28px', padding: '6px 0', textAlign: 'center', fontWeight: 600, borderLeft: '1px solid #64748b' }} title="במשמרת">
                  <svg style={{ display: 'inline', height: '12px', width: '12px', opacity: 0.8 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
                </th>
                <th style={{ padding: '4px 0', textAlign: 'center', fontWeight: 600, backgroundColor: '#1d4ed8', borderLeft: '1px solid #3b82f6' }}>
                  <div style={{ fontSize: '10px' }}>היום</div>
                  <div style={{ fontSize: '8px', opacity: 0.7 }}>{dates.length > 0 ? fmtDate(dates[0]) : ""}</div>
                </th>
                {dates.map((d, i) => (
                  <th key={d} style={{ padding: '4px 0', textAlign: 'center', fontWeight: 600, backgroundColor: '#0f766e', borderLeft: '1px solid #14b8a6' }}>
                    <div style={{ fontSize: '10px' }}>{dayLabel(d, i, cfg)}</div>
                    <div style={{ fontSize: '8px', opacity: 0.7 }}>{fmtDate(d)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={10 + dates.length} style={{ padding: '48px 16px', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '14px' }}>אין רשומות להצגה</td></tr>
              ) : filtered.map((r, idx) => {
                const sel = selected.has(r.personnel.id);
                const c0 = r.current[0] || {} as RoutineEntry;
                const f0 = r.future[0] || {} as RoutineEntry;
                const cText = c0.entry_time ? `${c0.entry_time}-${c0.exit_time}` : "—";
                const cMiss = !c0.entry_time;
                const todayConflict = c0.entry_time !== f0.entry_time || c0.exit_time !== f0.exit_time;
                const rowBg = sel ? '#eff6ff' : idx % 2 !== 0 ? 'color-mix(in srgb, var(--muted) 20%, transparent)' : undefined;
                return (
                  <tr
                    key={r.personnel.id}
                    data-slot="checkin-row"
                    style={{ borderBottom: '1px solid color-mix(in srgb, var(--border) 40%, transparent)', transition: 'background-color 150ms', backgroundColor: rowBg }}
                  >
                    <td style={{ padding: '4px', textAlign: 'center' }}><input type="checkbox" checked={sel} onChange={() => toggleSelect(r.personnel.id)} style={{ height: '12px', width: '12px', cursor: 'pointer' }} /></td>
                    <td style={{ padding: '4px', fontSize: '10px', color: 'var(--muted-foreground)', ...S.mono, ...S.truncate }}>{r.personnel.id}</td>
                    <td style={{ padding: '4px', fontWeight: 500, color: 'var(--foreground)', ...S.truncate }}>{r.personnel.name}</td>
                    <td style={{ padding: '4px', color: 'var(--muted-foreground)', ...S.truncate }}>{r.personnel.rank}</td>
                    <td style={{ padding: '4px', color: 'var(--muted-foreground)', ...S.truncate }}>{r.personnel.service_type}</td>
                    <td style={{ padding: '4px', color: 'var(--muted-foreground)', ...S.truncate }}>{r.personnel.arena}</td>
                    <td style={{ padding: '4px', color: 'var(--muted-foreground)', ...S.truncate }}>{r.personnel.branch}</td>
                    <td style={{ padding: '4px', color: 'var(--muted-foreground)', ...S.truncate }}>{r.personnel.base}</td>
                    <td style={{ padding: '4px', textAlign: 'center', borderLeft: '1px solid color-mix(in srgb, var(--border) 40%, transparent)' }}>
                      <span style={{ display: 'inline-block', height: '10px', width: '10px', borderRadius: '9999px', backgroundColor: c0.on_shift ? '#10b981' : 'color-mix(in srgb, var(--muted-foreground) 30%, transparent)' }} />
                    </td>
                    <td style={{
                      padding: '4px', textAlign: 'center', borderLeft: '1px solid rgba(147,197,253,0.5)',
                      ...(cMiss ? { backgroundColor: 'color-mix(in srgb, var(--destructive) 5%, transparent)', color: 'color-mix(in srgb, var(--destructive) 60%, transparent)' }
                        : todayConflict ? { backgroundColor: 'color-mix(in srgb, var(--destructive) 5%, transparent)' }
                        : { color: 'var(--muted-foreground)' }),
                    }}>
                      <span style={todayConflict && !cMiss ? { color: 'var(--destructive)', fontWeight: 600 } : undefined}>{cMiss ? "—" : cText}</span>
                    </td>
                    {dates.map((_, i) => {
                      const c = r.current[i] || {} as RoutineEntry;
                      const f2 = r.future[i] || {} as RoutineEntry;
                      const fText = f2.entry_time ? `${f2.entry_time}-${f2.exit_time}` : "—";
                      const fMiss = !f2.entry_time;
                      const conflict = c.entry_time !== f2.entry_time || c.exit_time !== f2.exit_time;
                      return (
                        <td key={i} style={{
                          padding: '4px', textAlign: 'center', borderLeft: '1px solid rgba(94,234,212,0.3)',
                          ...(fMiss ? { backgroundColor: 'color-mix(in srgb, var(--destructive) 5%, transparent)', color: 'color-mix(in srgb, var(--destructive) 60%, transparent)' }
                            : conflict ? { backgroundColor: 'color-mix(in srgb, var(--destructive) 5%, transparent)' }
                            : { color: 'var(--muted-foreground)' }),
                        }}>
                          <span style={conflict && !fMiss ? { color: 'var(--destructive)', fontWeight: 600 } : undefined}>{fMiss ? "—" : fText}</span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Filter Modal */}
      <FilterModal open={filterOpen} onClose={() => setFilterOpen(false)} dateFrom={dateFrom} dateTo={dateTo} onApply={(df, dt) => { setDateFrom(df); setDateTo(dt); setFilterOpen(false); }} />

      {/* Upload Modal */}
      <UploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} onUpload={handleUpload} onDownloadTemplate={downloadTemplate} dates={dates} records={records} />

      {/* Edit Modal */}
      <EditModal open={editOpen} onClose={() => setEditOpen(false)} editIds={editIds} records={records} dates={dates} cfg={cfg} onSave={loadData} />
    </div>
  );
}

/* ── Hebrew Calendar helpers ── */
const HEB_MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
const HEB_DAYS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

function pad2(n: number) { return n < 10 ? `0${n}` : `${n}`; }
function toISO(y: number, m: number, d: number) { return `${y}-${pad2(m + 1)}-${pad2(d)}`; }

/* ── Filter Modal ── */
function FilterModal({ open, onClose, dateFrom, dateTo, onApply }: {
  open: boolean; onClose: () => void; dateFrom: string; dateTo: string;
  onApply: (df: string, dt: string) => void;
}) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [rangeStart, setRangeStart] = useState(dateFrom);
  const [rangeEnd, setRangeEnd] = useState(dateTo);
  const [picking, setPicking] = useState<"start" | "end">("start");

  useEffect(() => {
    if (open) {
      setRangeStart(dateFrom);
      setRangeEnd(dateTo);
      setPicking("start");
      if (dateFrom) {
        const d = new Date(dateFrom);
        setViewYear(d.getFullYear());
        setViewMonth(d.getMonth());
      } else {
        setViewYear(today.getFullYear());
        setViewMonth(today.getMonth());
      }
    }
  }, [open, dateFrom, dateTo]);

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); }
    else setViewMonth(viewMonth - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); }
    else setViewMonth(viewMonth + 1);
  }
  function prevYear() { setViewYear(viewYear - 1); }
  function nextYear() { setViewYear(viewYear + 1); }

  function handleDayClick(iso: string) {
    if (picking === "start") {
      setRangeStart(iso);
      setRangeEnd("");
      setPicking("end");
    } else {
      if (iso < rangeStart) {
        setRangeStart(iso);
        setRangeEnd("");
        setPicking("end");
      } else {
        setRangeEnd(iso);
        setPicking("start");
      }
    }
  }

  // Build calendar grid
  const firstDay = new Date(viewYear, viewMonth, 1);
  const startDow = firstDay.getDay(); // 0=Sun
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const todayISO = toISO(today.getFullYear(), today.getMonth(), today.getDate());
  const rs = rangeStart || "";
  const re = rangeEnd || "";

  const rangeLabel = rs && re
    ? `${fmtDate(rs)} – ${fmtDate(re)}`
    : rs
      ? `${fmtDate(rs)} – בחר תאריך סיום`
      : "בחר טווח תאריכים";

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent style={{ maxWidth: '24rem', padding: 0, gap: 0 }}>
        <DialogHeader style={{ background: 'linear-gradient(to left, #334155, #1e293b)', padding: '16px 24px', color: 'white', borderTopLeftRadius: '8px', borderTopRightRadius: '8px' }}>
          <DialogTitle style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'white' }}>
            <svg style={{ height: '20px', width: '20px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
            <div><div style={{ fontSize: '16px', fontWeight: 700 }}>סינון לפי תאריכים</div></div>
          </DialogTitle>
        </DialogHeader>

        <div style={{ padding: '16px 20px' }}>
          {/* Range display */}
          <div style={{ textAlign: 'center', padding: '8px', marginBottom: '12px', borderRadius: '8px', backgroundColor: rs ? '#eff6ff' : 'var(--secondary)', fontSize: '13px', fontWeight: 500, color: rs ? '#1d4ed8' : 'var(--muted-foreground)' }}>
            {rangeLabel}
          </div>

          {/* Year navigation */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginBottom: '4px' }}>
            <button onClick={nextYear} style={{ backgroundColor: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--muted-foreground)', fontSize: '12px' }}>«</button>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--foreground)', minWidth: '40px', textAlign: 'center' }}>{viewYear}</span>
            <button onClick={prevYear} style={{ backgroundColor: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--muted-foreground)', fontSize: '12px' }}>»</button>
          </div>

          {/* Month navigation */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <button onClick={prevMonth} style={{ backgroundColor: 'transparent', border: 'none', cursor: 'pointer', padding: '6px', color: 'var(--muted-foreground)' }}>
              <svg style={{ height: '16px', width: '16px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M9 18l6-6-6-6" /></svg>
            </button>
            <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--foreground)' }}>{HEB_MONTHS[viewMonth]}</span>
            <button onClick={nextMonth} style={{ backgroundColor: 'transparent', border: 'none', cursor: 'pointer', padding: '6px', color: 'var(--muted-foreground)' }}>
              <svg style={{ height: '16px', width: '16px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M15 18l-6-6 6-6" /></svg>
            </button>
          </div>

          {/* Day headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', marginBottom: '4px' }}>
            {HEB_DAYS.map((d) => (
              <div key={d} style={{ textAlign: 'center', fontSize: '11px', fontWeight: 600, color: 'var(--muted-foreground)', padding: '4px 0' }}>{d}</div>
            ))}
          </div>

          {/* Day cells */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
            {cells.map((day, i) => {
              if (day === null) return <div key={i} />;
              const iso = toISO(viewYear, viewMonth, day);
              const isToday = iso === todayISO;
              const isStart = iso === rs;
              const isEnd = iso === re;
              const inRange = rs && re && iso >= rs && iso <= re;
              const isEdge = isStart || isEnd;

              let bg = 'transparent';
              let color = 'var(--foreground)';
              let fontWeight = 400;
              let borderRadius = '6px';

              if (isEdge) {
                bg = '#1d4ed8';
                color = 'white';
                fontWeight = 700;
              } else if (inRange) {
                bg = '#dbeafe';
                color = '#1e40af';
                fontWeight = 500;
                borderRadius = '0';
              }

              if (isStart && re) borderRadius = '0 6px 6px 0';
              if (isEnd) borderRadius = '6px 0 0 6px';
              if (isStart && !re) borderRadius = '6px';
              if (isStart && isEnd) borderRadius = '6px';

              return (
                <button
                  key={i}
                  onClick={() => handleDayClick(iso)}
                  style={{
                    width: '100%',
                    aspectRatio: '1',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '13px',
                    fontWeight,
                    backgroundColor: bg,
                    color,
                    border: isToday && !isEdge ? '2px solid #3b82f6' : 'none',
                    borderRadius,
                    cursor: 'pointer',
                    transition: 'background-color 100ms',
                  }}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>

        <DialogFooter style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border)', padding: '12px 20px' }}>
          {(rangeStart || rangeEnd) ? (
            <button onClick={() => { setRangeStart(""); setRangeEnd(""); onApply("", ""); }} style={{ fontSize: '12px', color: 'var(--destructive)', backgroundColor: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 500 }}>נקה סינון</button>
          ) : <span />}
          <Button onClick={() => onApply(rangeStart, rangeEnd)} disabled={!!(rangeStart && !rangeEnd)}>החל סינון</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Filter Chip ── */
function FilterChip({ label, value, options, onChange, activeColor }: { label: string; value: string; options: string[]; onChange: (v: string) => void; activeColor: string }) {
  const active = value !== "הכל";
  const colorMap: Record<string, React.CSSProperties> = {
    blue: { borderColor: '#93c5fd', backgroundColor: '#eff6ff', color: '#1d4ed8' },
    purple: { borderColor: '#d8b4fe', backgroundColor: '#faf5ff', color: '#7e22ce' },
  };
  const activeStyle: React.CSSProperties = active ? (colorMap[activeColor] || {}) : {};
  const inactiveStyle: React.CSSProperties = !active ? { borderColor: 'var(--border)', backgroundColor: 'var(--background)', color: 'var(--muted-foreground)' } : {};
  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          WebkitAppearance: 'none',
          appearance: 'none',
          cursor: 'pointer',
          borderRadius: '9999px',
          border: '1px solid',
          padding: '4px 12px 4px 24px',
          fontSize: '11px',
          fontWeight: 500,
          transition: 'all 150ms',
          outline: 'none',
          ...inactiveStyle,
          ...activeStyle,
        }}
      >
        {options.map((o) => <option key={o} value={o}>{o === "הכל" ? `${label}: הכל` : `${label}: ${o}`}</option>)}
      </select>
      <svg style={{ pointerEvents: 'none', position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', height: '12px', width: '12px', color: 'var(--muted-foreground)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="m19 9-7 7-7-7" /></svg>
    </div>
  );
}

/* ── Upload Modal ── */
function UploadModal({ open, onClose, onUpload, onDownloadTemplate, dates, records }: {
  open: boolean; onClose: () => void; onUpload: (f: File) => void; onDownloadTemplate: () => void; dates: string[]; records: PersonRecord[];
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent style={{ maxWidth: '32rem', padding: 0, gap: 0 }}>
        <DialogHeader style={{ background: 'linear-gradient(to left, #334155, #1e293b)', padding: '20px 24px', color: 'white', borderTopLeftRadius: '8px', borderTopRightRadius: '8px' }}>
          <DialogTitle style={{ display: 'flex', alignItems: 'center', gap: '16px', color: 'white' }}>
            <div style={{ display: 'flex', height: '48px', width: '48px', alignItems: 'center', justifyContent: 'center', borderRadius: '9999px', backgroundColor: 'rgba(255,255,255,0.2)' }}>
              <svg style={{ height: '24px', width: '24px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
            </div>
            <div><div style={{ fontSize: '18px', fontWeight: 700 }}>העלאת משמרת עתידית</div><p style={{ fontSize: '14px', opacity: 0.7, fontWeight: 400 }}>העלה קובץ אקסל עם נתוני משמרות עתידיות</p></div>
          </DialogTitle>
        </DialogHeader>
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <h3 style={{ fontSize: '12px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.025em', marginBottom: '8px' }}>תבנית קובץ לדוגמה</h3>
            <Card style={{ overflow: 'hidden', padding: 0 }}>
              <Table style={{ fontSize: '12px' }}>
                <TableHeader>
                  <TableRow style={{ backgroundColor: 'color-mix(in srgb, var(--muted) 50%, transparent)' }}>
                    <TableHead style={{ textAlign: 'right', padding: '8px 12px', fontSize: '11px' }}>מ.א.</TableHead>
                    {dates.slice(0, 4).map((d) => <TableHead key={d} style={{ textAlign: 'center', padding: '8px 12px', fontSize: '11px' }}>{fmtDate(d)}</TableHead>)}
                    {dates.length > 4 && <TableHead style={{ textAlign: 'center', padding: '8px 12px', fontSize: '11px', color: 'var(--muted-foreground)' }}>...</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[0, 1].map((i) => (
                    <TableRow key={i}>
                      <TableCell style={{ padding: '6px 12px', ...S.mono, color: 'var(--muted-foreground)' }}>{records[i]?.personnel.id || `10000${i}`}</TableCell>
                      {dates.slice(0, 4).map((d) => <TableCell key={d} style={{ padding: '6px 12px', textAlign: 'center', color: 'var(--muted-foreground)' }}>{i === 0 ? "07:00-17:00" : "08:30-19:00"}</TableCell>)}
                      {dates.length > 4 && <TableCell style={{ padding: '6px 12px', textAlign: 'center', color: 'var(--muted-foreground)' }}>...</TableCell>}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
            <p style={{ marginTop: '8px', fontSize: '10px', color: 'var(--muted-foreground)' }}>עמודת מ.א. + עמודה לכל תאריך (DD/MM). בכל תא יש להזין שעת כניסה ויציאה (לדוגמה: 07:00-17:00). תאים ריקים יידלגו.</p>
          </div>
          <label
            data-slot="drop-zone"
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRadius: '12px', border: '2px dashed var(--border)', backgroundColor: 'color-mix(in srgb, var(--muted) 30%, transparent)', padding: '32px 0', cursor: 'pointer', transition: 'border-color 150ms, background-color 150ms', position: 'relative' }}
          >
            <svg style={{ height: '32px', width: '32px', color: 'var(--muted-foreground)', marginBottom: '8px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
            <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--foreground)' }}>לחץ לבחירת קובץ או גרור לכאן</span>
            <span style={{ fontSize: '12px', color: 'var(--muted-foreground)', marginTop: '4px' }}>Excel (.xlsx, .xls) או CSV</span>
            <input type="file" accept=".xlsx,.xls,.csv" style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} onChange={(e) => { if (e.target.files?.[0]) onUpload(e.target.files[0]); }} />
          </label>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── Edit Modal ── */
function EditModal({ open, onClose, editIds, records, dates, cfg, onSave }: {
  open: boolean; onClose: () => void; editIds: string[]; records: PersonRecord[]; dates: string[]; cfg: Config; onSave: () => Promise<void>;
}) {
  const isBulk = editIds.length > 1;
  const rec = !isBulk ? records.find((r) => r.personnel.id === editIds[0]) : null;
  const [saving, setSaving] = useState(false);

  const [curEntries, setCurEntries] = useState<{ e: string; x: string }[]>([]);
  const [futEntries, setFutEntries] = useState<{ e: string; x: string }[]>([]);

  useEffect(() => {
    if (!open) return;
    if (rec) {
      setCurEntries([{ e: rec.current[0]?.entry_time || "", x: rec.current[0]?.exit_time || "" }]);
      setFutEntries(dates.map((_, i) => ({ e: rec.future[i]?.entry_time || "", x: rec.future[i]?.exit_time || "" })));
    } else {
      setCurEntries([{ e: "", x: "" }]);
      setFutEntries(dates.map(() => ({ e: "", x: "" })));
    }
  }, [open, rec, dates]);

  async function handleSave() {
    setSaving(true);
    try {
      if (isBulk) {
        if (curEntries[0]?.e || curEntries[0]?.x) {
          await apiFetch("/routine/current/bulk", { method: "POST", body: JSON.stringify({ person_ids: editIds, entries: [{ person_id: "", date: dates[0], entry_time: curEntries[0].e, exit_time: curEntries[0].x, on_shift: curEntries[0].e ? 1 : 0 }] }) });
        }
        const futE = futEntries.filter((f, i) => f.e || f.x).map((f, i) => ({ person_id: "", date: dates[i], entry_time: f.e, exit_time: f.x, on_shift: f.e ? 1 : 0 }));
        if (futE.length) await apiFetch("/routine/future/bulk", { method: "POST", body: JSON.stringify({ person_ids: editIds, entries: futE }) });
      } else if (rec) {
        await apiFetch(`/routine/current/${rec.personnel.id}/${dates[0]}`, { method: "PUT", body: JSON.stringify({ person_id: rec.personnel.id, date: dates[0], entry_time: curEntries[0].e, exit_time: curEntries[0].x, on_shift: curEntries[0].e ? 1 : 0 }) });
        for (let i = 0; i < dates.length; i++) {
          await apiFetch(`/routine/future/${rec.personnel.id}/${dates[i]}`, { method: "PUT", body: JSON.stringify({ person_id: rec.personnel.id, date: dates[i], entry_time: futEntries[i].e, exit_time: futEntries[i].x, on_shift: futEntries[i].e ? 1 : 0 }) });
        }
      }
      await onSave();
      onClose();
    } catch {}
    setSaving(false);
  }

  const names = editIds.slice(0, 5).map((id) => records.find((r) => r.personnel.id === id)?.personnel.name || id);
  const more = editIds.length > 5 ? editIds.length - 5 : 0;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent style={{ maxWidth: '42rem', maxHeight: '85vh', display: 'flex', flexDirection: 'column', padding: 0, gap: 0 }}>
        <DialogHeader style={{ background: 'linear-gradient(to left, #334155, #1e293b)', padding: '20px 24px', color: 'white', borderTopLeftRadius: '8px', borderTopRightRadius: '8px' }}>
          <DialogTitle style={{ display: 'flex', alignItems: 'center', gap: '16px', color: 'white' }}>
            <div style={{ display: 'flex', height: '48px', width: '48px', alignItems: 'center', justifyContent: 'center', borderRadius: '9999px', backgroundColor: 'rgba(255,255,255,0.2)', fontSize: '18px', fontWeight: 700 }}>
              {isBulk ? (
                <svg style={{ height: '24px', width: '24px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>
              ) : rec?.personnel.name.charAt(0)}
            </div>
            <div>
              <div style={{ fontSize: '18px', fontWeight: 700 }}>{isBulk ? "עריכה קבוצתית" : rec?.personnel.name}</div>
              <p style={{ fontSize: '14px', opacity: 0.7, fontWeight: 400 }}>{isBulk ? `${editIds.length} רשומות נבחרו` : `מ.א. ${rec?.personnel.id}`}</p>
            </div>
          </DialogTitle>
        </DialogHeader>

        {isBulk && (
          <div style={{ borderBottom: '1px solid var(--border)', padding: '12px 24px', backgroundColor: 'color-mix(in srgb, var(--muted) 50%, transparent)' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {names.map((n) => <Badge key={n} variant="secondary" style={{ fontSize: '11px' }}>{n}</Badge>)}
              {more > 0 && <Badge variant="outline" style={{ fontSize: '11px' }}>+{more} נוספים</Badge>}
            </div>
          </div>
        )}

        <div style={{ flex: '1 1 0%', overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {isBulk && <p style={{ fontSize: '12px', color: 'var(--muted-foreground)' }}>שעות שימולאו יוחלו על כל הרשומות. שדות ריקים לא ישתנו.</p>}

          <div>
            <h3 style={{ fontSize: '12px', fontWeight: 600, color: '#2563eb', marginBottom: '8px' }}>משמרת נוכחית (היום)</h3>
            <RoutineTable entries={curEntries} dates={dates.length > 0 ? [dates[0]] : []} cfg={cfg} onChange={setCurEntries} />
          </div>
          <div>
            <h3 style={{ fontSize: '12px', fontWeight: 600, color: '#0d9488', marginBottom: '8px' }}>משמרת עתידית</h3>
            <RoutineTable entries={futEntries} dates={dates} cfg={cfg} onChange={setFutEntries} />
          </div>
        </div>

        <DialogFooter style={{ borderTop: '1px solid var(--border)', padding: '16px 24px' }}>
          <Button style={{ width: '100%' }} onClick={handleSave} disabled={saving}>{saving ? "שומר..." : isBulk ? `החל על ${editIds.length} רשומות` : "שמור שינויים"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Routine Table (for edit modal) ── */
function RoutineTable({ entries, dates, cfg, onChange }: {
  entries: { e: string; x: string }[]; dates: string[]; cfg: Config; onChange: (e: { e: string; x: string }[]) => void;
}) {
  function update(idx: number, field: "e" | "x", val: string) {
    const next = [...entries];
    next[idx] = { ...next[idx], [field]: val };
    onChange(next);
  }
  return (
    <Card style={{ overflow: 'hidden', padding: 0 }}>
      <Table style={{ fontSize: '14px' }}>
        <TableHeader>
          <TableRow style={{ backgroundColor: 'color-mix(in srgb, var(--muted) 50%, transparent)' }}>
            <TableHead style={{ textAlign: 'right', padding: '8px 12px', fontSize: '11px' }}>יום</TableHead>
            <TableHead style={{ textAlign: 'right', padding: '8px 12px', fontSize: '11px' }}>תאריך</TableHead>
            <TableHead style={{ textAlign: 'center', padding: '8px 12px', fontSize: '11px' }}>כניסה</TableHead>
            <TableHead style={{ textAlign: 'center', padding: '8px 12px', fontSize: '11px' }}>יציאה</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {dates.map((d, i) => (
            <TableRow key={d}>
              <TableCell style={{ padding: '8px 12px', fontWeight: 500, fontSize: '13px' }}>{dayLabel(d, i, cfg)}</TableCell>
              <TableCell style={{ padding: '8px 12px', color: 'var(--muted-foreground)', fontSize: '12px' }}>{fmtDate(d)}</TableCell>
              <TableCell style={{ padding: '6px 8px', textAlign: 'center' }}><TimeInput value={entries[i]?.e || ""} onChange={(v) => update(i, "e", v)} /></TableCell>
              <TableCell style={{ padding: '6px 8px', textAlign: 'center' }}><TimeInput value={entries[i]?.x || ""} onChange={(v) => update(i, "x", v)} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
