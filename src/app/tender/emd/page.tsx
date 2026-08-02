"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { TenderShell, TenderEmpty } from "@/components/tender/TenderShell";
import { SortTh } from "@/components/vyapar/SortTh";
import { useTableSort } from "@/lib/useTableSort";
import { useTenderStore } from "@/lib/tenderStore";
import { EMD_MODE_META, EMD_STATE_META, type Tender } from "@/lib/tenderTypes";
import { bucketOf, exposure, isEmdBlocked, isEmdRecoverable } from "@/lib/tenderMetrics";
import { BUCKET_META } from "@/lib/tenderTypes";
import { tdate, tiso, tmoney, tval } from "@/lib/tenderHelpers";
import { exportTenders } from "@/lib/tenderExcel";
import { inr } from "@/lib/format";
import { Download, Landmark, Search, Undo2 } from "lucide-react";

type Filter = "BLOCKED" | "RECOVERABLE" | "RELEASED" | "PENDING" | "ALL";

const FILTERS: { key: Filter; label: string; hint: string }[] = [
  { key: "BLOCKED", label: "Blocked", hint: "Paid on live or won tenders" },
  { key: "RECOVERABLE", label: "To recover", hint: "Decided against us, no refund recorded" },
  { key: "PENDING", label: "Not yet paid", hint: "Still in the pipeline" },
  { key: "RELEASED", label: "Released", hint: "Refund recorded" },
  { key: "ALL", label: "All", hint: "" },
];

/**
 * The EMD register — the working-capital view the workbook never had.
 *
 * The client's sheet totals blocked EMD in one cell but has no way to answer "which tenders is that
 * money sitting in, and which of it should already have come back?". This page is that answer, and
 * releasing an EMD here is what removes it from the dashboard's blocked figure.
 */
export default function TenderEmdPage() {
  const tenders = useTenderStore((s) => s.tenders);
  const updateTender = useTenderStore((s) => s.updateTender);
  const [filter, setFilter] = useState<Filter>("BLOCKED");
  const [search, setSearch] = useState("");

  const money = useMemo(() => exposure(tenders), [tenders]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tenders.filter((t) => {
      if (t.emd == null) return false;
      const match =
        filter === "ALL" ||
        (filter === "BLOCKED" && isEmdBlocked(t) && !isEmdRecoverable(t)) ||
        (filter === "RECOVERABLE" && isEmdRecoverable(t)) ||
        (filter === "RELEASED" && (t.emdState === "RELEASED" || !!t.emdReleasedOn)) ||
        (filter === "PENDING" && t.emdState === "PENDING");
      if (!match) return false;
      if (!q) return true;
      return (
        (t.nameOfWork ?? "").toLowerCase().includes(q) ||
        (t.department ?? "").toLowerCase().includes(q) ||
        (t.tenderId ?? "").toLowerCase().includes(q)
      );
    });
  }, [tenders, filter, search]);

  const { sorted, sortKey, sortDir, toggle } = useTableSort<Tender>(
    rows,
    {
      department: (t) => t.department,
      nameOfWork: (t) => t.nameOfWork,
      emd: (t) => t.emd,
      emdMode: (t) => t.emdMode,
      emdState: (t) => t.emdState,
      emdPaidOn: (t) => t.emdPaidOn,
      emdExpiry: (t) => t.emdExpiry,
      bucket: (t) => bucketOf(t),
    },
    { key: "emd", dir: "desc" },
  );

  const total = useMemo(() => sorted.reduce((s, t) => s + (t.emd ?? 0), 0), [sorted]);

  function release(t: Tender) {
    updateTender(t.id, { emdState: "RELEASED", emdReleasedOn: tiso(new Date()) });
  }

  return (
    <TenderShell>
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-gray-800">EMD Register</h1>
            <p className="text-sm text-gray-500">Every rupee of earnest money, where it sits and whether it is coming back.</p>
          </div>
          <button
            onClick={() => exportTenders(sorted, "emd-register.xlsx", "EMD")}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 transition-colors duration-150 hover:bg-gray-50"
          >
            <Download size={14} /> Export
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Card label="Blocked" value={money.emdBlocked} tone="amber" hint="Live and won bids" />
          <Card label="To recover" value={money.emdRecoverable} tone="rose" hint="Lost or cancelled, unrefunded" />
          <Card label="Locked in live bids" value={money.emdLocked} tone="gray" hint="Awaiting an outcome" />
          <Card label="Required ahead" value={money.emdRequired} tone="gray" hint="Pipeline tenders not yet paid" />
        </div>

        {money.emdRecoverable > 0 && (
          <div className="flex items-start gap-2 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-inset ring-rose-600/20">
            <Undo2 size={16} className="mt-0.5 shrink-0" />
            <span>
              <strong>{inr(money.emdRecoverable)}</strong> is sitting against tenders we have already lost or that were
              cancelled, with no refund recorded. The source workbook never tracked releases at all, so some of this may
              already be back — mark those released to clear them.
            </span>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-1 rounded-lg border border-gray-200 bg-white p-0.5">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                title={f.hint}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-150 ${
                  filter === f.key ? "bg-cyan-50 text-brand-accent" : "text-gray-500 hover:bg-gray-50"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex min-w-[180px] flex-1 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 focus-within:border-cyan-500">
            <Search size={15} className="text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search work, department or tender ID"
              className="w-full bg-transparent text-sm outline-none"
            />
          </div>
          <div className="text-sm text-gray-500">
            {sorted.length} tenders · <span className="font-medium text-gray-700">{inr(total)}</span>
          </div>
        </div>

        {sorted.length === 0 ? (
          <TenderEmpty icon={Landmark} title="Nothing here" hint="Try a different filter." />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full min-w-[980px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
                  <SortTh label="Department" sortKey="department" activeKey={sortKey} dir={sortDir} onSort={toggle} />
                  <SortTh label="Name of Work" sortKey="nameOfWork" activeKey={sortKey} dir={sortDir} onSort={toggle} />
                  <SortTh label="Stage" sortKey="bucket" activeKey={sortKey} dir={sortDir} onSort={toggle} />
                  <SortTh label="EMD" sortKey="emd" activeKey={sortKey} dir={sortDir} onSort={toggle} align="right" />
                  <SortTh label="Instrument" sortKey="emdMode" activeKey={sortKey} dir={sortDir} onSort={toggle} />
                  <SortTh label="State" sortKey="emdState" activeKey={sortKey} dir={sortDir} onSort={toggle} />
                  <SortTh label="Paid" sortKey="emdPaidOn" activeKey={sortKey} dir={sortDir} onSort={toggle} />
                  <SortTh label="Expiry" sortKey="emdExpiry" activeKey={sortKey} dir={sortDir} onSort={toggle} />
                  <th className="px-4 py-2 font-medium text-gray-500">Action</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((t) => {
                  const bucket = bucketOf(t);
                  const recoverable = isEmdRecoverable(t);
                  return (
                    <tr key={t.id} className={`border-b border-gray-50 last:border-b-0 even:bg-gray-50/40 hover:bg-cyan-50/40 ${recoverable ? "bg-rose-50/40" : ""}`}>
                      <td className="px-4 py-2.5 text-gray-600">{tval(t.department)}</td>
                      <td className="px-4 py-2.5 text-gray-700">
                        <Link href={`/tender/${routeForStage(t)}?open=${t.id}`} className="block max-w-[320px] truncate hover:text-brand-accent" title={t.nameOfWork ?? ""}>
                          {tval(t.nameOfWork)}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${BUCKET_META[bucket].chip}`}>
                          {BUCKET_META[bucket].label}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium text-gray-700">{tmoney(t.emd)}</td>
                      <td className="px-4 py-2.5 text-gray-600">{t.emdMode ? EMD_MODE_META[t.emdMode].label : "—"}</td>
                      <td className="px-4 py-2.5">
                        {t.emdState ? (
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${EMD_STATE_META[t.emdState].chip}`}>
                            {EMD_STATE_META[t.emdState].label}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-gray-600">{tdate(t.emdPaidOn)}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-gray-600">{tdate(t.emdExpiry)}</td>
                      <td className="px-4 py-2.5">
                        {isEmdBlocked(t) ? (
                          <button
                            onClick={() => release(t)}
                            className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 transition-colors duration-150 hover:bg-emerald-100"
                          >
                            Mark released
                          </button>
                        ) : (
                          <span className="text-[11px] text-gray-400">{t.emdReleasedOn ? tdate(t.emdReleasedOn) : "—"}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </TenderShell>
  );
}

function routeForStage(t: Tender): string {
  if (t.stage === "SORTING") return "sorting";
  if (t.stage === "RESEARCH") return "research";
  return "applied";
}

function Card({ label, value, tone, hint }: { label: string; value: number; tone: "amber" | "rose" | "gray"; hint: string }) {
  const text: Record<string, string> = { amber: "text-amber-600", rose: "text-rose-600", gray: "text-gray-800" };
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${text[tone]}`}>{inr(value)}</div>
      <div className="mt-0.5 text-[11px] text-gray-400">{hint}</div>
    </div>
  );
}
