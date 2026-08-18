"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Clock, PackageSearch, Search } from "lucide-react";
import { Spinner } from "@/components/Spinner";
import { getProjectMaterials, ApiError } from "@/lib/api";
import type { ProjectMaterialRow } from "@/lib/api";
import { inr, qty } from "@/lib/format";

/**
 * Project → Material tab.
 *
 * <p>Items are global master data (one "OPC 53 Cement" shared by every site), so a project doesn't
 * have its own materials — it has its own *movement*. Every row here is a line off a document filed
 * against this project: purchases bring material onto the site, sales and challans take it off,
 * estimates and orders are planned but haven't moved anything yet.
 *
 * <p>Replaces `generateProjectMaterials()`, which invented six seeded-random rows per project.
 */

const MOVEMENT_META: Record<ProjectMaterialRow["movement"], { label: string; chip: string; icon: typeof ArrowDownLeft }> = {
  IN: { label: "Received", chip: "bg-emerald-50 text-emerald-700 ring-emerald-600/20", icon: ArrowDownLeft },
  OUT: { label: "Issued", chip: "bg-rose-50 text-rose-700 ring-rose-600/20", icon: ArrowUpRight },
  PLANNED: { label: "Planned", chip: "bg-slate-100 text-slate-600 ring-slate-500/20", icon: Clock },
};

type Filter = "ALL" | ProjectMaterialRow["movement"];

export function ProjectMaterials({ projectId }: { projectId: number }) {
  const [rows, setRows] = useState<ProjectMaterialRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    getProjectMaterials(projectId)
      .then((r) => {
        if (!cancelled) setRows(r);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof ApiError ? e.message : "Couldn't load material movement.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter((r) => (filter === "ALL" ? true : r.movement === filter))
      .filter((r) => (q ? r.itemName.toLowerCase().includes(q) || r.partyName.toLowerCase().includes(q) : true));
  }, [rows, filter, query]);

  const totals = useMemo(() => {
    let received = 0;
    let issued = 0;
    for (const r of rows) {
      if (r.movement === "IN") received += r.amount;
      else if (r.movement === "OUT") issued += r.amount;
    }
    return { received, issued, lines: rows.length };
  }, [rows]);

  if (loading) return <div className="flex justify-center py-16"><Spinner /></div>;
  if (error) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50/60 px-4 py-8 text-center text-sm text-rose-700">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Tile icon={<ArrowDownLeft size={16} />} tint="bg-emerald-50 text-emerald-600" label="Material received" value={inr(totals.received)} />
        <Tile icon={<ArrowUpRight size={16} />} tint="bg-rose-50 text-rose-600" label="Material issued / billed" value={inr(totals.issued)} />
        <Tile icon={<PackageSearch size={16} />} tint="bg-cyan-50 text-cyan-600" label="Movements recorded" value={String(totals.lines)} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(["ALL", "IN", "OUT", "PLANNED"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              filter === f
                ? "bg-brand-accent text-white"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {f === "ALL" ? "All" : MOVEMENT_META[f].label}
          </button>
        ))}
        <div className="relative ml-auto">
          <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search material or party"
            className="w-56 rounded-lg border border-slate-200 py-1.5 pl-8 pr-3 text-sm outline-none focus:border-brand-accent"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">
            {rows.length === 0
              ? "No material has moved on this project yet. Record a purchase against this project and it will appear here."
              : "No movement matches that filter."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Date</th>
                  <th className="px-4 py-2.5 font-medium">Material</th>
                  <th className="px-4 py-2.5 font-medium">Movement</th>
                  <th className="px-4 py-2.5 text-right font-medium">Qty</th>
                  <th className="px-4 py-2.5 text-right font-medium">Rate</th>
                  <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                  <th className="px-4 py-2.5 font-medium">Party</th>
                  <th className="px-4 py-2.5 font-medium">Document</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => {
                  const meta = MOVEMENT_META[r.movement];
                  const Icon = meta.icon;
                  return (
                    <tr key={`${r.invoiceId}-${r.itemName}-${i}`} className="border-t border-slate-100 hover:bg-slate-50/60">
                      <td className="whitespace-nowrap px-4 py-2.5 text-slate-500">{r.date ?? "—"}</td>
                      <td className="px-4 py-2.5 font-medium text-slate-800">{r.itemName}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${meta.chip}`}>
                          <Icon size={12} />
                          {meta.label}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right text-slate-700">
                        {qty(r.quantity)} {r.unit ?? ""}
                      </td>
                      <td className="px-4 py-2.5 text-right text-slate-500">{inr(r.rate)}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-slate-800">{inr(r.amount)}</td>
                      <td className="px-4 py-2.5 text-slate-500">{r.partyName}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-400">{r.docNo ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Tile({ icon, tint, label, value }: { icon: React.ReactNode; tint: string; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${tint}`}>{icon}</span>
      <div className="mt-3 text-xl font-semibold tracking-tight text-slate-900">{value}</div>
      <div className="mt-0.5 text-xs text-slate-500">{label}</div>
    </div>
  );
}
