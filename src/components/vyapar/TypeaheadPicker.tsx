"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";

/**
 * Vyapar's search-as-you-type picker, used for the item cell on an invoice line and for the party
 * field on every document.
 *
 * Two things separate it from a plain `<Select>`, and both are why the client noticed:
 *
 *  1. **It shows context in the list.** Item suggestions carry sale price, purchase price and stock;
 *     party suggestions carry the running balance. You pick the right row without leaving the form.
 *  2. **It creates.** A `⊕ Add …` row sits at the top, so an item that isn't in the catalogue yet
 *     gets made from inside the invoice instead of abandoning the document.
 *
 * The input stays free text, because Vyapar lets a line name something that isn't a catalogue item.
 */
export interface PickerColumn<T> {
  label: string;
  get: (row: T) => string;
  /** Tailwind classes for the value cell — used to colour stock green, balances red, etc. */
  className?: string | ((row: T) => string);
  align?: "left" | "right";
}

export function TypeaheadPicker<T>({
  value,
  onChange,
  rows,
  getKey,
  getLabel,
  columns = [],
  onPick,
  onCreate,
  createLabel = "Add",
  placeholder,
  autoFocus,
  className = "",
  disabled = false,
}: {
  /** The text in the box. Free-form: a line may name something not in the catalogue. */
  value: string;
  onChange: (text: string) => void;
  rows: T[];
  getKey: (row: T) => string | number;
  getLabel: (row: T) => string;
  columns?: PickerColumn<T>[];
  onPick: (row: T) => void;
  /** Omit to hide the create row. */
  onCreate?: (typed: string) => void;
  createLabel?: string;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => {
    const q = value.trim().toLowerCase();
    const list = q ? rows.filter((r) => getLabel(r).toLowerCase().includes(q)) : rows;
    // A long catalogue would otherwise render thousands of rows on every keystroke.
    return list.slice(0, 50);
  }, [rows, value, getLabel]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  // Keep the highlighted row in view while arrowing through a long list.
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function pick(row: T) {
    onPick(row);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      setOpen(true);
      return;
    }
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (matches[active]) pick(matches[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const cellClass = (col: PickerColumn<T>, row: T) =>
    typeof col.className === "function" ? col.className(row) : (col.className ?? "text-gray-500");

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <input
        value={value}
        disabled={disabled}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className="w-full rounded-md border border-gray-200 px-2 py-1 text-sm outline-none transition-colors duration-150 focus:border-cyan-500 disabled:bg-gray-50"
      />

      {open && (matches.length > 0 || onCreate) && (
        <div
          ref={listRef}
          className="animate-menu-pop absolute left-0 top-full z-50 mt-1 max-h-72 w-[min(560px,80vw)] overflow-y-auto rounded-xl border border-gray-100 bg-white py-1 shadow-2xl ring-1 ring-black/[0.04]"
        >
          {onCreate && (
            <button
              type="button"
              onClick={() => {
                onCreate(value);
                setOpen(false);
              }}
              className="flex w-full items-center gap-1.5 px-3 py-2 text-sm font-medium text-brand-accent transition-colors duration-150 hover:bg-cyan-50"
            >
              <Plus size={14} /> {createLabel}
            </button>
          )}

          {columns.length > 0 && matches.length > 0 && (
            <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-1 text-[10px] font-semibold tracking-wide text-gray-400 uppercase">
              <span className="min-w-0 flex-1">Name</span>
              {columns.map((c) => (
                <span key={c.label} className={`w-24 shrink-0 ${c.align === "left" ? "text-left" : "text-right"}`}>
                  {c.label}
                </span>
              ))}
            </div>
          )}

          {matches.map((row, idx) => (
            <button
              key={getKey(row)}
              type="button"
              data-idx={idx}
              onMouseEnter={() => setActive(idx)}
              onClick={() => pick(row)}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors duration-100 ${
                idx === active ? "bg-cyan-50" : "hover:bg-gray-50"
              }`}
            >
              <span className="min-w-0 flex-1 truncate text-gray-700">{getLabel(row)}</span>
              {columns.map((c) => (
                <span
                  key={c.label}
                  className={`w-24 shrink-0 truncate text-xs ${c.align === "left" ? "text-left" : "text-right"} ${cellClass(c, row)}`}
                >
                  {c.get(row)}
                </span>
              ))}
            </button>
          ))}

          {matches.length === 0 && !onCreate && (
            <div className="px-3 py-4 text-center text-sm text-gray-400">No matches.</div>
          )}
        </div>
      )}
    </div>
  );
}
