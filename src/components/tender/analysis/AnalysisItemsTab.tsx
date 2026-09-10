"use client";

import { useMemo, useState } from "react";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  FolderPlus,
  Pencil,
  Plus,
  Search,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { Modal } from "@/components/Modal";
import { Select } from "@/components/Select";
import { RowMenu, RowMenuDivider, RowMenuItem } from "@/components/RowMenu";
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
  const applyLibraryRates = useAnalysisStore((s) => s.applyLibraryRates);
  const addGroup = useAnalysisStore((s) => s.addGroup);
  const renameGroup = useAnalysisStore((s) => s.renameGroup);
  const removeGroup = useAnalysisStore((s) => s.removeGroup);
  const library = useAnalysisStore((s) => s.library);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "loss" | "unpriced">("all");
  // Families start collapsed so the sheet opens as its list of titles; expand a title to price it.
  const [collapsed, setCollapsed] = useState<Set<string>>(
    () => new Set(groupedBoq(analysis.boqLines, analysis.groups).map((g) => g.key)),
  );
  /** Which family the picker is filling. Null when closed, so nothing is ever added unfiled. */
  const [picking, setPicking] = useState<{ key: string; label: string } | null>(null);
  const [added, setAdded] = useState(0);
  const [newFamily, setNewFamily] = useState(false);
  const [renaming, setRenaming] = useState<{ key: string; label: string } | null>(null);
  const [deleting, setDeleting] = useState<{ key: string; label: string; count: number } | null>(null);

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
      // An empty family stays visible: it is where the next line goes, and hiding it is exactly what
      // made "add a title" impossible before. A search or filter still hides it, because then the
      // user is looking for something specific rather than building the schedule.
      .filter((g) => g.lines.length > 0 || (!q && filter === "all"));
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
            onClick={() => setNewFamily(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-accent px-3 py-2 text-xs font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95"
          >
            <FolderPlus size={13} /> Add title
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
        The schedule is built title first: add a title, then add its items from the Library. Each
        title carries its own subtotal, and the whole structure crosses to the project BOQ when the
        tender is won.
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
                onAddLine={() => setPicking({ key: g.key, label: g.label })}
                onRename={() => setRenaming({ key: g.key, label: g.label })}
                onDelete={() => setDeleting({ key: g.key, label: g.label, count: g.lines.length })}
              />
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={13} className="px-4 py-12 text-center text-sm text-gray-400">
                  {analysis.groups.length === 0
                    ? "No titles yet. Add one, then add its items from the Library."
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
          groupKey={picking.key}
          groupLabel={picking.label}
          onClose={() => setPicking(null)}
          onAdded={(n) => setAdded(n)}
        />
      )}

      {newFamily && (
        <FamilyNameDialog
          title="Add title"
          hint="Earthwork, DI K7 pipe supply, Road restoration — the headings this schedule is built from."
          onClose={() => setNewFamily(false)}
          onSave={(label) => {
            addGroup(analysis.id, label);
            setNewFamily(false);
          }}
        />
      )}

      {renaming && (
        <FamilyNameDialog
          title="Rename title"
          initial={renaming.label}
          hint="Its items stay where they are — only the heading changes."
          onClose={() => setRenaming(null)}
          onSave={(label) => {
            renameGroup(analysis.id, renaming.key, label);
            setRenaming(null);
          }}
        />
      )}

      {deleting && (
        <DeleteFamilyDialog
          family={deleting}
          others={analysis.groups.filter((g) => g.key !== deleting.key)}
          onClose={() => setDeleting(null)}
          onConfirm={(moveTo) => {
            removeGroup(analysis.id, deleting.key, moveTo);
            setDeleting(null);
          }}
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
  onAddLine,
  onRename,
  onDelete,
}: {
  group: BoqGroupCalc;
  collapsed: boolean;
  onToggle: () => void;
  onEdit: (lineId: string, patch: Partial<BoqLine>) => void;
  onRemove: (lineId: string) => void;
  onLibrary: (lineId: string) => boolean;
  hasLibraryRate: (l: BoqLine) => boolean;
  onAddLine: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  // The header always shows now. It used to be hidden for a family of one, on the grounds that a
  // heading over a single line is noise — but a family is something somebody named and it carries
  // the button that adds its next line, so hiding it hides the way forward.

  return (
    <>
      {(
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
          {/* Spans Item + Qty + Unit + Tender rate. A title's name is long — "Excavation trench Soft
              Murrum/Clay/Sand (all lifts)" — and squeezing it into the Item column alone wrapped it
              over three lines and broke the controls beside it in half. */}
          <td className="px-3 py-2 text-[13px] font-semibold text-gray-700" colSpan={4}>
            <div className="flex min-w-0 items-center gap-2">
              <span className="min-w-0 truncate" title={group.label}>
                {group.label}
              </span>
              <span className="shrink-0 font-normal whitespace-nowrap text-gray-400">
                {group.lines.length} {group.lines.length === 1 ? "item" : "items"}
                {group.lossCount > 0 && (
                  <span className="ml-2 text-rose-600">· {group.lossCount} below cost</span>
                )}
              </span>
              {/* Adding lives in the menu and in the dashed row below. A solid button repeated down
                  every title turned the page into a column of blue and drowned the items. */}
              <RowMenu align="left" buttonLabel={`Actions for ${group.label}`}>
                {(close) => (
                  <>
                    <RowMenuItem
                      icon={Plus}
                      label="Add item"
                      onClick={() => {
                        close();
                        onAddLine();
                      }}
                    />
                    <RowMenuItem
                      icon={Pencil}
                      label="Rename title"
                      onClick={() => {
                        close();
                        onRename();
                      }}
                    />
                    <RowMenuDivider />
                    <RowMenuItem
                      icon={Trash2}
                      label="Delete title"
                      tone="danger"
                      onClick={() => {
                        close();
                        onDelete();
                      }}
                    />
                  </>
                )}
              </RowMenu>
            </div>
          </td>
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

      {!collapsed && (
        <tr className="border-b border-gray-100">
          <td />
          <td colSpan={12} className="py-2 pr-3 pl-10">
            <button
              type="button"
              onClick={onAddLine}
              className="flex w-full max-w-md items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-300 py-1.5 text-xs text-gray-500 transition-colors duration-150 hover:border-brand-accent hover:bg-cyan-50/40 hover:text-brand-accent"
            >
              <Plus size={12} />
              {group.lines.length === 0
                ? `Add the first item to ${group.label}`
                : `Add item to ${group.label}`}
            </button>
          </td>
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

/** Naming a family — used for both creating one and renaming it. */
function FamilyNameDialog({
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
  onSave: (label: string) => void;
}) {
  const [label, setLabel] = useState(initial);

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
          onKeyDown={(e) => {
            if (e.key === "Enter" && label.trim()) onSave(label.trim());
          }}
          placeholder="Title name"
          className="w-full rounded-lg border border-gray-200 px-2.5 py-2 text-sm focus:border-brand-accent focus:outline-none"
        />
        <button
          type="button"
          disabled={!label.trim()}
          onClick={() => onSave(label.trim())}
          className="w-full rounded-lg bg-brand-accent py-2.5 text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95 disabled:opacity-40"
        >
          Save
        </button>
      </div>
    </Modal>
  );
}

/**
 * Deleting a family asks where its items go before it will proceed.
 *
 * <p>Removing a heading is a filing decision. Taking its priced lines with it is not what anybody
 * means by it, and there is no undo.
 */
function DeleteFamilyDialog({
  family,
  others,
  onClose,
  onConfirm,
}: {
  family: { key: string; label: string; count: number };
  others: { key: string; label: string }[];
  onClose: () => void;
  onConfirm: (moveTo?: string) => void;
}) {
  const [moveTo, setMoveTo] = useState(others[0]?.key ?? "");
  const empty = family.count === 0;

  return (
    <Modal onClose={onClose} guardOnClose={false}>
      <div className="w-[420px] max-w-full space-y-4 p-5">
        <h2 className="text-base font-semibold text-gray-800">Delete &ldquo;{family.label}&rdquo;?</h2>

        {empty ? (
          <p className="text-sm text-gray-500">It has nothing in it, so nothing is lost.</p>
        ) : others.length === 0 ? (
          <p className="text-sm text-rose-600">
            It holds {family.count} item(s) and there is no other title to move them into. Add one
            first.
          </p>
        ) : (
          <>
            <p className="text-sm text-gray-500">
              It holds {family.count} item(s). They will be moved rather than deleted — pick where
              they go.
            </p>
            <Select
              value={moveTo}
              onChange={setMoveTo}
              size="sm"
              options={others.map((g) => ({ value: g.key, label: g.label }))}
            />
          </>
        )}

        <button
          type="button"
          disabled={!empty && others.length === 0}
          onClick={() => onConfirm(empty ? undefined : moveTo)}
          className="w-full rounded-lg bg-rose-600 py-2.5 text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95 disabled:opacity-40"
        >
          {empty ? "Delete" : "Move items and delete"}
        </button>
      </div>
    </Modal>
  );
}
