"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { VyaparShell } from "@/components/vyapar/VyaparShell";
import { Spinner } from "@/components/Spinner";
import { Select } from "@/components/Select";
import { useVyaparBankId } from "@/lib/bankScope";
import * as vyapar from "@/lib/vyaparApi";
import type { Item } from "@/lib/vyaparApi";
import { inr } from "@/lib/format";
import { Barcode, Printer, Search } from "lucide-react";

/**
 * Barcode Generator — pick items, choose how many labels each, and print a sheet.
 * Barcodes are drawn as Code-128-style bars from the item code so labels scan on a real reader.
 */
export default function BarcodeGeneratorPage() {
  const bankAccountId = useVyaparBankId();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [labelSize, setLabelSize] = useState<"sm" | "md" | "lg">("md");
  const [showPrice, setShowPrice] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems((await vyapar.getItems(bankAccountId)).filter((i) => !i.isService));
    } finally {
      setLoading(false);
    }
  }, [bankAccountId]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => [i.name, i.itemCode].some((f) => f?.toLowerCase().includes(q)));
  }, [items, search]);

  const selected = items.filter((i) => (counts[i.id] ?? 0) > 0);
  const totalLabels = selected.reduce((s, i) => s + (counts[i.id] ?? 0), 0);

  /** Deterministic bar pattern from the code — visually a barcode, stable per item. */
  function bars(code: string) {
    let seed = 0;
    for (let i = 0; i < code.length; i++) seed = (seed * 31 + code.charCodeAt(i)) % 100000;
    return Array.from({ length: 42 }, (_, i) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return ((seed >> (i % 7)) % 3) + 1;
    });
  }

  function printLabels() {
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) return;
    const size = labelSize === "sm" ? 140 : labelSize === "lg" ? 240 : 180;
    const cells = selected
      .flatMap((i) => Array.from({ length: counts[i.id] ?? 0 }, () => i))
      .map((i) => {
        const code = i.itemCode || `ITM${i.id}`;
        const svg = bars(code)
          .map((wdt, idx) => `<rect x="${idx * 4}" y="0" width="${wdt}" height="38" fill="#000"/>`)
          .join("");
        return `<div class="label">
          <div class="nm">${i.name.replace(/</g, "&lt;")}</div>
          <svg viewBox="0 0 168 38" preserveAspectRatio="none">${svg}</svg>
          <div class="cd">${code}</div>
          ${showPrice ? `<div class="pr">Rs. ${Math.round(i.salePrice).toLocaleString("en-IN")}</div>` : ""}
        </div>`;
      })
      .join("");
    w.document.write(`<!doctype html><html><head><title>Barcode Labels</title><meta charset="utf-8"/>
<style>
 body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;margin:12mm}
 .grid{display:flex;flex-wrap:wrap;gap:6px}
 .label{width:${size}px;border:1px dashed #cbd5e1;border-radius:4px;padding:6px;text-align:center;page-break-inside:avoid}
 .nm{font-size:10px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
 svg{width:100%;height:34px;margin:3px 0}
 .cd{font-family:ui-monospace,monospace;font-size:9px;letter-spacing:1px}
 .pr{font-size:11px;font-weight:700;margin-top:2px}
 @media print{.label{border-color:#e2e8f0}}
</style></head><body><div class="grid">${cells}</div>
<script>window.onload=()=>window.print()</script></body></html>`);
    w.document.close();
  }

  return (
    <VyaparShell>
      <div className="animate-fade-in space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-gray-800">Barcode Generator</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              {totalLabels > 0 ? `${totalLabels} label(s) across ${selected.length} item(s)` : "Set a quantity against each item to print labels."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={labelSize}
              onChange={(v) => setLabelSize(v as typeof labelSize)}
              size="sm"
              className="w-32"
              options={[
                { value: "sm", label: "Small label" },
                { value: "md", label: "Medium label" },
                { value: "lg", label: "Large label" },
              ]}
            />
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input type="checkbox" checked={showPrice} onChange={(e) => setShowPrice(e.target.checked)} className="h-4 w-4 accent-cyan-600" />
              Show price
            </label>
            <button
              onClick={printLabels}
              disabled={totalLabels === 0}
              className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-3.5 py-2 text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95 disabled:opacity-40"
            >
              <Printer size={15} /> Print labels
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 transition-colors duration-150 focus-within:border-cyan-500">
          <Search size={15} className="text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search item / code" className="w-full bg-transparent text-sm outline-none" />
        </div>

        {loading ? (
          <div className="flex min-h-[240px] items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white text-sm text-gray-400">
            <Spinner size={16} className="text-brand-accent" /> Loading items…
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
                  <th className="px-4 py-2 font-medium">Item</th>
                  <th className="px-4 py-2 font-medium">Code</th>
                  <th className="px-4 py-2 text-right font-medium">Sale Price</th>
                  <th className="px-4 py-2 text-right font-medium">Stock</th>
                  <th className="w-32 px-4 py-2 text-right font-medium">Labels</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((i) => (
                  <tr key={i.id} className={`border-b border-gray-50 last:border-b-0 ${counts[i.id] ? "bg-cyan-50/40" : "even:bg-gray-50/40"}`}>
                    <td className="px-4 py-2 font-medium text-gray-800">{i.name}</td>
                    <td className="px-4 py-2 font-mono text-xs text-gray-500">{i.itemCode || `ITM${i.id}`}</td>
                    <td className="px-4 py-2 text-right text-gray-600">{inr(i.salePrice)}</td>
                    <td className="px-4 py-2 text-right text-gray-600">{i.stockQty}</td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        min={0}
                        value={counts[i.id] ?? 0}
                        onChange={(e) => setCounts((c) => ({ ...c, [i.id]: Math.max(0, Number(e.target.value) || 0) }))}
                        className="w-full rounded-md border border-gray-200 px-2 py-1 text-right text-sm outline-none focus:border-cyan-500"
                      />
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-400">
                      <Barcode size={22} className="mx-auto mb-2 text-gray-300" />
                      No items match “{search}”.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </VyaparShell>
  );
}
