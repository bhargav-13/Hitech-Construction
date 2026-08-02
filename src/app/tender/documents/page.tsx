"use client";

import { useMemo, useState } from "react";
import { TenderShell, TenderEmpty } from "@/components/tender/TenderShell";
import { useTenderStore } from "@/lib/tenderStore";
import { DOCUMENT_STEPS, raLabel } from "@/lib/tenderTypes";
import type { DocPair, TenderDocuments } from "@/lib/tenderTypes";
import { tval } from "@/lib/tenderHelpers";
import { FileText, Plus, Search } from "lucide-react";

export default function TenderDocumentsPage() {
  const documents = useTenderStore((s) => s.documents);
  const toggleDocument = useTenderStore((s) => s.toggleDocument);
  const addRaBill = useTenderStore((s) => s.addRaBill);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return documents;
    return documents.filter((d) => (d.nameOfWork ?? "").toLowerCase().includes(q) || (d.tenderId ?? "").toLowerCase().includes(q));
  }, [documents, search]);

  return (
    <TenderShell>
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-gray-800">Documentation Tracker</h1>
            <p className="text-sm text-gray-500">Soft & hard copy status of each document per won tender — click a pill to toggle.</p>
          </div>
          <div className="text-sm text-gray-500">{filtered.length} tenders</div>
        </div>

        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 transition-colors duration-150 focus-within:border-cyan-500">
          <Search size={15} className="text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name of work or tender ID"
            className="w-full bg-transparent text-sm outline-none"
          />
        </div>

        {filtered.length === 0 ? (
          <TenderEmpty icon={FileText} title="No documentation records" hint="Try a different search." />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {filtered.map((d) => (
              <DocumentCard key={d.id} doc={d} onToggle={toggleDocument} onAddRaBill={() => addRaBill(d.id)} />
            ))}
          </div>
        )}
      </div>
    </TenderShell>
  );
}

function DocumentCard({
  doc,
  onToggle,
  onAddRaBill,
}: {
  doc: TenderDocuments;
  onToggle: (id: string, key: string, copy: keyof DocPair, raIndex?: number) => void;
  onAddRaBill: () => void;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-gray-800" title={doc.nameOfWork ?? ""}>
            {tval(doc.nameOfWork)}
          </h3>
          <p className="text-[11px] text-gray-400">Tender {tval(doc.tenderId)}</p>
        </div>
        {doc.progress && (
          <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">{doc.progress}</span>
        )}
      </div>

      <div className="divide-y divide-gray-50">
        {DOCUMENT_STEPS.map((step) => (
          <DocRow
            key={String(step.key)}
            label={step.label}
            pair={doc[step.key] as DocPair}
            onToggle={(copy) => onToggle(doc.id, String(step.key), copy)}
          />
        ))}
        {/* Running Account Bills — unbounded: the workbook's five columns were never the real limit,
            and at least one project in the source data is already on its sixth bill. */}
        <div className="py-2">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[13px] text-gray-600">Running Account Bills</span>
            <button
              onClick={onAddRaBill}
              className="flex items-center gap-0.5 text-[11px] font-medium text-brand-accent hover:underline"
            >
              <Plus size={11} /> Add bill
            </button>
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {doc.raBills.map((pair, i) => (
              <div key={i} className="rounded-lg border border-gray-100 p-1.5 text-center">
                <div className="mb-1 text-[10px] font-medium text-gray-400">{raLabel(i)}</div>
                <div className="flex justify-center gap-1">
                  <CopyPill label="S" on={pair.soft} onClick={() => onToggle(doc.id, "raBills", "soft", i)} />
                  <CopyPill label="H" on={pair.hard} onClick={() => onToggle(doc.id, "raBills", "hard", i)} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {doc.viewDocuments && <p className="mt-3 text-[11px] text-gray-400">📁 {doc.viewDocuments}</p>}
    </div>
  );
}

function DocRow({ label, pair, onToggle }: { label: string; pair: DocPair; onToggle: (copy: keyof DocPair) => void }) {
  return (
    <div className="flex items-center justify-between gap-2 py-2">
      <span className="text-[13px] text-gray-600">{label}</span>
      <div className="flex gap-1.5">
        <CopyPill label="Soft" on={pair.soft} onClick={() => onToggle("soft")} />
        <CopyPill label="Hard" on={pair.hard} onClick={() => onToggle("hard")} />
      </div>
    </div>
  );
}

function CopyPill({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors duration-150 active:scale-95 ${
        on
          ? "bg-emerald-500 text-white hover:bg-emerald-600"
          : "border border-gray-200 text-gray-400 hover:border-emerald-300 hover:text-emerald-500"
      }`}
    >
      {label}
    </button>
  );
}
