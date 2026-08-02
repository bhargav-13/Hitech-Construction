"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TenderShell } from "@/components/tender/TenderShell";
import { useTenderStore } from "@/lib/tenderStore";
import { BUCKET_META, EMD_MODE_META, LOSS_REASON_META, SECURITY_TYPE_META } from "@/lib/tenderTypes";
import type { EmdMode, SecurityType, Tender, TenderBucket } from "@/lib/tenderTypes";
import {
  DEADLINE_KIND_LABEL,
  bucketRows,
  competitorRows,
  departmentRows,
  exposure,
  isEmdRecoverable,
  lossBreakdown,
  monthlySubmissions,
  staleCount,
  successRate,
  upcomingDeadlines,
} from "@/lib/tenderMetrics";
import { DEADLINE_TONE_CLASS, deadlineLabel, deadlineTone, tdate, tmoney } from "@/lib/tenderHelpers";
import { inr, inrAxis } from "@/lib/format";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  IndianRupee,
  Landmark,
  Percent,
  ShieldCheck,
  Trophy,
  Undo2,
  Users,
} from "lucide-react";

/** Which pipeline screen each reporting bucket drills into. */
const BUCKET_ROUTE: Record<TenderBucket, string> = {
  SHORTLISTED: "/tender/sorting",
  UNDER_RESEARCH: "/tender/research",
  APPLIED: "/tender/applied",
  UNDER_REVIEW: "/tender/applied",
  CANCELLED_RETENDERED: "/tender/applied",
  WON: "/tender/applied?outcome=WON",
  COMPLETED: "/tender/applied?outcome=WON",
  LOST: "/tender/applied?outcome=LOST",
};

export default function TenderDashboard() {
  const tenders = useTenderStore((s) => s.tenders);

  const rows = useMemo(() => bucketRows(tenders), [tenders]);
  const rate = useMemo(() => successRate(tenders), [tenders]);
  const money = useMemo(() => exposure(tenders), [tenders]);
  const months = useMemo(() => monthlySubmissions(tenders), [tenders]);
  const upcoming = useMemo(() => upcomingDeadlines(tenders, 14), [tenders]);
  const stale = useMemo(() => staleCount(tenders), [tenders]);
  const losses = useMemo(() => lossBreakdown(tenders), [tenders]);
  const competitors = useMemo(() => competitorRows(tenders), [tenders]);
  const departments = useMemo(() => departmentRows(tenders), [tenders]);
  const recoverable = useMemo(
    () => tenders.filter(isEmdRecoverable).sort((a, b) => (b.emd ?? 0) - (a.emd ?? 0)),
    [tenders],
  );
  const awaitingHandover = useMemo(
    () => tenders.filter((t) => t.stage === "WON" && t.projectId == null),
    [tenders],
  );

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, r) => ({
          count: acc.count + r.count,
          estimated: acc.estimated + r.estimated,
          contract: acc.contract + r.contract,
        }),
        { count: 0, estimated: 0, contract: 0 },
      ),
    [rows],
  );

  const overdue = upcoming.filter((u) => u.days < 0).length;

  return (
    <TenderShell>
      <div className="space-y-5">
        <div>
          <h1 className="text-lg font-semibold text-gray-800">Tender Dashboard</h1>
          <p className="text-sm text-gray-500">
            {totals.count} tenders · {inr(totals.estimated)} estimated · {inr(totals.contract)} contracted
          </p>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Success rate"
            value={`${(rate.rate * 100).toFixed(1)}%`}
            hint={`${rate.won} won ÷ ${rate.contested} contested`}
            accent="green"
            icon={Percent}
          />
          <StatCard label="Contract value won" value={inr(rows.find((r) => r.bucket === "WON")?.contract ?? 0)} accent="cyan" icon={Trophy} />
          <StatCard
            label="Money blocked"
            value={inr(money.totalBlocked)}
            hint={`${inr(money.emdBlocked)} EMD + ${inr(money.securityBlocked)} security`}
            accent="amber"
            icon={Landmark}
          />
          <StatCard
            label="Due in 14 days"
            value={upcoming.length}
            hint={overdue ? `${overdue} already overdue` : "Nothing overdue"}
            accent={overdue ? "rose" : "gray"}
            icon={CalendarClock}
          />
        </div>

        {/* Success rate — both definitions, explicitly labelled */}
        <Panel
          title="Success rate"
          subtitle="Matching the workbook's definition, with the alternative shown beside it so no figure is ambiguous."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <RateBlock
              label="Awarded"
              pct={rate.rate}
              formula={`${rate.won} won ÷ ${rate.contested} contested`}
              note="The workbook's figure. Completed jobs are counted separately; cancelled and retendered tenders are excluded from the denominator."
              tone="emerald"
            />
            <RateBlock
              label="Awarded + completed"
              pct={rate.rateInclCompleted}
              formula={`${rate.won + rate.completed} won ÷ ${rate.contested} contested`}
              note="Counts finished jobs as wins too — arguably the truer number, but not what the sheet reports."
              tone="cyan"
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-gray-500">
            <Tag>{rate.won} awarded</Tag>
            <Tag>{rate.completed} completed</Tag>
            <Tag>{rate.lost} lost</Tag>
            <Tag>{rate.cancelled} cancelled / retendered (excluded)</Tag>
          </div>
        </Panel>

        {/* Status table + funnel */}
        <div className="grid gap-4 xl:grid-cols-2">
          <Panel title="Status-wise value" subtitle="Tender count, estimated cost and contract value per bucket.">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-gray-500">
                    <th className="py-2 pr-2 font-medium">Status</th>
                    <th className="py-2 px-2 text-right font-medium">Count</th>
                    <th className="py-2 px-2 text-right font-medium">Estimated</th>
                    <th className="py-2 pl-2 text-right font-medium">Contract</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.bucket} className="border-b border-gray-50 last:border-b-0">
                      <td className="py-2 pr-2">
                        <Link href={BUCKET_ROUTE[r.bucket]} className="inline-flex items-center gap-1.5 text-gray-700 hover:text-brand-accent">
                          <span className={`h-2 w-2 shrink-0 rounded-full ${BUCKET_META[r.bucket].bar}`} />
                          {BUCKET_META[r.bucket].label}
                        </Link>
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums text-gray-700">{r.count}</td>
                      <td className="py-2 px-2 text-right tabular-nums text-gray-600">{r.estimated ? inr(r.estimated) : "—"}</td>
                      <td className="py-2 pl-2 text-right tabular-nums text-gray-600">{r.contract ? inr(r.contract) : "—"}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-gray-200 font-semibold text-gray-800">
                    <td className="py-2 pr-2">Total</td>
                    <td className="py-2 px-2 text-right tabular-nums">{totals.count}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{inr(totals.estimated)}</td>
                    <td className="py-2 pl-2 text-right tabular-nums">{inr(totals.contract)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Funnel" subtitle="Where every tender currently sits.">
            <div className="space-y-1.5">
              {rows.map((r) => {
                const max = Math.max(1, ...rows.map((x) => x.count));
                const pct = Math.round((r.count / max) * 100);
                return (
                  <Link
                    key={r.bucket}
                    href={BUCKET_ROUTE[r.bucket]}
                    className="flex items-center gap-3 rounded-md py-0.5 hover:bg-gray-50"
                  >
                    <div className="w-40 shrink-0 truncate text-[13px] text-gray-600">{BUCKET_META[r.bucket].label}</div>
                    <div className="relative h-6 flex-1 overflow-hidden rounded-md bg-gray-100">
                      <div
                        className={`h-full ${BUCKET_META[r.bucket].bar} opacity-80 transition-all duration-300`}
                        style={{ width: `${Math.max(pct, r.count ? 3 : 0)}%` }}
                      />
                      <span className="absolute inset-y-0 left-2 flex items-center text-xs font-medium text-gray-700">{r.count}</span>
                    </div>
                    <ArrowRight size={13} className="shrink-0 text-gray-300" />
                  </Link>
                );
              })}
            </div>
          </Panel>
        </div>

        {/* Financial exposure */}
        <Panel
          title="Money blocked"
          subtitle="Working capital tied up in EMDs and security deposits — the reason this desk exists."
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MoneyCard label="EMD blocked" value={money.emdBlocked} icon={Landmark} tone="amber" hint="Paid, not yet released, on live or won bids." />
            <MoneyCard label="Security deposits" value={money.securityBlocked} icon={ShieldCheck} tone="violet" hint="Security + additional security still held." />
            <MoneyCard label="EMD required" value={money.emdRequired} icon={IndianRupee} tone="gray" hint="Will have to be furnished on pipeline tenders." />
            <MoneyCard label="BG charges" value={money.bgCharges} icon={Percent} tone="gray" hint="Cost of carrying bank guarantees — an expense, not blocked capital." />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <Breakdown
              title="EMD by instrument"
              rows={(Object.keys(EMD_MODE_META) as EmdMode[])
                .map((m) => ({ label: EMD_MODE_META[m].label, value: money.emdByMode[m] }))
                .filter((r) => r.value > 0)}
              total={money.emdBlocked}
            />
            <Breakdown
              title="Security by instrument"
              rows={(Object.keys(SECURITY_TYPE_META) as SecurityType[])
                .flatMap((t) => [
                  { label: `${SECURITY_TYPE_META[t].label} — security`, value: money.securityByType[t] },
                  { label: `${SECURITY_TYPE_META[t].label} — additional`, value: money.additionalByType[t] },
                ])
                .filter((r) => r.value > 0)}
              total={money.securityBlocked}
            />
            <Breakdown
              title="Tender fee"
              rows={Object.entries(money.feeByBucket)
                .map(([bucket, value]) => ({ label: BUCKET_META[bucket as TenderBucket].label, value }))
                .filter((r) => r.value > 0)}
              total={money.feeSpent + money.feePipeline}
            />
          </div>
        </Panel>

        {/* EMD to chase — nothing in the workbook tracks this */}
        {recoverable.length > 0 && (
          <Panel
            title="EMD to recover"
            subtitle="Paid on tenders that are already lost or cancelled, with no refund recorded. The workbook never tracked releases at all."
            accent="rose"
          >
            <div className="mb-3 flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-inset ring-rose-600/20">
              <Undo2 size={15} />
              <span>
                <strong>{inr(money.emdRecoverable)}</strong> across {recoverable.length} tenders is refundable and unaccounted for.
              </span>
            </div>
            <ul className="divide-y divide-gray-50">
              {recoverable.slice(0, 6).map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 py-2">
                  <Link href={`/tender/applied?open=${t.id}`} className="min-w-0 flex-1 hover:text-brand-accent">
                    <div className="truncate text-sm text-gray-700" title={t.nameOfWork ?? ""}>
                      {t.nameOfWork ?? "Untitled tender"}
                    </div>
                    <div className="text-[11px] text-gray-400">
                      {t.department ?? "—"} · {t.statusLabel ?? t.status ?? "—"}
                    </div>
                  </Link>
                  <span className="shrink-0 text-sm font-medium text-gray-700">{tmoney(t.emd)}</span>
                </li>
              ))}
            </ul>
            {recoverable.length > 6 && (
              <Link href="/tender/emd" className="mt-2 inline-block text-xs font-medium text-brand-accent hover:underline">
                See all {recoverable.length} →
              </Link>
            )}
          </Panel>
        )}

        {/* Won tenders still waiting to become projects — the handoff nobody chases. */}
        {awaitingHandover.length > 0 && (
          <Panel
            title="Won, not yet handed over"
            subtitle="Awarded tenders with no project in the Project module. Execution cannot start until they cross over."
          >
            <ul className="divide-y divide-gray-50">
              {awaitingHandover.slice(0, 5).map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 py-2">
                  <Link href={`/tender/applied?open=${t.id}`} className="min-w-0 flex-1 hover:text-brand-accent">
                    <div className="truncate text-sm text-gray-700" title={t.nameOfWork ?? ""}>
                      {t.nameOfWork ?? "Untitled tender"}
                    </div>
                    <div className="text-[11px] text-gray-400">{t.department ?? "—"}</div>
                  </Link>
                  <span className="shrink-0 text-sm font-medium text-gray-700">
                    {tmoney(t.contractValue ?? t.estimatedCost)}
                  </span>
                </li>
              ))}
            </ul>
            <Link href="/project" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand-accent hover:underline">
              Open the Project module <ArrowUpRight size={12} />
            </Link>
          </Panel>
        )}

        {/* Deadlines + monthly trend */}
        <div className="grid gap-4 xl:grid-cols-2">
          <Panel
            title="Next 14 days"
            subtitle={
              stale > 0
                ? `Deadlines, hardcopy dispatch, pre-bid meetings and openings on live tenders. ${stale} tender${stale === 1 ? "" : "s"} went past their deadline over a month ago and are hidden — close them.`
                : "Bid deadlines, hardcopy dispatch, pre-bid meetings and openings on live tenders."
            }
          >
            {upcoming.length === 0 ? (
              <p className="text-sm text-gray-400">Nothing due in the next fortnight.</p>
            ) : (
              <ul className="max-h-[320px] divide-y divide-gray-50 overflow-y-auto">
                {upcoming.slice(0, 25).map((item) => (
                  <li key={`${item.tender.id}-${item.kind}`} className="flex items-center gap-3 py-2">
                    <span
                      className={`w-24 shrink-0 rounded-full px-2 py-0.5 text-center text-[11px] font-medium ring-1 ring-inset ${
                        DEADLINE_TONE_CLASS[deadlineTone(item.date)]
                      }`}
                    >
                      {deadlineLabel(item.date)}
                    </span>
                    <Link href={`/tender/${routeForStage(item.tender)}?open=${item.tender.id}`} className="min-w-0 flex-1 hover:text-brand-accent">
                      <div className="truncate text-sm text-gray-700" title={item.tender.nameOfWork ?? ""}>
                        {item.tender.nameOfWork ?? "Untitled tender"}
                      </div>
                      <div className="text-[11px] text-gray-400">
                        {DEADLINE_KIND_LABEL[item.kind]} · {tdate(item.date)}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/tender/calendar" className="mt-2 inline-block text-xs font-medium text-brand-accent hover:underline">
              Open calendar →
            </Link>
          </Panel>

          <Panel title="Monthly submissions" subtitle="Bids submitted and the contract value they carried.">
            {months.length === 0 ? (
              <p className="text-sm text-gray-400">No submission dates recorded yet.</p>
            ) : (
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={months} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                    <YAxis yAxisId="count" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <YAxis
                      yAxisId="value"
                      orientation="right"
                      tick={{ fontSize: 10, fill: "#94a3b8" }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: number) => inrAxis(v)}
                    />
                    <Tooltip
                      contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }}
                      formatter={(value, name) =>
                        name === "Contract value" ? [inr(Number(value)), name] : [String(value), name]
                      }
                    />
                    <Bar yAxisId="count" dataKey="count" name="Submissions" fill="#0891b2" radius={[4, 4, 0, 0]} maxBarSize={26} />
                    <Line yAxisId="value" type="monotone" dataKey="contract" name="Contract value" stroke="#10b981" strokeWidth={2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </Panel>
        </div>

        {/* Outcome analysis */}
        <div className="grid gap-4 xl:grid-cols-3">
          <Panel title="Why we lose" subtitle="Captured on every tender that leaves the pipeline." icon={AlertTriangle}>
            {losses.length === 0 ? (
              <p className="text-sm text-gray-400">No losses recorded.</p>
            ) : (
              <ul className="space-y-2">
                {losses.map((row) => {
                  const max = Math.max(...losses.map((l) => l.count));
                  const label = row.reason === "UNSPECIFIED" ? "Not recorded" : LOSS_REASON_META[row.reason].label;
                  return (
                    <li key={row.reason}>
                      <div className="flex items-baseline justify-between gap-2 text-[13px]">
                        <span className={row.reason === "UNSPECIFIED" ? "text-gray-400 italic" : "text-gray-700"}>{label}</span>
                        <span className="tabular-nums text-gray-500">{row.count}</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100">
                        <div
                          className={`h-full ${row.reason === "UNSPECIFIED" ? "bg-gray-300" : "bg-rose-400"}`}
                          style={{ width: `${(row.count / max) * 100}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          <Panel title="Who beats us" subtitle="From the L1 bidder recorded on each loss." icon={Users}>
            {competitors.length === 0 ? (
              <p className="text-sm text-gray-400">
                No competitor data yet — record the L1 bidder when marking a tender lost and this fills in.
              </p>
            ) : (
              <ul className="divide-y divide-gray-50">
                {competitors.slice(0, 6).map((c) => (
                  <li key={c.bidder} className="flex items-center justify-between gap-2 py-2">
                    <span className="min-w-0 truncate text-sm text-gray-700">{c.bidder}</span>
                    <span className="shrink-0 text-xs text-gray-500">
                      {c.wins}× {c.avgMarginPct != null && `· ${c.avgMarginPct.toFixed(1)}% under`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Departments" subtitle="Where the work actually comes from.">
            {departments.length === 0 ? (
              <p className="text-sm text-gray-400">Nothing decided yet.</p>
            ) : (
              <ul className="divide-y divide-gray-50">
                {departments.map((d) => (
                  <li key={d.department} className="py-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="min-w-0 truncate text-[13px] text-gray-700" title={d.department}>
                        {d.department}
                      </span>
                      <span className="shrink-0 text-xs text-gray-500">
                        {d.won}/{d.won + d.lost} · {(d.winRate * 100).toFixed(0)}%
                      </span>
                    </div>
                    {d.value > 0 && <div className="text-[11px] text-gray-400">{inr(d.value)} won</div>}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </TenderShell>
  );
}

/** Which pipeline page a tender's detail drawer lives on. */
function routeForStage(t: Tender): string {
  if (t.stage === "SORTING") return "sorting";
  if (t.stage === "RESEARCH") return "research";
  return "applied";
}

/* ---------- presentational pieces ---------- */

function Panel({
  title,
  subtitle,
  children,
  icon: Icon,
  accent,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  accent?: "rose";
}) {
  return (
    <section className={`rounded-xl border bg-white p-4 ${accent === "rose" ? "border-rose-200" : "border-gray-200"}`}>
      <div className="mb-3">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-gray-700">
          {Icon && <Icon size={14} className="text-gray-400" />}
          {title}
        </h2>
        {subtitle && <p className="mt-0.5 text-xs text-gray-400">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function StatCard({
  label,
  value,
  accent,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  accent: "gray" | "green" | "amber" | "cyan" | "rose";
  hint?: string;
  icon: React.ComponentType<{ size?: number }>;
}) {
  const tone: Record<string, string> = {
    gray: "text-gray-800",
    green: "text-emerald-600",
    amber: "text-amber-600",
    cyan: "text-brand-accent",
    rose: "text-rose-600",
  };
  const bg: Record<string, string> = {
    gray: "bg-gray-100 text-gray-500",
    green: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    cyan: "bg-cyan-50 text-brand-accent",
    rose: "bg-rose-50 text-rose-600",
  };
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs text-gray-500">{label}</div>
          <div className={`mt-1 text-2xl font-semibold ${tone[accent]}`}>{value}</div>
          {hint && <div className="mt-0.5 text-[11px] text-gray-400">{hint}</div>}
        </div>
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${bg[accent]}`}>
          <Icon size={17} />
        </div>
      </div>
    </div>
  );
}

function RateBlock({
  label,
  pct,
  formula,
  note,
  tone,
}: {
  label: string;
  pct: number;
  formula: string;
  note: string;
  tone: "emerald" | "cyan";
}) {
  const bar = tone === "emerald" ? "bg-emerald-500" : "bg-brand-accent";
  const text = tone === "emerald" ? "text-emerald-600" : "text-brand-accent";
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50/60 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-medium text-gray-700">{label}</span>
        <span className={`text-xl font-semibold ${text}`}>{(pct * 100).toFixed(1)}%</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-200">
        <div className={`h-full ${bar}`} style={{ width: `${Math.min(pct * 100, 100)}%` }} />
      </div>
      <div className="mt-1.5 text-[11px] font-medium text-gray-500">{formula}</div>
      <p className="mt-1 text-[11px] leading-relaxed text-gray-400">{note}</p>
    </div>
  );
}

function MoneyCard({
  label,
  value,
  hint,
  tone,
  icon: Icon,
}: {
  label: string;
  value: number;
  hint: string;
  tone: "amber" | "violet" | "gray";
  icon: React.ComponentType<{ size?: number }>;
}) {
  const bg: Record<string, string> = {
    amber: "bg-amber-50 text-amber-600",
    violet: "bg-violet-50 text-violet-600",
    gray: "bg-gray-100 text-gray-500",
  };
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50/60 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] text-gray-500">{label}</div>
          <div className="mt-0.5 text-lg font-semibold text-gray-800">{inr(value)}</div>
        </div>
        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${bg[tone]}`}>
          <Icon size={14} />
        </div>
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-gray-400">{hint}</p>
    </div>
  );
}

function Breakdown({ title, rows, total }: { title: string; rows: { label: string; value: number }[]; total: number }) {
  return (
    <div>
      <h3 className="mb-1.5 text-[11px] font-semibold tracking-wide text-gray-400 uppercase">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-xs text-gray-400">Nothing recorded.</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r) => (
            <li key={r.label}>
              <div className="flex items-baseline justify-between gap-2 text-[12px]">
                <span className="min-w-0 truncate text-gray-600">{r.label}</span>
                <span className="shrink-0 tabular-nums text-gray-700">{inr(r.value)}</span>
              </div>
              <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-gray-100">
                <div className="h-full bg-brand-accent/60" style={{ width: `${total ? (r.value / total) * 100 : 0}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-600">{children}</span>;
}
