"use client";

import { useCallback, useEffect, useState } from "react";
import * as procurement from "./procurementApi";
import type { Rfq } from "./procurementApi";
import { useVyaparProjectId } from "./projectScope";

/**
 * Loads RFQs for the selected project and keeps them in step after a write.
 *
 * Every mutating call on the API returns the whole RFQ back, because a single change ripples: an
 * award can flip the enquiry's status to Awarded, deleting a quote can un-award the lines that
 * pointed at it. Splicing the returned record in — rather than refetching the list — keeps the
 * comparison screen from flickering through a loading state on every click.
 */
export function useRfqs() {
  const projectId = useVyaparProjectId();
  const [rfqs, setRfqs] = useState<Rfq[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRfqs(await procurement.getRfqs(projectId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load enquiries.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  /** Replace one RFQ in place with the server's copy. */
  const splice = useCallback((updated: Rfq) => {
    setRfqs((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  }, []);

  const award = useCallback(
    async (rfqId: number, lineId: number, vendorPartyId: number | null, reason?: string) => {
      try {
        splice(await procurement.awardLine(rfqId, lineId, vendorPartyId, reason));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't record that award.");
      }
    },
    [splice],
  );

  /** Reopen a supplier's quote link so they can revise. Our decision, not theirs. */
  const unlock = useCallback(
    async (rfqId: number, quoteId: number) => {
      try {
        splice(await procurement.unlockQuote(rfqId, quoteId));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't reopen that quote.");
      }
    },
    [splice],
  );

  return { rfqs, loading, error, reload: load, award, unlock, splice };
}
