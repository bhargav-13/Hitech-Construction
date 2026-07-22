"use client";

import { useMemo, useRef, useState } from "react";
import { Drawer } from "@/components/Drawer";
import { Select } from "@/components/Select";
import { parseCsv, exportRowsToCsv } from "@/lib/vyaparExport";
import { useVyaparBankId } from "@/lib/bankScope";
import * as vyapar from "@/lib/vyaparApi";
import type { Party } from "@/lib/vyaparApi";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Upload } from "lucide-react";

/** Party fields an imported sheet can map onto. */
const TARGETS = [
  { key: "skip", label: "— Don't import —" },
  { key: "name", label: "Party Name *" },
  { key: "partyType", label: "Party Type (Customer/Supplier)" },
  { key: "phone", label: "Phone Number" },
  { key: "email", label: "Email" },
  { key: "gstin", label: "GSTIN" },
  { key: "gstType", label: "GST Type" },
  { key: "state", label: "State" },
  { key: "billingAddress", label: "Billing Address" },
  { key: "shippingAddress", label: "Shipping Address" },
  { key: "partyGroup", label: "Party Group" },
  { key: "openingBalance", label: "Opening Balance" },
  { key: "creditLimit", label: "Credit Limit" },
] as const;

/** Best-guess mapping from a spreadsheet header to one of our fields. */
function guessTarget(header: string): string {
  const h = header.toLowerCase().replace(/[^a-z]/g, "");
  if (h.includes("partyname") || h === "name" || h.includes("customer") || h.includes("supplier")) return "name";
  if (h.includes("type")) return "partyType";
  if (h.includes("phone") || h.includes("mobile") || h.includes("contact")) return "phone";
  if (h.includes("email")) return "email";
  if (h.includes("gstin") || h === "gst") return "gstin";
  if (h.includes("gsttype")) return "gstType";
  if (h.includes("state")) return "state";
  if (h.includes("shipping")) return "shippingAddress";
  if (h.includes("address") || h.includes("billing")) return "billingAddress";
  if (h.includes("group")) return "partyGroup";
  if (h.includes("opening") || h.includes("balance")) return "openingBalance";
  if (h.includes("credit") || h.includes("limit")) return "creditLimit";
  return "skip";
}

/**
 * Import parties from an Excel/CSV sheet: pick a file, confirm how columns map onto our fields,
 * preview what will be created, then import. Vyapar drops you straight into a rigid template —
 * we auto-detect the columns instead and let you correct them.
 */
export function PartyImportDialog({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
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
    // .xlsx is a zip archive — ask for CSV, which every spreadsheet app exports.
    if (/\.xlsx?$/i.test(file.name)) {
      setError("Save the sheet as CSV first (File → Save As → CSV), then upload it here.");
      return;
    }
    const text = await file.text();
    const parsed = parseCsv(text);
    if (parsed.length === 0) {
      setError("That file looks empty.");
      return;
    }
    setFileName(file.name);
    const head = parsed[0];
    setHeaders(head);
    setRows(parsed.slice(1));
    setMapping(head.map(guessTarget));
  }

  const dataRows = hasHeader ? rows : [headers, ...rows];
  const nameIdx = mapping.indexOf("name");

  const preview = useMemo(() => {
    if (nameIdx === -1) return [];
    return dataRows.slice(0, 8).map((r) => {
      const out: Record<string, string> = {};
      mapping.forEach((t, i) => {
        if (t !== "skip" && r[i]) out[t] = r[i].trim();
      });
      return out;
    });
  }, [dataRows, mapping, nameIdx]);

  const validCount = nameIdx === -1 ? 0 : dataRows.filter((r) => (r[nameIdx] ?? "").trim()).length;

  async function runImport() {
    if (nameIdx === -1) {
      setError("Map one column to Party Name before importing.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const payload: Partial<Party>[] = dataRows
        .filter((r) => (r[nameIdx] ?? "").trim())
        .map((r) => {
          const p: Record<string, unknown> = { partyType: "CUSTOMER", bankAccountId: bankAccountId ?? null };
          mapping.forEach((t, i) => {
            const v = (r[i] ?? "").trim();
            if (!v || t === "skip") return;
            if (t === "openingBalance" || t === "creditLimit") p[t] = Number(v.replace(/[^\d.-]/g, "")) || 0;
            else if (t === "partyType") p[t] = /supp|vendor/i.test(v) ? "SUPPLIER" : "CUSTOMER";
            else p[t] = v;
          });
          return p as Partial<Party>;
        });

      let created = 0;
      try {
        const res = await vyapar.importParties(payload);
        created = res.length;
      } catch {
        // No bulk endpoint yet — fall back to creating them one by one.
        for (const p of payload) {
          await vyapar.createParty(p);
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
      title="Import Parties from Excel"
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
            <div className="text-base font-semibold text-gray-800">{done} parties imported</div>
            <p className="mt-1 text-sm text-gray-500">They&apos;re in your party list now.</p>
          </div>
        ) : (
          <>
            {/* Step 1 — file */}
            <section>
              <StepTitle n={1} title="Choose your sheet" />
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
                      "party-import-template",
                      ["Party Name", "Party Type", "Phone Number", "Email", "GSTIN", "State", "Billing Address", "Opening Balance"],
                      [["Acme Traders", "Customer", "9876543210", "acme@example.com", "24ABCDE1234F1Z5", "Gujarat", "Rajkot", "0"]]
                    )
                  }
                  className="flex items-center gap-1.5 text-sm font-medium text-gray-500 transition-colors duration-150 hover:text-brand-accent"
                >
                  <Download size={14} /> Download template
                </button>
              </div>
              {headers.length > 0 && (
                <label className="mt-3 flex items-center gap-2 text-sm text-gray-600">
                  <input
                    type="checkbox"
                    checked={hasHeader}
                    onChange={(e) => setHasHeader(e.target.checked)}
                    className="h-4 w-4 accent-cyan-600"
                  />
                  First row is a header
                </label>
              )}
            </section>

            {/* Step 2 — mapping */}
            {headers.length > 0 && (
              <section className="animate-fade-in">
                <StepTitle n={2} title="Match the columns" />
                <div className="grid gap-2 sm:grid-cols-2">
                  {headers.map((h, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-gray-700">{h || `Column ${i + 1}`}</div>
                        <div className="truncate text-[11px] text-gray-400">
                          e.g. {dataRows[0]?.[i] || "—"}
                        </div>
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
                {nameIdx === -1 && (
                  <p className="mt-2 text-xs text-rose-600">Map one column to <strong>Party Name</strong> to continue.</p>
                )}
              </section>
            )}

            {/* Step 3 — preview */}
            {preview.length > 0 && (
              <section className="animate-fade-in">
                <StepTitle n={3} title={`Preview — ${validCount} parties will be imported`} />
                <div className="overflow-x-auto rounded-xl border border-gray-200">
                  <table className="w-full min-w-[560px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
                        <th className="px-3 py-2 font-medium">Name</th>
                        <th className="px-3 py-2 font-medium">Type</th>
                        <th className="px-3 py-2 font-medium">Phone</th>
                        <th className="px-3 py-2 font-medium">GSTIN</th>
                        <th className="px-3 py-2 text-right font-medium">Opening</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((p, i) => (
                        <tr key={i} className="border-b border-gray-50 last:border-b-0 even:bg-gray-50/40">
                          <td className="px-3 py-2 font-medium text-gray-800">{p.name}</td>
                          <td className="px-3 py-2 text-gray-600">{/supp|vendor/i.test(p.partyType ?? "") ? "Supplier" : "Customer"}</td>
                          <td className="px-3 py-2 text-gray-600">{p.phone ?? "—"}</td>
                          <td className="px-3 py-2 font-mono text-xs text-gray-500">{p.gstin ?? "—"}</td>
                          <td className="px-3 py-2 text-right text-gray-600">{p.openingBalance ?? "0"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {validCount > preview.length && (
                  <p className="mt-2 text-xs text-gray-400">…and {validCount - preview.length} more.</p>
                )}
              </section>
            )}

            {headers.length === 0 && (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 py-12 text-center">
                <FileSpreadsheet size={26} className="mb-2 text-gray-300" />
                <p className="text-sm text-gray-500">Pick a CSV to get started.</p>
                <p className="mt-1 text-xs text-gray-400">We&apos;ll detect the columns for you.</p>
              </div>
            )}
          </>
        )}
      </div>
    </Drawer>
  );
}

function StepTitle({ n, title }: { n: number; title: string }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-accent text-[11px] font-semibold text-white">
        {n}
      </span>
      <span className="text-sm font-semibold text-gray-800">{title}</span>
    </div>
  );
}
