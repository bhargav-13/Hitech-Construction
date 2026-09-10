"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Flag,
  FolderPlus,
  Library,
  Pencil,
  Plus,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { Modal } from "@/components/Modal";
import { Select } from "@/components/Select";
import { RowMenu, RowMenuDivider, RowMenuItem } from "@/components/RowMenu";
import { inr } from "@/lib/format";
import * as api from "@/lib/projectTargetApi";
import type { ApiBoqFamily, ApiBoqItem, ApiProjectBoq } from "@/lib/projectTargetApi";
import { useAnalysisStore } from "@/lib/tenderAnalysisStore";
import type { RateLibraryItem } from "@/lib/tenderAnalysisTypes";
import {
  milestoneAmount,
  newId,
  useMilestones,
  useSalesInvoices,
  type MilestoneStatus,
  type ProjectMilestone,
  type ProjectSalesInvoice,
} from "@/lib/projectBillingStore";

/**
 * The project's Bill of Quantities — the commercial document the job is billed against.
 *
 * <p>Two rules shape the whole screen, and both come from the same complaint: a BOQ nobody can
 * navigate.
 *
 * <ol>
 *   <li><b>Titles are built first, items go inside them.</b> A title is a real record that can sit
 *       empty, so a job can be laid out as twelve headings on day one and filled in over the
 *       following week. Every line names the family it belongs to — there is no "Additional items"
 *       bucket for lines nobody filed, because that bucket is how a BOQ ends up with forty lines that
 *       can never be found again.
 *   <li><b>Lines come from the rate library, not from a blank row.</b> A blank row is a rate nobody
 *       checked and a description nobody will match to the next tender. Picking from the library
 *       carries the rate that was actually used, and how many sheets used it.
 * </ol>
 */
export function ProjectBoq({ projectId }: { projectId: number }) {
  const [boq, setBoq] = useState<ApiProjectBoq | null>(null);
  const [families, setFamilies] = useState<ApiBoqFamily[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    const b = await api.getBoq(projectId);
    return { boq: b, families: b ? await api.getFamilies(projectId) : [] };
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    fetchAll()
      .then((r) => {
        if (cancelled) return;
        setBoq(r.boq);
        setFamilies(r.families);
        setError(null);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Couldn't load this BOQ.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchAll]);

  const reload = useCallback(async () => {
    const r = await fetchAll();
    setBoq(r.boq);
    setFamilies(r.families);
  }, [fetchAll]);

  if (loading) {
    return <div className="animate-fade-in py-16 text-center text-sm text-gray-400">Loading BOQ…</div>;
  }

  if (error) {
    return (
      <div className="animate-fade-in flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50/70 px-4 py-3 text-sm text-rose-900">
        <TriangleAlert size={16} className="mt-0.5 shrink-0" />
        <p>
          <strong>Couldn&apos;t load the BOQ.</strong> {error}
        </p>
      </div>
    );
  }

  if (!boq) {
    return (
      <div className="animate-fade-in flex min-h-[320px] flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white px-6 text-center">
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-cyan-50 text-brand-accent">
          <Library size={24} />
        </div>
        <div className="text-base font-semibold text-gray-700">No BOQ on this project</div>
        <p className="mt-1 max-w-md text-sm text-gray-400">
          A BOQ arrives when a won tender is handed over, carrying its families and rates across. Until
          then there is nothing to bill against.
        </p>
      </div>
    );
  }

  return <BoqSheet projectId={projectId} boq={boq} families={families} reload={reload} />;
}

function BoqSheet({
  projectId,
  boq,
  families,
  reload,
}: {
  projectId: number;
  boq: ApiProjectBoq;
  families: ApiBoqFamily[];
  reload: () => Promise<void>;
}) {
  const [sub, setSub] = useState<SubTab>("items");
  // Titles start collapsed: a BOQ with a dozen headings opens as a readable table of contents, not
  // a wall of every line at once. One click opens the title you actually want.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(families.map((f) => f.key)));
  const [newFamily, setNewFamily] = useState(false);
  const [renaming, setRenaming] = useState<ApiBoqFamily | null>(null);
  const [deleting, setDeleting] = useState<ApiBoqFamily | null>(null);
  const [adding, setAdding] = useState<ApiBoqFamily | null>(null);
  const [editing, setEditing] = useState<ApiBoqItem | null>(null);
  const [error, setError] = useState("");

  const byFamily = useMemo(() => {
    const m = new Map<string, ApiBoqItem[]>();
    for (const i of boq.items) {
      const list = m.get(i.groupKey) ?? [];
      list.push(i);
      m.set(i.groupKey, list);
    }
    return m;
  }, [boq.items]);

  const totals = useMemo(() => {
    let value = 0;
    let cost = 0;
    for (const i of boq.items) {
      value += i.qty * i.saleRate;
      cost += i.qty * i.costRate;
    }
    return { value, cost, markup: value - cost, pct: value > 0 ? ((value - cost) / value) * 100 : 0 };
  }, [boq.items]);

  async function act(fn: () => Promise<unknown>) {
    setError("");
    try {
      await fn();
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That change was refused.");
    }
  }

  const toggle = (key: string) =>
    setCollapsed((p) => {
      const n = new Set(p);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  return (
    <div className="animate-fade-in space-y-4">
      <header className="grid grid-cols-2 divide-x divide-gray-100 rounded-xl border border-gray-200 bg-white lg:grid-cols-4">
        <Stat label="Contract value" value={inr(totals.value)} sub={`${boq.items.length} lines`} />
        <Stat label="Budgeted cost" value={inr(totals.cost)} sub="carried from the bid" />
        <Stat label="Margin" value={inr(totals.markup)} sub={`${totals.pct.toFixed(1)}%`} />
        <Stat label="Titles" value={String(families.length)} sub="headings on this BOQ" />
      </header>

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          <TriangleAlert size={15} className="mt-0.5 shrink-0" />
          <span className="min-w-0 flex-1">{error}</span>
          <button type="button" onClick={() => setError("")} className="shrink-0 text-rose-400 hover:text-rose-600">
            ✕
          </button>
        </div>
      )}

      <SubTabBar value={sub} onChange={setSub} />

      {sub === "budget" && <BudgetPanel boq={boq} />}
      {sub === "milestone" && <MilestonePanel projectId={projectId} boqValue={totals.value} />}
      {sub === "invoices" && <InvoicesPanel projectId={projectId} boq={boq} />}

      {sub === "items" && (
        <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-gray-400">
          {boq.title ?? "BOQ"} · {boq.boqNo ?? "—"}
        </span>
        <button
          type="button"
          onClick={() => setNewFamily(true)}
          className="ml-auto flex items-center gap-1.5 rounded-lg bg-brand-accent px-3 py-1.5 text-xs font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95"
        >
          <FolderPlus size={13} /> New title
        </button>
      </div>

      {families.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
          <FolderPlus size={22} className="mx-auto mb-2 text-gray-300" />
          <p className="text-sm text-gray-500">No titles yet.</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-gray-400">
            A BOQ is organised into titles — Earthwork, Pipe laying, Manholes — and items go inside
            them. Make the first one and add items to it.
          </p>
          <button
            type="button"
            onClick={() => setNewFamily(true)}
            className="mt-4 rounded-lg bg-brand-accent px-3.5 py-2 text-xs font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95"
          >
            New title
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {families.map((f) => {
            const items = byFamily.get(f.key) ?? [];
            const isOpen = !collapsed.has(f.key);
            return (
              <section key={f.key} className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                <header className="flex items-center gap-2 border-b border-gray-100 bg-gray-50/70 px-3 py-2.5">
                  <button
                    type="button"
                    onClick={() => toggle(f.key)}
                    className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                  >
                    {isOpen ? (
                      <ChevronDown size={15} className="shrink-0 text-gray-400" />
                    ) : (
                      <ChevronRight size={15} className="shrink-0 text-gray-400" />
                    )}
                    <span className="min-w-0 truncate text-sm font-semibold text-gray-800" title={f.label}>
                      {f.label}
                    </span>
                    <span className="shrink-0 whitespace-nowrap text-[11px] text-gray-400">
                      {f.lineCount} {f.lineCount === 1 ? "item" : "items"}
                    </span>
                  </button>
                  <span className="w-32 shrink-0 text-right text-xs tabular-nums text-gray-600">
                    {inr(f.value)}
                  </span>
                  {/* Adding lives in the menu and in the dashed row inside. A solid button repeated
                      down every title turned the page into a column of blue. */}
                  <RowMenu align="right" buttonLabel={`Actions for ${f.label}`}>
                    {(close) => (
                      <>
                        <RowMenuItem
                          icon={Plus}
                          label="Add item"
                          onClick={() => {
                            close();
                            setAdding(f);
                          }}
                        />
                        <RowMenuItem
                          icon={Pencil}
                          label="Rename title"
                          onClick={() => {
                            close();
                            setRenaming(f);
                          }}
                        />
                        <RowMenuDivider />
                        <RowMenuItem
                          icon={Trash2}
                          label="Delete title"
                          tone="danger"
                          onClick={() => {
                            close();
                            setDeleting(f);
                          }}
                        />
                      </>
                    )}
                  </RowMenu>
                </header>

                {isOpen &&
                  (items.length === 0 ? (
                    <div className="px-4 py-6 text-center">
                      <p className="text-xs text-gray-400">Nothing in this title yet.</p>
                      <button
                        type="button"
                        onClick={() => setAdding(f)}
                        className="mt-2 inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] text-gray-600 transition-colors duration-150 hover:bg-gray-50"
                      >
                        <Plus size={11} /> Add the first item
                      </button>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[820px] text-sm">
                        <thead className="border-b border-gray-100 text-[11px] tracking-wide text-gray-400 uppercase">
                          <tr>
                            <th className="w-14 px-3 py-2 text-left font-medium">Sr</th>
                            <th className="px-3 py-2 text-left font-medium">Description</th>
                            <th className="px-3 py-2 text-right font-medium">Qty</th>
                            <th className="px-3 py-2 text-left font-medium">Unit</th>
                            <th className="px-3 py-2 text-right font-medium">Rate</th>
                            <th className="px-3 py-2 text-right font-medium">Amount</th>
                            <th className="px-3 py-2 text-right font-medium">Cost</th>
                            <th className="w-10" />
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((i) => {
                            const amount = i.qty * i.saleRate;
                            const cost = i.qty * i.costRate;
                            const loss = i.saleRate > 0 && i.costRate > i.saleRate;
                            return (
                              <tr key={i.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                                <td className="px-3 py-2 text-xs tabular-nums text-gray-400">{i.srNo}</td>
                                <td className="px-3 py-2 text-[13px] text-gray-700">
                                  {i.description}
                                  {loss && (
                                    <span
                                      className="ml-2 rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-600"
                                      title="Priced below what it costs"
                                    >
                                      below cost
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums text-gray-600">
                                  {i.qty.toLocaleString("en-IN")}
                                </td>
                                <td className="px-3 py-2 text-xs text-gray-500">{i.unit}</td>
                                <td className="px-3 py-2 text-right tabular-nums text-gray-600">{inr(i.saleRate)}</td>
                                <td className="px-3 py-2 text-right font-medium tabular-nums text-gray-800">
                                  {inr(amount)}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums text-gray-400">{inr(cost)}</td>
                                <td className="px-2 py-2 text-right">
                                  <RowMenu align="right" buttonLabel={`Actions for ${i.description}`}>
                                    {(close) => (
                                      <>
                                        <RowMenuItem
                                          icon={Pencil}
                                          label="Edit line"
                                          onClick={() => {
                                            close();
                                            setEditing(i);
                                          }}
                                        />
                                        <RowMenuDivider />
                                        <RowMenuItem
                                          icon={Trash2}
                                          label="Delete line"
                                          tone="danger"
                                          onClick={() => {
                                            close();
                                            if (
                                              confirm(
                                                `Delete "${i.description}"? Its target and any progress reported against it go too.`,
                                              )
                                            ) {
                                              void act(() => api.deleteBoqItem(projectId, i.id));
                                            }
                                          }}
                                        />
                                      </>
                                    )}
                                  </RowMenu>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr>
                            <td colSpan={8} className="px-3 py-2">
                              <button
                                type="button"
                                onClick={() => setAdding(f)}
                                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-300 py-2 text-xs text-gray-500 transition-colors duration-150 hover:border-brand-accent hover:bg-cyan-50/40 hover:text-brand-accent"
                              >
                                <Plus size={13} /> Add item to {f.label}
                              </button>
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  ))}
              </section>
            );
          })}
        </div>
      )}
        </>
      )}

      {newFamily && (
        <FamilyNameModal
          title="New title"
          hint="Earthwork, Pipe laying, Manholes — the headings this BOQ is organised under."
          onClose={() => setNewFamily(false)}
          onSave={async (label) => {
            await act(() => api.saveFamily(projectId, { label }));
            setNewFamily(false);
          }}
        />
      )}

      {renaming && (
        <FamilyNameModal
          title="Rename title"
          initial={renaming.label}
          hint="Its items stay where they are — only the heading changes."
          onClose={() => setRenaming(null)}
          onSave={async (label) => {
            await act(() => api.saveFamily(projectId, { key: renaming.key, label }));
            setRenaming(null);
          }}
        />
      )}

      {deleting && (
        <DeleteFamilyModal
          family={deleting}
          others={families.filter((f) => f.key !== deleting.key)}
          onClose={() => setDeleting(null)}
          onConfirm={async (moveTo) => {
            await act(() => api.deleteFamily(projectId, deleting.key, moveTo));
            setDeleting(null);
          }}
        />
      )}

      {adding && (
        <AddLineModal
          family={adding}
          nextSr={String(boq.items.length + 1)}
          onClose={() => setAdding(null)}
          onSave={async (body) => {
            await act(() => api.addBoqItem(projectId, { ...body, groupKey: adding.key }));
            setAdding(null);
          }}
        />
      )}

      {editing && (
        <EditLineModal
          item={editing}
          families={families}
          onClose={() => setEditing(null)}
          onSave={async (body) => {
            await act(() => api.updateBoqItem(projectId, editing.id, body));
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="px-4 py-3">
      <div className="text-[10px] font-semibold tracking-wide text-gray-400 uppercase">{label}</div>
      <div className="mt-1 text-base font-semibold tabular-nums text-gray-800">{value}</div>
      <div className="mt-0.5 text-[11px] text-gray-400">{sub}</div>
    </div>
  );
}

// ------------------------------------------------------------------ sub-tabs

type SubTab = "items" | "budget" | "milestone" | "invoices";

const SUB_TABS: { key: SubTab; label: string }[] = [
  { key: "items", label: "Items" },
  { key: "budget", label: "Budget" },
  { key: "milestone", label: "Milestone" },
  { key: "invoices", label: "Invoices" },
];

/** The Items / Budget / Milestone / Invoices switch — the four faces of a BOQ. */
function SubTabBar({ value, onChange }: { value: SubTab; onChange: (t: SubTab) => void }) {
  return (
    <div className="inline-flex gap-1 rounded-full bg-brand-accent p-1">
      {SUB_TABS.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors duration-150 ${
            value === t.key ? "bg-white text-brand-accent" : "text-white/90 hover:text-white"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ Budget

/**
 * The BOQ read as cost against sale: what each line costs us, the mark-up on it, and what the client
 * pays. Same lines as Items, priced from the other side, so the margin on the job is one screen.
 */
function BudgetPanel({ boq }: { boq: ApiProjectBoq }) {
  const totals = useMemo(() => {
    let cost = 0;
    let sale = 0;
    for (const i of boq.items) {
      cost += i.qty * i.costRate;
      sale += i.qty * i.saleRate;
    }
    return { cost, sale, markup: sale - cost };
  }, [boq.items]);

  if (boq.items.length === 0) {
    return <EmptyPanel icon={FileText} text="No items to budget yet. Add them on the Items tab." />;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-gray-100 text-[11px] tracking-wide text-gray-400 uppercase">
            <tr>
              <th className="w-14 px-3 py-2.5 text-left font-medium">Sr</th>
              <th className="px-3 py-2.5 text-left font-medium">Item</th>
              <th className="px-3 py-2.5 text-right font-medium">Cost price</th>
              <th className="px-3 py-2.5 text-right font-medium">Markup</th>
              <th className="px-3 py-2.5 text-right font-medium">Qty</th>
              <th className="px-3 py-2.5 text-right font-medium">Sales price</th>
            </tr>
          </thead>
          <tbody>
            {boq.items.map((i) => {
              const cost = i.qty * i.costRate;
              const sale = i.qty * i.saleRate;
              const markup = sale - cost;
              return (
                <tr key={i.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                  <td className="px-3 py-2 text-xs tabular-nums text-gray-400">{i.srNo}</td>
                  <td className="px-3 py-2 text-[13px] text-gray-700">{i.description}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-600">{inr(cost)}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${markup < 0 ? "text-rose-600" : "text-emerald-600"}`}>
                    {inr(markup)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-500">
                    {i.qty.toLocaleString("en-IN")} {i.unit}
                  </td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums text-gray-800">{inr(sale)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="grid grid-cols-3 divide-x divide-gray-100 border-t border-gray-200 bg-gray-50/70 text-center">
        <FootTotal label="Total cost price" value={inr(totals.cost)} />
        <FootTotal label="Mark up" value={inr(totals.markup)} tone={totals.markup < 0 ? "loss" : "gain"} />
        <FootTotal label="Total sales price" value={inr(totals.sale)} />
      </div>
    </div>
  );
}

function FootTotal({ label, value, tone }: { label: string; value: string; tone?: "gain" | "loss" }) {
  return (
    <div className="px-4 py-3">
      <div className="text-[10px] font-semibold tracking-wide text-gray-400 uppercase">{label}</div>
      <div
        className={`mt-1 text-sm font-semibold tabular-nums ${
          tone === "loss" ? "text-rose-600" : tone === "gain" ? "text-emerald-600" : "text-gray-800"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Milestone

const MS_STATUS: Record<MilestoneStatus, { label: string; chip: string }> = {
  PENDING: { label: "Pending", chip: "bg-slate-100 text-slate-600" },
  IN_PROGRESS: { label: "In progress", chip: "bg-amber-50 text-amber-700" },
  COMPLETED: { label: "Completed", chip: "bg-emerald-50 text-emerald-700" },
};

/**
 * Payment milestones against the BOQ — the schedule the client is billed on. A milestone's value is
 * either a share of the contract or a fixed sum, and it can depend on others finishing first.
 */
function MilestonePanel({ projectId, boqValue }: { projectId: number; boqValue: number }) {
  const { items, upsert, remove } = useMilestones(projectId);
  const [editing, setEditing] = useState<ProjectMilestone | null>(null);
  const [creating, setCreating] = useState(false);

  const nameById = useMemo(() => new Map(items.map((m) => [m.id, m.name])), [items]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400">{items.length} milestone(s)</span>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-3 py-1.5 text-xs font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95"
        >
          <Plus size={13} /> New milestone
        </button>
      </div>

      {items.length === 0 ? (
        <EmptyPanel icon={Flag} text="No milestones yet. Break the contract into billing stages the client signs off." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-b border-gray-100 text-[11px] tracking-wide text-gray-400 uppercase">
                <tr>
                  <th className="w-12 px-3 py-2.5 text-left font-medium">Sr</th>
                  <th className="px-3 py-2.5 text-left font-medium">Name</th>
                  <th className="px-3 py-2.5 text-right font-medium">Value</th>
                  <th className="px-3 py-2.5 text-right font-medium">Amount</th>
                  <th className="px-3 py-2.5 text-left font-medium">Due date</th>
                  <th className="px-3 py-2.5 text-left font-medium">Dependencies</th>
                  <th className="px-3 py-2.5 text-left font-medium">Status</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {items.map((m, idx) => (
                  <tr key={m.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                    <td className="px-3 py-2 text-xs tabular-nums text-gray-400">{idx + 1}</td>
                    <td className="px-3 py-2 text-[13px] text-gray-700">{m.name}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-600">
                      {m.valueMode === "percent" ? `${m.value}%` : inr(m.value)}
                    </td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums text-gray-800">
                      {inr(milestoneAmount(m, boqValue))}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500">{m.dueDate || "—"}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">
                      {m.dependencies.length === 0
                        ? "—"
                        : m.dependencies.map((d) => nameById.get(d) ?? "?").join(", ")}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${MS_STATUS[m.status].chip}`}>
                        {MS_STATUS[m.status].label}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right">
                      <RowMenu align="right" buttonLabel={`Actions for ${m.name}`}>
                        {(close) => (
                          <>
                            <RowMenuItem
                              icon={Pencil}
                              label="Edit"
                              onClick={() => {
                                close();
                                setEditing(m);
                              }}
                            />
                            <RowMenuDivider />
                            <RowMenuItem
                              icon={Trash2}
                              label="Delete"
                              tone="danger"
                              onClick={() => {
                                close();
                                if (confirm(`Delete milestone "${m.name}"?`)) remove(m.id);
                              }}
                            />
                          </>
                        )}
                      </RowMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {(creating || editing) && (
        <MilestoneModal
          milestone={editing}
          others={items.filter((m) => m.id !== editing?.id)}
          boqValue={boqValue}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSave={(m) => {
            upsert(m);
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function MilestoneModal({
  milestone,
  others,
  boqValue,
  onClose,
  onSave,
}: {
  milestone: ProjectMilestone | null;
  others: ProjectMilestone[];
  boqValue: number;
  onClose: () => void;
  onSave: (m: ProjectMilestone) => void;
}) {
  const [name, setName] = useState(milestone?.name ?? "");
  const [valueMode, setValueMode] = useState<"percent" | "amount">(milestone?.valueMode ?? "percent");
  const [value, setValue] = useState(milestone ? String(milestone.value) : "");
  const [dueDate, setDueDate] = useState(milestone?.dueDate ?? "");
  const [status, setStatus] = useState<MilestoneStatus>(milestone?.status ?? "PENDING");
  const [deps, setDeps] = useState<string[]>(milestone?.dependencies ?? []);

  const amount = valueMode === "percent" ? (boqValue * (Number(value) || 0)) / 100 : Number(value) || 0;
  const valid = name.trim() && Number(value) > 0;

  return (
    <Modal onClose={onClose}>
      <div className="w-[440px] max-w-full space-y-4 p-5">
        <h2 className="text-base font-semibold text-gray-800">{milestone ? "Edit milestone" : "New milestone"}</h2>

        <label className="block">
          <span className="text-[10px] font-semibold tracking-wide text-gray-400 uppercase">Milestone name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            placeholder="e.g. Advance on order"
            className="mt-1 w-full rounded-lg border border-gray-200 px-2.5 py-2 text-sm focus:border-brand-accent focus:outline-none"
          />
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-[10px] font-semibold tracking-wide text-gray-400 uppercase">Value</span>
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              inputMode="decimal"
              placeholder="0"
              className="mt-1 w-full rounded-lg border border-gray-200 px-2.5 py-2 text-sm tabular-nums focus:border-brand-accent focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="text-[10px] font-semibold tracking-wide text-gray-400 uppercase">Measured as</span>
            <Select
              value={valueMode}
              onChange={(v) => setValueMode(v as "percent" | "amount")}
              size="sm"
              options={[
                { value: "percent", label: "% of order" },
                { value: "amount", label: "Fixed amount" },
              ]}
            />
          </label>
        </div>

        <p className="text-right text-xs tabular-nums text-gray-500">Amount {inr(amount)}</p>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-[10px] font-semibold tracking-wide text-gray-400 uppercase">Due date</span>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-200 px-2.5 py-2 text-sm focus:border-brand-accent focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="text-[10px] font-semibold tracking-wide text-gray-400 uppercase">Status</span>
            <Select
              value={status}
              onChange={(v) => setStatus(v as MilestoneStatus)}
              size="sm"
              options={[
                { value: "PENDING", label: "Pending" },
                { value: "IN_PROGRESS", label: "In progress" },
                { value: "COMPLETED", label: "Completed" },
              ]}
            />
          </label>
        </div>

        {others.length > 0 && (
          <div>
            <span className="text-[10px] font-semibold tracking-wide text-gray-400 uppercase">Depends on</span>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {others.map((o) => {
                const on = deps.includes(o.id);
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setDeps((p) => (on ? p.filter((d) => d !== o.id) : [...p, o.id]))}
                    className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                      on
                        ? "border-brand-accent bg-cyan-50 text-brand-accent"
                        : "border-gray-200 text-gray-500 hover:bg-gray-50"
                    }`}
                  >
                    {o.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <button
          type="button"
          disabled={!valid}
          onClick={() =>
            onSave({
              id: milestone?.id ?? newId(),
              name: name.trim(),
              valueMode,
              value: Number(value) || 0,
              dueDate,
              dependencies: deps,
              status,
              invoiceId: milestone?.invoiceId ?? null,
            })
          }
          className="w-full rounded-lg bg-brand-accent py-2.5 text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95 disabled:opacity-40"
        >
          {milestone ? "Save changes" : "Add milestone"}
        </button>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ Invoices

/** Sales invoices raised against this BOQ — what has actually been billed to the client. */
function InvoicesPanel({ projectId, boq }: { projectId: number; boq: ApiProjectBoq }) {
  const { items, upsert, remove } = useSalesInvoices(projectId);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ProjectSalesInvoice | null>(null);

  const total = useMemo(() => items.reduce((s, i) => s + i.amount, 0), [items]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400">
          {items.length} invoice(s) · {inr(total)} billed
        </span>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-3 py-1.5 text-xs font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95"
        >
          <Plus size={13} /> Sales invoice
        </button>
      </div>

      {items.length === 0 ? (
        <EmptyPanel icon={FileText} text="No invoices raised yet against this BOQ." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-gray-100 text-[11px] tracking-wide text-gray-400 uppercase">
                <tr>
                  <th className="px-3 py-2.5 text-left font-medium">Invoice no</th>
                  <th className="px-3 py-2.5 text-left font-medium">Client name</th>
                  <th className="px-3 py-2.5 text-left font-medium">Invoice date</th>
                  <th className="px-3 py-2.5 text-right font-medium">Total amount</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {items.map((inv) => (
                  <tr key={inv.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                    <td className="px-3 py-2 text-[13px] font-medium text-gray-700">{inv.invoiceNo}</td>
                    <td className="px-3 py-2 text-[13px] text-gray-600">{inv.clientName || "—"}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">{inv.invoiceDate || "—"}</td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums text-gray-800">{inr(inv.amount)}</td>
                    <td className="px-2 py-2 text-right">
                      <RowMenu align="right" buttonLabel={`Actions for ${inv.invoiceNo}`}>
                        {(close) => (
                          <>
                            <RowMenuItem
                              icon={Pencil}
                              label="Edit"
                              onClick={() => {
                                close();
                                setEditing(inv);
                              }}
                            />
                            <RowMenuDivider />
                            <RowMenuItem
                              icon={Trash2}
                              label="Delete"
                              tone="danger"
                              onClick={() => {
                                close();
                                if (confirm(`Delete invoice "${inv.invoiceNo}"?`)) remove(inv.id);
                              }}
                            />
                          </>
                        )}
                      </RowMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {(creating || editing) && (
        <InvoiceModal
          invoice={editing}
          defaultClient={boq.clientName ?? ""}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSave={(inv) => {
            upsert(inv);
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function InvoiceModal({
  invoice,
  defaultClient,
  onClose,
  onSave,
}: {
  invoice: ProjectSalesInvoice | null;
  defaultClient: string;
  onClose: () => void;
  onSave: (inv: ProjectSalesInvoice) => void;
}) {
  const [invoiceNo, setInvoiceNo] = useState(invoice?.invoiceNo ?? "");
  const [clientName, setClientName] = useState(invoice?.clientName ?? defaultClient);
  const [invoiceDate, setInvoiceDate] = useState(invoice?.invoiceDate ?? new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState(invoice ? String(invoice.amount) : "");

  const valid = invoiceNo.trim() && Number(amount) > 0;

  return (
    <Modal onClose={onClose}>
      <div className="w-[440px] max-w-full space-y-4 p-5">
        <h2 className="text-base font-semibold text-gray-800">{invoice ? "Edit invoice" : "New sales invoice"}</h2>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-[10px] font-semibold tracking-wide text-gray-400 uppercase">Invoice no</span>
            <input
              value={invoiceNo}
              onChange={(e) => setInvoiceNo(e.target.value)}
              autoFocus
              placeholder="INV-001"
              className="mt-1 w-full rounded-lg border border-gray-200 px-2.5 py-2 text-sm focus:border-brand-accent focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="text-[10px] font-semibold tracking-wide text-gray-400 uppercase">Invoice date</span>
            <input
              type="date"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-200 px-2.5 py-2 text-sm focus:border-brand-accent focus:outline-none"
            />
          </label>
        </div>

        <label className="block">
          <span className="text-[10px] font-semibold tracking-wide text-gray-400 uppercase">Client name</span>
          <input
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-200 px-2.5 py-2 text-sm focus:border-brand-accent focus:outline-none"
          />
        </label>

        <label className="block">
          <span className="text-[10px] font-semibold tracking-wide text-gray-400 uppercase">Total amount</span>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="0"
            className="mt-1 w-full rounded-lg border border-gray-200 px-2.5 py-2 text-sm tabular-nums focus:border-brand-accent focus:outline-none"
          />
        </label>

        <button
          type="button"
          disabled={!valid}
          onClick={() =>
            onSave({
              id: invoice?.id ?? newId(),
              invoiceNo: invoiceNo.trim(),
              clientName: clientName.trim(),
              invoiceDate,
              amount: Number(amount) || 0,
            })
          }
          className="w-full rounded-lg bg-brand-accent py-2.5 text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95 disabled:opacity-40"
        >
          {invoice ? "Save changes" : "Add invoice"}
        </button>
      </div>
    </Modal>
  );
}

function EmptyPanel({ icon: Icon, text }: { icon: typeof FileText; text: string }) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white px-6 text-center">
      <Icon size={22} className="mb-2 text-gray-300" />
      <p className="max-w-md text-sm text-gray-400">{text}</p>
    </div>
  );
}

function FamilyNameModal({
  title,
  hint,
  initial = "",
  onClose,
  onSave,
}: {
  title: string;
  hint: string;
  initial?: string;
  onClose: () => void;
  onSave: (label: string) => Promise<void>;
}) {
  const [label, setLabel] = useState(initial);
  const [saving, setSaving] = useState(false);

  return (
    <Modal onClose={onClose}>
      <div className="w-[400px] max-w-full space-y-4 p-5">
        <div>
          <h2 className="text-base font-semibold text-gray-800">{title}</h2>
          <p className="mt-1 text-xs text-gray-400">{hint}</p>
        </div>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          autoFocus
          placeholder="Title name"
          className="w-full rounded-lg border border-gray-200 px-2.5 py-2 text-sm focus:border-brand-accent focus:outline-none"
        />
        <button
          type="button"
          disabled={!label.trim() || saving}
          onClick={async () => {
            setSaving(true);
            await onSave(label.trim());
            setSaving(false);
          }}
          className="w-full rounded-lg bg-brand-accent py-2.5 text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95 disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </Modal>
  );
}

/**
 * Deleting a family asks where its lines go before it will proceed.
 *
 * <p>Removing a heading is a filing decision. Taking seven priced lines with it is not what anybody
 * means, and it is not recoverable.
 */
function DeleteFamilyModal({
  family,
  others,
  onClose,
  onConfirm,
}: {
  family: ApiBoqFamily;
  others: ApiBoqFamily[];
  onClose: () => void;
  onConfirm: (moveTo?: string) => Promise<void>;
}) {
  const [moveTo, setMoveTo] = useState(others[0]?.key ?? "");
  const [saving, setSaving] = useState(false);
  const empty = family.lineCount === 0;

  return (
    <Modal onClose={onClose} guardOnClose={false}>
      <div className="w-[420px] max-w-full space-y-4 p-5">
        <h2 className="text-base font-semibold text-gray-800">Delete &ldquo;{family.label}&rdquo;?</h2>

        {empty ? (
          <p className="text-sm text-gray-500">It has nothing in it, so nothing is lost.</p>
        ) : others.length === 0 ? (
          <p className="text-sm text-rose-600">
            It holds {family.lineCount} line(s) and there is no other family to move them into. Make
            one first.
          </p>
        ) : (
          <>
            <p className="text-sm text-gray-500">
              It holds {family.lineCount} item(s). They will be moved rather than deleted — pick where
              they go.
            </p>
            <Select
              value={moveTo}
              onChange={setMoveTo}
              size="sm"
              options={others.map((f) => ({ value: f.key, label: f.label }))}
            />
          </>
        )}

        <button
          type="button"
          disabled={saving || (!empty && others.length === 0)}
          onClick={async () => {
            setSaving(true);
            await onConfirm(empty ? undefined : moveTo);
            setSaving(false);
          }}
          className="w-full rounded-lg bg-rose-600 py-2.5 text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95 disabled:opacity-40"
        >
          {saving ? "Deleting…" : empty ? "Delete" : "Move items and delete"}
        </button>
      </div>
    </Modal>
  );
}

/**
 * Adding a line, from the rate library.
 *
 * <p>The library is the point. A blank row is a rate nobody checked and a description that will not
 * match the next tender; a library pick carries the rate that was actually used and how many sheets
 * used it. Typing a line by hand is still possible for the case the library genuinely does not
 * cover, but it is the second option and it says so.
 */
function AddLineModal({
  family,
  nextSr,
  onClose,
  onSave,
}: {
  family: ApiBoqFamily;
  nextSr: string;
  onClose: () => void;
  onSave: (body: api.BoqItemUpsert) => Promise<void>;
}) {
  const library = useAnalysisStore((s) => s.library);
  const [mode, setMode] = useState<"library" | "manual">("library");
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<RateLibraryItem | null>(null);

  const [srNo, setSrNo] = useState(nextSr);
  const [description, setDescription] = useState("");
  const [unit, setUnit] = useState("");
  const [qty, setQty] = useState("");
  const [saleRate, setSaleRate] = useState("");
  const [costRate, setCostRate] = useState("");
  const [saving, setSaving] = useState(false);

  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = needle
      ? library.filter((r) => r.name.toLowerCase().includes(needle))
      : [...library].sort((a, b) => b.usageCount - a.usageCount);
    return rows.slice(0, 40);
  }, [library, q]);

  const choose = (r: RateLibraryItem) => {
    setPicked(r);
    setDescription(r.name);
    setUnit(r.unit);
    // The library holds what it costs us, not what the client is billed — those are different
    // numbers and guessing one from the other is how a line gets priced below cost.
    const cost = (r.materialRate ?? 0) + (r.labourRate ?? 0) + (r.otherRate ?? 0);
    setCostRate(cost ? String(cost) : "");
  };

  const valid = description.trim() && Number(qty) > 0;

  return (
    <Modal onClose={onClose} wide>
      <div className="w-[600px] max-w-full space-y-4 p-5">
        <div>
          <h2 className="text-base font-semibold text-gray-800">Add an item to {family.label}</h2>
          <p className="mt-1 text-xs text-gray-400">
            Lines are priced from the rate library so the same work carries the same rate across
            tenders.
          </p>
        </div>

        <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
          {(
            [
              ["library", `Rate library${library.length ? ` (${library.length})` : ""}`],
              ["manual", "Type it in"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setMode(k)}
              className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-150 ${
                mode === k ? "bg-white text-gray-800 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === "library" && (
          <div className="space-y-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              autoFocus
              placeholder="Search the rate library"
              className="w-full rounded-lg border border-gray-200 px-2.5 py-2 text-sm focus:border-brand-accent focus:outline-none"
            />
            <div className="max-h-52 overflow-y-auto rounded-lg border border-gray-200">
              {library.length === 0 ? (
                <p className="px-3 py-8 text-center text-xs text-gray-400">
                  The rate library is empty. It fills up as tenders are analysed — until then, type the
                  line in.
                </p>
              ) : matches.length === 0 ? (
                <p className="px-3 py-8 text-center text-xs text-gray-400">Nothing matches &ldquo;{q}&rdquo;.</p>
              ) : (
                <ul className="divide-y divide-gray-50">
                  {matches.map((r) => {
                    const cost = (r.materialRate ?? 0) + (r.labourRate ?? 0) + (r.otherRate ?? 0);
                    return (
                      <li key={r.id}>
                        <button
                          type="button"
                          onClick={() => choose(r)}
                          className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-gray-50 ${
                            picked?.id === r.id ? "bg-cyan-50" : ""
                          }`}
                        >
                          <span className="min-w-0 flex-1 truncate text-gray-700">{r.name}</span>
                          <span className="shrink-0 text-gray-400">{r.unit}</span>
                          <span className="w-20 shrink-0 text-right tabular-nums text-gray-500">
                            {cost ? inr(cost) : "—"}
                          </span>
                          <span
                            className="w-16 shrink-0 text-right text-[10px] text-gray-400"
                            title="How many sheets priced this item"
                          >
                            {r.usageCount}×
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-6 gap-2">
          <label className="col-span-1 block">
            <span className="text-[10px] font-semibold tracking-wide text-gray-400 uppercase">Sr</span>
            <input
              value={srNo}
              onChange={(e) => setSrNo(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-2 text-sm focus:border-brand-accent focus:outline-none"
            />
          </label>
          <label className="col-span-5 block">
            <span className="text-[10px] font-semibold tracking-wide text-gray-400 uppercase">Description</span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              readOnly={mode === "library" && picked !== null}
              placeholder={mode === "library" ? "Pick from the library above" : "What the work is"}
              className="mt-1 w-full rounded-lg border border-gray-200 px-2.5 py-2 text-sm placeholder:text-gray-300 read-only:bg-gray-50 focus:border-brand-accent focus:outline-none"
            />
          </label>

          <label className="col-span-2 block">
            <span className="text-[10px] font-semibold tracking-wide text-gray-400 uppercase">Quantity</span>
            <input
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              inputMode="decimal"
              placeholder="0"
              className="mt-1 w-full rounded-lg border border-gray-200 px-2.5 py-2 text-sm tabular-nums focus:border-brand-accent focus:outline-none"
            />
          </label>
          <label className="col-span-1 block">
            <span className="text-[10px] font-semibold tracking-wide text-gray-400 uppercase">Unit</span>
            <input
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="cum"
              className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-2 text-sm focus:border-brand-accent focus:outline-none"
            />
          </label>
          <label className="col-span-3 block">
            <span className="text-[10px] font-semibold tracking-wide text-gray-400 uppercase">
              Sale rate — what the client pays
            </span>
            <input
              value={saleRate}
              onChange={(e) => setSaleRate(e.target.value)}
              inputMode="decimal"
              placeholder="0"
              className="mt-1 w-full rounded-lg border border-gray-200 px-2.5 py-2 text-sm tabular-nums focus:border-brand-accent focus:outline-none"
            />
          </label>
          <label className="col-span-3 block">
            <span className="text-[10px] font-semibold tracking-wide text-gray-400 uppercase">
              Cost rate — what it costs us
            </span>
            <input
              value={costRate}
              onChange={(e) => setCostRate(e.target.value)}
              inputMode="decimal"
              placeholder="0"
              className="mt-1 w-full rounded-lg border border-gray-200 px-2.5 py-2 text-sm tabular-nums focus:border-brand-accent focus:outline-none"
            />
          </label>
        </div>

        {Number(qty) > 0 && Number(saleRate) > 0 && (
          <p className="text-right text-xs tabular-nums text-gray-500">
            Amount {inr(Number(qty) * Number(saleRate))}
            {Number(costRate) > Number(saleRate) && (
              <span className="ml-2 text-rose-600">below cost</span>
            )}
          </p>
        )}

        <button
          type="button"
          disabled={!valid || saving}
          onClick={async () => {
            setSaving(true);
            await onSave({
              srNo: srNo.trim() || null,
              description: description.trim(),
              qty: Number(qty) || 0,
              unit: unit.trim() || "No",
              saleRate: Number(saleRate) || 0,
              costRate: Number(costRate) || 0,
            });
            setSaving(false);
          }}
          className="w-full rounded-lg bg-brand-accent py-2.5 text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95 disabled:opacity-40"
        >
          {saving ? "Adding…" : "Add item"}
        </button>
      </div>
    </Modal>
  );
}

function EditLineModal({
  item,
  families,
  onClose,
  onSave,
}: {
  item: ApiBoqItem;
  families: ApiBoqFamily[];
  onClose: () => void;
  onSave: (body: api.BoqItemUpsert) => Promise<void>;
}) {
  const [groupKey, setGroupKey] = useState(item.groupKey);
  const [srNo, setSrNo] = useState(item.srNo);
  const [description, setDescription] = useState(item.description);
  const [qty, setQty] = useState(String(item.qty));
  const [unit, setUnit] = useState(item.unit);
  const [saleRate, setSaleRate] = useState(String(item.saleRate));
  const [costRate, setCostRate] = useState(String(item.costRate));
  const [saving, setSaving] = useState(false);

  return (
    <Modal onClose={onClose}>
      <div className="w-[480px] max-w-full space-y-4 p-5">
        <h2 className="text-base font-semibold text-gray-800">Edit line</h2>

        <label className="block">
          <span className="text-[10px] font-semibold tracking-wide text-gray-400 uppercase">Title</span>
          <Select
            value={groupKey}
            onChange={setGroupKey}
            size="sm"
            options={families.map((f) => ({ value: f.key, label: f.label }))}
          />
        </label>

        <div className="grid grid-cols-6 gap-2">
          <label className="col-span-1 block">
            <span className="text-[10px] font-semibold tracking-wide text-gray-400 uppercase">Sr</span>
            <input
              value={srNo}
              onChange={(e) => setSrNo(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-2 text-sm focus:border-brand-accent focus:outline-none"
            />
          </label>
          <label className="col-span-5 block">
            <span className="text-[10px] font-semibold tracking-wide text-gray-400 uppercase">Description</span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-200 px-2.5 py-2 text-sm focus:border-brand-accent focus:outline-none"
            />
          </label>
          <label className="col-span-2 block">
            <span className="text-[10px] font-semibold tracking-wide text-gray-400 uppercase">Quantity</span>
            <input
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              inputMode="decimal"
              className="mt-1 w-full rounded-lg border border-gray-200 px-2.5 py-2 text-sm tabular-nums focus:border-brand-accent focus:outline-none"
            />
          </label>
          <label className="col-span-1 block">
            <span className="text-[10px] font-semibold tracking-wide text-gray-400 uppercase">Unit</span>
            <input
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-2 text-sm focus:border-brand-accent focus:outline-none"
            />
          </label>
          <label className="col-span-3 block">
            <span className="text-[10px] font-semibold tracking-wide text-gray-400 uppercase">Sale rate</span>
            <input
              value={saleRate}
              onChange={(e) => setSaleRate(e.target.value)}
              inputMode="decimal"
              className="mt-1 w-full rounded-lg border border-gray-200 px-2.5 py-2 text-sm tabular-nums focus:border-brand-accent focus:outline-none"
            />
          </label>
          <label className="col-span-3 block">
            <span className="text-[10px] font-semibold tracking-wide text-gray-400 uppercase">Cost rate</span>
            <input
              value={costRate}
              onChange={(e) => setCostRate(e.target.value)}
              inputMode="decimal"
              className="mt-1 w-full rounded-lg border border-gray-200 px-2.5 py-2 text-sm tabular-nums focus:border-brand-accent focus:outline-none"
            />
          </label>
        </div>

        <p className="text-[11px] text-gray-400">
          The target measuring this line follows a rename or a quantity change, but anything already
          reported against it stays.
        </p>

        <button
          type="button"
          disabled={saving || !description.trim()}
          onClick={async () => {
            setSaving(true);
            await onSave({
              groupKey,
              srNo: srNo.trim() || null,
              description: description.trim(),
              qty: Number(qty) || 0,
              unit: unit.trim() || "No",
              saleRate: Number(saleRate) || 0,
              costRate: Number(costRate) || 0,
            });
            setSaving(false);
          }}
          className="w-full rounded-lg bg-brand-accent py-2.5 text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95 disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </Modal>
  );
}
