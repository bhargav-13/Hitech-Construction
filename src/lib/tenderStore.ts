"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  Tender,
  TenderStage,
  TenderStatus,
  TenderMilestones,
  TenderDocuments,
  TenderHandoff,
  TenderAttachment,
  DocPair,
  HardcopyDispatch,
  MaterialParty,
} from "./tenderTypes";
import { taddMonths, tiso } from "./tenderHelpers";
import { TENDER_SEED, MATERIAL_SEED, MILESTONE_SEED, DOCUMENT_SEED, HARDCOPY_SEED } from "./tenderSeed";

/**
 * UI-first store for the Tender module (backend comes later, same as Payroll). Seeded from the
 * client's tender-analysis workbook and persisted to localStorage so edits survive reloads while
 * we iterate on the UI. Bump the persist `name` version to force a reseed after schema changes.
 */

/** One undoable step. Only the affected rows are snapshotted, so this stays cheap on 228 tenders. */
export interface UndoEntry {
  label: string;
  tenders: Tender[];
}

export interface ImportResult {
  added: number;
  updated: number;
  skipped: number;
}

interface TenderState {
  tenders: Tender[];
  materials: MaterialParty[];
  milestones: TenderMilestones[];
  documents: TenderDocuments[];
  hardcopy: HardcopyDispatch[];
  /**
   * Conversions into the Project module. Starts empty — Tender keeps no project list of its own;
   * `/project` owns execution. These rows are the audit trail of what was pushed across.
   */
  handoffs: TenderHandoff[];
  /** Last reversible mutation. Cleared once consumed or superseded. */
  lastUndo: UndoEntry | null;

  /** Move a tender to a new stage (e.g. shortlist from research, or mark applied). */
  setStage: (id: string, stage: TenderStage, status?: TenderStatus | null, patch?: Partial<Tender>) => void;
  /** Record an applied tender's outcome status; stage is derived from it. */
  setStatus: (id: string, status: TenderStatus, patch?: Partial<Tender>) => void;
  /** Move many tenders at once — the sorting screen is 120+ rows, one-at-a-time is unusable. */
  setStageBulk: (ids: string[], stage: TenderStage, status?: TenderStatus | null, patch?: Partial<Tender>) => void;
  /** Link a won tender to the Project created from it, recording what was pushed across. */
  linkProject: (id: string, projectId: number, patch?: Partial<TenderHandoff>) => void;
  /** The payload a tender would hand to the Project module — shared by the store and the UI. */
  handoffPayloadFor: (id: string) => TenderHandoff | null;
  addTender: (t: Tender) => void;
  updateTender: (id: string, patch: Partial<Tender>) => void;
  removeTender: (id: string) => void;
  /** Merge imported rows, matching on tenderId. Existing rows are patched, new ones appended. */
  importTenders: (rows: Tender[], mode: "merge" | "replace") => ImportResult;
  /** Toggle a milestone step for a tender's tracker row. */
  toggleMilestone: (id: string, key: keyof TenderMilestones) => void;
  /** Toggle a document's soft/hard availability. */
  toggleDocument: (id: string, key: string, copy: keyof DocPair, raIndex?: number) => void;
  /** Append another running-account bill — the workbook's five columns were never the real limit. */
  addRaBill: (id: string) => void;
  addAttachment: (id: string, file: TenderAttachment) => void;
  removeAttachment: (id: string, attachmentId: string) => void;
  undo: () => void;
  clearUndo: () => void;
  reset: () => void;
}

const STATUS_TO_STAGE: Record<TenderStatus, TenderStage> = {
  SUBMITTED: "APPLIED",
  TECH_OPENED: "APPLIED",
  TECH_QUALIFIED: "APPLIED",
  RETENDERED: "APPLIED",
  TECH_DISQUALIFIED: "LOST",
  LOST: "LOST",
  CANCELLED: "LOST",
  WON: "WON",
  COMPLETED: "WON",
};

/** Snapshot the rows a mutation is about to touch, so `undo` can put them back verbatim. */
const snapshot = (tenders: Tender[], ids: Set<string>, label: string): UndoEntry => ({
  label,
  tenders: tenders.filter((t) => ids.has(t.id)).map((t) => ({ ...t })),
});

export const useTenderStore = create<TenderState>()(
  persist(
    (set, get) => ({
      tenders: TENDER_SEED,
      materials: MATERIAL_SEED,
      milestones: MILESTONE_SEED,
      documents: DOCUMENT_SEED,
      hardcopy: HARDCOPY_SEED,
      handoffs: [],
      lastUndo: null,

      setStage: (id, stage, status, patch) =>
        set((s) => ({
          lastUndo: snapshot(s.tenders, new Set([id]), "Stage change"),
          tenders: s.tenders.map((t) =>
            t.id === id ? { ...t, ...patch, stage, status: status ?? t.status } : t,
          ),
        })),

      setStatus: (id, status, patch) =>
        set((s) => ({
          lastUndo: snapshot(s.tenders, new Set([id]), "Status change"),
          tenders: s.tenders.map((t) =>
            t.id === id ? { ...t, ...patch, status, stage: STATUS_TO_STAGE[status] } : t,
          ),
        })),

      setStageBulk: (ids, stage, status, patch) =>
        set((s) => {
          const idSet = new Set(ids);
          return {
            lastUndo: snapshot(s.tenders, idSet, `${ids.length} tenders moved`),
            tenders: s.tenders.map((t) =>
              idSet.has(t.id) ? { ...t, ...patch, stage, status: status ?? t.status } : t,
            ),
          };
        }),

      handoffPayloadFor: (id) => {
        const t = get().tenders.find((x) => x.id === id);
        if (!t) return null;
        const workOrderDate = tiso(new Date());
        return {
          id: `hnd-${id}`,
          tenderRef: t.id,
          tenderId: t.tenderId,
          projectId: t.projectId ?? null,
          nameOfWork: t.nameOfWork ?? null,
          clientName: t.department ?? null,
          location: t.location ?? null,
          contractValue: t.contractValue ?? t.estimatedCost ?? null,
          workOrderDate,
          completionPeriod: t.duration ?? null,
          completionDate: t.durationMonths != null ? taddMonths(workOrderDate, t.durationMonths) : null,
          status: "IN_PROGRESS",
          handedOverAt: workOrderDate,
          synced: false,
        };
      },

      linkProject: (id, projectId, patch) =>
        set((s) => {
          const t = s.tenders.find((x) => x.id === id);
          if (!t) return {};
          const base = get().handoffPayloadFor(id);
          if (!base) return {};
          const handoff: TenderHandoff = { ...base, projectId, ...patch };
          return {
            tenders: s.tenders.map((x) => (x.id === id ? { ...x, projectId } : x)),
            handoffs: [handoff, ...s.handoffs.filter((h) => h.tenderRef !== id)],
          };
        }),

      addTender: (t) => set((s) => ({ tenders: [t, ...s.tenders] })),

      updateTender: (id, patch) =>
        set((s) => ({
          lastUndo: snapshot(s.tenders, new Set([id]), "Edit"),
          tenders: s.tenders.map((t) => (t.id === id ? { ...t, ...patch } : t)),
        })),

      removeTender: (id) =>
        set((s) => ({
          lastUndo: snapshot(s.tenders, new Set([id]), "Delete"),
          tenders: s.tenders.filter((t) => t.id !== id),
        })),

      importTenders: (rows, mode) => {
        const result: ImportResult = { added: 0, updated: 0, skipped: 0 };
        if (mode === "replace") {
          set({ tenders: rows, lastUndo: null });
          result.added = rows.length;
          return result;
        }
        const current = get().tenders;
        const byTenderId = new Map(current.filter((t) => t.tenderId).map((t) => [t.tenderId, t]));
        const next = [...current];
        for (const row of rows) {
          const existing = row.tenderId ? byTenderId.get(row.tenderId) : undefined;
          if (existing) {
            const i = next.findIndex((t) => t.id === existing.id);
            // Keep our own id, stage and any outcome intelligence the sheet does not carry.
            const merged = { ...next[i], ...row, id: next[i].id, stage: next[i].stage };
            if (JSON.stringify(merged) === JSON.stringify(next[i])) result.skipped += 1;
            else {
              next[i] = merged;
              result.updated += 1;
            }
          } else {
            next.unshift(row);
            result.added += 1;
          }
        }
        set({ tenders: next, lastUndo: null });
        return result;
      },

      toggleMilestone: (id, key) =>
        set((s) => ({
          milestones: s.milestones.map((m) =>
            m.id === id && typeof m[key] === "boolean" ? { ...m, [key]: !m[key] } : m,
          ),
        })),

      toggleDocument: (id, key, copy, raIndex) =>
        set((s) => ({
          documents: s.documents.map((d) => {
            if (d.id !== id) return d;
            if (key === "raBills" && raIndex != null) {
              const raBills = d.raBills.map((p, i) => (i === raIndex ? { ...p, [copy]: !p[copy] } : p));
              return { ...d, raBills };
            }
            const pair = d[key as keyof TenderDocuments] as DocPair | undefined;
            if (!pair || typeof pair.soft !== "boolean") return d;
            return { ...d, [key]: { ...pair, [copy]: !pair[copy] } };
          }),
        })),

      addRaBill: (id) =>
        set((s) => ({
          documents: s.documents.map((d) =>
            d.id === id ? { ...d, raBills: [...d.raBills, { soft: false, hard: false }] } : d,
          ),
        })),

      addAttachment: (id, file) =>
        set((s) => ({
          tenders: s.tenders.map((t) =>
            t.id === id ? { ...t, attachments: [...(t.attachments ?? []), file] } : t,
          ),
        })),

      removeAttachment: (id, attachmentId) =>
        set((s) => ({
          tenders: s.tenders.map((t) =>
            t.id === id
              ? { ...t, attachments: (t.attachments ?? []).filter((a) => a.id !== attachmentId) }
              : t,
          ),
        })),

      undo: () =>
        set((s) => {
          if (!s.lastUndo) return {};
          const restored = new Map(s.lastUndo.tenders.map((t) => [t.id, t]));
          return {
            tenders: s.tenders.map((t) => restored.get(t.id) ?? t),
            lastUndo: null,
          };
        }),

      clearUndo: () => set({ lastUndo: null }),

      reset: () =>
        set({
          tenders: TENDER_SEED,
          materials: MATERIAL_SEED,
          milestones: MILESTONE_SEED,
          documents: DOCUMENT_SEED,
          hardcopy: HARDCOPY_SEED,
          handoffs: [],
          lastUndo: null,
        }),
    }),
    {
      // Bump on every schema change — persisted state otherwise shadows a regenerated seed.
      name: "hitech.tender.v5",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        tenders: s.tenders,
        materials: s.materials,
        milestones: s.milestones,
        documents: s.documents,
        hardcopy: s.hardcopy,
        handoffs: s.handoffs,
      }),
    },
  ),
);
