"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Select } from "@/components/Select";
import { Spinner } from "@/components/Spinner";
import { SortTh } from "@/components/vyapar/SortTh";
import { AssetFormDialog, AssignDialog, TypesDialog } from "@/components/asset/AssetDialogs";
import { ApiError } from "@/lib/api";
import { assignAsset, listAssetTypes, listAssets } from "@/lib/assetApi";
import type { Asset, AssetType } from "@/lib/assetApi";
import { useCan } from "@/lib/permissions";
import { useTableSort } from "@/lib/useTableSort";
import { inr } from "@/lib/format";
import { exportRowsToCsv } from "@/lib/vyaparExport";
import { Boxes, FileSpreadsheet, Plus, Search, Tags, Wrench, TriangleAlert, UserCheck } from "lucide-react";

const SORT = {
  code: (a: Asset) => a.codePrefix + String(a.codeNumber).padStart(6, "0"),
  name: (a: Asset) => a.name,
  type: (a: Asset) => a.typeName ?? "",
  rate: (a: Asset) => Number(a.unitRate),
  total: (a: Asset) => a.totalQty,
  available: (a: Asset) => a.availableQty,
  assigned: (a: Asset) => a.assignedQty,
};

/**
 * Asset Management — the register of what the firm owns and lends out (Onsite's Asset screen):
 * code, name, type, total vs available, and an Assign button on every row. A row opens the asset's
 * page with its holders, timeline, Return / Transfer and stock corrections.
 */
export default function AssetListPage() {
  const router = useRouter();
  const can = useCan();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [types, setTypes] = useState<AssetType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [dialog, setDialog] = useState<null | { kind: "NEW" } | { kind: "TYPES" } | { kind: "ASSIGN"; asset: Asset }>(null);

  const load = useCallback(async () => {
    try {
      const [a, t] = await Promise.all([listAssets(), listAssetTypes()]);
      setAssets(a);
      setTypes(t);
      setError("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load assets.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return assets.filter((a) => {
      if (typeFilter !== "all" && String(a.typeId ?? "none") !== typeFilter) return false;
      if (!q) return true;
      return [a.code, a.name, a.typeName ?? "", a.description ?? ""].some((f) => f.toLowerCase().includes(q));
    });
  }, [assets, search, typeFilter]);
  const { sorted, sortKey, sortDir, toggle } = useTableSort(rows, SORT, { key: "code", dir: "desc" });

  const totals = useMemo(() => ({
    units: assets.reduce((s, a) => s + a.totalQty, 0),
    assigned: assets.reduce((s, a) => s + a.assignedQty, 0),
    repair: assets.reduce((s, a) => s + a.repairQty, 0),
    damaged: assets.reduce((s, a) => s + a.damagedQty, 0),
    value: assets.reduce((s, a) => s + Number(a.unitRate) * a.totalQty, 0),
  }), [assets]);

  const canCreate = can("ASSET_REGISTER:CREATE");
  const canAssign = can("ASSET_ASSIGN:CREATE");

  function exportCsv() {
    exportRowsToCsv(
      "assets",
      ["Code", "Asset", "Type", "Unit rate", "Total", "Assigned", "In repair", "Damaged", "Available"],
      sorted.map((a) => [a.code, a.name, a.typeName ?? "", Number(a.unitRate), a.totalQty, a.assignedQty, a.repairQty, a.damagedQty, a.availableQty]),
    );
  }

  return (
    <AppShell title="Asset">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Asset Management</h2>
            <p className="mt-0.5 text-sm text-gray-500">What the firm owns and hands out — who has it, on which project, and what&apos;s in repair.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={exportCsv} className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">
              <FileSpreadsheet size={14} /> Export
            </button>
            <button onClick={() => setDialog({ kind: "TYPES" })} className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">
              <Tags size={14} /> Types
            </button>
            {canCreate && (
              <button onClick={() => setDialog({ kind: "NEW" })} className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-3.5 py-2 text-sm font-semibold text-white hover:opacity-90">
                <Plus size={15} /> New Asset
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat label="Assets" value={String(assets.length)} hint={`${totals.units} units`} icon={Boxes} tone="cyan" />
          <Stat label="Assigned" value={String(totals.assigned)} hint="units out" icon={UserCheck} tone="emerald" />
          <Stat label="In repair" value={String(totals.repair)} icon={Wrench} tone="amber" />
          <Stat label="Damaged" value={String(totals.damaged)} icon={TriangleAlert} tone="rose" />
          <Stat label="Register value" value={inr(totals.value)} hint="unit rate × total" tone="gray" />
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white p-3">
          <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 focus-within:border-cyan-500">
            <Search size={15} className="text-gray-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search code, name, type…" className="w-full bg-transparent text-sm outline-none" />
          </div>
          <div className="w-48">
            <Select
              value={typeFilter}
              onChange={setTypeFilter}
              options={[{ value: "all", label: "All types" }, ...types.map((t) => ({ value: String(t.id), label: t.name })), { value: "none", label: "No type" }]}
            />
          </div>
          <span className="text-sm text-gray-500">({rows.length})</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white py-16 text-sm text-gray-400">
            <Spinner size={16} className="text-brand-accent" /> Loading assets…
          </div>
        ) : error ? (
          <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</div>
        ) : assets.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white py-16 text-center">
            <Boxes size={26} className="mx-auto mb-2 text-gray-300" />
            <p className="text-sm font-medium text-gray-700">No assets yet</p>
            <p className="mt-1 text-xs text-gray-400">Add the cameras, mixers, pumps and vehicles the firm owns, then assign them to people.</p>
            {canCreate && (
              <button onClick={() => setDialog({ kind: "NEW" })} className="mt-4 rounded-lg bg-brand-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
                Add first asset
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full min-w-[820px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs text-gray-500">
                  <SortTh label="Code" sortKey="code" activeKey={sortKey} dir={sortDir} onSort={toggle} className="px-4" />
                  <SortTh label="Asset" sortKey="name" activeKey={sortKey} dir={sortDir} onSort={toggle} className="px-3" />
                  <SortTh label="Type" sortKey="type" activeKey={sortKey} dir={sortDir} onSort={toggle} className="px-3" />
                  <SortTh label="Unit rate" sortKey="rate" activeKey={sortKey} dir={sortDir} onSort={toggle} align="right" className="px-3" />
                  <SortTh label="Total" sortKey="total" activeKey={sortKey} dir={sortDir} onSort={toggle} align="right" className="px-3" />
                  <SortTh label="Assigned" sortKey="assigned" activeKey={sortKey} dir={sortDir} onSort={toggle} align="right" className="px-3" />
                  <SortTh label="Available" sortKey="available" activeKey={sortKey} dir={sortDir} onSort={toggle} align="right" className="px-3" />
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((a) => (
                  <tr key={a.id} onClick={() => router.push(`/asset/${a.id}`)} className="cursor-pointer border-b border-gray-50 last:border-b-0 hover:bg-cyan-50/40">
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{a.code}</td>
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-gray-800">{a.name}</div>
                      {(a.repairQty > 0 || a.damagedQty > 0) && (
                        <div className="mt-0.5 flex gap-1 text-[10px]">
                          {a.repairQty > 0 && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700">{a.repairQty} in repair</span>}
                          {a.damagedQty > 0 && <span className="rounded bg-rose-50 px-1.5 py-0.5 text-rose-700">{a.damagedQty} damaged</span>}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-gray-600">{a.typeName ?? <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-2.5 text-right text-gray-700">{inr(a.unitRate)}</td>
                    <td className="px-3 py-2.5 text-right text-gray-700">{a.totalQty}</td>
                    <td className="px-3 py-2.5 text-right text-gray-700">
                      {a.assignedQty}
                      {a.holderCount > 0 && <span className="ml-1 text-[11px] text-gray-400">({a.holderCount} {a.holderCount === 1 ? "holder" : "holders"})</span>}
                    </td>
                    <td className={`px-3 py-2.5 text-right font-semibold ${a.availableQty > 0 ? "text-emerald-600" : "text-gray-400"}`}>{a.availableQty}</td>
                    <td className="px-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                      {canAssign && (
                        <button
                          onClick={() => setDialog({ kind: "ASSIGN", asset: a })}
                          disabled={a.availableQty <= 0}
                          title={a.availableQty <= 0 ? "None available — return or transfer from a holder" : "Assign to a staff member or party"}
                          className="rounded-lg bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400"
                        >
                          Assign
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {sorted.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-400">No assets match.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {dialog?.kind === "NEW" && (
        <AssetFormDialog types={types} onClose={() => setDialog(null)} onSaved={(a) => { void load(); router.push(`/asset/${a.id}`); }} />
      )}
      {dialog?.kind === "TYPES" && (
        <TypesDialog
          types={types}
          canEdit={can("ASSET_REGISTER:EDIT")}
          canDelete={can("ASSET_REGISTER:DELETE")}
          onClose={() => setDialog(null)}
          onChanged={() => void load()}
        />
      )}
      {dialog?.kind === "ASSIGN" && (
        <AssignDialog
          asset={dialog.asset}
          onClose={() => setDialog(null)}
          onDone={() => void load()}
          run={(body) => assignAsset(dialog.asset.id, body)}
        />
      )}
    </AppShell>
  );
}

const TONES = {
  cyan: "bg-cyan-50 text-brand-accent",
  emerald: "bg-emerald-50 text-emerald-600",
  amber: "bg-amber-50 text-amber-600",
  rose: "bg-rose-50 text-rose-600",
  gray: "bg-gray-50 text-gray-500",
} as const;

function Stat({ label, value, hint, icon: Icon, tone }: {
  label: string; value: string; hint?: string; icon?: React.ComponentType<{ size?: number }>; tone: keyof typeof TONES;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <div className="flex items-start justify-between">
        <div className="text-xs text-gray-500">{label}</div>
        {Icon && <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${TONES[tone]}`}><Icon size={14} /></span>}
      </div>
      <div className="mt-1 text-lg font-semibold text-gray-900">{value}</div>
      {hint && <div className="text-[11px] text-gray-400">{hint}</div>}
    </div>
  );
}
