"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IconArrowDown, IconArrowUp, IconArrowUpDown, IconFilter, IconSearch } from "./icons";

export type SortDir = "asc" | "desc";
export type Filters = Record<string, Set<string>>;

/* ── Column header with sort + optional Excel-style filter dropdown ── */

export function ColumnHeader<K extends string>({
  label,
  sortKey,
  currentSort,
  sortDir,
  onSort,
  filterCol,
  filterOptions,
  filters,
  onFilter,
  openFilter,
  setOpenFilter,
}: {
  label: string;
  sortKey: K;
  currentSort: K;
  sortDir: SortDir;
  onSort: (key: K) => void;
  filterCol?: string;
  filterOptions?: { value: string; label: string }[];
  filters?: Filters;
  onFilter?: (col: string, values: Set<string>) => void;
  openFilter?: string | null;
  setOpenFilter?: (col: string | null) => void;
}) {
  const sortActive = currentSort === sortKey;
  const hasFilter = filterCol && filterOptions && filters && onFilter && setOpenFilter;
  const filterActive = hasFilter && filters[filterCol] && filters[filterCol].size > 0;
  const isOpen = hasFilter && openFilter === filterCol;
  const filterIconRef = useRef<HTMLSpanElement>(null);
  const thRef = useRef<HTMLTableCellElement>(null);

  // Compute alignment once when opening, not reactively
  const alignLeft = isOpen && thRef.current ? thRef.current.getBoundingClientRect().left < 220 : false;

  return (
    <th ref={thRef} className="px-4 py-3 text-right font-semibold select-none relative" style={{ color: sortActive ? "var(--text-1)" : "var(--text-3)" }}>
      <div className="flex items-center gap-1">
        <span className="cursor-pointer" onClick={() => onSort(sortKey)}>
          {label}
        </span>
        <span className="cursor-pointer" onClick={() => onSort(sortKey)}>
          {sortActive ? (
            sortDir === "asc" ? <IconArrowUp size={12} /> : <IconArrowDown size={12} />
          ) : (
            <IconArrowUpDown size={12} />
          )}
        </span>
        {hasFilter ? (
          <span
            ref={filterIconRef}
            className="cursor-pointer mr-0.5"
            style={{ color: filterActive ? "var(--accent)" : "var(--text-3)" }}
            onClick={(e) => {
              e.stopPropagation();
              setOpenFilter(isOpen ? null : filterCol);
            }}
          >
            <IconFilter size={12} />
          </span>
        ) : null}
      </div>
      {isOpen ? (
        <FilterDropdown
          options={filterOptions}
          selected={filters[filterCol] || new Set()}
          onApply={(values) => { onFilter(filterCol, values); setOpenFilter(null); }}
          onClose={() => setOpenFilter(null)}
          ignoreRef={filterIconRef}
          alignLeft={alignLeft}
        />
      ) : null}
    </th>
  );
}

/* ── Excel-style filter dropdown: search + checkbox list + select all / clear ── */

function FilterDropdown({
  options,
  selected,
  onApply,
  onClose,
  ignoreRef,
  alignLeft = false,
}: {
  options: { value: string; label: string }[];
  selected: Set<string>;
  onApply: (values: Set<string>) => void;
  onClose: () => void;
  ignoreRef?: React.RefObject<HTMLElement | null>;
  alignLeft?: boolean;
}) {
  // selected.size === 0 means "no filter" (all shown). We convert to explicit set for local editing.
  const [localSelected, setLocalSelected] = useState<Set<string>>(
    () => selected.size === 0 ? new Set(options.map((o) => o.value)) : new Set(selected),
  );
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (ref.current && !ref.current.contains(target) && !(ignoreRef?.current && ignoreRef.current.contains(target))) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose, ignoreRef]);

  const allValues = new Set(options.map((o) => o.value));
  const allSelected = allValues.size > 0 && localSelected.size === allValues.size && [...allValues].every((v) => localSelected.has(v));

  const visibleOptions = search.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(search.trim().toLowerCase()))
    : options;

  function toggleValue(val: string) {
    setLocalSelected((prev) => {
      const next = new Set(prev);
      if (next.has(val)) next.delete(val);
      else next.add(val);
      return next;
    });
  }

  function toggleSelectAll() {
    if (allSelected) {
      setLocalSelected(new Set());
    } else {
      setLocalSelected(new Set(options.map((o) => o.value)));
    }
  }

  return (
    <div
      ref={ref}
      className={`absolute top-full mt-1 z-30 surface-card p-2 min-w-[200px] ${alignLeft ? "left-0" : "right-0"}`}
      style={{ boxShadow: "var(--shadow-hover)" }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Search box */}
      <div className="relative mb-1.5">
        <div className="absolute right-2 top-1/2 -translate-y-1/2" style={{ color: "var(--text-3)" }}>
          <IconSearch size={11} />
        </div>
        <input
          ref={searchRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full text-[11px] py-1.5 pr-7 pl-2 rounded-md"
          style={{ background: "var(--surface-3)", color: "var(--text-1)", border: "1px solid var(--border)", outline: "none" }}
          placeholder="חיפוש..."
        />
      </div>

      {/* Select all */}
      <label className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer text-[12px] font-semibold" style={{ color: "var(--text-2)" }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-3)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />
        בחר הכל
      </label>

      <div className="my-1" style={{ borderTop: "1px solid var(--border)" }} />

      {/* Checkbox list */}
      <div className="max-h-[200px] overflow-y-auto">
        {visibleOptions.length === 0 ? (
          <p className="text-[11px] text-center py-2" style={{ color: "var(--text-3)" }}>אין תוצאות</p>
        ) : (
          visibleOptions.map((opt) => (
              <label
                key={opt.value}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer text-[12px]"
                style={{ color: "var(--text-2)" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-3)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <input
                  type="checkbox"
                  checked={localSelected.has(opt.value)}
                  onChange={() => toggleValue(opt.value)}
                />
                {opt.label}
              </label>
            ))
        )}
      </div>

      <div className="my-1" style={{ borderTop: "1px solid var(--border)" }} />

      <div className="flex items-center gap-2 px-1">
        <button
          type="button"
          className="flex-1 text-[11px] font-semibold py-1.5 rounded-md cursor-pointer"
          style={{ color: "var(--text-2)", background: "var(--surface-3)" }}
          onClick={() => { onApply(new Set()); onClose(); }}
        >
          נקה
        </button>
        <button
          type="button"
          className="flex-1 text-[11px] font-semibold py-1.5 rounded-md cursor-pointer"
          style={{ color: "#fff", background: "var(--accent)" }}
          onClick={() => {
            // If all options are selected, apply empty set (= no filter)
            const allVals = new Set(options.map((o) => o.value));
            const isAll = localSelected.size === allVals.size && [...allVals].every((v) => localSelected.has(v));
            onApply(isAll ? new Set() : localSelected);
          }}
        >
          החל
        </button>
      </div>
    </div>
  );
}

/* ── Hook for filter state management ── */

export function useColumnFilters() {
  const [filters, setFilters] = useState<Filters>({});
  const [openFilter, setOpenFilter] = useState<string | null>(null);

  const setColumnFilter = useCallback((col: string, values: Set<string>) => {
    setFilters((prev) => {
      const next = { ...prev };
      if (values.size === 0) {
        delete next[col];
      } else {
        next[col] = values;
      }
      return next;
    });
  }, []);

  const clearAll = useCallback(() => setFilters({}), []);

  const activeCount = Object.values(filters).filter((s) => s.size > 0).length;

  return { filters, setColumnFilter, openFilter, setOpenFilter, clearAll, activeCount };
}
