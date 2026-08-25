"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * The recurring-checklist board — a standalone tracker, deliberately wired to nothing else.
 *
 * <p>Hi-Tech runs its routines off a spreadsheet: three blocks (daily / weekly / monthly), a row per
 * routine, and a tick per period. This reproduces that sheet inside Taskopad without turning the
 * rows into tasks — no assignees, no approvals, no notifications, no reports. It is a board people
 * tick, and that is all it is meant to be.
 *
 * <p>It lives in browser storage, like the other single-user tools in this codebase (party ratings,
 * the "Others" registers). That includes the access list: a Super Admin picks who should see the
 * board, and that choice is remembered on their machine until the backend models this screen.
 */

const KEY = "hitech.taskopad.checklist.v1";

export type ChecklistPeriod = "daily" | "weekly" | "monthly";

export interface ChecklistRow {
  id: string;
  name: string;
  /**
   * Who owns the routine — a real user id from the team directory, not a typed-in name.
   * The sheet's "Contact" column was free text ("JAY"), which meant the board had its own private
   * idea of who people are; this points at the same users as the rest of the app.
   */
  assigneeId: string | null;
  /** The weekly sheet's "Work Alloted / Done" column — a work item, not a person. */
  note: string;
  /** Ticked periods, keyed by period id ("2026-08-03", "2026-08-W2", "2026-08"). */
  ticks: Record<string, boolean>;
}

export interface ChecklistData {
  daily: ChecklistRow[];
  weekly: ChecklistRow[];
  monthly: ChecklistRow[];
  /** User ids (as strings, matching the team directory) allowed to open the board. */
  allowedUserIds: string[];
}

const newId = () => `chk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const row = (name: string, note = ""): ChecklistRow => ({
  id: newId(),
  name,
  assigneeId: null,
  note,
  ticks: {},
});

/** The routines the client already tracks, so the board is usable the moment it opens. */
function seed(): ChecklistData {
  return {
    daily: [
      row("Attendance Check - 10 AM"),
      row("Core Value Evaluation / Core Value Entries (EOD)"),
      row("Vision Reading Regular and understanding its core meaning"),
      row("Onsite Regular Checking"),
    ],
    weekly: [
      row("Accountant Work Review", "ACCOUNT"),
      row("Tender Analysis Work review", "Construction Tender Analysis"),
      row("Tender Analyst Work", "GeM Tender Analysis"),
      row("Data Analyst Work", "DPR HI-TECH UJJAIN"),
      row("Data Analyst Work", "Brick plant update strategy"),
      row("Bonus Calculation Sheet", "Bonus Calculation"),
      row("Maturity Docket"),
    ],
    monthly: [
      row("Hiring of billing executive"),
      row("Training schedule / Team Building"),
      row("Tracking Ujjain Employees site photos in whatsapp group"),
      row("Bonus sheet Calculation review"),
      row("Maintaining Maturity Development Docket"),
      row("Campus placement"),
      row("Hiring Students for internship also [ Rs 5000 ]"),
      row("Linkedin platform"),
      row("Mainting PF sheet for upcoming salary deduction"),
    ],
    allowedUserIds: [],
  };
}

function read(): ChecklistData {
  if (typeof window === "undefined") return seed();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return seed();
    const parsed = JSON.parse(raw) as Partial<ChecklistData>;
    return {
      daily: migrate(parsed.daily),
      weekly: migrate(parsed.weekly),
      monthly: migrate(parsed.monthly),
      allowedUserIds: Array.isArray(parsed.allowedUserIds) ? parsed.allowedUserIds : [],
    };
  } catch {
    return seed();
  }
}

/**
 * Bring rows saved before the assignee column existed up to date.
 *
 * <p>They carried a free-text `contact`. There is no safe way to turn a string like "JAY" into a
 * user id here (the directory isn't loaded at this level, and two people can share a first name),
 * so it is kept as the work note and whoever opens the row picks the real person. Nothing is lost.
 */
function migrate(rows: unknown): ChecklistRow[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => {
    const row = r as Partial<ChecklistRow> & { contact?: string };
    return {
      id: String(row.id ?? newId()),
      name: String(row.name ?? ""),
      assigneeId: row.assigneeId ?? null,
      note: row.note ?? row.contact ?? "",
      ticks: row.ticks ?? {},
    };
  });
}

function write(data: ChecklistData) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // storage full / disabled — the in-memory board still works for this session
  }
}

// The board is one shared value for the whole tab, read through useSyncExternalStore so the server
// render sees an empty board and the client swaps in localStorage without a hydration mismatch.
const EMPTY: ChecklistData = { daily: [], weekly: [], monthly: [], allowedUserIds: [] };
let cache: ChecklistData | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function snapshot(): ChecklistData {
  if (cache === null) cache = read();
  return cache;
}

function commit(next: ChecklistData) {
  cache = next;
  write(next);
  for (const l of listeners) l();
}

export function useChecklist() {
  const data = useSyncExternalStore(subscribe, snapshot, () => EMPTY);
  // False during the server render and the first client paint, so the page can hold off drawing an
  // empty board for a frame.
  const ready = useSyncExternalStore(subscribe, () => true, () => false);

  const update = useCallback((fn: (prev: ChecklistData) => ChecklistData) => commit(fn(snapshot())), []);

  const addRow = useCallback(
    (period: ChecklistPeriod) => update((p) => ({ ...p, [period]: [...p[period], row("")] })),
    [update]
  );

  const removeRow = useCallback(
    (period: ChecklistPeriod, id: string) =>
      update((p) => ({ ...p, [period]: p[period].filter((r) => r.id !== id) })),
    [update]
  );

  const patchRow = useCallback(
    (period: ChecklistPeriod, id: string, patch: Partial<Pick<ChecklistRow, "name" | "note" | "assigneeId">>) =>
      update((p) => ({ ...p, [period]: p[period].map((r) => (r.id === id ? { ...r, ...patch } : r)) })),
    [update]
  );

  const toggleTick = useCallback(
    (period: ChecklistPeriod, id: string, periodKey: string) =>
      update((p) => ({
        ...p,
        [period]: p[period].map((r) =>
          r.id === id ? { ...r, ticks: { ...r.ticks, [periodKey]: !r.ticks[periodKey] } } : r
        ),
      })),
    [update]
  );

  const setAllowedUsers = useCallback(
    (ids: string[]) => update((p) => ({ ...p, allowedUserIds: ids })),
    [update]
  );

  const reset = useCallback(() => update((p) => ({ ...seed(), allowedUserIds: p.allowedUserIds })), [update]);

  return { data, ready, addRow, removeRow, patchRow, toggleTick, setAllowedUsers, reset };
}
