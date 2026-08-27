"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { BoqItem, BoqItemCalc, BoqTotals, ProjectBoq, Target, TargetStatus } from "./projectBoqTypes";
import type { TenderAnalysis } from "./tenderAnalysisTypes";
import { costRateOf, expenseAmount, groupedBoq } from "./tenderAnalysisCalc";

/**
 * A project's BOQ and its targets. UI-first and persisted locally, like the rest of the modules
 * that are ahead of the backend.
 *
 * <p>The interesting part is `createFromAnalysis` — the conversion that makes the tender module
 * worth having. Everything else here is ordinary editing on top of what it produces.
 */

const nowIso = () => new Date().toISOString();
const uid = (p: string) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/** What the handoff dialog collects. */
export interface HandoffOptions {
  /** Price the BOQ at the awarded rate (tender rate less the bid discount) or at the tender rate. */
  rateBasis: "AWARDED" | "TENDER";
  /** Carry the analysis's cost build-up across as the project budget. */
  carryCost: boolean;
  /** Create targets, and at what granularity. "NONE" creates the BOQ only. */
  targets: "PER_GROUP" | "PER_LINE" | "NONE";
  boqNo: string;
  clientName: string | null;
}

export const DEFAULT_HANDOFF: HandoffOptions = {
  rateBasis: "AWARDED",
  carryCost: true,
  targets: "PER_GROUP",
  boqNo: "",
  clientName: null,
};

export interface ProjectBoqState {
  boqs: ProjectBoq[];

  boqFor: (projectId: number) => ProjectBoq | null;
  /** Convert a won tender's analysis into a project BOQ (and its targets). Returns the new BOQ. */
  createFromAnalysis: (
    projectId: number,
    analysis: TenderAnalysis,
    opts: HandoffOptions,
  ) => ProjectBoq;
  removeBoq: (id: string) => void;

  updateItem: (boqId: string, itemId: string, patch: Partial<BoqItem>) => void;
  removeItem: (boqId: string, itemId: string) => void;
  addItem: (boqId: string) => void;

  /**
   * Build targets for a BOQ that has none — the recovery when a handover created the items but not
   * the targets, and the way to change your mind about granularity afterwards. Replaces whatever
   * targets exist, keeping any quantity already reported against a target of the same name.
   */
  generateTargets: (boqId: string, mode: "PER_GROUP" | "PER_LINE") => number;
  addTarget: (boqId: string, t: Omit<Target, "id" | "entries" | "doneQty">) => void;
  updateTarget: (boqId: string, targetId: string, patch: Partial<Target>) => void;
  removeTarget: (boqId: string, targetId: string) => void;
  /** Report a day's work against a target. This is how progress — and earned value — moves. */
  logProgress: (boqId: string, targetId: string, qty: number, note?: string, by?: string) => void;
  removeEntry: (boqId: string, targetId: string, entryId: string) => void;

  reset: () => void;
}

const editBoq = (
  set: (fn: (s: ProjectBoqState) => Partial<ProjectBoqState>) => void,
  boqId: string,
  fn: (b: ProjectBoq) => ProjectBoq,
) => set((s) => ({ boqs: s.boqs.map((b) => (b.id === boqId ? { ...fn(b), updatedAt: nowIso() } : b)) }));

export const useProjectBoqStore = create<ProjectBoqState>()(
  persist(
    (set, get) => ({
      boqs: [],

      boqFor: (projectId) => get().boqs.find((b) => b.projectId === projectId) ?? null,

      createFromAnalysis: (projectId, analysis, opts) => {
        const factor = opts.rateBasis === "AWARDED" ? 1 - analysis.bidPct / 100 : 1;
        const groups = groupedBoq(analysis.boqLines, analysis.groups);

        // Site overheads are the only cost the analysis does not hold on a line. Spread by value so
        // the project's budget still totals what the bid said the job would cost.
        const tenderValue = analysis.boqLines.reduce((sum, l) => sum + l.qty * l.rate, 0);
        const overheads = analysis.expenseLines.reduce((sum, e) => sum + expenseAmount(e, tenderValue), 0);
        const overheadShare = tenderValue > 0 ? overheads / tenderValue : 0;

        const items: BoqItem[] = [];
        for (const g of groups) {
          for (const { line } of g.lines) {
            items.push({
              id: uid("bi"),
              srNo: line.srNo,
              groupKey: g.key,
              groupLabel: g.label,
              description: line.description,
              qty: line.qty,
              unit: line.unit,
              saleRate: line.rate * factor,
              // The line's own material + labour + other, plus its share of the site overheads.
              costRate: opts.carryCost ? (costRateOf(line) ?? 0) + line.rate * overheadShare : 0,
              overheadRate: opts.carryCost ? line.rate * overheadShare : 0,
              targetId: null,
              sourceLineId: line.id,
            });
          }
        }

        const targets: Target[] = [];
        if (opts.targets === "PER_GROUP") {
          for (const g of groups) {
            const members = items.filter((i) => i.groupKey === g.key);
            if (members.length === 0) continue;
            // A family can mix units (supply in Rmt, fittings in Kg). Where it does, the target
            // counts lines complete rather than pretending the quantities add up.
            const units = new Set(members.map((m) => m.unit));
            const mixed = units.size > 1;
            const t: Target = {
              id: uid("tg"),
              name: g.label,
              unit: mixed ? "lines" : members[0].unit,
              targetQty: mixed ? members.length : members.reduce((s, m) => s + m.qty, 0),
              doneQty: 0,
              boqItemIds: members.map((m) => m.id),
              startDate: null,
              dueDate: null,
              assignee: null,
              entries: [],
            };
            targets.push(t);
            for (const m of members) m.targetId = t.id;
          }
        } else if (opts.targets === "PER_LINE") {
          for (const item of items) {
            const t: Target = {
              id: uid("tg"),
              name: item.description,
              unit: item.unit,
              targetQty: item.qty,
              doneQty: 0,
              boqItemIds: [item.id],
              startDate: null,
              dueDate: null,
              assignee: null,
              entries: [],
            };
            targets.push(t);
            item.targetId = t.id;
          }
        }

        const boq: ProjectBoq = {
          id: uid("pboq"),
          projectId,
          tenderRef: analysis.tenderRef,
          analysisId: analysis.id,
          title: analysis.title,
          clientName: opts.clientName,
          boqNo: opts.boqNo || `BOQ-${projectId}`,
          boqDate: nowIso().slice(0, 10),
          bidPct: opts.rateBasis === "AWARDED" ? analysis.bidPct : 0,
          items,
          targets,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        };

        // One BOQ per project — re-running the handoff replaces rather than duplicates, which is
        // what "create the project BOQ again" always means in practice.
        set((s) => ({ boqs: [boq, ...s.boqs.filter((b) => b.projectId !== projectId)] }));
        return boq;
      },

      removeBoq: (id) => set((s) => ({ boqs: s.boqs.filter((b) => b.id !== id) })),

      updateItem: (boqId, itemId, patch) =>
        editBoq(set, boqId, (b) => ({
          ...b,
          items: b.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)),
        })),

      removeItem: (boqId, itemId) =>
        editBoq(set, boqId, (b) => ({
          ...b,
          items: b.items.filter((i) => i.id !== itemId),
          targets: b.targets.map((t) => ({ ...t, boqItemIds: t.boqItemIds.filter((x) => x !== itemId) })),
        })),

      addItem: (boqId) =>
        editBoq(set, boqId, (b) => ({
          ...b,
          items: [
            ...b.items,
            {
              id: uid("bi"),
              srNo: String(b.items.length + 1),
              groupKey: "extra",
              groupLabel: "Additional items",
              description: "",
              qty: 0,
              unit: "No",
              saleRate: 0,
              costRate: 0,
              overheadRate: 0,
              targetId: null,
              sourceLineId: null,
            },
          ],
        })),

      generateTargets: (boqId, mode) => {
        const boq = get().boqs.find((b) => b.id === boqId);
        if (!boq) return 0;

        // Progress already reported is real work — carry it onto the target that replaces it.
        const doneByName = new Map(boq.targets.map((t) => [t.name, { doneQty: t.doneQty, entries: t.entries }]));
        const items = boq.items.map((i) => ({ ...i, targetId: null as string | null }));
        const targets: Target[] = [];

        const make = (name: string, unit: string, targetQty: number, members: BoqItem[]) => {
          const prior = doneByName.get(name);
          const t: Target = {
            id: uid("tg"),
            name,
            unit,
            targetQty,
            doneQty: Math.min(targetQty, prior?.doneQty ?? 0),
            boqItemIds: members.map((m) => m.id),
            startDate: null,
            dueDate: null,
            assignee: null,
            entries: prior?.entries ?? [],
          };
          targets.push(t);
          for (const m of members) m.targetId = t.id;
        };

        if (mode === "PER_LINE") {
          for (const item of items) make(item.description || item.srNo, item.unit, item.qty, [item]);
        } else {
          const order: string[] = [];
          const byGroup = new Map<string, BoqItem[]>();
          for (const i of items) {
            if (!byGroup.has(i.groupKey)) {
              byGroup.set(i.groupKey, []);
              order.push(i.groupKey);
            }
            byGroup.get(i.groupKey)!.push(i);
          }
          for (const key of order) {
            const members = byGroup.get(key)!;
            // A family can mix units (supply in Rmt, fittings in Kg). Where it does, count lines
            // complete rather than pretending the quantities add up.
            const mixed = new Set(members.map((m) => m.unit)).size > 1;
            make(
              members[0].groupLabel || members[0].description,
              mixed ? "lines" : members[0].unit,
              mixed ? members.length : members.reduce((s, m) => s + m.qty, 0),
              members,
            );
          }
        }

        editBoq(set, boqId, (b) => ({ ...b, items, targets }));
        return targets.length;
      },

      addTarget: (boqId, t) =>
        editBoq(set, boqId, (b) => {
          const target: Target = { ...t, id: uid("tg"), doneQty: 0, entries: [] };
          return {
            ...b,
            targets: [...b.targets, target],
            items: b.items.map((i) => (target.boqItemIds.includes(i.id) ? { ...i, targetId: target.id } : i)),
          };
        }),

      updateTarget: (boqId, targetId, patch) =>
        editBoq(set, boqId, (b) => ({
          ...b,
          targets: b.targets.map((t) => (t.id === targetId ? { ...t, ...patch } : t)),
          items: patch.boqItemIds
            ? b.items.map((i) => {
                if (patch.boqItemIds!.includes(i.id)) return { ...i, targetId };
                return i.targetId === targetId ? { ...i, targetId: null } : i;
              })
            : b.items,
        })),

      removeTarget: (boqId, targetId) =>
        editBoq(set, boqId, (b) => ({
          ...b,
          targets: b.targets.filter((t) => t.id !== targetId),
          items: b.items.map((i) => (i.targetId === targetId ? { ...i, targetId: null } : i)),
        })),

      logProgress: (boqId, targetId, qty, note, by) =>
        editBoq(set, boqId, (b) => ({
          ...b,
          targets: b.targets.map((t) =>
            t.id === targetId
              ? {
                  ...t,
                  // Clamped at the target: over-reporting a quantity is a measurement error, and
                  // letting it through would make earned value exceed the contract.
                  doneQty: Math.max(0, Math.min(t.targetQty, t.doneQty + qty)),
                  entries: [
                    { id: uid("te"), date: nowIso().slice(0, 10), qty, note: note ?? null, by: by ?? null },
                    ...t.entries,
                  ],
                }
              : t,
          ),
        })),

      removeEntry: (boqId, targetId, entryId) =>
        editBoq(set, boqId, (b) => ({
          ...b,
          targets: b.targets.map((t) => {
            if (t.id !== targetId) return t;
            const entry = t.entries.find((e) => e.id === entryId);
            if (!entry) return t;
            return {
              ...t,
              doneQty: Math.max(0, t.doneQty - entry.qty),
              entries: t.entries.filter((e) => e.id !== entryId),
            };
          }),
        })),

      reset: () => set({ boqs: [] }),
    }),
    {
      name: "hitech.projectBoq.v1",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ boqs: s.boqs }),
    },
  ),
);

/* ---------------- derivations ---------------- */

export function targetStatus(t: Target): TargetStatus {
  if (t.doneQty <= 0) return "NOT_STARTED";
  return t.doneQty >= t.targetQty ? "COMPLETED" : "IN_PROGRESS";
}

export function targetProgress(t: Target): number {
  return t.targetQty > 0 ? Math.min(1, t.doneQty / t.targetQty) : 0;
}

export function itemCalc(item: BoqItem, targets: Target[]): BoqItemCalc {
  const target = targets.find((t) => t.id === item.targetId) ?? null;
  const value = item.qty * item.saleRate;
  const cost = item.qty * item.costRate;
  const markup = item.saleRate - item.costRate;
  const progress = target ? targetProgress(target) : 0;
  return {
    item,
    value,
    cost,
    markup,
    markupPct: item.costRate > 0 ? (markup / item.costRate) * 100 : 0,
    progress,
    doneValue: value * progress,
    target,
  };
}

export function boqTotals(boq: ProjectBoq): BoqTotals {
  let value = 0;
  let cost = 0;
  let doneValue = 0;
  let lossCount = 0;

  for (const item of boq.items) {
    const c = itemCalc(item, boq.targets);
    value += c.value;
    cost += c.cost;
    doneValue += c.doneValue;
    if (item.costRate > 0 && item.saleRate < item.costRate) lossCount += 1;
  }

  const markup = value - cost;
  return {
    value,
    cost,
    markup,
    markupPct: value > 0 ? (markup / value) * 100 : 0,
    doneValue,
    // Value-weighted, not line-counted: finishing the cheap lines first is not half the job.
    progressPct: value > 0 ? (doneValue / value) * 100 : 0,
    itemCount: boq.items.length,
    lossCount,
    targetCount: boq.targets.length,
    targetsComplete: boq.targets.filter((t) => targetStatus(t) === "COMPLETED").length,
  };
}
