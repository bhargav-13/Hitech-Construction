"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { TenderShell, TenderEmpty } from "@/components/tender/TenderShell";
import { SortTh } from "@/components/vyapar/SortTh";
import { HardcopyForm } from "@/components/tender/HardcopyForm";
import { ImportDialog } from "@/components/vyapar/ImportDialog";
import { hardcopyImportConfig } from "@/lib/tenderImportConfigs";
import { exportRowsToCsv } from "@/lib/vyaparExport";
import { useTableSort } from "@/lib/useTableSort";
import { useTenderStore } from "@/lib/tenderStore";
import { tdate, tval } from "@/lib/tenderHelpers";
import type { HardcopyDispatch } from "@/lib/tenderTypes";
import { Download, Pencil, Plus, Search, Trash2, Truck, Upload } from "lucide-react";

function arrivedChip(status?: string | null) {
  const s = (status ?? "").toUpperCase();
  if (s.includes("NOT")) return "bg-amber-50 text-amber-700 ring-amber-600/20";
  if (s.includes("ARRIVED")) return "bg-emerald-50 text-emerald-700 ring-emerald-600/20";
  return "bg-gray-100 text-gray-500 ring-gray-500/20";
}

export default function TenderHardcopyPage() {
  const hardcopy = useTenderStore((s) => s.hardcopy);
  const tenders = useTenderStore((s) => s.tenders);
  const removeHardcopy = useTenderStore((s) => s.removeHardcopy);
  const addHardcopy = useTenderStore((s) => s.addHardcopy);
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<HardcopyDispatch | null>(null);
  const [importing, setImporting] = useState(false);
  const importConfig = useMemo(() => hardcopyImportConfig(addHardcopy), [addHardcopy]);

  // The source sheet has no tender column at all, so dispatches were only ever matched by name.
  // The seed resolves a tenderId where it can; this turns that into a real link.
  const tenderByNumber = useMemo(
    () => new Map(tenders.filter((t) => t.tenderId).map((t) => [t.tenderId, t])),
    [tenders],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return hardcopy;
    return hardcopy.filter((h) =>
      [h.nameOfWork, h.trackingNo, h.packedBy, h.dispatchBy, h.tenderId].some((v) => (v ?? "").toLowerCase().includes(q)),
    );
  }, [hardcopy, search]);

  const { sorted, sortKey, sortDir, toggle } = useTableSort<HardcopyDispatch>(
    filtered,
    {
      date: (h) => h.date,
      nameOfWork: (h) => h.nameOfWork,
      trackingNo: (h) => h.trackingNo,
      arrived: (h) => h.arrived,
      arrivedDate: (h) => h.arrivedDate,
    },
    { key: "date", dir: "desc" },
  );

  return (
    <TenderShell>
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-gray-800">Hardcopy Dispatch Tracker</h1>
            <p className="text-sm text-gray-500">Physical tender documents couriered to tendering offices.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setImporting(true)}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 transition-colors duration-150 hover:bg-gray-50"
            >
              <Upload size={14} /> Import
            </button>
            <button
              onClick={() =>
                exportRowsToCsv(
                  "tender-hardcopy",
                  ["Date", "Name of Work", "Tender ID", "Documents", "Packed By", "Dispatch By", "Tracking No.", "Arrived", "Arrived Date", "Remarks"],
                  sorted.map((h) => [h.date, h.nameOfWork, h.tenderId, h.documentList, h.packedBy, h.dispatchBy, h.trackingNo, h.arrived, h.arrivedDate, h.remarks]),
                )
              }
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 transition-colors duration-150 hover:bg-gray-50"
            >
              <Download size={14} /> Export
            </button>
            <button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
              className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-3 py-2 text-sm font-medium text-white transition-all duration-150 hover:opacity-90 active:scale-95"
            >
              <Plus size={14} /> Add dispatch
            </button>
            <div className="text-sm text-gray-500">{filtered.length} dispatches</div>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 transition-colors duration-150 focus-within:border-cyan-500">
          <Search size={15} className="text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search work, tracking no. or person"
            className="w-full bg-transparent text-sm outline-none"
          />
        </div>

        {filtered.length === 0 ? (
          <TenderEmpty icon={Truck} title="No dispatches" hint="Try a different search." />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full min-w-[1000px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
                  <SortTh label="Date" sortKey="date" activeKey={sortKey} dir={sortDir} onSort={toggle} />
                  <SortTh label="Name of Work" sortKey="nameOfWork" activeKey={sortKey} dir={sortDir} onSort={toggle} />
                  <th className="px-4 py-2 font-medium text-gray-500">Tender</th>
                  <th className="px-4 py-2 font-medium text-gray-500">Documents</th>
                  <th className="px-4 py-2 font-medium text-gray-500">Packed By</th>
                  <th className="px-4 py-2 font-medium text-gray-500">Dispatch By</th>
                  <SortTh label="Tracking No." sortKey="trackingNo" activeKey={sortKey} dir={sortDir} onSort={toggle} />
                  <SortTh label="Arrived" sortKey="arrived" activeKey={sortKey} dir={sortDir} onSort={toggle} />
                  <SortTh label="Arrived Date" sortKey="arrivedDate" activeKey={sortKey} dir={sortDir} onSort={toggle} />
                  <th className="px-4 py-2 font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((h) => (
                  <tr key={h.id} className="border-b border-gray-50 align-top transition-colors duration-150 last:border-b-0 even:bg-gray-50/40 hover:bg-cyan-50/40">
                    <td className="px-4 py-2.5 whitespace-nowrap text-gray-600">{tdate(h.date)}</td>
                    <td className="px-4 py-2.5 text-gray-700"><span className="block max-w-[320px] truncate" title={h.nameOfWork ?? ""}>{tval(h.nameOfWork)}</span></td>
                    <td className="px-4 py-2.5 text-gray-600">
                      {(() => {
                        const linked = h.tenderId ? tenderByNumber.get(h.tenderId) : undefined;
                        if (!linked) return <span className="text-xs text-gray-400">{h.tenderId ?? "unlinked"}</span>;
                        return (
                          <Link href={`/tender/applied?open=${linked.id}`} className="text-xs font-medium text-brand-accent hover:underline">
                            {h.tenderId}
                          </Link>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-2.5 whitespace-pre-wrap text-gray-600"><span className="block max-w-[200px] text-xs">{tval(h.documentList)}</span></td>
                    <td className="px-4 py-2.5 whitespace-pre-wrap text-gray-600">{tval(h.packedBy)}</td>
                    <td className="px-4 py-2.5 whitespace-pre-wrap text-gray-600">{tval(h.dispatchBy)}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-600">{tval(h.trackingNo)}</td>
                    <td className="px-4 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${arrivedChip(h.arrived)}`}>
                        {tval(h.arrived)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-gray-600">{tdate(h.arrivedDate)}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            setEditing(h);
                            setFormOpen(true);
                          }}
                          aria-label="Edit dispatch"
                          className="rounded p-1.5 text-gray-400 transition-colors hover:bg-cyan-50 hover:text-brand-accent"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm("Remove this dispatch record?")) removeHardcopy(h.id);
                          }}
                          aria-label="Remove dispatch"
                          className="rounded p-1.5 text-gray-400 transition-colors hover:bg-rose-50 hover:text-rose-500"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {formOpen && <HardcopyForm dispatch={editing ?? undefined} onClose={() => setFormOpen(false)} />}
      {importing && <ImportDialog config={importConfig} onClose={() => setImporting(false)} onImported={() => setImporting(false)} />}
    </TenderShell>
  );
}
