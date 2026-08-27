"use client";

import { useMemo, useState } from "react";
import { BookOpen, ChevronDown, ChevronRight, Plus, Search, Trash2, TriangleAlert } from "lucide-react";
import { LibraryItemPicker } from "@/components/tender/analysis/LibraryItemPicker";
import { inr } from "@/lib/format";
import { expenseAmount, findLibraryRate, groupedBoq, isSubSr } from "@/lib/tenderAnalysisCalc";
import { useAnalysisStore } from "@/lib/tenderAnalysisStore";
import { COST_COMPONENTS } from "@/lib/tenderAnalysisTypes";
import type { AnalysisTotals, BoqGroupCalc, BoqLine, CostComponent, TenderAnalysis } from "@/lib/tenderAnalysisTypes";

/**
 * The whole analysis in one table: the department's rate, our material / labour / other rates, and
 * what is left over — line by line.
 *
 * <p>The workbook kept labour and material on separate sheets that had to be tied back to the BOQ
 * by hand, which is where its numbers drifted. Pricing on the item means a line's margin is
 * readable on the line, and the totals cannot disagree with the rows that make them up.
 */
export function AnalysisItemsTab({ analysis, totals }: { analysis: TenderAnalysis; totals: AnalysisTotals }) {
  const updateBoqLine = useAnalysisStore((s) => s.updateBoqLine);
  const removeBoqLine = useAnalysisStore((s) => s.removeBoqLine);
  const addBoqLine = useAnalysisStore((s) => s.addBoqLine);
  const applyLibraryRates = useAnalysisStore((s) => s.applyLibraryRates);
  const library = useAnalysisStore((s) => s.library);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "loss" | "unpriced">("all");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [picking, setPicking] = useState(false);
  const [added, setAdded] = useState(0);

  const groups = useMemo(
    () => groupedBoq(analysis.boqLines, analysis.groups),
    [analysis.boqLines, analysis.groups],
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return groups
      .map((g) => ({
        ...g,
        lines: g.lines.filter(
          (c) =>
            (!q || c.line.description.toLowerCase().includes(q) || c.line.srNo.toLowerCase().includes(q)) &&
            (filter === "all" || (filter === "loss" ? c.isLoss : !c.priced)),
        ),
      }))
      .filter((g) => g.lines.length > 0);
  }, [groups, search, filter]);

  const unpriced = totals.linesTotal - totals.linesPriced;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={14} className="absolute top-2.5 left-3 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search items"
            className="w-56 rounded-lg border border-gray-200 py-2 pr-3 pl-9 text-sm focus:border-brand-accent focus:outline-none"
          />
        </div>

        <FilterChip active={filter === "all"} onClick={() => setFilter("all")} tone="neutral">
          All {totals.linesTotal}
        </FilterChip>
        {totals.lossLineCount > 0 && (
          <FilterChip active={filter === "loss"} onClick={() => setFilter(filter === "loss" ? "all" : "loss")} tone="bad">
            <TriangleAlert size={12} /> {totals.lossLineCount} below cost
          </FilterChip>
        )}
        {unpriced > 0 && (
          <FilterChip
            active={filter === "unpriced"}
            onClick={() => setFilter(filter === "unpriced" ? "all" : "unpriced")}
            tone="warn"
          >
            {unpriced} not costed
          </FilterChip>
        )}

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => addBoqLine(analysis.id)}
            title="For BOQ lines no material catalogue will ever hold — excavation, restoration, job work"
            className="rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-600 transition-colors duration-150 hover:bg-gray-50"
          >
            Blank row
          </button>
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-accent px-3 py-2 text-xs font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95"
          >
            <Plus size={13} /> Add from Library
          </button>
        </div>
      </div>

      {added > 0 && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          {added} item{added === 1 ? "" : "s"} added from the Library. Their unit and buying rate came with them —
          set the tender rate and quantity against each.
        </p>
      )}

      <p className="text-[11px] text-gray-400">
        Sr numbers group the schedule: type <code className="rounded bg-gray-100 px-1">7</code> for a main item and{" "}
        <code className="rounded bg-gray-100 px-1">7a</code>, <code className="rounded bg-gray-100 px-1">7b</code> for
        items under it — they fold into one family with its own subtotal.
      </p>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full min-w-[1180px] text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-[11px] tracking-wide text-gray-500 uppercase">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Sr</th>
              <th className="px-3 py-2 text-left font-medium">Item</th>
              <th className="px-3 py-2 text-right font-medium">Qty</th>
              <th className="px-3 py-2 text-left font-medium">Unit</th>
              <th className="border-l border-gray-200 px-3 py-2 text-right font-medium">Tender rate</th>
              <th className="px-3 py-2 text-right font-medium">Amount</th>
              <th className="border-l border-gray-200 px-3 py-2 text-right font-medium">Material</th>
              <th className="px-3 py-2 text-right font-medium">Labour</th>
              <th className="px-3 py-2 text-right font-medium">Other</th>
              <th className="px-3 py-2 text-right font-medium">Cost/unit</th>
              <th className="border-l border-gray-200 px-3 py-2 text-right font-medium">Margin/unit</th>
              <th className="px-3 py-2 text-right font-medium">Line margin</th>
              <th className="w-16" />
            </tr>
          </thead>
          <tbody>
            {visible.map((g) => (
              <GroupRows
                key={g.key}
                group={g}
                collapsed={collapsed.has(g.key)}
                onToggle={() =>
                  setCollapsed((p) => {
                    const n = new Set(p);
                    if (n.has(g.key)) n.delete(g.key);
                    else n.add(g.key);
                    return n;
                  })
                }
                onEdit={(lineId, patch) => updateBoqLine(analysis.id, lineId, patch)}
                onRemove={(lineId) => removeBoqLine(analysis.id, lineId)}
                onLibrary={(lineId) => applyLibraryRates(analysis.id, lineId)}
                hasLibraryRate={(l) => !!findLibraryRate(library, l.description, l.unit)}
              />
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={13} className="px-4 py-12 text-center text-sm text-gray-400">
                  {analysis.boqLines.length === 0
                    ? "No items yet — add them from the Library, then set each one's tender rate and quantity."
                    : "No items match this filter."}
                </td>
              </tr>
            )}
          </tbody>
          <tfoot className="border-t-2 border-gray-300 bg-gray-50 font-semibold text-gray-800">
            <tr>
              <td colSpan={5} className="px-3 py-3 text-right text-xs tracking-wide uppercase">
                Totals
              </td>
              <td className="px-3 py-3 text-right tabular-nums">{inr(totals.tenderValue)}</td>
              <td className="border-l border-gray-200 px-3 py-3 text-right tabular-nums">{inr(totals.material)}</td>
              <td className="px-3 py-3 text-right tabular-nums">{inr(totals.labour)}</td>
              <td className="px-3 py-3 text-right tabular-nums">{inr(totals.other)}</td>
              <td className="px-3 py-3 text-right tabular-nums">{inr(totals.directCost)}</td>
              <td colSpan={2} className="border-l border-gray-200 px-3 py-3 text-right tabular-nums text-emerald-600">
                {inr(totals.tenderValue - totals.directCost)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <ExpensesCard analysis={analysis} totals={totals} />
        <SummaryCard totals={totals} />
      </div>

      {picking && (
        <LibraryItemPicker
          analysisId={analysis.id}
          onClose={() => setPicking(false)}
          onAdded={(n) => setAdded(n)}
        />
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  tone,
  children,
}: {
  active: boolean;
  onClick: () => void;
  tone: "neutral" | "bad" | "warn";
  children: React.ReactNode;
}) {
  const base = {
    neutral: active ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200",
    bad: active ? "bg-rose-600 text-white" : "bg-rose-50 text-rose-700 ring-1 ring-rose-600/20 ring-inset hover:bg-rose-100",
    warn: active ? "bg-amber-600 text-white" : "bg-amber-50 text-amber-700 ring-1 ring-amber-600/20 ring-inset hover:bg-amber-100",
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors duration-150 ${base}`}
    >
      {children}
    </button>
  );
}

function GroupRows({
  group,
  collapsed,
  onToggle,
  onEdit,
  onRemove,
  onLibrary,
  hasLibraryRate,
}: {
  group: BoqGroupCalc;
  collapsed: boolean;
  onToggle: () => void;
  onEdit: (lineId: string, patch: Partial<BoqLine>) => void;
  onRemove: (lineId: string) => void;
  onLibrary: (lineId: string) => boolean;
  hasLibraryRate: (l: BoqLine) => boolean;
}) {
  // A family of one is just a line; a header above it would be noise.
  const single = group.lines.length === 1;

  return (
    <>
      {!single && (
        <tr className="border-b border-gray-100 bg-gray-50/70">
          <td className="px-3 py-2">
            <button
              type="button"
              onClick={onToggle}
              aria-label={collapsed ? `Expand ${group.label}` : `Collapse ${group.label}`}
              className="text-gray-400 transition-colors duration-150 hover:text-gray-600"
            >
              {collapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
            </button>
          </td>
          <td className="px-3 py-2 text-[13px] font-semibold text-gray-700">
            {group.label}
            <span className="ml-2 font-normal text-gray-400">
              {group.lines.length} items
              {group.lossCount > 0 && <span className="ml-2 text-rose-600">· {group.lossCount} below cost</span>}
            </span>
          </td>
          <td colSpan={3} />
          <td className="px-3 py-2 text-right font-semibold tabular-nums text-gray-700">{inr(group.amount)}</td>
          <td colSpan={3} className="border-l border-gray-200" />
          <td className="px-3 py-2 text-right font-semibold tabular-nums text-gray-500">{inr(group.costAmount)}</td>
          <td className="border-l border-gray-200" />
          <td
            className={`px-3 py-2 text-right font-semibold tabular-nums ${
              group.margin == null ? "text-gray-300" : group.margin < 0 ? "text-rose-600" : "text-emerald-600"
            }`}
          >
            {group.margin == null ? "—" : inr(group.margin)}
          </td>
          <td />
        </tr>
      )}

      {!collapsed &&
        group.lines.map((c) => {
          const l = c.line;
          return (
            <tr key={l.id} className={`border-b border-gray-100 ${c.isLoss ? "bg-rose-50/40" : "hover:bg-gray-50/60"}`}>
              <td className="px-3 py-1.5">
                <TextCell
                  value={l.srNo}
                  onCommit={(v) => onEdit(l.id, { srNo: v })}
                  className={`w-12 text-xs tabular-nums ${isSubSr(l.srNo) ? "pl-3 text-gray-400" : "font-medium text-gray-600"}`}
                />
              </td>
              <td className="px-3 py-1.5">
                <div className="flex items-center gap-1.5">
                  {c.isLoss && <TriangleAlert size={13} className="shrink-0 text-rose-500" />}
                  <TextCell
                    value={l.description}
                    onCommit={(v) => onEdit(l.id, { description: v })}
                    className="w-full min-w-[210px] text-gray-700"
                  />
                </div>
              </td>
              <td className="px-3 py-1.5 text-right">
                <NumCell value={l.qty} onCommit={(v) => onEdit(l.id, { qty: v ?? 0 })} needed={l.qty === 0} />
              </td>
              <td className="px-3 py-1.5">
                <TextCell value={l.unit} onCommit={(v) => onEdit(l.id, { unit: v })} className="w-14 text-gray-500" />
              </td>

              <td className="border-l border-gray-100 px-3 py-1.5 text-right">
                <NumCell value={l.rate} onCommit={(v) => onEdit(l.id, { rate: v ?? 0 })} needed={l.rate === 0} />
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums text-gray-600">{inr(c.amount)}</td>

              {COST_COMPONENTS.map(({ key }, i) => (
                <td key={key} className={`px-3 py-1.5 text-right ${i === 0 ? "border-l border-gray-100" : ""}`}>
                  <NumCell
                    value={l[key as CostComponent]}
                    placeholder="—"
                    onCommit={(v) => onEdit(l.id, { [key]: v } as Partial<BoqLine>)}
                  />
                </td>
              ))}
              <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">
                {c.costRate == null ? <span className="text-gray-300">—</span> : inr(c.costRate)}
              </td>

              <td
                className={`border-l border-gray-100 px-3 py-1.5 text-right tabular-nums ${
                  c.marginPerUnit == null ? "text-gray-300" : c.marginPerUnit < 0 ? "text-rose-600" : "text-emerald-600"
                }`}
              >
                {c.marginPerUnit == null ? "—" : inr(c.marginPerUnit)}
              </td>
              <td
                className={`px-3 py-1.5 text-right font-medium tabular-nums ${
                  c.lineMargin == null ? "text-gray-300" : c.lineMargin < 0 ? "text-rose-600" : "text-emerald-600"
                }`}
              >
                {c.lineMargin == null ? "—" : inr(c.lineMargin)}
              </td>

              <td className="px-2 py-1.5">
                <div className="flex items-center justify-end gap-1">
                  {hasLibraryRate(l) && (
                    <button
                      type="button"
                      onClick={() => onLibrary(l.id)}
                      title="Fill rates from the rate library"
                      aria-label={`Fill rates for ${l.description} from the library`}
                      className="text-gray-300 transition-colors duration-150 hover:text-brand-accent"
                    >
                      <BookOpen size={13} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onRemove(l.id)}
                    aria-label={`Remove ${l.description || "line"}`}
                    className="text-gray-300 transition-colors duration-150 hover:text-rose-600"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </td>
            </tr>
          );
        })}
    </>
  );
}

/** Site overheads — the one thing that is genuinely not per-item, so it stays its own small table. */
function ExpensesCard({ analysis, totals }: { analysis: TenderAnalysis; totals: AnalysisTotals }) {
  const addExpenseLine = useAnalysisStore((s) => s.addExpenseLine);
  const updateExpenseLine = useAnalysisStore((s) => s.updateExpenseLine);
  const removeExpenseLine = useAnalysisStore((s) => s.removeExpenseLine);

  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <header className="flex flex-wrap items-center gap-2 border-b border-gray-200 bg-gray-50 px-4 py-2.5">
        <h3 className="text-sm font-semibold text-gray-700">Site overheads</h3>
        <span className="text-xs text-gray-400">not attributable to any one item</span>
        <span className="ml-auto text-sm font-semibold tabular-nums text-gray-700">{inr(totals.expenses)}</span>
        <button
          type="button"
          onClick={() => addExpenseLine(analysis.id)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-600 transition-colors duration-150 hover:bg-white"
        >
          <Plus size={13} /> Add
        </button>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-sm">
          <thead className="border-b border-gray-100 text-[11px] tracking-wide text-gray-400 uppercase">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Item</th>
              <th className="px-3 py-2 text-left font-medium">Basis</th>
              <th className="px-3 py-2 text-right font-medium">Value</th>
              <th className="px-3 py-2 text-right font-medium">Amount</th>
              <th className="w-9" />
            </tr>
          </thead>
          <tbody>
            {analysis.expenseLines.map((e) => (
              <tr key={e.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                <td className="px-3 py-1.5">
                  <TextCell
                    value={e.item}
                    onCommit={(v) => updateExpenseLine(analysis.id, e.id, { item: v })}
                    className="w-full min-w-[150px] text-gray-700"
                  />
                </td>
                <td className="px-3 py-1.5">
                  <select
                    value={e.basis}
                    aria-label={`Basis for ${e.item || "overhead"}`}
                    onChange={(ev) =>
                      updateExpenseLine(analysis.id, e.id, { basis: ev.target.value as "PCT_OF_TENDER" | "FLAT" })
                    }
                    className="rounded border border-gray-200 bg-white px-1.5 py-1 text-xs text-gray-600 focus:border-brand-accent focus:outline-none"
                  >
                    <option value="PCT_OF_TENDER">% of tender</option>
                    <option value="FLAT">Flat amount</option>
                  </select>
                </td>
                <td className="px-3 py-1.5 text-right whitespace-nowrap">
                  <NumCell value={e.value} onCommit={(v) => updateExpenseLine(analysis.id, e.id, { value: v ?? 0 })} />
                  {e.basis === "PCT_OF_TENDER" && <span className="ml-0.5 text-xs text-gray-400">%</span>}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-gray-700">
                  {inr(expenseAmount(e, totals.tenderValue))}
                </td>
                <td className="px-2 py-1.5">
                  <button
                    type="button"
                    onClick={() => removeExpenseLine(analysis.id, e.id)}
                    aria-label={`Remove ${e.item || "overhead"}`}
                    className="text-gray-300 transition-colors duration-150 hover:text-rose-600"
                  >
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-gray-100 px-4 py-2 text-[11px] text-gray-400">
        Percentages are of the tender value, not of the bid — the site office does not shrink because you quoted a
        deeper discount.
      </p>
    </section>
  );
}

function SummaryCard({ totals }: { totals: AnalysisTotals }) {
  const pct = (n: number) => (totals.tenderValue > 0 ? ((n / totals.tenderValue) * 100).toFixed(1) : "0.0");
  const rows = [
    { label: "Material", value: totals.material },
    { label: "Labour", value: totals.labour },
    { label: "Other", value: totals.other },
    { label: "Site overheads", value: totals.expenses },
  ];

  return (
    <aside className="h-fit rounded-xl border border-gray-200 bg-white p-4">
      <h3 className="text-[11px] font-semibold tracking-wide text-gray-400 uppercase">What the job costs</h3>
      <dl className="mt-3 space-y-2.5">
        {rows.map((r) => (
          <div key={r.label}>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-sm text-gray-600">{r.label}</dt>
              <dd className="text-sm font-medium tabular-nums text-gray-800">{inr(r.value)}</dd>
            </div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-gray-100">
              <div className="h-full rounded-full bg-brand-accent/60" style={{ width: `${pct(r.value)}%` }} />
            </div>
            <div className="mt-0.5 text-[10px] text-gray-400">{pct(r.value)}% of tender</div>
          </div>
        ))}
      </dl>

      <div className="mt-4 border-t border-gray-200 pt-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-semibold text-gray-700">Total cost</span>
          <span className="text-base font-semibold tabular-nums text-gray-900">{inr(totals.cost)}</span>
        </div>
        <div className="mt-0.5 text-[11px] text-gray-400">{pct(totals.cost)}% of the tender value</div>
      </div>

      <div className="mt-3 rounded-lg bg-gray-50 p-3">
        <div className="text-[10px] font-semibold tracking-wide text-gray-400 uppercase">Margin at estimate</div>
        <div
          className={`mt-1 text-lg font-semibold tabular-nums ${
            totals.marginAtEstimate < 0 ? "text-rose-600" : "text-emerald-600"
          }`}
        >
          {inr(totals.marginAtEstimate)}
        </div>
        <div className="text-[11px] text-gray-400">{totals.marginPctAtEstimate.toFixed(2)}% before any discount</div>
      </div>

      {totals.linesPriced < totals.linesTotal && (
        <p className="mt-3 text-[11px] text-amber-700">
          {totals.linesTotal - totals.linesPriced} of {totals.linesTotal} items have no cost against them yet, so this
          job looks cheaper than it is.
        </p>
      )}
    </aside>
  );
}

/* ---------------- cells ---------------- */

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

/**
 * A numeric cell. Commits on blur rather than on every keystroke, so typing a rate doesn't
 * re-derive every subtotal between characters. An emptied box commits null — "not worked out"
 * and "zero" are different answers and the model keeps them apart.
 */
function NumCell({
  value,
  onCommit,
  placeholder = "0",
  /** Ring the cell amber: this is a figure the analysis cannot be finished without. */
  needed = false,
}: {
  value: number | null;
  onCommit: (v: number | null) => void;
  placeholder?: string;
  needed?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      value={draft ?? (value == null ? "" : String(round(value)))}
      placeholder={placeholder}
      inputMode="decimal"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft != null) {
          const t = draft.trim();
          onCommit(t === "" ? null : Number(t));
        }
        setDraft(null);
      }}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      className={`w-[86px] rounded border bg-transparent px-1 py-0.5 text-right text-sm tabular-nums placeholder:text-gray-300 focus:border-brand-accent focus:bg-white focus:outline-none ${
        needed ? "border-amber-300 bg-amber-50/60" : "border-transparent"
      }`}
    />
  );
}

/** Seeded rates carry full precision so totals reconcile; the box shouldn't show 14 decimals. */
const round = (n: number) => Math.round(n * 100) / 100;
