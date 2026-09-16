"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createRoutine,
  deleteRoutine,
  getChecklistScope,
  listRoutines,
  toggleRoutineTick,
  updateRoutine,
  type ChecklistPeriodApi,
  type RoutineDto,
} from "./checklistApi";

/**
 * The recurring-checklist board — a standalone tracker, deliberately wired to nothing else.
 *
 * <p>Hi-Tech runs its routines off a spreadsheet: a block per cadence, a row per routine, and a tick
 * per period. This reproduces that sheet inside Taskopad without turning the rows into tasks — no
 * approvals, no notifications, no reports.
 *
 * <p>It used to live in each browser's localStorage, which made it a private notebook: a PM could
 * not see their team's ticks. It is now one shared board on the server, run by the role ladder —
 * whoever sits above a person sets up that person's routines; the person (or anyone above) ticks.
 */

export type ChecklistPeriod = "daily" | "weekly" | "monthly" | "quarterly" | "halfYearly" | "yearly";

export const CHECKLIST_PERIODS: ChecklistPeriod[] = ["daily", "weekly", "monthly", "quarterly", "halfYearly", "yearly"];

const TO_API: Record<ChecklistPeriod, ChecklistPeriodApi> = {
  daily: "DAILY",
  weekly: "WEEKLY",
  monthly: "MONTHLY",
  quarterly: "QUARTERLY",
  halfYearly: "HALF_YEARLY",
  yearly: "YEARLY",
};
const FROM_API = Object.fromEntries(Object.entries(TO_API).map(([k, v]) => [v, k])) as Record<
  ChecklistPeriodApi,
  ChecklistPeriod
>;

export interface ChecklistRow {
  id: string;
  period: ChecklistPeriod;
  name: string;
  assigneeId: string;
  /** The weekly sheet's "Work Alloted / Done" column — a work item, not a person. */
  note: string;
  /** Ticked periods, keyed by period id ("2026-08-03", "2026-08-W2", "2026-08", "FY2026-Q2", "FY2026-H1", "FY2026"). */
  ticks: Record<string, boolean>;
  canManage: boolean;
  canTick: boolean;
}

export interface ChecklistScope {
  meId: string;
  superAdmin: boolean;
  /** People below the signed-in user in the role ladder. Empty for Super Admin, who may pick anyone. */
  teamUserIds: string[];
}

export interface RoutineInput {
  period: ChecklistPeriod;
  name: string;
  assigneeId: string;
  note: string;
}

function toRow(d: RoutineDto): ChecklistRow {
  return {
    id: String(d.id),
    period: FROM_API[d.period],
    name: d.name,
    assigneeId: String(d.assigneeId),
    note: d.note ?? "",
    ticks: Object.fromEntries(d.ticks.map((k) => [k, true])),
    canManage: d.canManage,
    canTick: d.canTick,
  };
}

const toRequest = (r: RoutineInput) => ({
  period: TO_API[r.period],
  name: r.name.trim(),
  assigneeId: Number(r.assigneeId),
  note: r.note.trim() || null,
});

export function useChecklist() {
  const [rows, setRows] = useState<ChecklistRow[]>([]);
  const [scope, setScope] = useState<ChecklistScope | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Bumped by reload() to refetch.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [s, list] = await Promise.all([getChecklistScope(), listRoutines()]);
        if (cancelled) return;
        setScope({ meId: String(s.meId), superAdmin: s.superAdmin, teamUserIds: s.teamUserIds.map(String) });
        setRows(list.map(toRow));
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load the checklist");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const load = useCallback(() => {
    setLoading(true);
    setAttempt((n) => n + 1);
  }, []);

  const replace = (next: ChecklistRow) => setRows((prev) => prev.map((r) => (r.id === next.id ? next : r)));

  const addRow = useCallback(async (input: RoutineInput) => {
    const created = toRow(await createRoutine(toRequest(input)));
    setRows((prev) => [...prev, created]);
  }, []);

  const saveRow = useCallback(async (id: string, input: RoutineInput) => {
    replace(toRow(await updateRoutine(Number(id), toRequest(input))));
  }, []);

  const removeRow = useCallback(async (id: string) => {
    await deleteRoutine(Number(id));
    setRows((prev) => prev.filter((r) => r.id !== id));
  }, []);

  /** Optimistic — the box flips at once and snaps back if the server refuses. */
  const toggleTick = useCallback(async (row: ChecklistRow, periodKey: string) => {
    const flipped = { ...row, ticks: { ...row.ticks, [periodKey]: !row.ticks[periodKey] } };
    replace(flipped);
    try {
      replace(toRow(await toggleRoutineTick(Number(row.id), periodKey)));
    } catch (e) {
      replace(row);
      alert(e instanceof Error ? e.message : "Could not update the tick");
    }
  }, []);

  return { rows, scope, loading, error, reload: load, addRow, saveRow, removeRow, toggleTick };
}
