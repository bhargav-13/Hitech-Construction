"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest, ApiError } from "./api";
import type { Invoice, Party, PartyLedgerRow } from "./vyaparApi";
import { useVyaparProjectId } from "./projectScope";

/**
 * The buying side of the books, read through Procurement's own endpoints.
 *
 * <p>Purchase orders, vendors and purchase bills are Vyapar records, and Procurement used to link
 * straight into the Vyapar screens for them. That works for anyone holding VYAPAR:VIEW and dead-ends
 * for everyone else: a buyer or store keeper with only PROCUREMENT:* followed those links into an
 * access wall, so three of the module's own outputs were unreachable by the people producing them.
 *
 * <p>`/api/v1/procurement/purchases/*` is a narrow read-only window over exactly those records —
 * purchase documents and suppliers, nothing that writes and nothing from the sales side — accepted
 * for either module's VIEW right. Writing still belongs to Vyapar, so the screens built on this
 * offer a "Open in Vyapar" affordance only where the user actually has that access.
 */

const BASE = "/api/v1/procurement/purchases";

const qs = (params: Record<string, string | number | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
};

export const getPurchaseOrders = (projectId?: number) =>
  apiRequest<Invoice[]>(`${BASE}/orders${qs({ projectId })}`);

export const getPurchaseBills = (projectId?: number) =>
  apiRequest<Invoice[]>(`${BASE}/bills${qs({ projectId })}`);

export const getPurchaseReturns = (projectId?: number) =>
  apiRequest<Invoice[]>(`${BASE}/returns${qs({ projectId })}`);

export const getPurchaseDocument = (id: number) => apiRequest<Invoice>(`${BASE}/documents/${id}`);

export const getVendors = (projectId?: number) =>
  apiRequest<Party[]>(`${BASE}/vendors${qs({ projectId })}`);

export const getVendor = (id: number) => apiRequest<Party>(`${BASE}/vendors/${id}`);

export const getVendorLedger = (id: number) => apiRequest<PartyLedgerRow[]>(`${BASE}/vendors/${id}/ledger`);

/** Shared loading shape for the three list screens, following the header's project scope. */
function useScopedList<T>(fetcher: (projectId?: number) => Promise<T[]>, label: string) {
  const projectId = useVyaparProjectId();
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Bumped to re-run the effect on an explicit refresh, so the fetch lives in exactly one place.
  const [nonce, setNonce] = useState(0);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    fetcher(projectId)
      .then((r) => { if (!cancelled) { setRows(r); setError(""); } })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : `Unable to load ${label}.`);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [fetcher, projectId, label, nonce]);

  return { rows, loading, error, refresh };
}

export function usePurchaseOrders() {
  return useScopedList<Invoice>(getPurchaseOrders, "purchase orders");
}

export function usePurchaseBills() {
  return useScopedList<Invoice>(getPurchaseBills, "purchase bills");
}

export function useVendors() {
  return useScopedList<Party>(getVendors, "vendors");
}
