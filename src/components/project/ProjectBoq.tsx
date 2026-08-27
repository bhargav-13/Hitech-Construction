"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, ChevronDown, ChevronRight, ClipboardList, Plus, Trash2, TriangleAlert } from "lucide-react";
import { Modal } from "@/components/Modal";
import { inr } from "@/lib/format";
import { boqTotals, itemCalc, useProjectBoqStore, DEFAULT_HANDOFF, type HandoffOptions } from "@/lib/projectBoqStore";
import { useAnalysisStore } from "@/lib/tenderAnalysisStore";
import { analysisTotals } from "@/lib/tenderAnalysisCalc";
import type { TenderAnalysis } from "@/lib/tenderAnalysisTypes";
import type { BoqItem, ProjectBoq as ProjectBoqType } from "@/lib/projectBoqTypes";

/**
 * The project's BOQ — what we bill, what it costs, and how much of it is actually built.
 *
 * <p>Items and Budget only — the commercial document. What is actually built against these rows
 * lives on the project's own Targets screen, because the people reading margins and the people
 * reporting quantities are not the same people.
 *
 * <p>The difference from OnSite is that Budget here is populated: it came across from the tender
 * analysis instead of being a column of zeroes nobody ever fills in.
 */

const TABS = ["Items", "Budget"] as const;
type Tab = (typeof TABS)[number];

export function ProjectBoq({ projectId }: { projectId: number }) {
  const boq = useProjectBoqStore((s) => s.boqs.find((b) => b.projectId === projectId) ?? null);
  const [tab, setTab] = useState<Tab>("Items");

  if (!boq) return <NoBoq projectId={projectId} />;

  const totals = boqTotals(boq);

  return (
    <div className="animate-fade-in space-y-4">
      <header className="grid grid-cols-2 divide-x divide-gray-100 rounded-xl border border-gray-200 bg-white lg:grid-cols-4">
        <Stat label="BOQ value" value={inr(totals.value)} sub={`${totals.itemCount} items · ${boq.boqNo}`} />
        <Stat
          label="Budget"
          value={inr(totals.cost)}
          sub={totals.cost > 0 ? "carried from the bid analysis" : "not costed"}
        />
        <Stat
          label="Planned margin"
          value={inr(totals.markup)}
          sub={`${totals.markupPct.toFixed(2)}%`}
          tone={totals.markup < 0 ? "text-rose-600" : "text-emerald-600"}
        />
        <Stat
          label="Work done"
          value={inr(totals.doneValue)}
          sub={`${totals.progressPct.toFixed(1)}% of BOQ value`}
        />
      </header>

      {boq.bidPct > 0 && (
        <p className="text-xs text-gray-500">
          Rates are the awarded rates — the tender schedule less the {boq.bidPct.toFixed(2)}% quoted below estimate.
          {boq.tenderRef && (
            <>
              {" "}
              <Link href={`/tender/analysis/${boq.tenderRef}`} className="text-brand-accent hover:underline">
                Open the bid analysis
              </Link>
              .
            </>
          )}
        </p>
      )}

      <nav className="flex gap-1 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`border-b-2 px-3.5 py-2.5 text-sm transition-colors duration-150 ${
              tab === t
                ? "border-brand-accent font-medium text-brand-accent"
                : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            {t}
          </button>
        ))}
      </nav>

      {tab === "Items" && <ItemsTab boq={boq} />}
      {tab === "Budget" && <BudgetTab boq={boq} />}
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: string }) {
  return (
    <div className="px-4 py-3">
      <div className="text-[10px] font-semibold tracking-wide text-gray-400 uppercase">{label}</div>
      <div className={`mt-1 text-base font-semibold tabular-nums ${tone ?? "text-gray-800"}`}>{value}</div>
      <div className="mt-0.5 text-[11px] text-gray-400">{sub}</div>
    </div>
  );
}

/* ---------------- Items ---------------- */

function ItemsTab({ boq }: { boq: ProjectBoqType }) {
  const updateItem = useProjectBoqStore((s) => s.updateItem);
  const removeItem = useProjectBoqStore((s) => s.removeItem);
  const addItem = useProjectBoqStore((s) => s.addItem);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const groups = useMemo(() => groupItems(boq.items), [boq.items]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => addItem(boq.id)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-600 transition-colors duration-150 hover:bg-gray-50"
        >
          <Plus size={13} /> Add item
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-[11px] tracking-wide text-gray-500 uppercase">
            <tr>
              <th className="px-3 py-2.5 text-left font-medium">Sr</th>
              <th className="px-3 py-2.5 text-left font-medium">Item</th>
              <th className="px-3 py-2.5 text-right font-medium">Qty</th>
              <th className="px-3 py-2.5 text-left font-medium">Unit</th>
              <th className="px-3 py-2.5 text-right font-medium">Rate</th>
              <th className="px-3 py-2.5 text-right font-medium">Amount</th>
              <th className="px-3 py-2.5 text-left font-medium">Progress</th>
              <th className="px-3 py-2.5 text-right font-medium">Done value</th>
              <th className="w-9" />
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <>
                {g.items.length > 1 && (
                  <tr key={g.key} className="border-b border-gray-100 bg-gray-50/70">
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        aria-label={collapsed.has(g.key) ? `Expand ${g.label}` : `Collapse ${g.label}`}
                        onClick={() =>
                          setCollapsed((p) => {
                            const n = new Set(p);
                            if (n.has(g.key)) n.delete(g.key);
                            else n.add(g.key);
                            return n;
                          })
                        }
                        className="text-gray-400 hover:text-gray-600"
                      >
                        {collapsed.has(g.key) ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-[13px] font-semibold text-gray-700">
                      {g.label}
                      <span className="ml-2 font-normal text-gray-400">{g.items.length} items</span>
                    </td>
                    <td colSpan={3} />
                    <td className="px-3 py-2 text-right font-semibold tabular-nums text-gray-700">
                      {inr(g.items.reduce((s, i) => s + itemCalc(i, boq.targets).value, 0))}
                    </td>
                    <td colSpan={3} />
                  </tr>
                )}
                {!collapsed.has(g.key) &&
                  g.items.map((item) => {
                    const c = itemCalc(item, boq.targets);
                    return (
                      <tr key={item.id} className="border-b border-gray-50 hover:bg-gray-50/60">
                        <td className="px-3 py-1.5 text-xs tabular-nums text-gray-400">{item.srNo}</td>
                        <td className="max-w-[300px] px-3 py-1.5">
                          <TextCell
                            value={item.description}
                            onCommit={(v) => updateItem(boq.id, item.id, { description: v })}
                            className="w-full min-w-[220px] text-gray-700"
                          />
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          <NumCell value={item.qty} onCommit={(v) => updateItem(boq.id, item.id, { qty: v })} />
                        </td>
                        <td className="px-3 py-1.5 text-gray-500">{item.unit}</td>
                        <td className="px-3 py-1.5 text-right">
                          <NumCell
                            value={item.saleRate}
                            onCommit={(v) => updateItem(boq.id, item.id, { saleRate: v })}
                          />
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-gray-700">{inr(c.value)}</td>
                        <td className="px-3 py-1.5">
                          {c.target ? (
                            <div className="flex items-center gap-2" title={`Target: ${c.target.name}`}>
                              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-gray-100">
                                <div
                                  className="h-full rounded-full bg-brand-accent"
                                  style={{ width: `${c.progress * 100}%` }}
                                />
                              </div>
                              <span className="text-[11px] tabular-nums text-gray-500">
                                {(c.progress * 100).toFixed(0)}%
                              </span>
                            </div>
                          ) : (
                            <span className="text-[11px] text-gray-300">no target</span>
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">{inr(c.doneValue)}</td>
                        <td className="px-2 py-1.5">
                          <button
                            type="button"
                            onClick={() => removeItem(boq.id, item.id)}
                            aria-label={`Remove ${item.description || "item"}`}
                            className="text-gray-300 transition-colors duration-150 hover:text-rose-600"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------- Budget ---------------- */

function BudgetTab({ boq }: { boq: ProjectBoqType }) {
  const updateItem = useProjectBoqStore((s) => s.updateItem);
  const totals = boqTotals(boq);

  return (
    <div className="space-y-3">
      {totals.lossCount > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50/70 px-4 py-2.5 text-sm text-rose-800">
          <TriangleAlert size={15} className="shrink-0" />
          {totals.lossCount} line{totals.lossCount === 1 ? " is" : "s are"} priced below what they cost. They were
          flagged at bid time too — worth checking before they are executed.
        </div>
      )}
      {boq.items.some((i) => (i.overheadRate ?? 0) > 0) && (
        <p className="text-xs text-gray-500">
          Cost rates are the item&apos;s own material and labour from the bid, plus its share of the site overheads —
          spread by value, because overheads are the one cost the bid does not hold per line.
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full min-w-[880px] text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-[11px] tracking-wide text-gray-500 uppercase">
            <tr>
              <th className="px-3 py-2.5 text-left font-medium">Item</th>
              <th className="px-3 py-2.5 text-right font-medium">Qty</th>
              <th className="px-3 py-2.5 text-right font-medium">Cost rate</th>
              <th className="px-3 py-2.5 text-right font-medium">Sale rate</th>
              <th className="px-3 py-2.5 text-right font-medium">Markup</th>
              <th className="px-3 py-2.5 text-right font-medium">Budget</th>
              <th className="px-3 py-2.5 text-right font-medium">Billable</th>
            </tr>
          </thead>
          <tbody>
            {boq.items.map((item) => {
              const c = itemCalc(item, boq.targets);
              const loss = item.costRate > 0 && item.saleRate < item.costRate;
              return (
                <tr key={item.id} className={`border-b border-gray-50 ${loss ? "bg-rose-50/40" : "hover:bg-gray-50/60"}`}>
                  <td className="max-w-[300px] truncate px-3 py-1.5 text-gray-700" title={item.description}>
                    {loss && <TriangleAlert size={12} className="mr-1 inline text-rose-500" />}
                    {item.description}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">
                    {item.qty.toLocaleString("en-IN")} {item.unit}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <NumCell value={item.costRate} onCommit={(v) => updateItem(boq.id, item.id, { costRate: v })} />
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <NumCell value={item.saleRate} onCommit={(v) => updateItem(boq.id, item.id, { saleRate: v })} />
                  </td>
                  <td
                    className={`px-3 py-1.5 text-right tabular-nums ${c.markup < 0 ? "text-rose-600" : "text-emerald-600"}`}
                  >
                    {inr(c.markup)}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">{inr(c.cost)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-gray-700">{inr(c.value)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t-2 border-gray-300 bg-gray-50 font-semibold text-gray-800">
            <tr>
              <td colSpan={5} className="px-3 py-3 text-right text-xs tracking-wide uppercase">
                Totals
              </td>
              <td className="px-3 py-3 text-right tabular-nums">{inr(totals.cost)}</td>
              <td className="px-3 py-3 text-right tabular-nums">{inr(totals.value)}</td>
            </tr>
            <tr>
              <td colSpan={5} className="px-3 py-2 text-right text-xs tracking-wide text-gray-400 uppercase">
                Planned margin
              </td>
              <td
                colSpan={2}
                className={`px-3 py-2 text-right tabular-nums ${totals.markup < 0 ? "text-rose-600" : "text-emerald-600"}`}
              >
                {inr(totals.markup)} · {totals.markupPct.toFixed(2)}%
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="text-xs text-gray-400">
        Every rate here came across from the bid analysis, so the project&apos;s budget is exactly what the bid said
        the job would cost. Edit a rate and the planned margin moves with it.
      </p>
    </div>
  );
}

/* ---------------- helpers ---------------- */

function groupItems(items: BoqItem[]): { key: string; label: string; items: BoqItem[] }[] {
  const byKey = new Map<string, { key: string; label: string; items: BoqItem[] }>();
  const order: string[] = [];
  for (const i of items) {
    let g = byKey.get(i.groupKey);
    if (!g) {
      g = { key: i.groupKey, label: i.groupLabel || i.description, items: [] };
      byKey.set(i.groupKey, g);
      order.push(i.groupKey);
    }
    g.items.push(i);
  }
  return order.map((k) => byKey.get(k)!);
}

function TextCell({ value, onCommit, className = "" }: { value: string; onCommit: (v: string) => void; className?: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      value={draft ?? value}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft != null && draft !== value) onCommit(draft);
        setDraft(null);
      }}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      className={`rounded border border-transparent bg-transparent px-1 py-0.5 text-sm focus:border-brand-accent focus:bg-white focus:outline-none ${className}`}
    />
  );
}

function NumCell({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      value={draft ?? String(value)}
      inputMode="decimal"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft != null) onCommit(Number(draft) || 0);
        setDraft(null);
      }}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      className="w-24 rounded border border-transparent bg-transparent px-1 py-0.5 text-right text-sm tabular-nums focus:border-brand-accent focus:bg-white focus:outline-none"
    />
  );
}

/**
 * A project with no BOQ.
 *
 * <p>The handover from a won tender is the normal route in, but every project that already existed
 * before this feature would otherwise be stuck looking at an empty tab with no way forward. So the
 * empty state can build the BOQ from any costed analysis directly.
 */
function NoBoq({ projectId }: { projectId: number }) {
  const analyses = useAnalysisStore((s) => s.analyses);
  const createFromAnalysis = useProjectBoqStore((s) => s.createFromAnalysis);
  const [picking, setPicking] = useState(false);
  const [chosen, setChosen] = useState<TenderAnalysis | null>(null);
  const [opts, setOpts] = useState<HandoffOptions>(DEFAULT_HANDOFF);

  const usable = analyses.filter((a) => a.boqLines.length > 0);

  return (
    <div className="animate-fade-in flex min-h-[320px] flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white px-6 text-center">
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-cyan-50 text-brand-accent">
        <ClipboardList size={24} />
      </div>
      <div className="text-base font-semibold text-gray-700">No BOQ on this project</div>
      <p className="mt-1 max-w-md text-sm text-gray-400">
        A BOQ normally arrives with the handover from a won tender. This project was created before that, or without
        an analysis — you can still build its BOQ from one now.
      </p>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          disabled={usable.length === 0}
          onClick={() => setPicking(true)}
          className="rounded-lg bg-brand-accent px-3.5 py-2 text-xs font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95 disabled:opacity-40"
        >
          Build BOQ from a tender analysis
        </button>
        <Link
          href="/tender/analysis"
          className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-600 transition-colors duration-150 hover:bg-gray-50"
        >
          Open health analysis <ArrowUpRight size={12} />
        </Link>
      </div>
      {usable.length === 0 && (
        <p className="mt-2 text-[11px] text-gray-400">No costed analyses yet — run one in the Tender module first.</p>
      )}

      {picking && (
        <Modal onClose={() => setPicking(false)} wide guardOnClose={false}>
          <div className="flex max-h-[80vh] flex-col text-left">
            <header className="border-b border-gray-200 p-4">
              <h2 className="text-base font-semibold text-gray-800">
                {chosen ? "How should the BOQ come across?" : "Which analysis?"}
              </h2>
              <p className="mt-0.5 text-xs text-gray-500">
                {chosen ? chosen.title : "Its BOQ, its cost build-up and its targets are copied onto this project."}
              </p>
            </header>

            {!chosen ? (
              <div className="min-h-0 flex-1 overflow-y-auto">
                {usable.map((a) => {
                  const t = analysisTotals(a);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => {
                        setChosen(a);
                        setOpts({ ...DEFAULT_HANDOFF, boqNo: `BOQ-${a.tenderId}` });
                      }}
                      className="flex w-full items-center gap-3 border-b border-gray-50 px-4 py-2.5 text-left transition-colors duration-150 hover:bg-cyan-50/50"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-gray-700">{a.title}</span>
                        <span className="text-[11px] text-gray-400">
                          {a.tenderId} · {a.boqLines.length} items · bid −{a.bidPct.toFixed(2)}%
                        </span>
                      </span>
                      <span className="shrink-0 text-sm tabular-nums text-gray-500">{inr(t.tenderValue)}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-3 p-4">
                <Field label="Rates">
                  <Segmented
                    value={opts.rateBasis}
                    onChange={(v) => setOpts((o) => ({ ...o, rateBasis: v as HandoffOptions["rateBasis"] }))}
                    options={[
                      { value: "AWARDED", label: `Awarded (−${chosen.bidPct.toFixed(2)}%)` },
                      { value: "TENDER", label: "Tender rate" },
                    ]}
                  />
                </Field>
                <Field label="Targets">
                  <Segmented
                    value={opts.targets}
                    onChange={(v) => setOpts((o) => ({ ...o, targets: v as HandoffOptions["targets"] }))}
                    options={[
                      { value: "PER_GROUP", label: "Per family" },
                      { value: "PER_LINE", label: "Per line" },
                      { value: "NONE", label: "None" },
                    ]}
                  />
                </Field>
                <Field label="Budget">
                  <Segmented
                    value={opts.carryCost ? "YES" : "NO"}
                    onChange={(v) => setOpts((o) => ({ ...o, carryCost: v === "YES" }))}
                    options={[
                      { value: "YES", label: "Carry cost estimate" },
                      { value: "NO", label: "Skip" },
                    ]}
                  />
                </Field>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setChosen(null)}
                    className="rounded-lg border border-gray-200 px-3.5 py-2 text-sm text-gray-600 transition-colors duration-150 hover:bg-gray-50"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      createFromAnalysis(projectId, chosen, opts);
                      setPicking(false);
                    }}
                    className="rounded-lg bg-brand-accent px-3.5 py-2 text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95"
                  >
                    Build BOQ
                  </button>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="text-sm text-gray-600">{label}</span>
      {children}
    </div>
  );
}

function Segmented({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex rounded-lg bg-gray-100 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded-md px-2.5 py-1 text-xs transition-colors duration-150 ${
            value === o.value ? "bg-white font-medium text-gray-800 shadow-sm" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
