"use client";

import { useEffect } from "react";
import { apiRequest } from "@/lib/api";
import { useAuthStore } from "@/lib/authStore";
import { useAnalysisStore } from "@/lib/tenderAnalysisStore";
import type { RateLibraryItem, TenderAnalysis } from "@/lib/tenderAnalysisTypes";

const BASE = "/api/v1/tender-analysis-docs";
const SAVE_DELAY_MS = 800;

interface DocsResponse {
  analyses: TenderAnalysis[];
  library: RateLibraryItem[] | null;
}

/** Same as the server's stripping (TenderAnalysisDocService), applied before anything renders. */
function withoutCosts(a: TenderAnalysis): TenderAnalysis {
  return {
    ...a,
    boqLines: a.boqLines.map((l) => ({ ...l, materialRate: null, labourRate: null, otherRate: null })),
    expenseLines: [],
    scenarios: [],
    bidPct: 0,
  };
}

/**
 * KAN-87: health analyses live on the server, not just in this browser.
 *
 * <p>On sign-in the server's analyses and rate library replace the local copy — for a role without
 * Costs & Margins they arrive with every buying rate removed by the server, and the local copy is
 * stripped the same way before it is ever shown, so nothing cost-related survives in this browser.
 * Every edit is saved back (debounced). Analyses that only existed in a browser so far are uploaded
 * once by a role that holds the costs; a restricted role never uploads (it would only hold a
 * stripped copy).
 */
export function TenderAnalysisSync() {
  const userId = useAuthStore((s) => s.user?.id);
  // Primitives, not the permissions array: that array is replaced on every live-access refresh,
  // and restarting the sync each time would re-pull for nothing.
  const has = (code: string) => (s: { user: { permissions?: string[] } | null }) => !!s.user?.permissions?.includes(code);
  const canView = useAuthStore(has("TENDER_ANALYSIS:VIEW"));
  const costs = useAuthStore(has("TENDER_ANALYSIS_COSTS:VIEW"));
  const canEdit = useAuthStore(has("TENDER_ANALYSIS:EDIT"));
  const canCreate = useAuthStore(has("TENDER_ANALYSIS:CREATE"));
  const canDelete = useAuthStore(has("TENDER_ANALYSIS:DELETE"));

  useEffect(() => {
    if (!userId || !canView) return;
    const canWrite = canEdit || canCreate;

    let stopped = false;
    let applying = false;
    let ready = false;
    const timers = new Map<string, ReturnType<typeof setTimeout>>();

    const store = useAnalysisStore;
    const apply = (fn: () => void) => {
      applying = true;
      try {
        fn();
      } finally {
        applying = false;
      }
    };

    // Before the server answers: no cost may be on screen or left in local storage.
    if (!costs) {
      apply(() =>
        store.setState((s) => ({
          analyses: s.analyses.map(withoutCosts),
          library: s.library.map((x) => ({ ...x, materialRate: null, labourRate: null, otherRate: null })),
        })),
      );
    }

    const saveAnalysis = (a: TenderAnalysis) =>
      apiRequest(`${BASE}/${encodeURIComponent(a.id)}`, { method: "PUT", body: a }).catch(() => {});
    const saveLibrary = (lib: RateLibraryItem[]) =>
      apiRequest(`${BASE}/library`, { method: "PUT", body: lib }).catch(() => {});

    const schedule = (key: string, fn: () => void) => {
      const t = timers.get(key);
      if (t) clearTimeout(t);
      timers.set(key, setTimeout(() => {
        timers.delete(key);
        fn();
      }, SAVE_DELAY_MS));
    };

    async function pull(first: boolean) {
      let res: DocsResponse;
      try {
        res = await apiRequest<DocsResponse>(BASE);
      } catch {
        return;
      }
      if (stopped || (!first && timers.size > 0)) return; // don't overwrite an edit still on its way
      const server = new Map(res.analyses.map((a) => [a.id, a]));
      const local = store.getState().analyses;
      const localOnly = local.filter((a) => !server.has(a.id));
      const upload = first && costs && canWrite ? localOnly : [];
      apply(() =>
        store.setState(() => ({
          analyses: [...res.analyses, ...upload],
          library: res.library ?? (costs ? store.getState().library : []),
        })),
      );
      for (const a of upload) void saveAnalysis(a);
      if (first && costs && canWrite && res.library == null) void saveLibrary(store.getState().library);
      ready = true;
    }

    const unsub = store.subscribe((next, prev) => {
      if (applying || !ready || !canWrite) return;
      const before = new Map(prev.analyses.map((a) => [a.id, a]));
      for (const a of next.analyses) {
        if (before.get(a.id) !== a) schedule(a.id, () => void saveAnalysis(store.getState().analyses.find((x) => x.id === a.id) ?? a));
        before.delete(a.id);
      }
      if (canDelete) {
        for (const gone of before.keys()) {
          const t = timers.get(gone);
          if (t) clearTimeout(t);
          timers.delete(gone);
          void apiRequest(`${BASE}/${encodeURIComponent(gone)}`, { method: "DELETE" }).catch(() => {});
        }
      }
      if (costs && next.library !== prev.library) schedule("__library__", () => void saveLibrary(store.getState().library));
    });

    void pull(true);
    // Someone else's edits: pick them up when this tab comes back into view.
    const onVis = () => {
      if (document.visibilityState === "visible" && ready) void pull(false);
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      stopped = true;
      unsub();
      document.removeEventListener("visibilitychange", onVis);
      // Flush anything still waiting rather than dropping it.
      for (const [key, t] of timers) {
        clearTimeout(t);
        if (key === "__library__") void saveLibrary(store.getState().library);
        else {
          const a = store.getState().analyses.find((x) => x.id === key);
          if (a) void saveAnalysis(a);
        }
      }
    };
  }, [userId, canView, costs, canEdit, canCreate, canDelete]);

  return null;
}
