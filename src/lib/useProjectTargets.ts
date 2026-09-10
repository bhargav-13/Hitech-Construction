"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import * as api from "./projectTargetApi";
import type { ApiBoqItem, ApiProjectBoq, ApiTarget, TargetStatus } from "./projectTargetApi";

/**
 * The Target screen's data: a project's BOQ lines and the targets measuring them.
 *
 * <p>Loads both together because neither is readable alone — a target's row shows the family and
 * rate of the line it measures, and a line with no target still has to appear so somebody can add
 * one.
 *
 * <p>Every mutator refetches rather than patching local state. The server applies rules the client
 * does not model (reporting the last of a quantity completes the target; deleting one frees the
 * dependencies that pointed at it), so the honest thing after a write is to ask what actually
 * happened.
 */

export interface UseProjectTargets {
  boq: ApiProjectBoq | null;
  targets: ApiTarget[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

export function useProjectTargets(projectId: number): UseProjectTargets {
  const [boq, setBoq] = useState<ApiProjectBoq | null>(null);
  const [targets, setTargets] = useState<ApiTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // A plain fetch that sets no state. Keeping the two apart is what lets the effect below update
  // state only from inside callbacks — the shape React wants, and the one that survives a slow
  // request outliving the screen that asked for it.
  const fetchAll = useCallback(async () => {
    const b = await api.getBoq(projectId);
    // No BOQ means no targets, and asking for them would 422. The screen shows a call to action.
    return { boq: b, targets: b ? await api.getTargets(projectId) : [] };
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    fetchAll()
      .then((r) => {
        if (cancelled) return;
        setBoq(r.boq);
        setTargets(r.targets);
        setError(null);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Couldn't load this project's targets.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchAll]);

  const reload = useCallback(async () => {
    try {
      const r = await fetchAll();
      setBoq(r.boq);
      setTargets(r.targets);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't reload this project's targets.");
    }
  }, [fetchAll]);

  return { boq, targets, loading, error, reload };
}

// ---------------------------------------------------------------- rows

export interface FamilyRow {
  kind: "family";
  key: string;
  label: string;
  lineCount: number;
  /** Contract value of the family's lines, and how much of it has been built. */
  value: number;
  doneValue: number;
  /** 0–1 by value. There is deliberately no summed quantity — see the note below. */
  progress: number;
}

export interface TargetRow {
  kind: "target";
  target: ApiTarget;
  item: ApiBoqItem;
  /** 0 for a target on its line, 1 for a subtask under it. */
  depth: 0 | 1;
  /** Contract value of the line, and the share of it this row has earned. */
  value: number;
  doneValue: number;
  subtaskCount: number;
}

/** A BOQ line that nobody has put a target on yet. */
export interface UntargetedRow {
  kind: "untargeted";
  item: ApiBoqItem;
  value: number;
}

export type Row = FamilyRow | TargetRow | UntargetedRow;

const valueOf = (i: ApiBoqItem) => (i.qty ?? 0) * (i.saleRate ?? 0);

/**
 * A family's progress is measured **by value, never by summed quantity**.
 *
 * <p>This is the whole reason targets moved to one-per-line. "3,026 of 25,000" across a family
 * holding cum, rmt and nos is not a quantity, it is three quantities added together — and the
 * percentage taken from it is meaningless. Money is the one unit every line shares, so a family
 * rolls up as earned value and only a line shows a quantity pill.
 */
export function buildRows(
  boq: ApiProjectBoq | null,
  targets: ApiTarget[],
  opts: { collapsed: Set<string>; status: "ALL" | TargetStatus; search: string; assignee: number | null },
): Row[] {
  if (!boq) return [];

  const byItem = new Map<number, ApiBoqItem>();
  boq.items.forEach((i) => byItem.set(i.id, i));

  const roots = targets.filter((t) => t.parentId === null);
  const childrenOf = new Map<number, ApiTarget[]>();
  for (const t of targets) {
    if (t.parentId === null) continue;
    const list = childrenOf.get(t.parentId) ?? [];
    list.push(t);
    childrenOf.set(t.parentId, list);
  }
  const rootByItem = new Map<number, ApiTarget>();
  roots.forEach((t) => rootByItem.set(t.boqItemId, t));

  const q = opts.search.trim().toLowerCase();
  const keep = (t: ApiTarget, item: ApiBoqItem) => {
    if (opts.status !== "ALL" && t.status !== opts.status) return false;
    if (opts.assignee !== null && !t.assignees.some((a) => a.userId === opts.assignee)) return false;
    if (q && !`${t.name} ${item.description} ${item.srNo}`.toLowerCase().includes(q)) return false;
    return true;
  };

  // Families come from the BOQ, in the order the BOQ lists them — a schedule that reorders itself
  // because of a filter is one nobody can find their way around.
  const families: { key: string; label: string; items: ApiBoqItem[] }[] = [];
  const seen = new Map<string, number>();
  for (const item of boq.items) {
    const key = item.groupKey || "—";
    let idx = seen.get(key);
    if (idx === undefined) {
      idx = families.length;
      seen.set(key, idx);
      families.push({ key, label: item.groupLabel || item.groupKey || "Ungrouped", items: [] });
    }
    families[idx].items.push(item);
  }

  const out: Row[] = [];
  for (const fam of families) {
    const visible: { item: ApiBoqItem; target: ApiTarget | undefined }[] = fam.items.map((item) => ({
      item,
      target: rootByItem.get(item.id),
    }));

    const matching = visible.filter(({ item, target }) => (target ? keep(target, item) : !q && opts.status === "ALL" && opts.assignee === null));
    if (matching.length === 0) continue;

    const value = fam.items.reduce((s, i) => s + valueOf(i), 0);
    const doneValue = fam.items.reduce((s, i) => {
      const t = rootByItem.get(i.id);
      if (!t || !t.targetQty) return s;
      return s + valueOf(i) * Math.min(1, t.doneQty / t.targetQty);
    }, 0);

    out.push({
      kind: "family",
      key: fam.key,
      label: fam.label,
      lineCount: fam.items.length,
      value,
      doneValue,
      progress: value > 0 ? doneValue / value : 0,
    });

    if (opts.collapsed.has(fam.key)) continue;

    for (const { item, target } of matching) {
      if (!target) {
        out.push({ kind: "untargeted", item, value: valueOf(item) });
        continue;
      }
      const share = target.targetQty > 0 ? Math.min(1, target.doneQty / target.targetQty) : 0;
      const kids = childrenOf.get(target.id) ?? [];
      out.push({
        kind: "target",
        target,
        item,
        depth: 0,
        value: valueOf(item),
        doneValue: valueOf(item) * share,
        subtaskCount: kids.length,
      });
      for (const kid of kids) {
        const kidShare = kid.targetQty > 0 ? Math.min(1, kid.doneQty / kid.targetQty) : 0;
        out.push({
          kind: "target",
          target: kid,
          item,
          depth: 1,
          // A subtask earns nothing of its own: its parent's line is billed once, and counting the
          // subtask separately would double the earned value of that line.
          value: 0,
          doneValue: 0,
          subtaskCount: 0,
        });
        void kidShare;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- derived bits

export const TARGET_STATUS_META: Record<TargetStatus, { label: string; dot: string; text: string; chip: string }> = {
  NOT_STARTED: { label: "Not started", dot: "bg-slate-400", text: "text-slate-500", chip: "bg-slate-100 text-slate-600" },
  IN_PROGRESS: { label: "Ongoing", dot: "bg-blue-500", text: "text-blue-600", chip: "bg-blue-50 text-blue-700" },
  ON_HOLD: { label: "On hold", dot: "bg-amber-500", text: "text-amber-700", chip: "bg-amber-50 text-amber-700" },
  COMPLETED: { label: "Completed", dot: "bg-emerald-500", text: "text-emerald-600", chip: "bg-emerald-50 text-emerald-700" },
};

/** Working days between two dates, Sundays excluded — the "wd" the site reads durations in. */
export function workingDays(from: string | null, to: string | null): number | null {
  if (!from || !to) return null;
  const a = new Date(from);
  const b = new Date(to);
  if (Number.isNaN(+a) || Number.isNaN(+b) || b < a) return null;
  let n = 0;
  for (const d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) if (d.getDay() !== 0) n += 1;
  return n;
}

export const shortDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" }) : null;

/**
 * Whether a target is behind.
 *
 * <p>Compares what is built against how much of its window has gone, rather than waiting for the
 * due date: a target 20% done with 80% of its time spent is in trouble even though nothing is
 * formally overdue yet, and that is the only point at which it can still be recovered.
 */
export function delayOf(t: ApiTarget): { label: string; tone: string } {
  if (t.status === "COMPLETED") return { label: "Done", tone: "text-emerald-600" };
  if (t.status === "ON_HOLD") return { label: "On hold", tone: "text-amber-700" };
  if (!t.startDate || !t.dueDate) return { label: "—", tone: "text-gray-300" };

  const start = +new Date(t.startDate);
  const end = +new Date(t.dueDate);
  const now = Date.now();
  if (now < start) return { label: "Not started", tone: "text-gray-400" };

  const done = t.targetQty > 0 ? t.doneQty / t.targetQty : 0;
  const elapsed = end > start ? (now - start) / (end - start) : 1;
  if (now > end && done < 1) return { label: "Overdue", tone: "text-rose-600" };
  // Ten points of slack before calling a target late; site work is lumpy day to day.
  return elapsed - done > 0.1
    ? { label: "At risk", tone: "text-amber-600" }
    : { label: "On track", tone: "text-emerald-600" };
}

/** Total days recorded against a target's delay log. */
export const delayDays = (t: ApiTarget) => t.delayLogs.reduce((s, d) => s + (d.days || 0), 0);

export function useTargetTotals(boq: ApiProjectBoq | null, targets: ApiTarget[]) {
  return useMemo(() => {
    if (!boq) return null;
    const roots = targets.filter((t) => t.parentId === null);
    const byItem = new Map<number, ApiTarget>();
    roots.forEach((t) => byItem.set(t.boqItemId, t));

    let value = 0;
    let doneValue = 0;
    for (const i of boq.items) {
      const v = valueOf(i);
      value += v;
      const t = byItem.get(i.id);
      if (t && t.targetQty > 0) doneValue += v * Math.min(1, t.doneQty / t.targetQty);
    }
    return {
      value,
      doneValue,
      progressPct: value > 0 ? (doneValue / value) * 100 : 0,
      total: roots.length,
      complete: roots.filter((t) => t.status === "COMPLETED").length,
      atRisk: roots.filter((t) => {
        const d = delayOf(t);
        return d.label === "At risk" || d.label === "Overdue";
      }).length,
      untargeted: boq.items.length - roots.length,
    };
  }, [boq, targets]);
}
