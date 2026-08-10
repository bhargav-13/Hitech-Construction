"use client";

import { create } from "zustand";
import type { Grn, Indent, PurchaseOrder, Rfq } from "./procurementTypes";
import { GRN_SEED, INDENT_SEED, PO_SEED, RFQ_SEED } from "./procurementTypes";

/**
 * UI-first store for the Procurement module (backend comes later, same as Tender/Payroll). Seeded
 * with demo data so the whole chain — Indent → RFQ → Comparison → PO → GRN — is walkable today.
 * Kept in-memory (no persist) while the module is a "Soon" demo: the seed is the story we tell, and
 * a reload should return to it. Swap the seeds for `hydrateFromBackend()` when procurement-service
 * lands, exactly like tenderStore did.
 */
interface ProcurementState {
  indents: Indent[];
  rfqs: Rfq[];
  pos: PurchaseOrder[];
  grns: Grn[];

  /** Award an RFQ to a vendor (Comparison screen) — marks it Awarded and stamps the winner. */
  awardRfq: (rfqId: string, vendor: string) => void;
  /** Approve or reject a Purchase Order (Orders screen). */
  setPoApproval: (poId: string, decision: "Approved" | "Rejected") => void;
}

export const useProcurementStore = create<ProcurementState>((set) => ({
  indents: INDENT_SEED,
  rfqs: RFQ_SEED,
  pos: PO_SEED,
  grns: GRN_SEED,

  awardRfq: (rfqId, vendor) =>
    set((s) => ({
      rfqs: s.rfqs.map((r) => (r.id === rfqId ? { ...r, status: "Awarded", awardedVendor: vendor } : r)),
    })),

  setPoApproval: (poId, decision) =>
    set((s) => ({
      pos: s.pos.map((p) =>
        p.id === poId
          ? {
              ...p,
              approval: decision,
              status: decision === "Approved" ? "Approved" : "Rejected",
            }
          : p,
      ),
    })),
}));
