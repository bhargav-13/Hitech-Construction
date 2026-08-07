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
  TrackerStep,
  DocPair,
  HardcopyDispatch,
  MaterialParty,
} from "./tenderTypes";
import { MILESTONE_STEPS, DOCUMENT_STEPS } from "./tenderTypes";
import { taddMonths, tiso } from "./tenderHelpers";
import { TENDER_SEED, MATERIAL_SEED, MILESTONE_SEED, DOCUMENT_SEED, HARDCOPY_SEED } from "./tenderSeed";
import {
  listTenders,
  createTenderApi,
  updateTenderApi,
  deleteTenderApi,
  listMilestonesApi,
  createMilestoneApi,
  updateMilestoneApi,
  deleteMilestoneApi,
  listDocumentsApi,
  createDocumentApi,
  updateDocumentApi,
  deleteDocumentApi,
  listHardcopyApi,
  createHardcopyApi,
  updateHardcopyApi,
  deleteHardcopyApi,
  listMaterialsApi,
} from "./tenderApi";

/** Log-and-swallow: backend persistence is best-effort so the UI never blocks on it. */
const warn = (msg: string) => (e: unknown) => console.warn(msg, e);

/** Push the current state of a record to the backend (best-effort). No-op in local/offline mode. */
const persistTender = (get: () => TenderState, id: string) => {
  if (!get().backend) return;
  const t = get().tenders.find((x) => x.id === id);
  if (t) updateTenderApi(id, t).catch(warn("Tender update failed to sync"));
};
const persistMilestone = (get: () => TenderState, id: string) => {
  if (!get().backend) return;
  const m = get().milestones.find((x) => x.id === id);
  if (m) updateMilestoneApi(id, m).catch(warn("Milestone update failed to sync"));
};
const persistDocument = (get: () => TenderState, id: string) => {
  if (!get().backend) return;
  const d = get().documents.find((x) => x.id === id);
  if (d) updateDocumentApi(id, d).catch(warn("Document update failed to sync"));
};

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

/** Generate a collision-safe key for a user-added tracker step. */
const newStepKey = () => `tstep-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/** Insert `item` into `list` at `index` (clamped); index beyond the end appends. */
function insertAt<T>(list: T[], item: T, index: number): T[] {
  const i = Math.max(0, Math.min(index, list.length));
  return [...list.slice(0, i), item, ...list.slice(i)];
}

interface TenderState {
  tenders: Tender[];
  materials: MaterialParty[];
  milestones: TenderMilestones[];
  documents: TenderDocuments[];
  /** Editable column sets for the Status / Documentation trackers (add anywhere, rename, remove). */
  milestoneSteps: TrackerStep[];
  documentSteps: TrackerStep[];
  hardcopy: HardcopyDispatch[];
  /** User-added closed-lost reasons, on top of the built-in enum. Shown in the loss-reason picker. */
  customLossReasons: string[];
  /**
   * Conversions into the Project module. Starts empty — Tender keeps no project list of its own;
   * `/project` owns execution. These rows are the audit trail of what was pushed across.
   */
  handoffs: TenderHandoff[];
  /** Last reversible mutation. Cleared once consumed or superseded. */
  lastUndo: UndoEntry | null;
  /** True once data has been loaded from the backend — mutations then write through to the API. */
  backend: boolean;
  /** Load tenders + trackers from the backend, replacing seed/local data. No-op (stays local) if it fails. */
  hydrateFromBackend: () => Promise<void>;

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
  toggleMilestone: (id: string, key: string) => void;
  /** Toggle a document's soft/hard availability. */
  toggleDocument: (id: string, key: string, copy: keyof DocPair, raIndex?: number) => void;
  /** Add a milestone step at `atIndex` (append if omitted / out of range). */
  addMilestoneStep: (label: string, atIndex?: number) => void;
  removeMilestoneStep: (key: string) => void;
  renameMilestoneStep: (key: string, label: string) => void;
  /** Add a document type at `atIndex` (append if omitted / out of range). */
  addDocumentStep: (label: string, atIndex?: number) => void;
  removeDocumentStep: (key: string) => void;
  renameDocumentStep: (key: string, label: string) => void;
  /** Append another running-account bill — the workbook's five columns were never the real limit. */
  addRaBill: (id: string) => void;
  /** Status-tracker (milestone) records — add / edit identity / remove. */
  addMilestone: (m: TenderMilestones) => void;
  updateMilestone: (id: string, patch: Partial<TenderMilestones>) => void;
  removeMilestone: (id: string) => void;
  /** Documentation-tracker records — add / edit identity / remove. */
  addDocument: (d: TenderDocuments) => void;
  updateDocument: (id: string, patch: Partial<TenderDocuments>) => void;
  removeDocument: (id: string) => void;
  /** Hardcopy dispatch records — add / edit / remove. */
  addHardcopy: (h: HardcopyDispatch) => void;
  updateHardcopy: (id: string, patch: Partial<HardcopyDispatch>) => void;
  removeHardcopy: (id: string) => void;
  /** Register a user-added closed-lost reason (deduped, case-insensitive). */
  addLossReason: (label: string) => void;
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
      milestoneSteps: MILESTONE_STEPS,
      documentSteps: DOCUMENT_STEPS,
      hardcopy: HARDCOPY_SEED,
      customLossReasons: [],
      handoffs: [],
      lastUndo: null,
      backend: false,

      hydrateFromBackend: async () => {
        try {
          const [tenders, milestones, documents, hardcopy, materials] = await Promise.all([
            listTenders(),
            listMilestonesApi(),
            listDocumentsApi(),
            listHardcopyApi(),
            listMaterialsApi(),
          ]);
          set({ tenders, milestones, documents, hardcopy, materials, backend: true, lastUndo: null });
        } catch (e) {
          // Backend unreachable / not logged in — keep the seeded local data (offline-friendly).
          warn("Tender backend unavailable — using local data")(e);
        }
      },

      setStage: (id, stage, status, patch) => {
        set((s) => ({
          lastUndo: snapshot(s.tenders, new Set([id]), "Stage change"),
          tenders: s.tenders.map((t) =>
            t.id === id ? { ...t, ...patch, stage, status: status ?? t.status } : t,
          ),
        }));
        persistTender(get, id);
      },

      setStatus: (id, status, patch) => {
        set((s) => ({
          lastUndo: snapshot(s.tenders, new Set([id]), "Status change"),
          tenders: s.tenders.map((t) =>
            t.id === id ? { ...t, ...patch, status, stage: STATUS_TO_STAGE[status] } : t,
          ),
        }));
        persistTender(get, id);
      },

      setStageBulk: (ids, stage, status, patch) => {
        set((s) => {
          const idSet = new Set(ids);
          return {
            lastUndo: snapshot(s.tenders, idSet, `${ids.length} tenders moved`),
            tenders: s.tenders.map((t) =>
              idSet.has(t.id) ? { ...t, ...patch, stage, status: status ?? t.status } : t,
            ),
          };
        });
        if (get().backend) ids.forEach((id) => persistTender(get, id));
      },

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

      addTender: (t) => {
        set((s) => ({ tenders: [t, ...s.tenders] }));
        if (get().backend) {
          createTenderApi(t)
            // Swap the temp local id for the backend-assigned one so later edits address the right row.
            .then((saved) => set((s) => ({ tenders: s.tenders.map((x) => (x.id === t.id ? saved : x)) })))
            .catch(warn("Tender create failed to sync"));
        }
      },

      updateTender: (id, patch) => {
        set((s) => ({
          lastUndo: snapshot(s.tenders, new Set([id]), "Edit"),
          tenders: s.tenders.map((t) => (t.id === id ? { ...t, ...patch } : t)),
        }));
        persistTender(get, id);
      },

      removeTender: (id) => {
        set((s) => ({
          lastUndo: snapshot(s.tenders, new Set([id]), "Delete"),
          tenders: s.tenders.filter((t) => t.id !== id),
        }));
        if (get().backend) deleteTenderApi(id).catch(warn("Tender delete failed to sync"));
      },

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

      toggleMilestone: (id, key) => {
        set((s) => ({
          // Custom steps start undefined on existing rows, so treat anything but `true` as "off".
          milestones: s.milestones.map((m) => (m.id === id ? { ...m, [key]: m[key] !== true } : m)),
        }));
        persistMilestone(get, id);
      },

      toggleDocument: (id, key, copy, raIndex) => {
        set((s) => ({
          documents: s.documents.map((d) => {
            if (d.id !== id) return d;
            if (key === "raBills" && raIndex != null) {
              const raBills = d.raBills.map((p, i) => (i === raIndex ? { ...p, [copy]: !p[copy] } : p));
              return { ...d, raBills };
            }
            // A custom document type has no pair yet on older rows — default it to both-off, then flip.
            const pair = (d[key] as DocPair | undefined) ?? { soft: false, hard: false };
            return { ...d, [key]: { ...pair, [copy]: !pair[copy] } };
          }),
        }));
        persistDocument(get, id);
      },

      addMilestoneStep: (label, atIndex) =>
        set((s) => ({
          milestoneSteps: insertAt(s.milestoneSteps, { key: newStepKey(), label: label.trim() || "New step" }, atIndex ?? s.milestoneSteps.length),
        })),
      removeMilestoneStep: (key) =>
        set((s) => ({ milestoneSteps: s.milestoneSteps.filter((st) => st.key !== key) })),
      renameMilestoneStep: (key, label) =>
        set((s) => ({ milestoneSteps: s.milestoneSteps.map((st) => (st.key === key ? { ...st, label } : st)) })),

      addDocumentStep: (label, atIndex) =>
        set((s) => ({
          documentSteps: insertAt(s.documentSteps, { key: newStepKey(), label: label.trim() || "New document" }, atIndex ?? s.documentSteps.length),
        })),
      removeDocumentStep: (key) =>
        set((s) => ({ documentSteps: s.documentSteps.filter((st) => st.key !== key) })),
      renameDocumentStep: (key, label) =>
        set((s) => ({ documentSteps: s.documentSteps.map((st) => (st.key === key ? { ...st, label } : st)) })),

      addRaBill: (id) => {
        set((s) => ({
          documents: s.documents.map((d) =>
            d.id === id ? { ...d, raBills: [...d.raBills, { soft: false, hard: false }] } : d,
          ),
        }));
        persistDocument(get, id);
      },

      addMilestone: (m) => {
        set((s) => ({ milestones: [{ ...m }, ...s.milestones] }));
        if (get().backend) {
          createMilestoneApi(m)
            .then((saved) => set((s) => ({ milestones: s.milestones.map((x) => (x.id === m.id ? saved : x)) })))
            .catch(warn("Milestone create failed to sync"));
        }
      },
      updateMilestone: (id, patch) => {
        set((s) => ({ milestones: s.milestones.map((m) => (m.id === id ? { ...m, ...patch } : m)) }));
        persistMilestone(get, id);
      },
      removeMilestone: (id) => {
        set((s) => ({ milestones: s.milestones.filter((m) => m.id !== id) }));
        if (get().backend) deleteMilestoneApi(id).catch(warn("Milestone delete failed to sync"));
      },

      addDocument: (d) => {
        set((s) => ({ documents: [{ ...d }, ...s.documents] }));
        if (get().backend) {
          createDocumentApi(d)
            .then((saved) => set((s) => ({ documents: s.documents.map((x) => (x.id === d.id ? saved : x)) })))
            .catch(warn("Document create failed to sync"));
        }
      },
      updateDocument: (id, patch) => {
        set((s) => ({ documents: s.documents.map((d) => (d.id === id ? { ...d, ...patch } : d)) }));
        persistDocument(get, id);
      },
      removeDocument: (id) => {
        set((s) => ({ documents: s.documents.filter((d) => d.id !== id) }));
        if (get().backend) deleteDocumentApi(id).catch(warn("Document delete failed to sync"));
      },

      addHardcopy: (h) => {
        set((s) => ({ hardcopy: [{ ...h }, ...s.hardcopy] }));
        if (get().backend) {
          createHardcopyApi(h)
            .then((saved) => set((s) => ({ hardcopy: s.hardcopy.map((x) => (x.id === h.id ? saved : x)) })))
            .catch(warn("Hardcopy create failed to sync"));
        }
      },
      updateHardcopy: (id, patch) => {
        set((s) => ({ hardcopy: s.hardcopy.map((h) => (h.id === id ? { ...h, ...patch } : h)) }));
        if (get().backend) {
          const h = get().hardcopy.find((x) => x.id === id);
          if (h) updateHardcopyApi(id, h).catch(warn("Hardcopy update failed to sync"));
        }
      },
      removeHardcopy: (id) => {
        set((s) => ({ hardcopy: s.hardcopy.filter((h) => h.id !== id) }));
        if (get().backend) deleteHardcopyApi(id).catch(warn("Hardcopy delete failed to sync"));
      },

      addLossReason: (label) =>
        set((s) => {
          const clean = label.trim();
          if (!clean) return {};
          const exists = s.customLossReasons.some((r) => r.toLowerCase() === clean.toLowerCase());
          return exists ? {} : { customLossReasons: [...s.customLossReasons, clean] };
        }),

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
          milestoneSteps: MILESTONE_STEPS,
          documentSteps: DOCUMENT_STEPS,
          hardcopy: HARDCOPY_SEED,
          customLossReasons: [],
          handoffs: [],
          lastUndo: null,
        }),
    }),
    {
      // Bump on every schema change — persisted state otherwise shadows a regenerated seed.
      name: "hitech.tender.v6",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        tenders: s.tenders,
        materials: s.materials,
        milestones: s.milestones,
        documents: s.documents,
        milestoneSteps: s.milestoneSteps,
        documentSteps: s.documentSteps,
        hardcopy: s.hardcopy,
        customLossReasons: s.customLossReasons,
        handoffs: s.handoffs,
      }),
    },
  ),
);
