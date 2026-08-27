"use client";

import { useMemo, useState } from "react";
import { BookOpen, Search, Trash2, Upload } from "lucide-react";
import { inr } from "@/lib/format";
import { SortTh } from "@/components/vyapar/SortTh";
import { useTableSort } from "@/lib/useTableSort";
import { useAnalysisStore } from "@/lib/tenderAnalysisStore";
import { costRateOf } from "@/lib/tenderAnalysisCalc";
import type { RateLibraryItem, TenderAnalysis } from "@/lib/tenderAnalysisTypes";

/**
 * Every labour and material rate the firm has ever used, keyed by item + unit.
 *
 * <p>This is the asset the module builds quietly: the workbook is fifty sheets pricing the same
 * items over and over, and none of that knowledge was queryable. Saving an analysis files its rates
 * here, so the next tender starts from what the last one actually cost rather than from memory.
 */
export function AnalysisLibraryTab({ analysis }: { analysis: TenderAnalysis }) {
  const library = useAnalysisStore((s) => s.library);
  const publishRates = useAnalysisStore((s) => s.publishRates);
  const updateLibraryItem = useAnalysisStore((s) => s.updateLibraryItem);
  const removeLibraryItem = useAnalysisStore((s) => s.removeLibraryItem);

  const [search, setSearch] = useState("");
  const [saved, setSaved] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return library;
    return library.filter((x) => x.name.toLowerCase().includes(q) || x.unit.toLowerCase().includes(q));
  }, [library, search]);

  const { sorted, sortKey, sortDir, toggle } = useTableSort<RateLibraryItem>(
    filtered,
    {
      name: (x) => x.name,
      unit: (x) => x.unit,
      labourRate: (x) => x.labourRate ?? -1,
      materialRate: (x) => x.materialRate ?? -1,
      usageCount: (x) => x.usageCount,
    },
    { key: "usageCount", dir: "desc" },
  );

  // How much of this analysis is already in the library — the honest measure of whether saving
  // rates back is worth doing right now.
  const unfiled = analysis.boqLines.filter(
    (l) =>
      costRateOf(l) != null &&
      l.description.trim() !== "" &&
      !library.some(
        (x) => x.name.toLowerCase() === l.description.toLowerCase() && x.unit.toLowerCase() === l.unit.toLowerCase(),
      ),
  ).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={14} className="absolute top-2.5 left-3 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search rates"
            className="w-60 rounded-lg border border-gray-200 py-2 pr-3 pl-9 text-sm focus:border-brand-accent focus:outline-none"
          />
        </div>
        <span className="text-xs text-gray-400 tabular-nums">
          {filtered.length} of {library.length} items
        </span>

        <button
          type="button"
          onClick={() => {
            publishRates(analysis.id);
            setSaved(true);
          }}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-brand-accent px-3 py-2 text-xs font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95"
        >
          <Upload size={13} />
          {saved ? "Rates filed" : `File this analysis's rates${unfiled > 0 ? ` (${unfiled} new)` : ""}`}
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-[11px] tracking-wide text-gray-500 uppercase">
            <tr>
              <SortTh label="Item" sortKey="name" activeKey={sortKey} dir={sortDir} onSort={toggle} />
              <SortTh label="Unit" sortKey="unit" activeKey={sortKey} dir={sortDir} onSort={toggle} />
              <SortTh label="Labour rate" sortKey="labourRate" activeKey={sortKey} dir={sortDir} onSort={toggle} align="right" />
              <SortTh label="Material rate" sortKey="materialRate" activeKey={sortKey} dir={sortDir} onSort={toggle} align="right" />
              <SortTh label="Tenders" sortKey="usageCount" activeKey={sortKey} dir={sortDir} onSort={toggle} align="right" />
              <th className="px-4 py-2 text-left font-medium">Seen on</th>
              <th className="w-9" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((x) => (
              <tr key={x.id} className="border-b border-gray-50 hover:bg-gray-50/60">
                <td className="max-w-[320px] truncate px-4 py-2 text-gray-700" title={x.name}>
                  {x.name}
                </td>
                <td className="px-4 py-2 text-gray-500">{x.unit}</td>
                <td className="px-4 py-2 text-right">
                  <RateCell
                    value={x.labourRate}
                    onCommit={(v) => updateLibraryItem(x.id, { labourRate: v })}
                    label={`Labour rate for ${x.name}`}
                  />
                </td>
                <td className="px-4 py-2 text-right">
                  <RateCell
                    value={x.materialRate}
                    onCommit={(v) => updateLibraryItem(x.id, { materialRate: v })}
                    label={`Material rate for ${x.name}`}
                  />
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-gray-500">{x.usageCount}</td>
                <td className="max-w-[220px] truncate px-4 py-2 text-xs text-gray-400" title={x.sourceSheets.join(", ")}>
                  {x.sourceSheets.slice(0, 3).join(", ")}
                  {x.sourceSheets.length > 3 && ` +${x.sourceSheets.length - 3}`}
                </td>
                <td className="px-2 py-2">
                  <button
                    type="button"
                    onClick={() => removeLibraryItem(x.id)}
                    aria-label={`Remove ${x.name} from the library`}
                    className="text-gray-300 transition-colors duration-150 hover:text-rose-600"
                  >
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center">
                  <BookOpen size={22} className="mx-auto mb-2 text-gray-300" />
                  <p className="text-sm text-gray-400">
                    {library.length === 0
                      ? "The library is empty. Rates land here as you cost tenders."
                      : "Nothing matches that search."}
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400">
        Matched on item name and unit rather than linked to the stock catalogue — tender item names are far messier
        than Vyapar&apos;s, and a hard link would have meant cleaning both up before either could ship.
      </p>
    </div>
  );
}

function RateCell({
  value,
  onCommit,
  label,
}: {
  value: number | null;
  onCommit: (v: number | null) => void;
  label: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      aria-label={label}
      value={draft ?? (value == null ? "" : String(value))}
      placeholder="—"
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
      className="w-24 rounded border border-transparent bg-transparent px-1 py-0.5 text-right text-sm tabular-nums text-gray-700 placeholder:text-gray-300 focus:border-brand-accent focus:bg-white focus:outline-none"
    />
  );
}
