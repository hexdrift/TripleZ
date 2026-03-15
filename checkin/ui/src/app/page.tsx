"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "react-toastify";

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

/* ── Time input with validation ── */
function TimeInput({ value, onChange, className = "" }: { value: string; onChange: (v: string) => void; className?: string }) {
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
  const borderCls = value === "" ? "border-input" : complete ? "border-emerald-300 bg-emerald-50" : "border-amber-400 bg-amber-50";
  return (
    <input
      value={value}
      onChange={handleInput}
      placeholder="—"
      className={`w-16 text-center rounded-md border px-1 py-1 text-xs transition-colors focus:outline-none focus:ring-1 focus:ring-ring/30 ${borderCls} ${className}`}
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
    } catch { toast.error("שגיאה בטעינת נתונים"); }
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
    if (activeOnly) list = list.filter((r) => r.current.some((c) => c.on_shift));
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
    XLSX.writeFile(wb, "קמבצ_צק_אין.xlsx");
    toast.success("הקובץ הורד בהצלחה");
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
    XLSX.writeFile(wb, "תבנית_משמרת_עתידית.xlsx");
    toast.success("תבנית הורדה בהצלחה");
  }

  async function handleUpload(file: File) {
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(API + "/upload-future", { method: "POST", body: form });
      if (!res.ok) throw new Error(await res.text());
      const result = await res.json();
      toast.success(`${result.count} רשומות משמרת עתידית עודכנו`);
      setUploadOpen(false);
      await loadData();
    } catch (e) { toast.error(e instanceof Error ? e.message : "שגיאה בטעינת הקובץ"); }
  }

  if (loading) return <div className="flex items-center justify-center min-h-screen text-muted-foreground">טוען...</div>;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <Card className="overflow-hidden">
        {/* Toolbar Row 1 */}
        <div className="flex items-center gap-3 border-b px-4 py-3">
          <h1 className="text-lg font-bold text-foreground shrink-0">תצוגת קמב&quot;צ</h1>
          <div className="relative flex-1 max-w-xs">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="חיפוש לפי שם או מ.א."
              className="h-8 text-xs pr-3"
            />
          </div>
          <div className="mr-auto" />
          {selected.size > 0 && (
            <>
              <Badge variant="secondary" className="text-[11px]">{selected.size} נבחרו</Badge>
              <Button variant="ghost" size="sm" className="text-[11px]" onClick={() => { setEditIds([...selected]); setEditOpen(true); }}>עריכה</Button>
            </>
          )}
          <span className="text-[11px] text-muted-foreground">{filtered.length} רשומות</span>
          <div className="h-4 w-px bg-border" />
          <Button variant="ghost" size="icon-sm" onClick={() => setUploadOpen(true)} title="העלאת משמרת עתידית">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={handleDownload} title="הורדה לאקסל">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
          </Button>
        </div>

        {/* Toolbar Row 2: Filter chips */}
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2 bg-muted/30">
          <button onClick={() => setActiveOnly(!activeOnly)} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium transition-all ${activeOnly ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-border bg-background text-muted-foreground hover:text-foreground"}`}>
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${activeOnly ? "bg-emerald-500" : "bg-muted-foreground/40"}`} />
            משמרת פעילות
          </button>
          <FilterChip label="זירה" value={arena} options={arenaOptions} onChange={setArena} activeColor="blue" />
          <FilterChip label="שירות" value={statusFilter} options={serviceOptions} onChange={setStatusFilter} activeColor="purple" />
          {hasFilters && <button onClick={clearFilters} className="rounded-full px-2.5 py-1 text-[11px] font-medium text-destructive hover:bg-destructive/10">נקה הכל</button>}
        </div>

        {/* Table */}
        <div className="overflow-y-auto" style={{ maxHeight: "calc(100vh - 180px)" }}>
          <table className="w-full table-fixed text-[11px] border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-800 text-white text-[10px]">
                <th colSpan={9} className="py-1 text-center font-semibold border-l border-slate-600">פרטים אישיים</th>
                <th colSpan={1} className="py-1 text-center font-semibold bg-blue-800 border-l border-blue-600">נוכחית</th>
                <th colSpan={dates.length} className="py-1 text-center font-semibold bg-teal-800">משמרת עתידית</th>
              </tr>
              <tr className="bg-slate-700 text-white text-[10px]">
                <th className="w-[30px] py-1.5 text-center">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-3 w-3 cursor-pointer" />
                </th>
                <th className="w-[60px] py-1.5 text-right font-semibold px-1">מ.א.</th>
                <th className="py-1.5 text-right font-semibold px-1">שם מלא</th>
                <th className="w-[50px] py-1.5 text-right font-semibold px-1">דרגה</th>
                <th className="w-[45px] py-1.5 text-right font-semibold px-1">שירות</th>
                <th className="w-[42px] py-1.5 text-right font-semibold px-1">זירה</th>
                <th className="w-[50px] py-1.5 text-right font-semibold px-1">ענף</th>
                <th className="w-[48px] py-1.5 text-right font-semibold px-1">בסיס</th>
                <th className="w-[28px] py-1.5 text-center font-semibold border-l border-slate-500" title="במשמרת">
                  <svg className="inline h-3 w-3 opacity-80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
                </th>
                <th className="py-1 text-center font-semibold bg-blue-700 border-l border-blue-500">
                  <div className="text-[10px]">היום</div>
                  <div className="text-[8px] opacity-70">{dates.length > 0 ? fmtDate(dates[0]) : ""}</div>
                </th>
                {dates.map((d, i) => (
                  <th key={d} className="py-1 text-center font-semibold bg-teal-700 border-l border-teal-500">
                    <div className="text-[10px]">{dayLabel(d, i, cfg)}</div>
                    <div className="text-[8px] opacity-70">{fmtDate(d)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={10 + dates.length} className="px-4 py-12 text-center text-muted-foreground text-sm">אין רשומות להצגה</td></tr>
              ) : filtered.map((r, idx) => {
                const sel = selected.has(r.personnel.id);
                const c0 = r.current[0] || {} as RoutineEntry;
                const f0 = r.future[0] || {} as RoutineEntry;
                const cText = c0.entry_time ? `${c0.entry_time}-${c0.exit_time}` : "—";
                const cMiss = !c0.entry_time;
                const todayConflict = c0.entry_time !== f0.entry_time || c0.exit_time !== f0.exit_time;
                return (
                  <tr key={r.personnel.id} className={`border-b border-border/40 transition-colors hover:bg-accent/40 ${sel ? "bg-blue-50 dark:bg-blue-950/20" : idx % 2 === 0 ? "" : "bg-muted/20"}`}>
                    <td className="px-1 py-1.5 text-center"><input type="checkbox" checked={sel} onChange={() => toggleSelect(r.personnel.id)} className="h-3 w-3 cursor-pointer" /></td>
                    <td className="px-1 py-1.5 font-mono text-[10px] text-muted-foreground truncate">{r.personnel.id}</td>
                    <td className="px-1 py-1.5 font-medium text-foreground truncate">{r.personnel.name}</td>
                    <td className="px-1 py-1.5 text-muted-foreground truncate">{r.personnel.rank}</td>
                    <td className="px-1 py-1.5 text-muted-foreground truncate">{r.personnel.service_type}</td>
                    <td className="px-1 py-1.5 text-muted-foreground truncate">{r.personnel.arena}</td>
                    <td className="px-1 py-1.5 text-muted-foreground truncate">{r.personnel.branch}</td>
                    <td className="px-1 py-1.5 text-muted-foreground truncate">{r.personnel.base}</td>
                    <td className="px-1 py-1.5 text-center border-l border-border/40">
                      <span className={`inline-block h-2.5 w-2.5 rounded-full ${c0.on_shift ? "bg-emerald-500" : "bg-muted-foreground/30"}`} />
                    </td>
                    <td className={`px-1 py-1.5 text-center border-l border-blue-200/50 ${cMiss ? "bg-destructive/5 text-destructive/60" : todayConflict ? "bg-destructive/5" : "text-muted-foreground"}`}>
                      <span className={todayConflict && !cMiss ? "text-destructive font-semibold" : ""}>{cMiss ? "—" : cText}</span>
                    </td>
                    {dates.map((_, i) => {
                      const c = r.current[i] || {} as RoutineEntry;
                      const f2 = r.future[i] || {} as RoutineEntry;
                      const fText = f2.entry_time ? `${f2.entry_time}-${f2.exit_time}` : "—";
                      const fMiss = !f2.entry_time;
                      const conflict = c.entry_time !== f2.entry_time || c.exit_time !== f2.exit_time;
                      return (
                        <td key={i} className={`px-1 py-1.5 text-center border-l border-teal-200/30 ${fMiss ? "bg-destructive/5 text-destructive/60" : conflict ? "bg-destructive/5" : "text-muted-foreground"}`}>
                          <span className={conflict && !fMiss ? "text-destructive font-semibold" : ""}>{fMiss ? "—" : fText}</span>
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

      {/* Upload Modal */}
      <UploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} onUpload={handleUpload} onDownloadTemplate={downloadTemplate} dates={dates} records={records} />

      {/* Edit Modal */}
      <EditModal open={editOpen} onClose={() => setEditOpen(false)} editIds={editIds} records={records} dates={dates} cfg={cfg} onSave={loadData} />
    </div>
  );
}

/* ── Filter Chip ── */
function FilterChip({ label, value, options, onChange, activeColor }: { label: string; value: string; options: string[]; onChange: (v: string) => void; activeColor: string }) {
  const active = value !== "הכל";
  const colors: Record<string, string> = {
    blue: active ? "border-blue-300 bg-blue-50 text-blue-700" : "",
    purple: active ? "border-purple-300 bg-purple-50 text-purple-700" : "",
  };
  return (
    <div className="relative inline-flex">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`appearance-none cursor-pointer rounded-full border py-1 pr-3 pl-6 text-[11px] font-medium transition-all focus:outline-none ${colors[activeColor] || (active ? "" : "border-border bg-background text-muted-foreground hover:text-foreground")}`}
      >
        {options.map((o) => <option key={o} value={o}>{o === "הכל" ? `${label}: הכל` : `${label}: ${o}`}</option>)}
      </select>
      <svg className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="m19 9-7 7-7-7" /></svg>
    </div>
  );
}

/* ── Upload Modal ── */
function UploadModal({ open, onClose, onUpload, onDownloadTemplate, dates, records }: {
  open: boolean; onClose: () => void; onUpload: (f: File) => void; onDownloadTemplate: () => void; dates: string[]; records: PersonRecord[];
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg p-0 gap-0">
        <DialogHeader className="bg-gradient-to-l from-slate-700 to-slate-800 px-6 py-5 text-white rounded-t-lg">
          <DialogTitle className="flex items-center gap-4 text-white">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
            </div>
            <div><div className="text-lg font-bold">העלאת משמרת עתידית</div><p className="text-sm opacity-70 font-normal">העלה קובץ אקסל עם נתוני משמרות עתידיות</p></div>
          </DialogTitle>
        </DialogHeader>
        <div className="px-6 py-5 space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">תבנית קובץ לדוגמה</h3>
              <Button variant="secondary" size="sm" className="text-[11px] gap-1.5" onClick={onDownloadTemplate}>
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                הורד תבנית
              </Button>
            </div>
            <Card className="overflow-hidden p-0">
              <Table className="text-xs">
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="text-right px-3 py-2 text-[11px]">מ.א.</TableHead>
                    {dates.slice(0, 4).map((d) => <TableHead key={d} className="text-center px-3 py-2 text-[11px]">{fmtDate(d)}</TableHead>)}
                    {dates.length > 4 && <TableHead className="text-center px-3 py-2 text-[11px] text-muted-foreground">...</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[0, 1].map((i) => (
                    <TableRow key={i}>
                      <TableCell className="px-3 py-1.5 font-mono text-muted-foreground">{records[i]?.personnel.id || `10000${i}`}</TableCell>
                      {dates.slice(0, 4).map((d) => <TableCell key={d} className="px-3 py-1.5 text-center text-muted-foreground">{i === 0 ? "07:00-17:00" : "08:30-19:00"}</TableCell>)}
                      {dates.length > 4 && <TableCell className="px-3 py-1.5 text-center text-muted-foreground">...</TableCell>}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
            <p className="mt-2 text-[10px] text-muted-foreground">עמודת מ.א. + עמודה לכל תאריך (DD/MM). בכל תא יש להזין שעת כניסה ויציאה (לדוגמה: 07:00-17:00). תאים ריקים יידלגו.</p>
          </div>
          <label className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/30 py-8 cursor-pointer hover:border-primary/40 hover:bg-accent/30 transition-colors">
            <svg className="h-8 w-8 text-muted-foreground mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
            <span className="text-sm font-medium text-foreground">לחץ לבחירת קובץ או גרור לכאן</span>
            <span className="text-xs text-muted-foreground mt-1">Excel (.xlsx, .xls) או CSV</span>
            <input type="file" accept=".xlsx,.xls,.csv" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => { if (e.target.files?.[0]) onUpload(e.target.files[0]); }} />
          </label>
        </div>
        <DialogFooter className="border-t px-6 py-4">
          <Button variant="outline" onClick={onClose}>ביטול</Button>
        </DialogFooter>
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

  // Edit state for day entries
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
        // Bulk: current today
        if (curEntries[0]?.e || curEntries[0]?.x) {
          await apiFetch("/routine/current/bulk", { method: "POST", body: JSON.stringify({ person_ids: editIds, entries: [{ person_id: "", date: dates[0], entry_time: curEntries[0].e, exit_time: curEntries[0].x, on_shift: curEntries[0].e ? 1 : 0 }] }) });
        }
        // Bulk: future
        const futE = futEntries.filter((f, i) => f.e || f.x).map((f, i) => ({ person_id: "", date: dates[i], entry_time: f.e, exit_time: f.x, on_shift: f.e ? 1 : 0 }));
        if (futE.length) await apiFetch("/routine/future/bulk", { method: "POST", body: JSON.stringify({ person_ids: editIds, entries: futE }) });
        toast.success(`${editIds.length} רשומות עודכנו`);
      } else if (rec) {
        // Single: current today
        await apiFetch(`/routine/current/${rec.personnel.id}/${dates[0]}`, { method: "PUT", body: JSON.stringify({ person_id: rec.personnel.id, date: dates[0], entry_time: curEntries[0].e, exit_time: curEntries[0].x, on_shift: curEntries[0].e ? 1 : 0 }) });
        // Single: future all
        for (let i = 0; i < dates.length; i++) {
          await apiFetch(`/routine/future/${rec.personnel.id}/${dates[i]}`, { method: "PUT", body: JSON.stringify({ person_id: rec.personnel.id, date: dates[i], entry_time: futEntries[i].e, exit_time: futEntries[i].x, on_shift: futEntries[i].e ? 1 : 0 }) });
        }
        toast.success("הרשומה עודכנה");
      }
      await onSave();
      onClose();
    } catch { toast.error("שגיאה בשמירה"); }
    setSaving(false);
  }

  const names = editIds.slice(0, 5).map((id) => records.find((r) => r.personnel.id === id)?.personnel.name || id);
  const more = editIds.length > 5 ? editIds.length - 5 : 0;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="bg-gradient-to-l from-slate-700 to-slate-800 px-6 py-5 text-white rounded-t-lg">
          <DialogTitle className="flex items-center gap-4 text-white">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 text-lg font-bold">
              {isBulk ? (
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>
              ) : rec?.personnel.name.charAt(0)}
            </div>
            <div>
              <div className="text-lg font-bold">{isBulk ? "עריכה קבוצתית" : rec?.personnel.name}</div>
              <p className="text-sm opacity-70 font-normal">{isBulk ? `${editIds.length} רשומות נבחרו` : `מ.א. ${rec?.personnel.id}`}</p>
            </div>
          </DialogTitle>
        </DialogHeader>

        {isBulk && (
          <div className="border-b px-6 py-3 bg-muted/50">
            <div className="flex flex-wrap gap-1.5">
              {names.map((n) => <Badge key={n} variant="secondary" className="text-[11px]">{n}</Badge>)}
              {more > 0 && <Badge variant="outline" className="text-[11px]">+{more} נוספים</Badge>}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {isBulk && <p className="text-xs text-muted-foreground">שעות שימולאו יוחלו על כל הרשומות. שדות ריקים לא ישתנו.</p>}

          <div>
            <h3 className="text-xs font-semibold text-blue-600 mb-2">משמרת נוכחית (היום)</h3>
            <RoutineTable entries={curEntries} dates={dates.length > 0 ? [dates[0]] : []} cfg={cfg} onChange={setCurEntries} />
          </div>
          <div>
            <h3 className="text-xs font-semibold text-teal-600 mb-2">משמרת עתידית</h3>
            <RoutineTable entries={futEntries} dates={dates} cfg={cfg} onChange={setFutEntries} />
          </div>
        </div>

        <DialogFooter className="grid grid-cols-2 gap-3 border-t px-6 py-4">
          <Button variant="outline" onClick={onClose} disabled={saving}>ביטול</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "שומר..." : isBulk ? `החל על ${editIds.length} רשומות` : "שמור שינויים"}</Button>
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
    <Card className="overflow-hidden p-0">
      <Table className="text-sm">
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="text-right px-3 py-2 text-[11px]">יום</TableHead>
            <TableHead className="text-right px-3 py-2 text-[11px]">תאריך</TableHead>
            <TableHead className="text-center px-3 py-2 text-[11px]">כניסה</TableHead>
            <TableHead className="text-center px-3 py-2 text-[11px]">יציאה</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {dates.map((d, i) => (
            <TableRow key={d}>
              <TableCell className="px-3 py-2 font-medium text-[13px]">{dayLabel(d, i, cfg)}</TableCell>
              <TableCell className="px-3 py-2 text-muted-foreground text-xs">{fmtDate(d)}</TableCell>
              <TableCell className="px-2 py-1.5 text-center"><TimeInput value={entries[i]?.e || ""} onChange={(v) => update(i, "e", v)} /></TableCell>
              <TableCell className="px-2 py-1.5 text-center"><TimeInput value={entries[i]?.x || ""} onChange={(v) => update(i, "x", v)} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
