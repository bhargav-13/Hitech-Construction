"use client";

import { useMemo, useRef, useState } from "react";
import { Drawer } from "@/components/Drawer";
import { Select } from "@/components/Select";
import { parseCsv, exportRowsToCsv } from "@/lib/vyaparExport";
import { useVyaparBankId } from "@/lib/bankScope";
import * as vyapar from "@/lib/vyaparApi";
import type { Item } from "@/lib/vyaparApi";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Upload } from "lucide-react";

const TARGETS = [
  { key: "skip", label: "— Don't import —" },
  { key: "name", label: "Item Name *" },
  { key: "itemCode", label: "Item Code" },
  { key: "hsn", label: "HSN / SAC" },
  { key: "category", label: "Category" },
  { key: "unit", label: "Unit" },
  { key: "salePrice", label: "Sale Price" },
  { key: "purchasePrice", label: "Purchase Price" },
  { key: "taxPercent", label: "Tax %" },
  { key: "openingQty", label: "Opening Quantity" },
  { key: "lowStockAlert", label: "Min Stock" },
  { key: "location", label: "Location" },
  { key: "description", label: "Description" },
] as const;

function guess(header: string): string {
  const h = header.toLowerCase().replace(/[^a-z]/g, "");
  if (h.includes("itemname") || h === "name" || h === "item") return "name";
  if (h.includes("code") || h.includes("barcode")) return "itemCode";
  if (h.includes("hsn") || h.includes("sac")) return "hsn";
  if (h.includes("categ")) return "category";
  if (h.includes("unit")) return "unit";
  if (h.includes("saleprice") || h === "mrp" || h === "price") return "salePrice";
  if (h.includes("purchase") || h.includes("cost")) return "purchasePrice";
  if (h.includes("tax") || h.includes("gst")) return "taxPercent";
  if (h.includes("opening") || h.includes("qty") || h.includes("stock")) return "openingQty";
  if (h.includes("min")) return "lowStockAlert";
  if (h.includes("location") || h.includes("rack")) return "location";
  if (h.includes("desc")) return "description";
  return "skip";
}

const NUMERIC = new Set(["salePrice", "purchasePrice", "taxPercent", "openingQty", "lowStockAlert"]);

/** Import items from a CSV with auto-detected column mapping and a preview before committing. */
export function ItemImportDialog({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<string[]>([]);
  const [hasHeader, setHasHeader] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<number | null>(null);
  const bankAccountId = useVyaparBankId();

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    if (/\.xlsx?$/i.test(file.name)) {
      setError("Save the sheet as CSV first (File → Save As → CSV), then upload it here.");
      return;
    }
    const parsed = parseCsv(await file.text());
    if (parsed.length === 0) {
      setError("That file looks empty.");
      return;
    }
    setFileName(file.name);
    setHeaders(parsed[0]);
    setRows(parsed.slice(1));
    setMapping(parsed[0].map(guess));
  }

  const dataRows = hasHeader ? rows : [headers, ...rows];
  const nameIdx = mapping.indexOf("name");
  const validCount = nameIdx === -1 ? 0 : dataRows.filter((r) => (r[nameIdx] ?? "").trim()).length;

  const preview = useMemo(() => {
    if (nameIdx === -1) return [];
    return dataRows.slice(0, 8).map((r) => {
      const o: Record<string, string> = {};
      mapping.forEach((t, i) => {
        if (t !== "skip" && r[i]) o[t] = r[i].trim();
      });
      return o;
    });
  }, [dataRows, mapping, nameIdx]);

  async function runImport() {
    if (nameIdx === -1) {
      setError("Map one column to Item Name before importing.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const payload: Partial<Item>[] = dataRows
        .filter((r) => (r[nameIdx] ?? "").trim())
        .map((r) => {
          const p: Record<string, unknown> = { unit: "NONE", isService: false, bankAccountId: bankAccountId ?? null };
          mapping.forEach((t, i) => {
            const v = (r[i] ?? "").trim();
            if (!v || t === "skip") return;
            p[t] = NUMERIC.has(t) ? Number(v.replace(/[^\d.-]/g, "")) || 0 : v;
          });
          return p as Partial<Item>;
        });

      let created = 0;
      try {
        created = (await vyapar.importItems(payload)).length;
      } catch {
        for (const it of payload) {
          await vyapar.createItem(it);
          created++;
        }
      }
      setDone(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      title="Import Items from Excel"
      onClose={onClose}
      onSave={done == null ? runImport : onImported}
      saveLabel={done != null ? "Done" : busy ? "Importing…" : `Import ${validCount || ""}`.trim()}
      width="max-w-4xl"
    >
      <div className="space-y-5">
        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        {done != null ? (
          <div className="flex flex-col items-center justify-center py-14 text-center">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <CheckCircle2 size={26} />
            </div>
            <div className="text-base font-semibold text-gray-800">{done} items imported</div>
          </div>
        ) : (
          <>
            <section>
              <Step n={1} title="Choose your sheet" />
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-2 rounded-lg border border-dashed border-gray-300 px-4 py-3 text-sm font-medium text-brand-accent transition-all duration-150 hover:border-brand-accent hover:bg-cyan-50/40 active:scale-95"
                >
                  <Upload size={15} /> {fileName || "Select CSV file"}
                </button>
                <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={pick} />
                <button
                  onClick={() =>
                    exportRowsToCsv(
                      "item-import-template",
                      ["Item Name", "Item Code", "HSN", "Category", "Unit", "Sale Price", "Purchase Price", "Tax %", "Opening Quantity", "Min Stock"],
                      [["TMT Bar 12mm", "ITM001", "7214", "Steel", "KG", "62", "55", "18", "1200", "200"]]
                    )
                  }
                  className="flex items-center gap-1.5 text-sm font-medium text-gray-500 transition-colors duration-150 hover:text-brand-accent"
                >
                  <Download size={14} /> Download template
                </button>
              </div>
              {headers.length > 0 && (
                <label className="mt-3 flex items-center gap-2 text-sm text-gray-600">
                  <input type="checkbox" checked={hasHeader} onChange={(e) => setHasHeader(e.target.checked)} className="h-4 w-4 accent-cyan-600" />
                  First row is a header
                </label>
              )}
            </section>

            {headers.length > 0 && (
              <section className="animate-fade-in">
                <Step n={2} title="Match the columns" />
                <div className="grid gap-2 sm:grid-cols-2">
                  {headers.map((h, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-gray-700">{h || `Column ${i + 1}`}</div>
                        <div className="truncate text-[11px] text-gray-400">e.g. {dataRows[0]?.[i] || "—"}</div>
                      </div>
                      <Select
                        value={mapping[i] ?? "skip"}
                        onChange={(v) => setMapping((m) => m.map((x, j) => (j === i ? v : x)))}
                        size="sm"
                        className="w-44"
                        options={TARGETS.map((t) => ({ value: t.key, label: t.label }))}
                      />
                    </div>
                  ))}
                </div>
                {nameIdx === -1 && <p className="mt-2 text-xs text-rose-600">Map one column to <strong>Item Name</strong> to continue.</p>}
              </section>
            )}

            {preview.length > 0 && (
              <section className="animate-fade-in">
                <Step n={3} title={`Preview — ${validCount} items will be imported`} />
                <div className="overflow-x-auto rounded-xl border border-gray-200">
                  <table className="w-full min-w-[560px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
                        <th className="px-3 py-2 font-medium">Name</th>
                        <th className="px-3 py-2 font-medium">Code</th>
                        <th className="px-3 py-2 font-medium">Unit</th>
                        <th className="px-3 py-2 text-right font-medium">Sale</th>
                        <th className="px-3 py-2 text-right font-medium">Qty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((p, i) => (
                        <tr key={i} className="border-b border-gray-50 last:border-b-0 even:bg-gray-50/40">
                          <td className="px-3 py-2 font-medium text-gray-800">{p.name}</td>
                          <td className="px-3 py-2 font-mono text-xs text-gray-500">{p.itemCode ?? "—"}</td>
                          <td className="px-3 py-2 text-gray-600">{p.unit ?? "—"}</td>
                          <td className="px-3 py-2 text-right text-gray-600">{p.salePrice ?? "0"}</td>
                          <td className="px-3 py-2 text-right text-gray-600">{p.openingQty ?? "0"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {validCount > preview.length && <p className="mt-2 text-xs text-gray-400">…and {validCount - preview.length} more.</p>}
              </section>
            )}

            {headers.length === 0 && (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 py-12 text-center">
                <FileSpreadsheet size={26} className="mb-2 text-gray-300" />
                <p className="text-sm text-gray-500">Pick a CSV to get started.</p>
              </div>
            )}
          </>
        )}
      </div>
    </Drawer>
  );
}

function Step({ n, title }: { n: number; title: string }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-accent text-[11px] font-semibold text-white">{n}</span>
      <span className="text-sm font-semibold text-gray-800">{title}</span>
    </div>
  );
}
