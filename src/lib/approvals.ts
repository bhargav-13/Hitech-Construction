"use client";

import { useCallback, useEffect, useState } from "react";
import { create } from "zustand";
import { getAccessToken, getApprovalInbox, getApprovalStates, type ApprovalState } from "./api";

/**
 * Client side of the cross-feature approvals framework.
 *
 * Approval types are the backend's ApprovalEntityType names. Each Vyapar document type maps to the
 * chain that governs it (Settings → Multi Level Approval), mirroring VyaparApprovals on the server.
 */
export const DOC_APPROVAL_TYPE: Record<string, string> = {
  SALE: "SALES_INVOICE",
  SALE_RETURN: "SALE_RETURN",
  PURCHASE: "MATERIAL_PURCHASE",
  PURCHASE_RETURN: "PURCHASE_RETURN",
  PURCHASE_ORDER: "PURCHASE_ORDER",
  EXPENSE: "SITE_EXPENSE",
};
export const PAYMENT_APPROVAL_TYPE = "PAYMENT_ENTRY";

/** How many requests are waiting on me — shared so the sidebar badge refreshes after a decision. */
interface InboxCountState {
  count: number;
  loadedAt: number;
  refresh: () => Promise<void>;
}

export const useApprovalInboxCount = create<InboxCountState>((set) => ({
  count: 0,
  loadedAt: 0,
  refresh: async () => {
    if (!getAccessToken()) return;
    try {
      const rows = await getApprovalInbox("mine");
      set({ count: rows.length, loadedAt: Date.now() });
    } catch {
      // Older backend without the inbox endpoint, or offline — no badge rather than an error.
      set({ loadedAt: Date.now() });
    }
  },
}));

/**
 * Ladder state for the rows on a list screen, keyed by record id. `reload` re-fetches after a
 * decision. Records that never went through a chain are simply absent from the map.
 */
export function useApprovalStates(entityType: string | null | undefined, ids: number[]) {
  const [states, setStates] = useState<Record<number, ApprovalState>>({});
  const [version, setVersion] = useState(0);
  const key = ids.join(",");

  useEffect(() => {
    if (!entityType || !key) return;
    let off = false;
    getApprovalStates(entityType, key.split(",").map(Number))
      .then((r) => {
        if (!off) setStates(r);
      })
      .catch(() => {
        if (!off) setStates({});
      });
    return () => {
      off = true;
    };
  }, [entityType, key, version]);

  /** Re-fetch after a decision (or after the record was re-submitted). */
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  return { states, reload };
}
