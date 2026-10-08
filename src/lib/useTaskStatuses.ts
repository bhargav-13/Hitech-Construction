"use client";

import { useEffect } from "react";
import { create } from "zustand";
import * as tasksApi from "./tasksApi";
import { statusFromApi, statusToApi, TASK_STATUSES } from "./taskTypes";
import type { Task, TaskStatus } from "./taskTypes";

/**
 * Company-defined task statuses (Taskopad's Status master). Each has a name and colour and maps onto
 * one base state; the base is what the app reasons on (approvals, overdue, reports), the row is what
 * people see. Loaded once per tab and shared.
 */
export interface StatusRow {
  id: string;
  name: string;
  color: string;
  base: TaskStatus;
  sortOrder: number;
  system: boolean;
  active: boolean;
}

/** Used until the server answers, and if it can't — the six built-ins in their usual colours. */
const BUILT_IN_COLORS: Record<TaskStatus, string> = {
  Pending: "#f59e0b",
  "In Progress": "#8b5cf6",
  "On Hold": "#3b82f6",
  Stuck: "#f97316",
  "Awaiting Approval": "#06b6d4",
  Completed: "#22c55e",
};

const FALLBACK: StatusRow[] = TASK_STATUSES.map((s, i) => ({
  id: `base:${s}`,
  name: s,
  color: BUILT_IN_COLORS[s],
  base: s,
  sortOrder: i,
  system: true,
  active: true,
}));

function fromDto(d: tasksApi.TaskStatusDto): StatusRow {
  return {
    id: String(d.id),
    name: d.name,
    color: d.color,
    base: statusFromApi(d.baseStatus),
    sortOrder: d.sortOrder,
    system: d.system,
    active: d.active,
  };
}

interface StatusState {
  rows: StatusRow[];
  loaded: boolean;
  loading: boolean;
  load: (force?: boolean) => Promise<void>;
  save: (id: string | null, input: { name: string; color: string; base: TaskStatus; active?: boolean; sortOrder?: number }) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useTaskStatusStore = create<StatusState>((set, get) => ({
  rows: FALLBACK,
  loaded: false,
  loading: false,
  load: async (force = false) => {
    if (get().loading || (get().loaded && !force)) return;
    set({ loading: true });
    try {
      const res = await tasksApi.getTaskStatuses();
      set({ rows: res.length ? res.map(fromDto) : FALLBACK, loaded: true, loading: false });
    } catch {
      set({ loaded: true, loading: false });
    }
  },
  save: async (id, input) => {
    const body = {
      name: input.name,
      color: input.color,
      baseStatus: statusToApi(input.base),
      active: input.active,
      sortOrder: input.sortOrder,
    };
    if (id) await tasksApi.updateTaskStatus(Number(id), body);
    else await tasksApi.createTaskStatus(body);
    await get().load(true);
  },
  remove: async (id) => {
    await tasksApi.deleteTaskStatus(Number(id));
    await get().load(true);
  },
}));

export function useTaskStatuses() {
  const rows = useTaskStatusStore((s) => s.rows);
  const load = useTaskStatusStore((s) => s.load);
  useEffect(() => {
    void load();
  }, [load]);

  const sorted = [...rows].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  const active = sorted.filter((r) => r.active);

  /** The label a task shows: its own status row, else the built-in one for its base state. */
  function rowFor(task: Pick<Task, "status" | "statusId">): StatusRow {
    const own = task.statusId ? rows.find((r) => r.id === task.statusId) : undefined;
    if (own && own.base === task.status) return own;
    return (
      rows.find((r) => r.system && r.base === task.status) ??
      FALLBACK.find((r) => r.base === task.status) ??
      FALLBACK[0]
    );
  }

  /** The built-in row for a base state (for sub-tasks, which carry only a base). */
  function rowForBase(base: TaskStatus): StatusRow {
    return rows.find((r) => r.system && r.base === base) ?? FALLBACK.find((r) => r.base === base) ?? FALLBACK[0];
  }

  /** Server ids only — the fallback rows have none, so they can't be sent as a statusId. */
  const isRealId = (id: string) => !id.startsWith("base:");

  return { rows: sorted, active, rowFor, rowForBase, isRealId };
}
