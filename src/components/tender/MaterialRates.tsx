"use client";

import { useEffect, useMemo, useState } from "react";
import { listMaterialRatesApi, type MaterialRate } from "@/lib/tenderApi";
import { inr } from "@/lib/format";

const SECTIONS: { key: MaterialRate["section"]; title: string; note: string }[] = [
  { key: "DI_PIPE", title: "DI Pipe", note: "Per running metre. 450 mm is K9, the rest K7." },
  { key: "SLUICE_VALVE", title: "Sluice Valve", note: "Per number, GST extra." },
  { key: "AIR_VALVE", title: "Air Valve", note: "Per number, GST extra." },
];

const parse = (json: string): Record<string, number> => {
  try {
    return JSON.parse(json) as Record<string, number>;
  } catch {
    return {};
  }
};

/** Who quoted what, by size, with the lowest quote in each column picked out. */
export function MaterialRates() {
  const [rows, setRows] = useState<MaterialRate[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    listMaterialRatesApi().then(setRows).catch(() => setError("Couldn't load the rates."));
  }, []);

  const sections = useMemo(
    () =>
      SECTIONS.map((s) => {
        const parties = rows.filter((r) => r.section === s.key).map((r) => ({ ...r, rates: parse(r.ratesJson) }));
        const sizes = [...new Set(parties.flatMap((p) => Object.keys(p.rates)))].sort((a, b) => Number(a) - Number(b));
        const lowest = Object.fromEntries(
          sizes.map((size) => [size, Math.min(...parties.map((p) => p.rates[size] ?? Infinity))]),
        );
        return { ...s, parties: parties.filter((p) => Object.keys(p.rates).length > 0), sizes, lowest };
      }).filter((s) => s.parties.length > 0),
    [rows],
  );

  if (error) return <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>;
  if (sections.length === 0) return null;

  return (
    <div className="space-y-4">
      {sections.map((s) => (
        <div key={s.key}>
          <div className="mb-1.5 flex items-baseline gap-2">
            <h3 className="text-sm font-semibold text-gray-700">{s.title} rates</h3>
            <span className="text-xs text-gray-400">{s.note} Lowest quote in green.</span>
          </div>
          <div className="w-full min-w-0 overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-xs">
                  <th className="px-4 py-2 text-left font-medium text-gray-500">Party</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500">Make</th>
                  {s.sizes.map((size) => (
                    <th key={size} className="px-3 py-2 text-right font-medium whitespace-nowrap text-gray-500">{size} mm</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {s.parties.map((p) => (
                  <tr key={p.id} className="border-b border-gray-50 last:border-b-0 even:bg-gray-50/40">
                    <td className="px-4 py-2 font-medium whitespace-nowrap text-gray-700" title={p.contact ?? undefined}>{p.party}</td>
                    <td className="px-4 py-2 whitespace-nowrap text-gray-600">{p.make ?? "—"}</td>
                    {s.sizes.map((size) => {
                      const v = p.rates[size];
                      return (
                        <td
                          key={size}
                          className={`px-3 py-2 text-right whitespace-nowrap ${v != null && v === s.lowest[size] ? "font-semibold text-emerald-600" : "text-gray-600"}`}
                        >
                          {v == null ? "—" : inr(v)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
