"use client";

import { type RefObject, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowDown, ArrowUp, ChevronsUpDown, Filter } from "lucide-react";
import { Select } from "@/components/Select";
import type { SortDir } from "@/lib/useTableSort";

/**
 * Vyapar-style per-column filtering. Each header carries a funnel that opens a small popover —
 * pick an operator ("Contains", ">", "Between", …) and a value, Apply. Multiple columns stack
 * (all must match). Mirrors the funnel on Vyapar's own transaction grids.
 */

export type FilterType = "text" | "number" | "select";

export interface ColumnFilterState {
  op: string;
  value: string;
  /** Second bound for the numeric "between" operator. */
  value2?: string;
}

export type ColumnFilters = Record<string, ColumnFilterState>;

export interface FilterColumn<T> {
  get: (row: T) => string | number | null | undefined;
  type?: FilterType;
  /** Choices for a `select` column. */
  options?: string[];
}

const TEXT_OPS = [
  { value: "contains", label: "Contains" },
  { value: "equals", label: "Equals" },
  { value: "starts", label: "Starts with" },
  { value: "ends", label: "Ends with" },
  { value: "not_contains", label: "Does not contain" },
];

const NUMBER_OPS = [
  { value: "eq", label: "=" },
  { value: "gt", label: "Greater than" },
  { value: "lt", label: "Less than" },
  { value: "gte", label: "≥" },
  { value: "lte", label: "≤" },
  { value: "between", label: "Between" },
];

function defaultOp(type: FilterType): string {
  return type === "number" ? "eq" : type === "select" ? "equals" : "contains";
}

/** Does one row's value satisfy a single column filter? Empty values pass (no-op). */
function matches(type: FilterType, f: ColumnFilterState, raw: string | number | null | undefined): boolean {
  if (type === "number") {
    const n = Number(raw);
    const a = Number(f.value);
    if (f.value === "" || Number.isNaN(a)) return true;
    switch (f.op) {
      case "gt": return n > a;
      case "lt": return n < a;
      case "gte": return n >= a;
      case "lte": return n <= a;
      case "between": {
        const b = Number(f.value2);
        if (f.value2 == null || f.value2 === "" || Number.isNaN(b)) return n >= a;
        return n >= a && n <= b;
      }
      case "eq":
      default:
        return n === a;
    }
  }
  const s = String(raw ?? "").toLowerCase();
  const v = f.value.trim().toLowerCase();
  if (!v) return true;
  switch (f.op) {
    case "equals": return s === v;
    case "starts": return s.startsWith(v);
    case "ends": return s.endsWith(v);
    case "not_contains": return !s.includes(v);
    case "contains":
    default:
      return s.includes(v);
  }
}

/**
 * Applies a set of stacked column filters to a list. Pass a map of column key → accessor/type;
 * get back the filtered rows plus helpers the headers use to read and set each column's filter.
 */
export function useColumnFilters<T>(rows: T[], columns: Record<string, FilterColumn<T>>) {
  const [filters, setFilters] = useState<ColumnFilters>({});

  const filtered = useMemo(() => {
    const active = Object.entries(filters);
    if (active.length === 0) return rows;
    return rows.filter((row) =>
      active.every(([key, f]) => {
        const col = columns[key];
        if (!col) return true;
        return matches(col.type ?? "text", f, col.get(row));
      })
    );
  }, [rows, filters, columns]);

  const setFilter = (key: string, f: ColumnFilterState | null) =>
    setFilters((prev) => {
      const next = { ...prev };
      // A blank value clears the column rather than filtering everything out.
      if (!f || (f.value.trim() === "" && (f.value2 ?? "").trim() === "")) delete next[key];
      else next[key] = f;
      return next;
    });

  const clearAll = () => setFilters({});

  return { filtered, filters, setFilter, clearAll, activeCount: Object.keys(filters).length };
}

/**
 * A header cell that is both sortable (like {@link import("./SortTh").SortTh}) and filterable —
 * a click on the label sorts, the funnel opens the filter popover.
 */
export function FilterTh({
  label,
  align = "left",
  sortKey,
  activeKey,
  dir,
  onSort,
  filterKey,
  type = "text",
  options,
  filter,
  onApply,
}: {
  label: string;
  align?: "left" | "right";
  sortKey?: string;
  activeKey?: string | null;
  dir?: SortDir;
  onSort?: (key: string) => void;
  filterKey: string;
  type?: FilterType;
  options?: string[];
  filter?: ColumnFilterState;
  onApply: (key: string, f: ColumnFilterState | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const sortable = !!(onSort && sortKey);
  const sortActive = sortable && activeKey === sortKey;
  const filterActive = !!filter;

  return (
    <th className={`px-4 py-2 font-medium ${align === "right" ? "text-right" : "text-left"}`}>
      <div className={`flex items-center gap-1 ${align === "right" ? "justify-end" : ""}`}>
        {sortable ? (
          <button
            type="button"
            onClick={() => onSort!(sortKey!)}
            className={`group inline-flex items-center gap-1 transition-colors duration-150 hover:text-gray-700 ${
              sortActive ? "text-brand-accent" : "text-gray-500"
            }`}
          >
            <span>{label}</span>
            {sortActive ? (
              dir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />
            ) : (
              <ChevronsUpDown size={12} className="text-gray-300 group-hover:text-gray-400" />
            )}
          </button>
        ) : (
          <span className="text-gray-500">{label}</span>
        )}
        <button
          ref={btnRef}
          type="button"
          onClick={() => setOpen((o) => !o)}
          title={filterActive ? "Filter applied — edit or clear" : "Filter this column"}
          aria-label={`Filter ${label}`}
          className={`rounded p-0.5 transition-colors duration-150 ${
            filterActive ? "text-brand-accent" : "text-gray-300 hover:text-gray-500"
          }`}
        >
          <Filter size={12} fill={filterActive ? "currentColor" : "none"} />
        </button>
      </div>
      {open && (
        <FilterPopover
          anchorRef={btnRef}
          label={label}
          type={type}
          options={options}
          value={filter}
          onClose={() => setOpen(false)}
          onApply={(f) => {
            onApply(filterKey, f);
            setOpen(false);
          }}
        />
      )}
    </th>
  );
}

/** The popover itself — operator + value(s) + Clear/Apply. Rendered to a portal so the table's
 *  horizontal scroll container can't clip it. */
function FilterPopover({
  anchorRef,
  label,
  type,
  options,
  value,
  onClose,
  onApply,
}: {
  anchorRef: RefObject<HTMLButtonElement | null>;
  label: string;
  type: FilterType;
  options?: string[];
  value?: ColumnFilterState;
  onClose: () => void;
  onApply: (f: ColumnFilterState | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [op, setOp] = useState(value?.op ?? defaultOp(type));
  const [val, setVal] = useState(value?.value ?? "");
  const [val2, setVal2] = useState(value?.value2 ?? "");
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Position under the funnel, clamped to the viewport.
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    const width = 240;
    setPos({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)) });
  }, [anchorRef]);

  // Close on outside click or Escape.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !anchorRef.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [anchorRef, onClose]);

  const ops = type === "number" ? NUMBER_OPS : TEXT_OPS;
  const apply = () => onApply({ op, value: val, value2: op === "between" ? val2 : undefined });

  if (typeof document === "undefined" || !pos) return null;

  return createPortal(
    <div
      ref={ref}
      style={{ position: "fixed", top: pos.top, left: pos.left, width: 240 }}
      className="z-50 space-y-2.5 rounded-xl border border-gray-200 bg-white p-3 text-left shadow-xl"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="text-[11px] font-semibold tracking-wide text-gray-400 uppercase">Filter · {label}</div>
      {type === "select" ? (
        <Select
          value={val}
          onChange={setVal}
          size="sm"
          placeholder="Select value"
          options={[{ value: "", label: "Any" }, ...(options ?? []).map((o) => ({ value: o, label: o }))]}
        />
      ) : (
        <>
          <Select value={op} onChange={setOp} size="sm" options={ops} />
          <div className="flex items-center gap-2">
            <input
              autoFocus
              type={type === "number" ? "number" : "text"}
              value={val}
              onChange={(e) => setVal(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && apply()}
              placeholder={op === "between" ? "Min" : "Value"}
              className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm outline-none focus:border-cyan-500"
            />
            {type === "number" && op === "between" && (
              <input
                type="number"
                value={val2}
                onChange={(e) => setVal2(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && apply()}
                placeholder="Max"
                className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm outline-none focus:border-cyan-500"
              />
            )}
          </div>
        </>
      )}
      <div className="flex items-center justify-end gap-2 pt-0.5">
        <button
          onClick={() => { setOp(defaultOp(type)); setVal(""); setVal2(""); onApply(null); }}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-500 transition-colors duration-150 hover:bg-gray-100"
        >
          Clear
        </button>
        <button
          onClick={apply}
          className="rounded-lg bg-brand-accent px-3.5 py-1.5 text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95"
        >
          Apply
        </button>
      </div>
    </div>,
    document.body
  );
}
