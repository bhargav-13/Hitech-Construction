"use client";

import { useMemo } from "react";
import { Select } from "@/components/Select";
import { DatePicker } from "@/components/DatePicker";
import { Calendar } from "lucide-react";

/**
 * Vyapar's filter bar — the control that sits above every transaction list and report:
 *
 *   Filter by: [This Year ▾] [📅 01/01/2026 To 31/12/2026] [All Firms ▾] [All Users ▾]
 *
 * Our lists had no date filtering at all, which on books with years of history meant every screen
 * rendered everything. A preset writes explicit from/to dates, and editing either date switches the
 * preset to Custom — same as the real app.
 */
export type DatePreset =
  | "All"
  | "Today"
  | "Yesterday"
  | "This Week"
  | "This Month"
  | "Last Month"
  | "This Quarter"
  | "This Year"
  | "Last Year"
  | "Custom";

export interface DateRange {
  preset: DatePreset;
  from: string; // ISO yyyy-mm-dd, "" = unbounded
  to: string;
}

const PRESETS: DatePreset[] = [
  "All",
  "Today",
  "Yesterday",
  "This Week",
  "This Month",
  "Last Month",
  "This Quarter",
  "This Year",
  "Last Year",
  "Custom",
];

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** The from/to a preset resolves to, evaluated against today. */
export function rangeForPreset(preset: DatePreset, today = new Date()): { from: string; to: string } {
  const y = today.getFullYear();
  const m = today.getMonth();
  const d = today.getDate();
  switch (preset) {
    case "Today":
      return { from: iso(new Date(y, m, d)), to: iso(new Date(y, m, d)) };
    case "Yesterday": {
      const prev = new Date(y, m, d - 1);
      return { from: iso(prev), to: iso(prev) };
    }
    case "This Week": {
      // Weeks start Monday, as in the Indian business calendar Vyapar assumes.
      const dow = (today.getDay() + 6) % 7;
      return { from: iso(new Date(y, m, d - dow)), to: iso(new Date(y, m, d - dow + 6)) };
    }
    case "This Month":
      return { from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)) };
    case "Last Month":
      return { from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) };
    case "This Quarter": {
      const q = Math.floor(m / 3) * 3;
      return { from: iso(new Date(y, q, 1)), to: iso(new Date(y, q + 3, 0)) };
    }
    case "This Year":
      return { from: iso(new Date(y, 0, 1)), to: iso(new Date(y, 11, 31)) };
    case "Last Year":
      return { from: iso(new Date(y - 1, 0, 1)), to: iso(new Date(y - 1, 11, 31)) };
    default:
      return { from: "", to: "" };
  }
}

/** The default every list opens with — Vyapar defaults its transaction lists to the current year. */
export function defaultRange(preset: DatePreset = "This Year"): DateRange {
  return { preset, ...rangeForPreset(preset) };
}

/**
 * Whether an ISO date falls inside the range. An empty bound is unbounded, and a row with no date
 * is always kept — dropping undated rows would silently hide imported documents.
 */
export function inRange(date: string | null | undefined, range: DateRange): boolean {
  if (!date) return true;
  const d = date.slice(0, 10);
  if (range.from && d < range.from) return false;
  if (range.to && d > range.to) return false;
  return true;
}

export function DateRangeFilter({
  value,
  onChange,
  firm,
  firms,
  onFirmChange,
  user,
  users,
  onUserChange,
}: {
  value: DateRange;
  onChange: (next: DateRange) => void;
  firm?: string;
  firms?: { value: string; label: string }[];
  onFirmChange?: (v: string) => void;
  user?: string;
  users?: { value: string; label: string }[];
  onUserChange?: (v: string) => void;
}) {
  const presetOptions = useMemo(() => PRESETS.map((p) => ({ value: p, label: p })), []);

  function pickPreset(p: string) {
    const preset = p as DatePreset;
    if (preset === "Custom") {
      onChange({ ...value, preset });
      return;
    }
    onChange({ preset, ...rangeForPreset(preset) });
  }

  // Typing a date by hand means the preset no longer describes the range.
  const setBound = (key: "from" | "to") => (v: string) =>
    onChange({ ...value, [key]: v, preset: "Custom" });

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5">
      <span className="text-sm font-medium text-gray-500">Filter by :</span>

      <Select value={value.preset} onChange={pickPreset} size="sm" className="w-36" options={presetOptions} />

      <div className="flex items-center gap-1.5 rounded-lg bg-gray-50 px-2 py-1">
        <Calendar size={14} className="shrink-0 text-gray-400" />
        <DatePicker value={value.from} onChange={setBound("from")} placeholder="From" />
        <span className="px-0.5 text-xs text-gray-400">To</span>
        <DatePicker value={value.to} onChange={setBound("to")} min={value.from || undefined} placeholder="To" />
      </div>

      {firms && onFirmChange && (
        <Select value={firm ?? "All"} onChange={onFirmChange} size="sm" className="w-36" options={firms} />
      )}
      {users && onUserChange && (
        <Select value={user ?? "All"} onChange={onUserChange} size="sm" className="w-36" options={users} />
      )}
    </div>
  );
}
