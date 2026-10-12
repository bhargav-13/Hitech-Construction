"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Link2, Pencil, Plus, Scale, Search, Send, Trash2 } from "lucide-react";
import { Select } from "@/components/Select";
import { useProjects } from "@/lib/useProjects";
import { ProcurementShell, ProcurementEmpty, ProcurementHeader } from "@/components/procurement/ProcurementShell";
import { SendRfqDialog } from "@/components/procurement/SendRfqDialog";
import { QuoteDialog } from "@/components/procurement/QuoteDialog";
import { RowMenu, RowMenuDivider, RowMenuItem } from "@/components/RowMenu";
import { Spinner } from "@/components/Spinner";
import { useRfqs } from "@/lib/useRfqs";
import { RFQ_STATUS_CLS } from "@/lib/procurementConfig";
import { inr } from "@/lib/format";
import { useVyaparProjectId } from "@/lib/projectScope";
import * as procurement from "@/lib/procurementApi";
import * as vyapar from "@/lib/vyaparApi";
import type { Rfq } from "@/lib/procurementApi";
import type { Party } from "@/lib/vyaparApi";

/**
 * RFQ list — enquiries out to suppliers, and where quotes get keyed in.
 *
 * The list shows a price *range* rather than one amount: a quote is priced per line, so with a
 * five-line enquiry split across three suppliers there is no single number, and showing one would
 * invite a decision the comparison screen exists to make properly.
 */
export default function RfqPage() {
  const router = useRouter();
  const { rfqs, loading, error, reload, splice } = useRfqs();
  const projectId = useVyaparProjectId();
  const { projects } = useProjects();

  // Newest-created first by default: the order Onsite opens its RFQ list in.
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [sortBy, setSortBy] = useState("created-desc");
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = rfqs.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (projectFilter !== "all" && String(r.projectId ?? "") !== projectFilter) return false;
      if (!needle) return true;
      return (
        r.rfqNo.toLowerCase().includes(needle) ||
        (r.title ?? "").toLowerCase().includes(needle) ||
        r.lines.some((l) => (l.itemName ?? "").toLowerCase().includes(needle)) ||
        r.quotes.some((x) => (x.vendorName ?? "").toLowerCase().includes(needle))
      );
    });
    const created = (r: Rfq) => `${r.createdAt ?? ""}#${String(r.id).padStart(12, "0")}`;
    const by: Record<string, (a: Rfq, b: Rfq) => number> = {
      "created-desc": (a, b) => created(b).localeCompare(created(a)),
      "created-asc": (a, b) => created(a).localeCompare(created(b)),
      "date-desc": (a, b) => (b.rfqDate ?? "").localeCompare(a.rfqDate ?? ""),
      "due-asc": (a, b) => (a.biddingEndDate || "9999").localeCompare(b.biddingEndDate || "9999"),
      "replies-desc": (a, b) => b.quotes.length - a.quotes.length,
      "number-asc": (a, b) => a.rfqNo.localeCompare(b.rfqNo, undefined, { numeric: true }),
    };
    return [...list].sort(by[sortBy] ?? by["created-desc"]);
  }, [rfqs, q, statusFilter, projectFilter, sortBy]);
  const statuses = useMemo(() => [...new Set(rfqs.map((r) => r.status))].sort(), [rfqs]);
  const projectIds = useMemo(() => new Set(rfqs.map((r) => r.projectId).filter((p) => p != null)), [rfqs]);

  // Parties back the quote dialog; loaded once here rather than on every open.
  const [parties, setParties] = useState<Party[]>([]);
  const loadMasters = useCallback(async () => {
    try {
      setParties(await vyapar.getParties(undefined, projectId));
    } catch {
      setParties([]);
    }
  }, [projectId]);
  useEffect(() => {
    loadMasters();
  }, [loadMasters]);

  const [quoting, setQuoting] = useState<{ rfq: Rfq; vendorId?: number } | null>(null);
  // Reopening the send dialog is not a nicety: the quote links are shown once when the enquiry is
  // sent, and a supplier who loses the message needs it again the next day.
  const [sharing, setSharing] = useState<Rfq | null>(null);
  const [busy, setBusy] = useState("");

  async function remove(r: Rfq) {
    if (!confirm(`Delete ${r.rfqNo}? Any quotes received against it go too.`)) return;
    setBusy(r.rfqNo);
    try {
      await procurement.deleteRfq(r.id);
      reload();
    } finally {
      setBusy("");
    }
  }

  return (
    <ProcurementShell>
      <ProcurementHeader
        title="RFQ"
        subtitle="What we've asked suppliers to quote, and what has come back."
        right={
          <Link
            href="/procurement/rfq/build"
            className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-4 py-2.5 text-sm font-medium text-white transition-opacity duration-150 hover:opacity-90"
          >
            <Plus size={15} /> New RFQ
          </Link>
        }
      />

      {error && <div className="mb-3 rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}

      {loading ? (
        <div className="flex min-h-[240px] items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white text-sm text-gray-400">
          <Spinner size={16} className="text-brand-accent" /> Loading enquiries…
        </div>
      ) : rfqs.length === 0 ? (
        <ProcurementEmpty
          icon={Send}
          title="No enquiries yet"
          hint="Raise an RFQ to ask suppliers for a price."
          action={
            <Link
              href="/procurement/rfq/build"
              className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-4 py-2.5 text-sm font-medium text-white transition-opacity duration-150 hover:opacity-90"
            >
              <Plus size={15} /> New RFQ
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 focus-within:border-cyan-500">
              <Search size={15} className="text-gray-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search RFQ no., title, item or supplier…"
                className="w-full bg-transparent text-sm outline-none"
              />
            </div>
            <Select
              value={statusFilter}
              onChange={setStatusFilter}
              size="sm"
              className="w-44"
              options={[{ value: "all", label: "All statuses" }, ...statuses.map((s) => ({ value: s, label: s }))]}
            />
            <Select
              value={projectFilter}
              onChange={setProjectFilter}
              size="sm"
              className="w-56"
              options={[
                { value: "all", label: "All projects" },
                ...projects
                  .filter((p) => projectIds.has(Number(p.id)))
                  .map((p) => ({ value: String(p.id), label: p.name })),
              ]}
            />
            <Select
              value={sortBy}
              onChange={setSortBy}
              size="sm"
              className="w-52"
              options={[
                { value: "created-desc", label: "Sort: Newest first" },
                { value: "created-asc", label: "Sort: Oldest first" },
                { value: "date-desc", label: "Sort: RFQ date, latest" },
                { value: "due-asc", label: "Sort: Replies due soonest" },
                { value: "replies-desc", label: "Sort: Most replies" },
                { value: "number-asc", label: "Sort: Number" },
              ]}
            />
            <span className="text-xs text-gray-500">
              {shown.length} of {rfqs.length}
            </span>
          </div>
          {shown.map((r) => {
            const decided = r.lines.filter((l) => l.awardedVendorPartyId != null).length;
            // The cheapest and dearest way to buy the whole enquiry, line by line.
            const range = r.lines.reduce(
              (acc, line) => {
                const rates = r.quotes
                  .map((q) => q.lines.find((c) => c.rfqLineId === line.id)?.rate)
                  .filter((x): x is number => x != null);
                if (!rates.length) return acc;
                return {
                  low: acc.low + Math.min(...rates) * line.quantity,
                  high: acc.high + Math.max(...rates) * line.quantity,
                };
              },
              { low: 0, high: 0 },
            );

            const compareHref = `/procurement/compare?rfq=${r.id}`;
            return (
              // Clicking the card opens its comparison — what the buyer comes back to an enquiry
              // for. Editing is its own button; the action buttons stop the click.
              <div
                key={r.id}
                onClick={() => router.push(compareHref)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter") router.push(compareHref); }}
                title={`Compare quotes for ${r.rfqNo}`}
                className={`cursor-pointer rounded-xl border border-gray-200 bg-white p-4 transition-all duration-150 hover:border-brand-accent hover:shadow-sm ${busy === r.rfqNo ? "opacity-50" : ""}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-gray-800">{r.rfqNo}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${RFQ_STATUS_CLS[r.status]}`}>
                        {r.status}
                      </span>
                    </div>
                    <div className="mt-0.5 text-sm text-gray-600">{r.title}</div>
                    <div className="mt-0.5 text-xs text-gray-400">
                      raised {r.rfqDate}
                      {r.dueBy && <> · replies due {r.dueBy}</>}
                    </div>
                  </div>

                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => setQuoting({ rfq: r })}
                      className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors duration-150 hover:border-brand-accent hover:text-brand-accent"
                    >
                      <Plus size={13} /> Enter quote
                    </button>
                    <Link
                      href={`/procurement/rfq/build?id=${r.id}`}
                      className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors duration-150 hover:border-brand-accent hover:text-brand-accent"
                    >
                      <Pencil size={13} /> Edit RFQ
                    </Link>
                    <Link
                      href={compareHref}
                      className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-brand-accent transition-colors duration-150 hover:bg-brand-accent/5"
                    >
                      <Scale size={14} /> Compare
                    </Link>
                    <RowMenu align="right" buttonLabel="Enquiry actions">
                      {(close) => (
                        <>
                          <RowMenuItem
                            icon={Link2}
                            label={r.suppliers.some((x) => x.shareToken) ? "Quote links" : "Send to suppliers"}
                            onClick={() => { close(); setSharing(r); }}
                          />
                          <RowMenuDivider />
                          <RowMenuItem icon={Trash2} label="Delete" tone="danger" onClick={() => { close(); remove(r); }} />
                        </>
                      )}
                    </RowMenu>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 border-t border-gray-50 pt-3 text-xs text-gray-500">
                  <span>
                    {r.lines.length} line{r.lines.length > 1 ? "s" : ""}
                  </span>
                  <span>
                    {r.suppliers.length > 0
                      ? `${r.quotes.length} of ${r.suppliers.length} replied`
                      : `${r.quotes.length} quote${r.quotes.length === 1 ? "" : "s"} in`}
                  </span>
                  {range.low > 0 && (
                    <span className="tabular-nums">
                      {inr(range.low)}
                      {range.high > range.low && <> – {inr(range.high)}</>}
                    </span>
                  )}
                  {decided > 0 && (
                    <span className="font-medium text-emerald-700">
                      {decided} of {r.lines.length} awarded
                    </span>
                  )}
                </div>

                {/* Who has replied, and a way back into each quote to revise it */}
                {r.quotes.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
                    {r.quotes.map((q) => (
                      <button
                        key={q.id}
                        onClick={() => setQuoting({ rfq: r, vendorId: q.vendorPartyId })}
                        title="Revise this quote"
                        className="rounded-lg bg-gray-50 px-2 py-1 text-[11px] text-gray-600 transition-colors duration-150 hover:bg-cyan-50 hover:text-brand-accent"
                      >
                        {q.vendorName}
                        {q.version > 1 && <span className="text-gray-400"> v{q.version}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {sharing && (
        <SendRfqDialog rfq={sharing} onSent={(saved) => { splice(saved); setSharing(saved); }} onClose={() => setSharing(null)} />
      )}

      {quoting && (
        <QuoteDialog
          rfq={quoting.rfq}
          vendors={parties}
          existingVendorId={quoting.vendorId}
          onVendorAdded={loadMasters}
          onClose={() => setQuoting(null)}
          onSaved={(saved) => {
            splice(saved);
            setQuoting(null);
          }}
        />
      )}
    </ProcurementShell>
  );
}
