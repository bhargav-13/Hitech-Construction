"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  AnalysisScenario,
  BoqGroup,
  BoqLine,
  ExpenseLine,
  RateLibraryItem,
  TenderAnalysis,
} from "./tenderAnalysisTypes";
import { absorbIntoLibrary, familyLabel, findLibraryRate, srStem } from "./tenderAnalysisCalc";
import {
  ANALYSIS_BOQ_SEED,
  ANALYSIS_EXPENSE_SEED,
  ANALYSIS_GROUP_SEED,
  RATE_LIBRARY_SEED,
} from "./tenderAnalysisSeed";

/**
 * UI-first store for tender health analysis, same shape as the rest of the Tender module: seeded
 * from the client's workbook, persisted to localStorage, backend swapped in later.
 *
 * <p>The seed carries one complete analysis — the ₹20.90 Cr Rajkot Ward 8 job — because an empty
 * estimating screen teaches nobody anything, and because every figure in it can be checked against
 * the sheet it came from.
 */

/**
 * The tender the worked example belongs to.
 *
 * <p>Identified from the workbook rather than guessed: the "20cr" sheet totals ₹20,90,49,236, and
 * exactly one tender in the pipeline carries that estimate — 287517, Rajkot Municipal Corporation,
 * DI pipe lines and road restoration on Kalawad / Nirmala / Sahakar Main Road, Ward 8. Its recorded
 * variance is −0.1147, which is the same 11.47% the sheet's summary bids at. The sheet is that job.
 */
const SEED_TENDER_REF = "tnd-212";
const SEED_TENDER_ID = "287517";

const nowIso = () => new Date().toISOString();
const uid = (p: string) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

const SEED_ANALYSIS: TenderAnalysis = {
  id: "tan-001",
  tenderRef: SEED_TENDER_REF,
  tenderId: SEED_TENDER_ID,
  title: "DI Pipe Lines & Road Restoration — Ward 8, Rajkot",
  // What the client actually quoted on this job — the tender's own recorded variance.
  bidPct: 11.47,
  status: "DRAFT",
  boqLines: ANALYSIS_BOQ_SEED,
  groups: ANALYSIS_GROUP_SEED,
  expenseLines: ANALYSIS_EXPENSE_SEED,
  scenarios: [
    { id: "sc-1", name: "Aggressive", bidPct: 15 },
    { id: "sc-2", name: "Our bid", bidPct: 11.47 },
    { id: "sc-3", name: "Safe", bidPct: 8 },
  ],
  notes: null,
  createdAt: "2026-05-06T10:00:00+05:30",
  updatedAt: "2026-05-06T10:00:00+05:30",
};

/** Default site overheads for a new analysis — the percentages the client uses on every job. */
const DEFAULT_EXPENSES = (): ExpenseLine[] => [
  { id: uid("ex"), item: "Profit reserve", basis: "PCT_OF_TENDER", value: 5 },
  { id: uid("ex"), item: "Site supervision", basis: "PCT_OF_TENDER", value: 1.5 },
  { id: uid("ex"), item: "Overhead", basis: "PCT_OF_TENDER", value: 0 },
  { id: uid("ex"), item: "RMC cost", basis: "FLAT", value: 0 },
];

export interface AnalysisState {
  analyses: TenderAnalysis[];
  library: RateLibraryItem[];

  analysisFor: (tenderRef: string) => TenderAnalysis | null;
  /** Create an empty analysis against a tender, or return the one that already exists. */
  createAnalysis: (tenderRef: string, tenderId: string, title: string) => TenderAnalysis;
  removeAnalysis: (id: string) => void;
  patchAnalysis: (id: string, patch: Partial<TenderAnalysis>) => void;
  setBidPct: (id: string, bidPct: number) => void;

  addBoqLine: (id: string, line?: Partial<BoqLine>) => void;
  updateBoqLine: (id: string, lineId: string, patch: Partial<BoqLine>) => void;
  removeBoqLine: (id: string, lineId: string) => void;
  /** Replace the whole schedule — what an import means here. */
  importBoqLines: (id: string, lines: BoqLine[], groups: BoqGroup[]) => void;
  /** Pull a line's rates in from the rate library, matched on its description + unit. */
  applyLibraryRates: (id: string, lineId: string) => boolean;

  addExpenseLine: (id: string) => void;
  updateExpenseLine: (id: string, lineId: string, patch: Partial<ExpenseLine>) => void;
  removeExpenseLine: (id: string, lineId: string) => void;

  addScenario: (id: string, s: Omit<AnalysisScenario, "id">) => void;
  removeScenario: (id: string, scenarioId: string) => void;

  /** File this analysis's rates into the library so the next tender starts from them. */
  publishRates: (id: string) => void;
  updateLibraryItem: (libraryItemId: string, patch: Partial<RateLibraryItem>) => void;
  removeLibraryItem: (libraryItemId: string) => void;

  /** Re-point an analysis at its tender's current id (see findAnalysis). */
  rebind: (id: string, tenderRef: string) => void;

  reset: () => void;
}

/**
 * Keep the group list in step with the lines: drop families nothing points at any more, add ones
 * that appeared, and re-derive each label from its members.
 *
 * <p>Labels are re-derived rather than kept, because a family's name is only meaningful in terms of
 * what is in it — move a line out of "DI K7 pipe supply" and the name should stop claiming it.
 */
function rebuildGroups(lines: BoqLine[], existing: BoqGroup[]): BoqGroup[] {
  const order: string[] = [];
  const members = new Map<string, string[]>();

  for (const l of lines) {
    if (!members.has(l.groupKey)) {
      members.set(l.groupKey, []);
      order.push(l.groupKey);
    }
    members.get(l.groupKey)!.push(l.description);
  }

  return order.map((key) => {
    const descs = members.get(key)!;
    const prior = existing.find((g) => g.key === key);
    // A single-line family shows no header, so its label only matters once it has company.
    return { key, label: descs.length > 1 ? familyLabel(descs) : prior?.label ?? descs[0] ?? "New item" };
  });
}

/** Apply `fn` to one analysis and stamp `updatedAt`. Every mutation goes through here. */
const edit = (
  set: (fn: (s: AnalysisState) => Partial<AnalysisState>) => void,
  id: string,
  fn: (a: TenderAnalysis) => TenderAnalysis,
) =>
  set((s) => ({
    analyses: s.analyses.map((a) => (a.id === id ? { ...fn(a), updatedAt: nowIso() } : a)),
  }));

export const useAnalysisStore = create<AnalysisState>()(
  persist(
    (set, get) => ({
      analyses: [SEED_ANALYSIS],
      library: RATE_LIBRARY_SEED,

      analysisFor: (tenderRef) => get().analyses.find((a) => a.tenderRef === tenderRef) ?? null,

      createAnalysis: (tenderRef, tenderId, title) => {
        const existing = get().analyses.find((a) => a.tenderRef === tenderRef);
        if (existing) return existing;
        const a: TenderAnalysis = {
          id: uid("tan"),
          tenderRef,
          tenderId,
          title,
          bidPct: 0,
          status: "DRAFT",
          boqLines: [],
          groups: [],
          expenseLines: DEFAULT_EXPENSES(),
          scenarios: [],
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        };
        set((s) => ({ analyses: [a, ...s.analyses] }));
        return a;
      },

      removeAnalysis: (id) => set((s) => ({ analyses: s.analyses.filter((a) => a.id !== id) })),

      patchAnalysis: (id, patch) => edit(set, id, (a) => ({ ...a, ...patch })),

      setBidPct: (id, bidPct) => edit(set, id, (a) => ({ ...a, bidPct })),

      addBoqLine: (id, line) =>
        edit(set, id, (a) => {
          const lineId = uid("bl");
          const srNo = line?.srNo ?? String(a.boqLines.length + 1);
          // File the new line by its Sr number, so "7b" lands under the same family as "7a".
          const sibling = a.boqLines.find((l) => srStem(l.srNo) === srStem(srNo));
          const groupKey = line?.groupKey ?? sibling?.groupKey ?? `g-${lineId}`;
          const boqLines = [
            ...a.boqLines,
            {
              description: "",
              qty: 0,
              unit: "No",
              rate: 0,
              materialRate: null,
              labourRate: null,
              otherRate: null,
              ...line,
              // The caller supplies content; identity and filing are decided here.
              id: lineId,
              srNo,
              groupKey,
            },
          ];
          return { ...a, boqLines, groups: rebuildGroups(boqLines, a.groups) };
        }),

      updateBoqLine: (id, lineId, patch) =>
        edit(set, id, (a) => {
          const boqLines = a.boqLines.map((l) => (l.id === lineId ? { ...l, ...patch } : l));

          // Editing the Sr number re-files the line. Lines sharing a main serial ("7", "7a", "7b")
          // become one family, which is how the client's schedule already reads — so there is no
          // separate "create a group" step to learn.
          if (patch.srNo != null) {
            const line = boqLines.find((l) => l.id === lineId)!;
            const stem = srStem(line.srNo);
            const sibling = boqLines.find((l) => l.id !== lineId && srStem(l.srNo) === stem);
            line.groupKey = sibling ? sibling.groupKey : `g-${lineId}`;
          }

          return { ...a, boqLines, groups: rebuildGroups(boqLines, a.groups) };
        }),

      removeBoqLine: (id, lineId) =>
        edit(set, id, (a) => {
          const boqLines = a.boqLines.filter((l) => l.id !== lineId);
          return { ...a, boqLines, groups: rebuildGroups(boqLines, a.groups) };
        }),

      importBoqLines: (id, lines, groups) => edit(set, id, (a) => ({ ...a, boqLines: lines, groups })),

      applyLibraryRates: (id, lineId) => {
        const a = get().analyses.find((x) => x.id === id);
        const line = a?.boqLines.find((l) => l.id === lineId);
        if (!a || !line) return false;
        const hit = findLibraryRate(get().library, line.description, line.unit);
        if (!hit) return false;
        // Only fill what the library actually knows — a null there must not wipe a rate the user typed.
        get().updateBoqLine(id, lineId, {
          materialRate: hit.materialRate ?? line.materialRate,
          labourRate: hit.labourRate ?? line.labourRate,
          otherRate: hit.otherRate ?? line.otherRate,
          libraryItemId: hit.id,
        });
        return true;
      },

      addExpenseLine: (id) =>
        edit(set, id, (a) => ({
          ...a,
          expenseLines: [...a.expenseLines, { id: uid("ex"), item: "", basis: "PCT_OF_TENDER", value: 0 }],
        })),

      updateExpenseLine: (id, lineId, patch) =>
        edit(set, id, (a) => ({
          ...a,
          expenseLines: a.expenseLines.map((e) => (e.id === lineId ? { ...e, ...patch } : e)),
        })),

      removeExpenseLine: (id, lineId) =>
        edit(set, id, (a) => ({ ...a, expenseLines: a.expenseLines.filter((e) => e.id !== lineId) })),

      addScenario: (id, s) =>
        edit(set, id, (a) => ({ ...a, scenarios: [...a.scenarios, { id: uid("sc"), ...s }] })),

      removeScenario: (id, scenarioId) =>
        edit(set, id, (a) => ({ ...a, scenarios: a.scenarios.filter((s) => s.id !== scenarioId) })),

      publishRates: (id) => {
        const a = get().analyses.find((x) => x.id === id);
        if (!a) return;
        set((s) => ({ library: absorbIntoLibrary(s.library, a, nowIso()) }));
      },

      updateLibraryItem: (libraryItemId, patch) =>
        set((s) => ({ library: s.library.map((x) => (x.id === libraryItemId ? { ...x, ...patch } : x)) })),

      removeLibraryItem: (libraryItemId) =>
        set((s) => ({ library: s.library.filter((x) => x.id !== libraryItemId) })),

      rebind: (id, tenderRef) =>
        set((s) => ({ analyses: s.analyses.map((a) => (a.id === id ? { ...a, tenderRef } : a)) })),

      reset: () => set({ analyses: [SEED_ANALYSIS], library: RATE_LIBRARY_SEED }),
    }),
    {
      // Bump on every schema change — persisted state otherwise shadows a regenerated seed.
      name: "hitech.tenderAnalysis.v3",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ analyses: s.analyses, library: s.library }),
    },
  ),
);

/**
 * Find the analysis belonging to a tender.
 *
 * <p>Matching on `tenderRef` alone is not enough. `hydrateFromBackend` replaces the whole tender
 * list with backend rows, whose ids are assigned by the server — so any analysis written against a
 * locally-seeded id is orphaned the moment the backend comes up. The portal tender number survives
 * that round trip, so it is the fallback key.
 */
export function findAnalysis(
  analyses: TenderAnalysis[],
  tender: { id: string; tenderId?: string | null } | string,
): TenderAnalysis | null {
  if (typeof tender === "string") return analyses.find((a) => a.tenderRef === tender) ?? null;
  const byRef = analyses.find((a) => a.tenderRef === tender.id);
  if (byRef) return byRef;
  const num = (tender.tenderId ?? "").trim();
  if (!num) return null;
  return analyses.find((a) => a.tenderId.trim() === num) ?? null;
}
