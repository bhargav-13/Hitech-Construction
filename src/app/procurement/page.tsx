"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowRight, FileText, Send, Users } from "lucide-react";
import { ProcurementShell } from "@/components/procurement/ProcurementShell";
import { useProcurementStore } from "@/lib/procurementStore";
import { RFQ_STATUS_CLS } from "@/lib/procurementConfig";
import { inr } from "@/lib/format";

/**
 * Procurement dashboard.
 *
 * Only counts what this module actually owns — enquiries out, quotes in, lines still undecided.
 * It used to show committed value, goods received and amounts pending billing, all from demo data
 * that shadowed figures Vyapar holds for real. Those tiles now link to Vyapar instead of restating
 * numbers from a second source, because two places showing "committed spend" is how they end up
 * disagreeing.
 */
export default function ProcurementDashboard() {
  const rfqs = useProcurementStore((s) => s.rfqs);

  const m = useMemo(() => {
    const awaiting = rfqs.filter((r) => r.status === "Sent").length;
    const toDecide = rfqs.filter((r) => r.status === "Responses In");
    // Lines with quotes in but no vendor chosen — the actual work sitting on someone's desk.
    const undecidedLines = toDecide.reduce(
      (s, r) => s + r.lines.filter((l) => !l.awardedTo).length,
      0,
    );
    // Value at stake on those lines, costed at the cheapest quote each.
    const atStake = toDecide.reduce((s, r) => {
      return (
        s +
        r.lines.reduce((ls, line, i) => {
          if (line.awardedTo) return ls;
          const rates = r.quotes.map((q) => q.lines[i]?.rate).filter((x): x is number => x != null);
          return ls + (rates.length ? Math.min(...rates) * line.qty : 0);
        }, 0)
      );
    }, 0);
    return { awaiting, toDecide, undecidedLines, atStake };
  }, [rfqs]);

  return (
    <ProcurementShell>
      <div className="space-y-5">
        <div>
          <h1 className="text-lg font-semibold text-gray-800">Procurement</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Ask several suppliers, compare what comes back, decide who gets each line. Orders and
            bills live in Vyapar.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Tile label="Awaiting quotes" value={String(m.awaiting)} hint="Enquiries sent, nothing back yet" />
          <Tile label="Ready to compare" value={String(m.toDecide.length)} hint="Quotes in, decision pending" />
          <Tile label="Lines undecided" value={String(m.undecidedLines)} hint="Across those enquiries" />
          <Tile label="Value at stake" value={inr(m.atStake)} hint="Undecided lines, at the cheapest quote" />
        </div>

        {/* What needs a decision, and nothing else */}
        <div className="rounded-xl border border-gray-200 bg-white">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-800">Waiting on a decision</h2>
            <Link href="/procurement/compare" className="text-xs font-medium text-brand-accent hover:underline">
              Open comparison
            </Link>
          </div>
          {m.toDecide.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-gray-400">Nothing waiting. Quotes appear here as they arrive.</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {m.toDecide.map((r) => {
                const undecided = r.lines.filter((l) => !l.awardedTo).length;
                return (
                  <Link
                    key={r.id}
                    href="/procurement/compare"
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 transition-colors duration-150 hover:bg-cyan-50/40"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-gray-800">{r.number}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${RFQ_STATUS_CLS[r.status]}`}>
                          {r.status}
                        </span>
                      </div>
                      <div className="mt-0.5 truncate text-xs text-gray-400">
                        {r.title} · {r.project}
                      </div>
                    </div>
                    <div className="text-right text-xs text-gray-500">
                      {r.quotes.length} quotes · {undecided} of {r.lines.length} lines undecided
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Handoffs — stated plainly so nobody looks for these here */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Handoff
            href="/vyapar/purchase-order"
            icon={FileText}
            title="Purchase Orders"
            body="Raised in Vyapar once a line is awarded, with approval and billing."
          />
          <Handoff href="/vyapar/parties" icon={Users} title="Vendors" body="Suppliers, balances and ledgers live with the parties." />
          <Handoff href="/vyapar/purchase" icon={Send} title="Purchase Bills" body="What was actually invoiced against an order." />
        </div>
      </div>
    </ProcurementShell>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="text-[11px] font-medium tracking-wide text-gray-400 uppercase">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-gray-900 tabular-nums">{value}</div>
      <div className="mt-0.5 text-xs text-gray-400">{hint}</div>
    </div>
  );
}

function Handoff({
  href,
  icon: Icon,
  title,
  body,
}: {
  href: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  body: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-4 transition-colors duration-150 hover:border-brand-accent"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-accent/10 text-brand-accent">
        <Icon size={17} />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-1 text-sm font-semibold text-gray-800 group-hover:text-brand-accent">
          {title} <ArrowRight size={13} className="opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
        </div>
        <p className="mt-0.5 text-xs text-gray-500">{body}</p>
      </div>
    </Link>
  );
}
