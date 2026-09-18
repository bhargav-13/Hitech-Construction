"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { Spinner } from "@/components/Spinner";
import { ApprovalBadge, ApprovalPanel } from "@/components/approval/ApprovalBadge";
import { getApprovalInbox, type ApprovalInboxItem } from "@/lib/api";
import { useApprovalInboxCount } from "@/lib/approvals";
import { useCan } from "@/lib/permissions";
import { formatDateTimeIST } from "@/lib/datetime";
import { inr } from "@/lib/format";
import { ArrowUpRight, BadgeCheck, ChevronDown, ChevronRight, Search } from "lucide-react";

type Scope = "mine" | "raised" | "all";

/**
 * Approvals — one inbox for every chain in Settings → Multi Level Approval.
 *
 * Tender stage moves and leave already had their own screens; sales invoices, purchase bills and
 * orders, expenses, payments and payroll runs raised requests with nowhere to see or act on them.
 * This lists whatever is waiting on the signed-in person, whatever they asked for, and — for anyone
 * with the Approvals module — everything still pending.
 */
export default function ApprovalsPage() {
  const can = useCan();
  const [scope, setScope] = useState<Scope>("mine");
  const [rows, setRows] = useState<ApprovalInboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [type, setType] = useState("ALL");
  const [search, setSearch] = useState("");
  const [openKey, setOpenKey] = useState<string | null>(null);
  const refreshCount = useApprovalInboxCount((s) => s.refresh);

  const [version, setVersion] = useState(0);
  /** Re-fetch the inbox; the spinner shows until the new list lands. */
  const load = useCallback(() => {
    setLoading(true);
    setVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    let off = false;
    getApprovalInbox(scope)
      .then((r) => {
        if (off) return;
        setRows(r);
        setError("");
      })
      .catch((e) => {
        if (off) return;
        setError(e instanceof Error ? e.message : "Couldn't load approvals.");
        setRows([]);
      })
      .finally(() => {
        if (!off) setLoading(false);
      });
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

  const scopes: { key: Scope; label: string }[] = [
    { key: "mine", label: "Waiting on me" },
    { key: "raised", label: "Raised by me" },
    ...(can("APPROVAL:VIEW") ? [{ key: "all" as const, label: "All pending" }] : []),
  ];

  return (
    <AppShell title="Approvals">
      <div className="animate-fade-in space-y-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-800">Approvals</h1>
          <p className="text-sm text-gray-500">
            Everything going through a ladder in Settings → Multi Level Approval — invoices, bills, orders, expenses,
            payments, payroll runs, leave and tender moves.
          </p>
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
                }}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  scope === s.key ? "bg-cyan-50 text-brand-accent" : "text-gray-500 hover:bg-gray-50"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="flex min-w-[240px] flex-1 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 focus-within:border-cyan-500">
            <Search size={14} className="text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search record, party or requester"
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
          <div className="flex min-h-[200px] items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white text-sm text-gray-400">
            <Spinner size={16} className="text-brand-accent" /> Loading…
          </div>
        ) : visible.length === 0 ? (
          <div className="flex min-h-[240px] flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-cyan-50 text-brand-accent">
              <BadgeCheck size={22} />
            </div>
            <div className="font-semibold text-gray-700">
              {scope === "mine" ? "Nothing waiting on you" : scope === "raised" ? "You haven't raised any requests" : "Nothing pending"}
            </div>
            <p className="mt-1 max-w-sm text-sm text-gray-400">
              Requests appear here when a record is saved under a published chain.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {visible.map((r) => {
              const key = `${r.entityType}-${r.entityId}`;
              const open = openKey === key;
              return (
                <div key={key} className={`rounded-xl border bg-white ${r.state.canActNow ? "border-rose-200" : "border-gray-200"}`}>
                  <button
                    type="button"
                    onClick={() => setOpenKey(open ? null : key)}
                    className="flex w-full items-start gap-3 px-4 py-3 text-left"
                  >
                    {open ? <ChevronDown size={16} className="mt-0.5 text-gray-400" /> : <ChevronRight size={16} className="mt-0.5 text-gray-400" />}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-md bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700">{r.entityLabel}</span>
                        <span className="truncate text-sm font-medium text-gray-800">{r.title}</span>
                        <ApprovalBadge state={r.state} />
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-gray-500">
                        {r.subtitle && <span>{r.subtitle}</span>}
                        {r.requestedByName && <span>Requested by {r.requestedByName}</span>}
                        {r.requestedAt && <span>{formatDateTimeIST(r.requestedAt)}</span>}
                      </div>
                    </div>
                    {r.amount != null && <span className="text-sm font-semibold whitespace-nowrap text-gray-800">{inr(r.amount)}</span>}
                  </button>
                  {open && (
                    <div className="space-y-2 border-t border-gray-100 px-4 py-3">
                      {r.link && (
                        <Link href={r.link} className="inline-flex items-center gap-1 text-xs font-medium text-brand-accent hover:underline">
                          Open record <ArrowUpRight size={12} />
                        </Link>
                      )}
                      <ApprovalPanel
                        entityType={r.entityType}
                        entityId={r.entityId}
                        state={r.state}
                        rejectHint={rejectHint(r.entityType)}
                        onChanged={() => {
                          load();
                          void refreshCount();
                        }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}

/** What rejecting does, per type — so nobody is surprised by it. */
function rejectHint(type: string): string | undefined {
  if (["SALES_INVOICE", "SALE_RETURN", "MATERIAL_PURCHASE", "PURCHASE_RETURN", "PURCHASE_ORDER", "SITE_EXPENSE"].includes(type)) {
    return "Rejecting cancels the document — it keeps its number, stops counting in balances and stock, and can be reopened once fixed.";
  }
  if (type === "PAYROLL_RUN") return "Rejecting sends the run back to draft so it can be regenerated.";
  if (type === "PAYMENT_ENTRY") return "Rejecting marks the payment rejected; it doesn't reverse money already moved.";
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
