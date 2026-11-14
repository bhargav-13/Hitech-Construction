"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { VyaparShell, VyaparEmpty } from "@/components/vyapar/VyaparShell";
import { Spinner } from "@/components/Spinner";
import { ApprovalBadge, ApprovalPanel } from "@/components/approval/ApprovalBadge";
import { decideApproval, getApprovalInbox, type ApprovalInboxItem } from "@/lib/api";
import { useApprovalInboxCount, useVyaparApprovalCount } from "@/lib/approvals";
import { useCan } from "@/lib/permissions";
import { formatDateTimeIST } from "@/lib/datetime";
import { inr } from "@/lib/format";
import { ArrowUpRight, BadgeCheck, Check, ChevronDown, ChevronRight, Search, X } from "lucide-react";

type Scope = "mine" | "raised" | "all";

/**
 * Vyapar → Approvals: every Vyapar document going through a ladder in Settings → Multi Level
 * Approval — sale invoices, purchase bills, purchase orders, returns, expenses, payments and
 * payment requests — in one list.
 *
 * Who sees what (Roles & Access → Vyapar → Approvals):
 *  - View: this page — what is waiting on me and what I raised.
 *  - Approve: deciding (on top of holding the role on the current rung), and "All pending".
 */
export default function VyaparApprovalsPage() {
  const can = useCan();
  const canApprove = can("VYAPAR_APPROVALS:APPROVE");
  const [scope, setScope] = useState<Scope>("mine");
  const [rows, setRows] = useState<ApprovalInboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [type, setType] = useState("ALL");
  const [search, setSearch] = useState("");
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const refreshVyapar = useVyaparApprovalCount((s) => s.refresh);
  const refreshAll = useApprovalInboxCount((s) => s.refresh);

  const reload = useCallback(() => {
    setLoading(true);
    setVersion((v) => v + 1);
    void refreshVyapar();
    void refreshAll();
  }, [refreshVyapar, refreshAll]);

  useEffect(() => {
    let off = false;
    getApprovalInbox(scope, "vyapar")
      .then((r) => {
        if (off) return;
        setRows(r);
        setError("");
      })
      .catch((e) => {
        if (off) return;
        setRows([]);
        setError(e instanceof Error ? e.message : "Couldn't load approvals.");
      })
      .finally(() => !off && setLoading(false));
    return () => {
      off = true;
    };
  }, [scope, version]);

  const types = useMemo(() => {
    const m = new Map<string, { label: string; count: number }>();
    for (const r of rows) {
      const cur = m.get(r.entityType) ?? { label: r.entityLabel, count: 0 };
      cur.count++;
      m.set(r.entityType, cur);
    }
    return [...m.entries()].sort((a, b) => a[1].label.localeCompare(b[1].label));
  }, [rows]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (type === "ALL" || r.entityType === type) &&
        (!q || [r.title, r.subtitle, r.requestedByName, r.entityLabel].some((v) => (v ?? "").toLowerCase().includes(q))),
    );
  }, [rows, type, search]);

  const totalAmount = visible.reduce((s, r) => s + (r.amount ?? 0), 0);

  async function quickDecide(r: ApprovalInboxItem, approve: boolean) {
    let note: string | undefined;
    if (!approve) {
      const why = window.prompt(`Reject ${r.title}?${rejectHint(r.entityType) ? `\n\n${rejectHint(r.entityType)}` : ""}\n\nReason (optional):`, "");
      if (why === null) return;
      note = why.trim() || undefined;
    }
    const key = `${r.entityType}-${r.entityId}`;
    setBusyKey(key);
    setError("");
    try {
      await decideApproval(r.entityType, r.entityId, approve ? "APPROVE" : "REJECT", note);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't record the decision.");
    } finally {
      setBusyKey(null);
    }
  }

  const scopes: { key: Scope; label: string }[] = [
    { key: "mine", label: "Waiting on me" },
    { key: "raised", label: "Raised by me" },
    ...(canApprove ? [{ key: "all" as const, label: "All pending" }] : []),
  ];

  return (
    <VyaparShell>
      <div className="animate-fade-in space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-gray-800">Approvals</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              Invoices, bills, purchase orders, returns, expenses, payments and payment requests going through Settings →
              Multi Level Approval.
            </p>
          </div>
          {visible.length > 0 && (
            <div className="text-right text-sm text-gray-500">
              {visible.length} {visible.length === 1 ? "document" : "documents"} ·{" "}
              <span className="font-medium text-gray-700">{inr(totalAmount)}</span>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-gray-200 bg-white p-1">
            {scopes.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => {
                  if (s.key !== scope) setLoading(true);
                  setScope(s.key);
                  setType("ALL");
                  setOpenKey(null);
                }}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  scope === s.key ? "bg-cyan-50 text-brand-accent" : "text-gray-500 hover:bg-gray-50"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 focus-within:border-cyan-500">
            <Search size={14} className="text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search document, party or requester"
              className="w-full bg-transparent text-sm outline-none"
            />
          </div>
        </div>

        {types.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            <Chip label="All" count={rows.length} active={type === "ALL"} onClick={() => setType("ALL")} />
            {types.map(([key, t]) => (
              <Chip key={key} label={t.label} count={t.count} active={type === key} onClick={() => setType(key)} />
            ))}
          </div>
        )}

        {error && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}

        {loading ? (
          <div className="flex min-h-[220px] items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white text-sm text-gray-400">
            <Spinner size={16} className="text-brand-accent" /> Loading…
          </div>
        ) : visible.length === 0 ? (
          <VyaparEmpty
            icon={BadgeCheck}
            title={scope === "mine" ? "Nothing waiting on you" : scope === "raised" ? "You haven't raised any requests" : "Nothing pending"}
            hint="A document shows here when it's saved under a published approval chain."
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            {visible.map((r) => {
              const key = `${r.entityType}-${r.entityId}`;
              const open = openKey === key;
              const actNow = r.state.status === "PENDING" && r.state.canActNow;
              return (
                <div key={key} className={`border-b border-gray-100 last:border-b-0 ${actNow ? "bg-rose-50/30" : ""}`}>
                  <div className="flex items-start gap-3 px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setOpenKey(open ? null : key)}
                      aria-label={open ? "Hide details" : "Show details"}
                      className="mt-0.5 rounded p-0.5 text-gray-400 hover:bg-gray-100"
                    >
                      {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>
                    <button type="button" onClick={() => setOpenKey(open ? null : key)} className="min-w-0 flex-1 text-left">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-md bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700">{r.entityLabel}</span>
                        <span className="truncate text-sm font-medium text-gray-800">{r.title}</span>
                        <ApprovalBadge state={r.state} />
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-gray-500">
                        {r.subtitle && <span>{r.subtitle}</span>}
                        {r.requestedByName && <span>Requested by {r.requestedByName}</span>}
                        {r.requestedAt && <span>{formatDateTimeIST(r.requestedAt)}</span>}
                        {r.state.status === "PENDING" && r.state.awaitingRoleNames && !actNow && (
                          <span>Waiting on {r.state.awaitingRoleNames}</span>
                        )}
                      </div>
                    </button>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      {r.amount != null && <span className="text-sm font-semibold whitespace-nowrap text-gray-800">{inr(r.amount)}</span>}
                      {actNow && (
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            disabled={busyKey === key}
                            onClick={() => void quickDecide(r, true)}
                            className="flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                          >
                            <Check size={12} /> Approve
                          </button>
                          <button
                            type="button"
                            disabled={busyKey === key}
                            onClick={() => void quickDecide(r, false)}
                            className="flex items-center gap-1 rounded-md border border-rose-200 bg-white px-2.5 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                          >
                            <X size={12} /> Reject
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  {open && (
                    <div className="space-y-2 border-t border-gray-100 bg-gray-50/40 px-4 py-3 sm:pl-11">
                      {r.link && (
                        <Link href={r.link} className="inline-flex items-center gap-1 text-xs font-medium text-brand-accent hover:underline">
                          Open document <ArrowUpRight size={12} />
                        </Link>
                      )}
                      <ApprovalPanel
                        entityType={r.entityType}
                        entityId={r.entityId}
                        state={r.state}
                        rejectHint={rejectHint(r.entityType)}
                        allowRecall={r.entityType === "PURCHASE_ORDER"}
                        onChanged={reload}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </VyaparShell>
  );
}

/** What rejecting does, per type — said before anyone clicks it. */
function rejectHint(type: string): string | undefined {
  if (["SALES_INVOICE", "SALE_RETURN", "MATERIAL_PURCHASE", "PURCHASE_RETURN", "PURCHASE_ORDER", "SITE_EXPENSE"].includes(type)) {
    return "Rejecting cancels the document — it keeps its number, stops counting in balances and stock, and can be reopened once fixed.";
  }
  if (type === "PAYMENT_ENTRY") return "Rejecting marks the payment rejected; it doesn't reverse money already moved.";
  if (type === "PAYMENT_REQUEST") return "Rejecting closes the request — nothing is paid.";
  return undefined;
}

function Chip({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-medium transition-all duration-150 active:scale-95 ${
        active ? "bg-brand-accent text-white shadow-sm" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
      }`}
    >
      {label} <span className={active ? "opacity-75" : "text-gray-400"}>{count}</span>
    </button>
  );
}
