"use client";

import { useEffect, useState } from "react";
import { FileClock, Send } from "lucide-react";
import { getApprovalChainActive, resubmitApproval } from "@/lib/api";
import { useApprovalInboxCount } from "@/lib/approvals";

/** Cached per page load — whether purchase orders go through an approval chain at all. */
let chainActive: Promise<boolean> | null = null;
export function usePoChainActive(): boolean | null {
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    chainActive ??= getApprovalChainActive("PURCHASE_ORDER")
      .then((r) => !!r.active)
      .catch(() => false);
    let off = false;
    void chainActive.then((v) => {
      if (!off) setOn(v);
    });
    return () => {
      off = true;
    };
  }, []);
  return on;
}

/** The "Draft" chip a PO list shows for an order that was never sent for approval. */
export function PoDraftBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap text-sky-700 ring-1 ring-sky-600/20 ring-inset">
      <FileClock size={10} /> Draft
    </span>
  );
}

/**
 * Onsite's draft purchase order: saved, but not sent for approval — so it can't be received yet.
 * Publish sends it up the PO approval chain; once approved it shows in Pending to Receive.
 * Renders nothing when POs have no approval chain (then every saved PO is live).
 */
export function PoDraftBar({ entityId, onPublished }: { entityId: number; onPublished: () => void }) {
  const active = usePoChainActive();
  const refreshCount = useApprovalInboxCount((s) => s.refresh);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!active) return null;

  async function publish() {
    setBusy(true);
    setError("");
    try {
      await resubmitApproval("PURCHASE_ORDER", entityId);
      onPublished();
      void refreshCount();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send it for approval.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <PoDraftBadge />
          <span className="text-sm text-gray-700">Not sent for approval — it can&apos;t be received until it&apos;s published and approved.</span>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void publish()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-accent px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
        >
          <Send size={13} /> {busy ? "Publishing…" : "Publish"}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
    </div>
  );
}
