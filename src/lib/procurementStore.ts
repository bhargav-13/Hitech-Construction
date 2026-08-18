"use client";

import { create } from "zustand";
import type { Rfq } from "./procurementTypes";
import { RFQ_SEED } from "./procurementTypes";

/**
 * UI-first store for RFQ and Comparison, still seeded (see the header of procurementTypes).
 *
 * Everything else the module used to hold — indents, purchase orders, goods receipts, vendors — has
 * been removed: it was demo data shadowing records that already exist for real in Vyapar. What is
 * left is the one part of the buying chain nothing else models, and it is the next thing to get a
 * real backend.
 */
interface ProcurementState {
  rfqs: Rfq[];

  /**
   * Award an RFQ line to a vendor. Awarding is per line, not per RFQ: a five-line enquiry can end
   * up split across three suppliers, which is how buying actually works and what the comparison
   * screen has to be able to express.
   */
  awardLine: (rfqId: string, lineIndex: number, vendor: string | null, reason?: string) => void;
}

export const useProcurementStore = create<ProcurementState>((set) => ({
  rfqs: RFQ_SEED,

  awardLine: (rfqId, lineIndex, vendor, reason) =>
    set((s) => ({
      rfqs: s.rfqs.map((r) =>
        r.id === rfqId
          ? {
              ...r,
              lines: r.lines.map((l, i) =>
                i === lineIndex ? { ...l, awardedTo: vendor, awardReason: reason ?? l.awardReason } : l,
              ),
            }
          : r,
      ),
    })),
}));
