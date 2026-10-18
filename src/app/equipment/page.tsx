"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Select } from "@/components/Select";
import { Spinner } from "@/components/Spinner";
import { SortTh } from "@/components/vyapar/SortTh";
import { EquipmentFormDialog, UsageDialog, num2, unitLabel } from "@/components/equipment/EquipmentDialogs";
import { ApiError } from "@/lib/api";
import { listEquipment } from "@/lib/equipmentApi";
import type { Equipment } from "@/lib/equipmentApi";
import { useProjects } from "@/lib/useProjects";
import { useCan } from "@/lib/permissions";
import { useTableSort } from "@/lib/useTableSort";
import { bookDate } from "@/lib/format";
import { useVyaparProjectId } from "@/lib/projectScope";
import { exportRowsToCsv } from "@/lib/vyaparExport";
import { Clock, FileSpreadsheet, Plus, Search, Tractor, Truck } from "lucide-react";

const SORT = {
  name: (e: Equipment) => e.name.toLowerCase(),
  type: (e: Equipment) => e.ownership,
  vendor: (e: Equipment) => (e.vendorName ?? "").toLowerCase(),
  entries: (e: Equipment) => e.usageEntries,
  hours: (e: Equipment) => Number(e.usedHours),
  distance: (e: Equipment) => Number(e.distance),
  last: (e: Equipment) => e.lastUsedOn ?? "",
};

/**
 * Equipment — the machines on the sites (Onsite's Equipment screen): rented or owned, the vendor
 * it is hired from, where it is now, and how much it has run. A row opens its deployments and log.
 */
export default function EquipmentListPage() {
  const router = useRouter();
  const can = useCan();
  const { projects } = useProjects();
  const projectName = useMemo(() => new Map(projects.map((p) => [Number(p.id), p.name])), [projects]);
  const [items, setItems] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  // Follows the header's project picker, like every module.
  const projectId = useVyaparProjectId() ?? null;
  const [status, setStatus] = useState("active");
  const [dialog, setDialog] = useState<null | { kind: "NEW" } | { kind: "USAGE"; item: Equipment }>(null);

  const load = useCallback(async () => {
    try {
      setItems(await listEquipment(projectId));
      setError("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load equipment.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);
  useEffect(() => { void load(); }, [load]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((e) => {
      if (status === "active" && !e.active) return false;
      if (status === "inactive" && e.active) return false;
      if (!q) return true;
      return [e.name, e.code ?? "", e.vendorName ?? "", e.fuel ?? ""].some((f) => f.toLowerCase().includes(q));
    });
  }, [items, search, status]);
  const { sorted, sortKey, sortDir, toggle } = useTableSort(rows, SORT, { key: "name", dir: "asc" });

  const totals = useMemo(() => ({
    rented: items.filter((e) => e.ownership === "RENTED").length,
    owned: items.filter((e) => e.ownership === "OWNED").length,
    deployed: items.filter((e) => e.activeProjectIds.length > 0).length,
    hours: items.reduce((s, e) => s + Number(e.usedHours), 0),
    entries: items.reduce((s, e) => s + e.usageEntries, 0),
  }), [items]);

  const canCreate = can("EQUIPMENT:CREATE");

  function exportCsv() {
    exportRowsToCsv(
      "equipment",
      ["Equipment", "Code", "Type", "Vendor", "Unit", "Deployed on", "Entries", "Hours", "Distance (km)", "Last used"],
      sorted.map((e) => [
        e.name, e.code ?? "", e.ownership === "RENTED" ? "Rented" : "Owned", e.vendorName ?? "", unitLabel(e.unit),
        e.activeProjectIds.map((id) => projectName.get(id) ?? `#${id}`).join(", "),
        e.usageEntries, Number(e.usedHours), Number(e.distance), e.lastUsedOn ?? "",
      ]),
    );
  }

  return (
    <AppShell title="Equipment">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Equipment</h2>
            <p className="mt-0.5 text-sm text-gray-500">Machines on the sites — where each one is, on what rent, and how long it has run.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={exportCsv} className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">
              <FileSpreadsheet size={14} /> Export
            </button>
            {canCreate && (
              <button onClick={() => setDialog({ kind: "NEW" })} className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-3.5 py-2 text-sm font-semibold text-white hover:opacity-90">
                <Plus size={15} /> New Equipment
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Equipment" value={String(items.length)} hint={`${totals.rented} rented · ${totals.owned} owned`} icon={Tractor} />
          <Stat label="On a site now" value={String(totals.deployed)} icon={Truck} />
          <Stat label="Hours run" value={num2(totals.hours)} hint={projectId ? "on this project" : "all projects"} icon={Clock} />
          <Stat label="Usage entries" value={String(totals.entries)} />
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white p-3">
          <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 focus-within:border-cyan-500">
            <Search size={15} className="text-gray-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, code, vendor…" className="w-full bg-transparent text-sm outline-none" />
          </div>
          <div className="w-36">
            <Select value={status} onChange={setStatus} options={[{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }, { value: "all", label: "All" }]} />
          </div>
          <span className="text-sm text-gray-500">({rows.length})</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white py-16 text-sm text-gray-400">
            <Spinner size={16} className="text-brand-accent" /> Loading equipment…
          </div>
        ) : error ? (
          <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</div>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white py-16 text-center">
            <Tractor size={26} className="mx-auto mb-2 text-gray-300" />
            <p className="text-sm font-medium text-gray-700">{projectId ? "No equipment on this project" : "No equipment yet"}</p>
            <p className="mt-1 text-xs text-gray-400">Add the tractors, JCBs and breakers the sites hire, deploy them to a project, and log each day&apos;s run.</p>
            {canCreate && !projectId && (
              <button onClick={() => setDialog({ kind: "NEW" })} className="mt-4 rounded-lg bg-brand-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
                Add first equipment
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full min-w-[900px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs text-gray-500">
                  <SortTh label="Equipment" sortKey="name" activeKey={sortKey} dir={sortDir} onSort={toggle} className="px-4" />
                  <SortTh label="Type" sortKey="type" activeKey={sortKey} dir={sortDir} onSort={toggle} className="px-3" />
                  <SortTh label="Vendor" sortKey="vendor" activeKey={sortKey} dir={sortDir} onSort={toggle} className="px-3" />
                  <th className="px-3 py-2 font-medium">On site</th>
                  <SortTh label="Entries" sortKey="entries" activeKey={sortKey} dir={sortDir} onSort={toggle} align="right" className="px-3" />
                  <SortTh label="Hours" sortKey="hours" activeKey={sortKey} dir={sortDir} onSort={toggle} align="right" className="px-3" />
                  <SortTh label="Km" sortKey="distance" activeKey={sortKey} dir={sortDir} onSort={toggle} align="right" className="px-3" />
                  <SortTh label="Last used" sortKey="last" activeKey={sortKey} dir={sortDir} onSort={toggle} className="px-3" />
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((e) => (
                  <tr key={e.id} onClick={() => router.push(`/equipment/${e.id}`)} className="cursor-pointer border-b border-gray-50 last:border-b-0 hover:bg-cyan-50/40">
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-gray-800">{e.name}{!e.active && <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">Inactive</span>}</div>
                      <div className="text-xs text-gray-400">{[e.code, unitLabel(e.unit), e.fuel].filter(Boolean).join(" · ")}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${e.ownership === "RENTED" ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
                        {e.ownership === "RENTED" ? "Rented" : "Owned"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-gray-700">{e.vendorName ?? <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-600">
                      {e.activeProjectIds.length === 0 ? <span className="text-gray-300">—</span> : e.activeProjectIds.map((id) => projectName.get(id) ?? `#${id}`).join(", ")}
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-700">{e.usageEntries}</td>
                    <td className="px-3 py-2.5 text-right font-medium text-gray-800">{num2(e.usedHours)}</td>
                    <td className="px-3 py-2.5 text-right text-gray-700">{Number(e.distance) > 0 ? num2(e.distance) : <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-2.5 text-gray-600">{e.lastUsedOn ? bookDate(e.lastUsedOn) : <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-2.5 text-right" onClick={(ev) => ev.stopPropagation()}>
                      {canCreate && e.active && (
                        <button
                          onClick={() => setDialog({ kind: "USAGE", item: e })}
                          className="rounded-lg bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100"
                        >
                          + Usage
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {sorted.length === 0 && (
                  <tr><td colSpan={9} className="px-4 py-10 text-center text-sm text-gray-400">No equipment matches.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {dialog?.kind === "NEW" && (
        <EquipmentFormDialog onClose={() => setDialog(null)} onSaved={(e) => { void load(); router.push(`/equipment/${e.id}`); }} />
      )}
      {dialog?.kind === "USAGE" && (
        <UsageDialog equipment={dialog.item} projectId={projectId} onClose={() => setDialog(null)} onDone={() => void load()} />
      )}
    </AppShell>
  );
}

function Stat({ label, value, hint, icon: Icon }: { label: string; value: string; hint?: string; icon?: React.ComponentType<{ size?: number }> }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <div className="flex items-start justify-between">
        <div className="text-xs text-gray-500">{label}</div>
        {Icon && <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-50 text-brand-accent"><Icon size={14} /></span>}
      </div>
      <div className="mt-1 text-lg font-semibold text-gray-900">{value}</div>
      {hint && <div className="text-[11px] text-gray-400">{hint}</div>}
    </div>
  );
}
