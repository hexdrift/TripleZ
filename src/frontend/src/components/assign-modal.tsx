"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { assignPerson, unassignPerson } from "@/lib/api";
import { useAppData } from "./app-shell";
import { buildingHe, deptHe, genderHe, rankHe } from "@/lib/hebrew";
import { Personnel } from "@/lib/types";
import {
  IconAlertCircle,
  IconCheck,
  IconSearch,
  IconUserMinus,
  IconUserPlus,
  IconX,
} from "./icons";

function translateError(msg: string): string {
  if (msg.includes("MISSING_FIELDS") || msg.includes("rank, department, gender are required")) {
    return "חסרים שדות חובה: דרגה, זירה ומגדר (האדם לא נמצא ברשומות כוח אדם).";
  }
  if (msg.includes("NO_ROOM_AVAILABLE") || msg.includes("No available room")) {
    return "לא נמצא חדר פנוי המתאים לדרגה, זירה ומגדר שצוינו.";
  }
  if (msg.includes("NO_VP_ROOM_AVAILABLE") || msg.includes("cannot be assigned")) {
    return "לא נמצא חדר פנוי לדרגת סמנכ\"ל. סמנכ\"לים לא ניתנים לשיבוץ בדרגות אחרות.";
  }
  if (msg.includes("INVALID_GENDER")) return "ערך מגדר לא תקין.";
  if (msg.includes("INVALID_RANK")) return "ערך דרגה לא תקין.";
  return msg;
}

interface AssignModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type Tab = "assign" | "batch-assign" | "batch-unassign";

const TAB_ORDER: Tab[] = ["assign", "batch-assign", "batch-unassign"];
const TAB_LABELS: Record<Tab, string> = {
  assign: "שיבוץ",
  "batch-assign": "שיבוץ קבוצתי",
  "batch-unassign": "הסרה קבוצתית",
};

export function AssignModal({ open, onClose, onSuccess }: AssignModalProps) {
  const [tab, setTab] = useState<Tab>("assign");
  const dialogRef = useRef<HTMLDivElement>(null);

  const handleClose = useCallback(() => {
    setTab("assign");
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    const previous = document.activeElement as HTMLElement | null;

    const focusCurrentTab = () => {
      const dialog = dialogRef.current;
      if (!dialog) return;
      const preferred = dialog.querySelector<HTMLElement>(`[data-tab-focus='${tab}']`);
      const fallback = getFocusable(dialog)[0];
      (preferred || fallback)?.focus();
    };

    requestAnimationFrame(focusCurrentTab);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        handleClose();
        return;
      }

      if (event.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = getFocusable(dialog);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previous?.focus();
    };
  }, [handleClose, open, tab]);

  function onTabKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, currentTab: Tab) {
    const currentIndex = TAB_ORDER.indexOf(currentTab);
    if (event.key === "ArrowRight") {
      event.preventDefault();
      const next = TAB_ORDER[(currentIndex + 1) % TAB_ORDER.length];
      setTab(next);
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      const prev = TAB_ORDER[(currentIndex - 1 + TAB_ORDER.length) % TAB_ORDER.length];
      setTab(prev);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      setTab(TAB_ORDER[0]);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      setTab(TAB_ORDER[TAB_ORDER.length - 1]);
    }
  }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-6"
          style={{ background: "rgba(0, 0, 0, 0.4)", backdropFilter: "blur(4px)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              handleClose();
            }
          }}
        >
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="assign-modal-title"
            className="surface-card w-full max-w-[1080px] max-h-[calc(100vh-40px)] overflow-hidden"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            onMouseDown={(event) => event.stopPropagation()}
          >
        <header className="px-8 py-6 border-b flex items-center justify-between" style={{ borderColor: "var(--border)" }}>
          <div>
            <h2 id="assign-modal-title" className="text-[24px] font-bold" style={{ color: "var(--text-1)" }}>
              ניהול שיבוצים
            </h2>
            <p className="text-[12px] mt-1" style={{ color: "var(--text-3)" }}>שיבוץ יחיד, שיבוץ קבוצתי או הסרה קבוצתית</p>
          </div>
          <button type="button" onClick={handleClose} className="btn-ghost !min-h-[36px] !px-2" aria-label="סגור חלון">
            <IconX size={18} />
          </button>
        </header>

        <div className="px-8 pt-4 border-b" style={{ borderColor: "var(--border)" }}>
          <div role="tablist" aria-label="ניהול סוגי שיבוץ" className="flex items-center gap-2">
            {TAB_ORDER.map((tabKey) => {
              const selected = tab === tabKey;
              return (
                <button
                  key={tabKey}
                  role="tab"
                  id={`tab-${tabKey}`}
                  aria-selected={selected}
                  aria-controls={`panel-${tabKey}`}
                  tabIndex={selected ? 0 : -1}
                  onKeyDown={(event) => onTabKeyDown(event, tabKey)}
                  onClick={() => setTab(tabKey)}
                  className="px-4 py-2 rounded-t-lg border border-b-0 text-[13px] font-semibold cursor-pointer transition-colors"
                  style={{
                    color: selected ? "var(--accent)" : "var(--text-2)",
                    borderColor: selected ? "var(--accent)" : "transparent",
                    background: selected ? "var(--accent-muted)" : "transparent",
                  }}
                >
                  {TAB_LABELS[tabKey]}
                </button>
              );
            })}
          </div>
        </div>

        <div className="px-8 py-6 overflow-y-auto" style={{ maxHeight: "calc(100vh - 220px)" }}>
          <section role="tabpanel" id="panel-assign" aria-labelledby="tab-assign" hidden={tab !== "assign"}>
            {tab === "assign" ? <SingleAssignTab onSuccess={onSuccess} /> : null}
          </section>

          <section role="tabpanel" id="panel-batch-assign" aria-labelledby="tab-batch-assign" hidden={tab !== "batch-assign"}>
            {tab === "batch-assign" ? <BatchAssignTab onSuccess={onSuccess} /> : null}
          </section>

          <section role="tabpanel" id="panel-batch-unassign" aria-labelledby="tab-batch-unassign" hidden={tab !== "batch-unassign"}>
            {tab === "batch-unassign" ? <BatchUnassignTab onSuccess={onSuccess} /> : null}
          </section>
        </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function SingleAssignTab({ onSuccess }: { onSuccess: () => void }) {
  const { personnel, rooms } = useAppData();
  const [personId, setPersonId] = useState("");
  const [personName, setPersonName] = useState("");
  const [rank, setRank] = useState("");
  const [department, setDepartment] = useState("");
  const [gender, setGender] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notInPersonnel, setNotInPersonnel] = useState(false);
  const [result, setResult] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const assignedIds = useMemo(() => new Set(rooms.flatMap((room) => room.occupant_ids)), [rooms]);

  const suggestions = useMemo(() => {
    if (!personId.trim()) return personnel;
    const q = personId.toLowerCase();
    return personnel.filter(
      (person) => person.person_id.toLowerCase().includes(q) || person.full_name.toLowerCase().includes(q)
    );
  }, [personId, personnel]);

  function selectPerson(person: Personnel) {
    setPersonId(person.person_id);
    setPersonName(person.full_name);
    setRank(person.rank);
    setDepartment(person.department);
    setGender(person.gender);
    setNotInPersonnel(false);
    setShowSuggestions(false);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setResult("");
    setNotInPersonnel(false);

    const trimmedId = personId.trim();
    if (!trimmedId) return;

    const found = personnel.find((p) => p.person_id === trimmedId);
    if (!found) {
      setNotInPersonnel(true);
      return;
    }

    setLoading(true);
    try {
      const response = await assignPerson(trimmedId);
      if (response.assigned && response.room) {
        const msg = `שובץ למבנה ${buildingHe(response.room.building_name)}, חדר ${response.room.room_number}`;
        setResult(msg);
        toast.success(msg);
        onSuccess();
      } else {
        setError(translateError(response.error_message || "השיבוץ נכשל"));
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <FieldLabel label="מזהה אישי" required />
        <input
          ref={inputRef}
          data-tab-focus="assign"
          type="text"
          value={personId}
          onChange={(event) => {
            setPersonId(event.target.value);
            setNotInPersonnel(false);
            setShowSuggestions(true);
          }}
          onFocus={() => setShowSuggestions(true)}
          required
          autoComplete="off"
          className="control-input"
          placeholder="הקלד מזהה או שם לחיפוש"
        />

        {showSuggestions && suggestions.length > 0 ? (
          <SuggestionList
            items={suggestions}
            assignedIds={assignedIds}
            onSelect={selectPerson}
            onClose={() => setShowSuggestions(false)}
            inputRef={inputRef}
          />
        ) : null}
      </div>

      {rank ? (
        <div className="flex flex-wrap gap-1.5">
          <MiniTag>{rankHe(rank)}</MiniTag>
          <MiniTag>{deptHe(department)}</MiniTag>
          <MiniTag>{genderHe(gender)}</MiniTag>
          {personName ? <MiniTag>{personName}</MiniTag> : null}
        </div>
      ) : null}

      {notInPersonnel ? (
        <div
          className="rounded-lg px-3 py-2.5 text-[13px] flex items-start gap-2"
          style={{
            color: "var(--danger)",
            background: "var(--danger-dim)",
            border: "1px solid var(--danger-border)",
          }}
        >
          <IconAlertCircle size={15} className="shrink-0 mt-0.5" />
          <span>
            המזהה לא נמצא ברשימת כוח האדם, יש לעשות צ׳ק אין בקישור{" "}
            <a href="#" className="underline font-semibold" style={{ color: "var(--danger)" }}>הבא</a>
          </span>
        </div>
      ) : null}

      {error ? <AlertBox type="error">{error}</AlertBox> : null}
      {result ? <AlertBox type="success">{result}</AlertBox> : null}

      <div className="pt-2 flex justify-center">
        <button type="submit" disabled={loading} className="btn-primary inline-flex items-center gap-2">
          <IconUserPlus size={14} />
          {loading ? "משבץ..." : "שבץ"}
        </button>
      </div>
    </form>
  );
}

function BatchAssignTab({ onSuccess }: { onSuccess: () => void }) {
  const { personnel, rooms } = useAppData();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Array<{ id: string; ok: boolean; msg: string }>>([]);

  const assignedIds = useMemo(() => new Set(rooms.flatMap((room) => room.occupant_ids)), [rooms]);
  const unassigned = useMemo(
    () => personnel.filter((person) => !assignedIds.has(person.person_id)),
    [personnel, assignedIds]
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return unassigned;
    const q = search.toLowerCase();
    return unassigned.filter(
      (person) =>
        person.person_id.toLowerCase().includes(q) ||
        person.full_name.toLowerCase().includes(q) ||
        deptHe(person.department).toLowerCase().includes(q) ||
        rankHe(person.rank).toLowerCase().includes(q)
    );
  }, [search, unassigned]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (filtered.length > 0 && selected.size === filtered.length) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(filtered.map((person) => person.person_id)));
  }

  async function handleBatchAssign() {
    setLoading(true);
    setResults([]);

    const out: Array<{ id: string; ok: boolean; msg: string }> = [];
    for (const id of selected) {
      try {
        const response = await assignPerson(id);
        if (response.assigned && response.room) {
          out.push({ id, ok: true, msg: `מבנה ${buildingHe(response.room.building_name)}, חדר ${response.room.room_number}` });
        } else {
          out.push({ id, ok: false, msg: translateError(response.error_message || "שיבוץ נכשל") });
        }
      } catch (err) {
        out.push({ id, ok: false, msg: String(err) });
      }
    }

    setResults(out);
    setSelected(new Set());
    setLoading(false);
    const ok = out.filter((r) => r.ok).length;
    const fail = out.filter((r) => !r.ok).length;
    if (ok > 0) toast.success(`${ok} אנשים שובצו בהצלחה`);
    if (fail > 0) toast.error(`${fail} שיבוצים נכשלו`);
    onSuccess();
  }

  return (
    <BatchPanel
      id="batch-assign"
      title="שיבוץ קבוצתי"
      search={search}
      onSearchChange={setSearch}
      onToggleAll={toggleAll}
      allChecked={filtered.length > 0 && selected.size === filtered.length}
      selectedCount={selected.size}
      actionButton={
        <button type="button" onClick={handleBatchAssign} disabled={loading || selected.size === 0} className="btn-primary inline-flex items-center gap-2">
          <IconUserPlus size={14} />
          {loading ? "משבץ..." : `שבץ ${selected.size} אנשים`}
        </button>
      }
      results={results}
    >
      {filtered.length === 0 ? (
        <EmptyList message="אין אנשים זמינים לשיבוץ" />
      ) : (
        filtered.map((person) => (
          <label
            key={person.person_id}
            className="surface-soft px-3 py-2 flex items-center gap-3 cursor-pointer"
            style={{ border: selected.has(person.person_id) ? "1px solid var(--accent)" : "1px solid transparent" }}
          >
            <input
              data-tab-focus="batch-assign"
              type="checkbox"
              checked={selected.has(person.person_id)}
              onChange={() => toggle(person.person_id)}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-semibold truncate" style={{ color: "var(--text-1)" }}>{person.full_name}</span>
                <span className="text-[11px]" style={{ color: "var(--text-3)" }}>{person.person_id}</span>
              </div>
              <div className="flex gap-1.5 mt-1">
                <MiniTag>{rankHe(person.rank)}</MiniTag>
                <MiniTag>{deptHe(person.department)}</MiniTag>
                <MiniTag>{genderHe(person.gender)}</MiniTag>
              </div>
            </div>
          </label>
        ))
      )}
    </BatchPanel>
  );
}

function BatchUnassignTab({ onSuccess }: { onSuccess: () => void }) {
  const { rooms } = useAppData();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Array<{ id: string; ok: boolean; msg: string }>>([]);

  const assigned = useMemo(() => {
    return rooms.flatMap((room) =>
      room.occupant_ids.map((personId) => ({
        person_id: personId,
        full_name: room.occupant_names?.[personId] || "",
        building_name: room.building_name,
        room_number: room.room_number,
        room_rank: room.room_rank,
        departments: room.departments,
      }))
    );
  }, [rooms]);

  const filtered = useMemo(() => {
    if (!search.trim()) return assigned;
    const q = search.toLowerCase();
    return assigned.filter(
      (person) =>
        person.person_id.toLowerCase().includes(q) ||
        person.full_name.toLowerCase().includes(q) ||
        buildingHe(person.building_name).toLowerCase().includes(q) ||
        person.departments.some((d: string) => deptHe(d).toLowerCase().includes(q))
    );
  }, [assigned, search]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (filtered.length > 0 && selected.size === filtered.length) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(filtered.map((person) => person.person_id)));
  }

  async function handleBatchUnassign() {
    setLoading(true);
    setResults([]);

    const out: Array<{ id: string; ok: boolean; msg: string }> = [];
    for (const id of selected) {
      try {
        const response = await unassignPerson(id);
        out.push({ id, ok: response.ok, msg: response.ok ? "הוסר" : response.detail || "הסרה נכשלה" });
      } catch (err) {
        out.push({ id, ok: false, msg: String(err) });
      }
    }

    setResults(out);
    setSelected(new Set());
    setLoading(false);
    const ok = out.filter((r) => r.ok).length;
    const fail = out.filter((r) => !r.ok).length;
    if (ok > 0) toast.success(`${ok} אנשים הוסרו בהצלחה`);
    if (fail > 0) toast.error(`${fail} הסרות נכשלו`);
    onSuccess();
  }

  return (
    <BatchPanel
      id="batch-unassign"
      title="הסרה קבוצתית"
      search={search}
      onSearchChange={setSearch}
      onToggleAll={toggleAll}
      allChecked={filtered.length > 0 && selected.size === filtered.length}
      selectedCount={selected.size}
      actionButton={
        <button type="button" onClick={() => {
          if (!window.confirm(`האם להסיר ${selected.size} אנשים מהחדרים?`)) return;
          handleBatchUnassign();
        }} disabled={loading || selected.size === 0} className="btn-danger inline-flex items-center gap-2">
          <IconUserMinus size={14} />
          {loading ? "מסיר..." : `הסר ${selected.size} אנשים`}
        </button>
      }
      results={results}
    >
      {filtered.length === 0 ? (
        <EmptyList message="אין אנשים משובצים" />
      ) : (
        filtered.map((person) => (
          <label
            key={person.person_id}
            className="surface-soft px-3 py-2 flex items-center gap-3 cursor-pointer"
            style={{ border: selected.has(person.person_id) ? "1px solid var(--danger-border)" : "1px solid transparent" }}
          >
            <input
              data-tab-focus="batch-unassign"
              type="checkbox"
              checked={selected.has(person.person_id)}
              onChange={() => toggle(person.person_id)}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-semibold truncate" style={{ color: "var(--text-1)" }}>
                  {person.full_name || person.person_id}
                </span>
                {person.full_name ? <span className="text-[11px]" style={{ color: "var(--text-3)" }}>{person.person_id}</span> : null}
              </div>
              <div className="flex gap-1.5 mt-1">
                <MiniTag>מבנה {buildingHe(person.building_name)}</MiniTag>
                <MiniTag>חדר {person.room_number}</MiniTag>
                <MiniTag>{rankHe(person.room_rank)}</MiniTag>
              </div>
            </div>
          </label>
        ))
      )}
    </BatchPanel>
  );
}

function BatchPanel({
  id,
  title,
  search,
  onSearchChange,
  onToggleAll,
  allChecked,
  selectedCount,
  actionButton,
  results,
  children,
}: {
  id: string;
  title: string;
  search: string;
  onSearchChange: (value: string) => void;
  onToggleAll: () => void;
  allChecked: boolean;
  selectedCount: number;
  actionButton: React.ReactNode;
  results: Array<{ id: string; ok: boolean; msg: string }>;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="panel-title mb-1">{title}</h3>
      <p className="panel-subtitle mb-4">בחר מספר אנשים ובצע פעולה אחת מרוכזת</p>

      <div className="relative mb-3">
        <div className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-3)" }}>
          <IconSearch size={14} />
        </div>
        <input
          data-tab-focus={id}
          type="text"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          className="control-input pr-10"
          placeholder="חיפוש לפי מזהה, שם או זירה"
        />
      </div>

      <div className="flex items-center justify-between mb-2">
        <label className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-2)" }}>
          <input type="checkbox" checked={allChecked} onChange={onToggleAll} />
          בחר הכל
        </label>
        {selectedCount > 0 ? <span className="badge badge-accent">{selectedCount} נבחרו</span> : null}
      </div>

      <div className="surface-card p-2 space-y-1 max-h-[42vh] overflow-y-auto mb-3">{children}</div>

      {results.length > 0 ? (
        <div className="surface-soft p-3 space-y-1.5 max-h-[180px] overflow-y-auto mb-3">
          {results.map((result) => (
            <div
              key={result.id}
              className="flex items-center gap-2 text-[12px] px-2 py-1.5 rounded-md"
              style={{
                color: result.ok ? "var(--success)" : "var(--danger)",
                background: result.ok ? "var(--success-dim)" : "var(--danger-dim)",
              }}
            >
              {result.ok ? <IconCheck size={12} /> : <IconAlertCircle size={12} />}
              <span className="font-semibold">{result.id}</span>
              <span>{result.msg}</span>
            </div>
          ))}
        </div>
      ) : null}

      {actionButton}
    </div>
  );
}

function SuggestionList({
  items,
  assignedIds,
  onSelect,
  onClose,
  inputRef,
}: {
  items: Personnel[];
  assignedIds: Set<string>;
  onSelect: (person: Personnel) => void;
  onClose: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onMouseDown(event: MouseEvent) {
      const target = event.target as Node;
      if (
        listRef.current &&
        !listRef.current.contains(target) &&
        inputRef.current &&
        !inputRef.current.contains(target)
      ) {
        onClose();
      }
    }

    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [inputRef, onClose]);

  return (
    <div
      ref={listRef}
      role="listbox"
      className="mt-1 surface-card max-h-[260px] overflow-y-auto p-1"
    >
      {items.slice(0, 40).map((person) => {
        const isAssigned = assignedIds.has(person.person_id);
        return (
          <button
            key={person.person_id}
            type="button"
            role="option"
            onMouseDown={() => onSelect(person)}
            className="w-full text-right px-2.5 py-2 rounded-lg flex items-center gap-2 cursor-pointer transition-colors"
            style={{ color: "var(--text-2)", opacity: isAssigned ? 0.5 : 1 }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-3)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <div className="h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0" style={{ background: "var(--surface-3)", color: "var(--text-2)" }}>
              {person.full_name ? person.full_name.charAt(0) : person.person_id.slice(-2)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-semibold truncate" style={{ color: "var(--text-1)" }}>{person.full_name}</p>
              <p className="text-[11px] truncate" style={{ color: "var(--text-3)" }}>{person.person_id}</p>
            </div>
            <div className="flex gap-1">
              {isAssigned ? <span className="text-[10px] shrink-0" style={{ color: "var(--text-3)" }}>משובץ</span> : null}
              <MiniTag>{rankHe(person.rank)}</MiniTag>
              <MiniTag>{deptHe(person.department)}</MiniTag>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function FieldLabel({ label, required = false }: { label: string; required?: boolean }) {
  return (
    <label className="block text-[12px] font-semibold mb-1.5" style={{ color: "var(--text-2)" }}>
      {label}
      {required ? <span style={{ color: "var(--danger)" }}> *</span> : null}
    </label>
  );
}

function MiniTag({ children }: { children: React.ReactNode }) {
  return <span className="badge" style={{ padding: "4px 8px" }}>{children}</span>;
}

function EmptyList({ message }: { message: string }) {
  return <p className="text-center text-[12px] py-8" style={{ color: "var(--text-3)" }}>{message}</p>;
}

function AlertBox({ type, children }: { type: "error" | "success"; children: React.ReactNode }) {
  const isError = type === "error";
  return (
    <div
      className="rounded-lg px-3 py-2.5 text-[13px] flex items-start gap-2"
      style={{
        color: isError ? "var(--danger)" : "var(--success)",
        background: isError ? "var(--danger-dim)" : "var(--success-dim)",
        border: `1px solid ${isError ? "var(--danger-border)" : "var(--success-border)"}`,
      }}
    >
      {isError ? <IconAlertCircle size={15} /> : <IconCheck size={15} />}
      <span>{children}</span>
    </div>
  );
}

function getFocusable(root: HTMLElement): HTMLElement[] {
  const nodes = root.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
  );
  return Array.from(nodes).filter((node) => !node.hasAttribute("hidden") && node.offsetParent !== null);
}
