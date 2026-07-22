"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Repeat } from "lucide-react";

export type RecurrenceRule = "NONE" | "CUSTOM" | "WEEKLY" | "MONTHLY" | "QUARTERLY" | "HALF_YEARLY";

export const RECURRENCE_OPTIONS: { value: RecurrenceRule; label: string }[] = [
  { value: "CUSTOM", label: "Custom" },
  { value: "WEEKLY", label: "Weekly" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "QUARTERLY", label: "Quarterly" },
  { value: "HALF_YEARLY", label: "Half Yearly" },
];

export function recurrenceLabel(rule: RecurrenceRule | null | undefined, interval = 1): string {
  if (!rule || rule === "NONE") return "Does not repeat";
  if (rule === "CUSTOM") return interval > 1 ? `Every ${interval} days` : "Every day";
  return RECURRENCE_OPTIONS.find((o) => o.value === rule)?.label ?? "Repeats";
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTHS_SHORT = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
/** Parses yyyy-MM-dd as a LOCAL date (new Date("2026-07-21") would be UTC and can shift a day). */
function fromIso(value: string): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}
function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * Date field with a custom calendar popup. When `recurrence` handlers are supplied the popup also
 * offers a "Recurring Tasks" switch — turning it on reveals the repeat frequencies (Custom, Weekly,
 * Monthly, Quarterly, Half Yearly), so a due date and its repeat rule are chosen in one place.
 *
 * The popup is portaled with fixed positioning, so no parent's overflow can clip it.
 */
export function DatePicker({
  value,
  onChange,
  min,
  max,
  placeholder = "Select date",
  disabled,
  className = "",
  recurrence,
  onRecurrenceChange,
  recurrenceInterval = 1,
  onRecurrenceIntervalChange,
}: {
  value: string;
  onChange: (v: string) => void;
  min?: string;
  max?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  recurrence?: RecurrenceRule;
  onRecurrenceChange?: (r: RecurrenceRule) => void;
  recurrenceInterval?: number;
  onRecurrenceIntervalChange?: (n: number) => void;
}) {
  const supportsRecurrence = typeof onRecurrenceChange === "function";
  const rule: RecurrenceRule = recurrence ?? "NONE";

  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: -9999, left: -9999 });
  const [mounted, setMounted] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [showMonthPick, setShowMonthPick] = useState(false);

  const selected = fromIso(value);
  const [cursor, setCursor] = useState<Date>(() => selected ?? new Date());

  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const WIDTH = 340;

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (open) setCursor(fromIso(value) ?? new Date());
  }, [open, value]);

  useLayoutEffect(() => {
    if (!open) return;
    const b = btnRef.current?.getBoundingClientRect();
    const h = popRef.current?.offsetHeight ?? 0;
    if (!b) return;
    const spaceBelow = window.innerHeight - b.bottom;
    const openUp = h > 0 && spaceBelow < h + 12 && b.top > spaceBelow;
    const top = openUp ? b.top - h - 6 : b.bottom + 6;
    const left = Math.min(Math.max(8, b.left), Math.max(8, window.innerWidth - WIDTH - 8));
    setPos({ top: Math.max(8, top), left });
  }, [open, showRules, showMonthPick]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (
        popRef.current && !popRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) {
        close();
      }
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function close() {
    setOpen(false);
    setShowRules(false);
    setShowMonthPick(false);
  }

  // Calendar grid: leading blanks then each day of the month.
  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const lead = first.getDay();
    const out: (Date | null)[] = Array.from({ length: lead }, () => null);
    for (let d = 1; d <= daysInMonth; d++) out.push(new Date(cursor.getFullYear(), cursor.getMonth(), d));
    return out;
  }, [cursor]);

  const minDate = fromIso(min ?? "");
  const maxDate = fromIso(max ?? "");
  const today = new Date();

  function pick(d: Date) {
    onChange(toIso(d));
    close();
  }

  const display = selected
    ? `${String(selected.getDate()).padStart(2, "0")} ${MONTHS_SHORT[selected.getMonth()]} ${selected.getFullYear()}`
    : "";

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={`group flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-left transition-all duration-150 ${
          open ? "border-cyan-500 ring-2 ring-cyan-500/15" : "border-gray-200 hover:border-cyan-300"
        } ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"} ${className}`}
      >
        <CalendarDays
          size={15}
          className={`shrink-0 transition-colors duration-150 ${open ? "text-brand-accent" : "text-gray-400 group-hover:text-brand-accent"}`}
        />
        <span className={`flex-1 truncate text-sm ${display ? "text-gray-700" : "text-gray-400"}`}>
          {display || placeholder}
        </span>
        {supportsRecurrence && rule !== "NONE" && (
          <span className="flex shrink-0 items-center gap-1 rounded-md bg-cyan-50 px-1.5 py-0.5 text-[10px] font-medium text-brand-accent">
            <Repeat size={9} /> {recurrenceLabel(rule, recurrenceInterval)}
          </span>
        )}
      </button>

      {open && mounted &&
        createPortal(
          <div
            ref={popRef}
            style={{ position: "fixed", top: pos.top, left: pos.left, width: WIDTH }}
            className="animate-menu-pop z-50 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-2xl ring-1 ring-black/[0.04]"
          >
            {/* Recurring switch */}
            {supportsRecurrence && (
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                <span className="text-sm font-semibold text-gray-800">Recurring Tasks</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={rule !== "NONE"}
                  onClick={() => {
                    if (rule === "NONE") {
                      setShowRules(true);
                    } else {
                      onRecurrenceChange?.("NONE");
                      setShowRules(false);
                    }
                  }}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${
                    rule !== "NONE" ? "bg-brand-accent" : "bg-gray-200"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-200 ${
                      rule !== "NONE" ? "left-[22px]" : "left-0.5"
                    }`}
                  />
                </button>
              </div>
            )}

            {/* Frequency list — shown while choosing a repeat rule */}
            {showRules ? (
              <div className="animate-fade-in py-1">
                {RECURRENCE_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => {
                      onRecurrenceChange?.(o.value);
                      setShowRules(false);
                    }}
                    className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition-colors duration-150 hover:bg-gray-50 ${
                      rule === o.value ? "font-medium text-brand-accent" : "text-gray-700"
                    }`}
                  >
                    {o.label}
                    {rule === o.value && <span className="h-1.5 w-1.5 rounded-full bg-brand-accent" />}
                  </button>
                ))}
                {rule === "CUSTOM" && (
                  <div className="flex items-center gap-2 border-t border-gray-100 px-4 py-2.5">
                    <span className="text-xs text-gray-500">Every</span>
                    <input
                      type="number"
                      min={1}
                      value={recurrenceInterval}
                      onChange={(e) => onRecurrenceIntervalChange?.(Math.max(1, Number(e.target.value) || 1))}
                      className="w-16 rounded-lg border border-gray-200 px-2 py-1 text-sm outline-none focus:border-cyan-500"
                    />
                    <span className="text-xs text-gray-500">day(s)</span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setShowRules(false)}
                  className="w-full border-t border-gray-100 px-4 py-2 text-center text-xs font-medium text-gray-500 transition-colors duration-150 hover:text-gray-800"
                >
                  Back to calendar
                </button>
              </div>
            ) : (
              <div className="p-4">
                <div className="mb-3 text-sm font-semibold text-gray-800">Select Due Date</div>

                {/* Month header */}
                <div className="mb-2 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setShowMonthPick((s) => !s)}
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-gray-700 transition-colors duration-150 hover:bg-gray-100"
                  >
                    {MONTHS_SHORT[cursor.getMonth()]} {cursor.getFullYear()}
                    <ChevronDown size={14} className="text-gray-400" />
                  </button>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
                      className="rounded-lg p-1.5 text-gray-400 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-700"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
                      className="rounded-lg p-1.5 text-gray-400 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-700"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>

                {showMonthPick ? (
                  <div className="animate-fade-in">
                    <div className="mb-2 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => setCursor(new Date(cursor.getFullYear() - 1, cursor.getMonth(), 1))}
                        className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                      >
                        <ChevronLeft size={15} />
                      </button>
                      <span className="text-sm font-medium text-gray-700">{cursor.getFullYear()}</span>
                      <button
                        type="button"
                        onClick={() => setCursor(new Date(cursor.getFullYear() + 1, cursor.getMonth(), 1))}
                        className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                      >
                        <ChevronRight size={15} />
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      {MONTHS.map((m, i) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => {
                            setCursor(new Date(cursor.getFullYear(), i, 1));
                            setShowMonthPick(false);
                          }}
                          className={`rounded-lg py-2 text-xs font-medium transition-colors duration-150 ${
                            i === cursor.getMonth()
                              ? "bg-brand-accent text-white"
                              : "text-gray-600 hover:bg-gray-100"
                          }`}
                        >
                          {MONTHS_SHORT[i]}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-7 text-center text-[11px] font-medium text-gray-400">
                      {WEEKDAYS.map((d, i) => (
                        <div key={i} className="py-1">{d}</div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 gap-y-1">
                      {cells.map((d, i) => {
                        if (!d) return <div key={`e-${i}`} />;
                        const isSel = selected ? sameDay(d, selected) : false;
                        const isToday = sameDay(d, today);
                        const blocked = (minDate && d < minDate) || (maxDate && d > maxDate);
                        return (
                          <button
                            key={toIso(d)}
                            type="button"
                            disabled={!!blocked}
                            onClick={() => pick(d)}
                            className={`mx-auto flex h-9 w-9 items-center justify-center rounded-full text-sm transition-all duration-150 ${
                              isSel
                                ? "bg-brand-accent font-semibold text-white shadow-sm"
                                : isToday
                                  ? "border border-gray-300 text-gray-800 hover:bg-gray-100"
                                  : "text-gray-700 hover:bg-cyan-50 hover:text-brand-accent"
                            } ${blocked ? "cursor-not-allowed opacity-30 hover:bg-transparent" : "active:scale-90"}`}
                          >
                            {d.getDate()}
                          </button>
                        );
                      })}
                    </div>

                    {/* Footer shortcuts */}
                    <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-2.5">
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => pick(new Date())}
                          className="rounded-md px-2 py-1 text-xs font-medium text-brand-accent transition-colors duration-150 hover:bg-cyan-50"
                        >
                          Today
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const t = new Date();
                            t.setDate(t.getDate() + 1);
                            pick(t);
                          }}
                          className="rounded-md px-2 py-1 text-xs font-medium text-gray-500 transition-colors duration-150 hover:bg-gray-100"
                        >
                          Tomorrow
                        </button>
                      </div>
                      {value && (
                        <button
                          type="button"
                          onClick={() => {
                            onChange("");
                            close();
                          }}
                          className="rounded-md px-2 py-1 text-xs font-medium text-gray-400 transition-colors duration-150 hover:text-rose-600"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>,
          document.body
        )}
    </>
  );
}
