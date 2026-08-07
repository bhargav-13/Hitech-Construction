"use client";

import { useMemo, useState } from "react";
import { TenderShell, TenderEmpty } from "@/components/tender/TenderShell";
import { StepEditor } from "@/components/tender/StepEditor";
import { useTenderStore } from "@/lib/tenderStore";
import { raLabel } from "@/lib/tenderTypes";
import type { DocPair, TenderDocuments, TrackerStep } from "@/lib/tenderTypes";
import { tval } from "@/lib/tenderHelpers";
import { Check, FileText, FolderOpen, Plus, Search, SlidersHorizontal } from "lucide-react";

export default function TenderDocumentsPage() {
  const documents = useTenderStore((s) => s.documents);
  const steps = useTenderStore((s) => s.documentSteps);
  const toggleDocument = useTenderStore((s) => s.toggleDocument);
  const addRaBill = useTenderStore((s) => s.addRaBill);
  const addDocumentStep = useTenderStore((s) => s.addDocumentStep);
  const removeDocumentStep = useTenderStore((s) => s.removeDocumentStep);
  const renameDocumentStep = useTenderStore((s) => s.renameDocumentStep);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return documents;
    return documents.filter((d) => (d.nameOfWork ?? "").toLowerCase().includes(q) || (d.tenderId ?? "").toLowerCase().includes(q));
  }, [documents, search]);

  // Selection is a preference resolved against the current filter, so it never points at a hidden
  // row and always has a sensible default (the first match) without a setState-in-effect.
  const selected = filtered.find((d) => d.id === selectedId) ?? filtered[0] ?? null;

  function addType() {
    const label = window.prompt("New document type name");
    if (label && label.trim()) addDocumentStep(label.trim());
  }

  return (
    <TenderShell>
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-gray-800">Documentation Tracker</h1>
            <p className="text-sm text-gray-500">Pick a tender on the left; its soft &amp; hard copy status opens on the right — click a box to toggle.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setEditing((v) => !v)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors ${
                editing ? "border-brand-accent bg-cyan-50 text-brand-accent" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              <SlidersHorizontal size={14} /> Edit types
            </button>
            <div className="text-sm text-gray-500">{filtered.length} tenders</div>
          </div>
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

        {editing && (
          <StepEditor
            title="document type"
            steps={steps}
            onAdd={addDocumentStep}
            onRemove={removeDocumentStep}
            onRename={renameDocumentStep}
          />
        )}

        {filtered.length === 0 ? (
          <TenderEmpty icon={FileText} title="No documentation records" hint="Try a different search." />
        ) : (
          <div className="grid gap-4 lg:grid-cols-[340px_1fr] lg:items-start">
            {/* Left: the list of tender boxes */}
            <div className="space-y-2 lg:max-h-[calc(100vh-230px)] lg:overflow-y-auto lg:pr-1">
              {filtered.map((d) => (
                <DocBox key={d.id} doc={d} steps={steps} active={selected?.id === d.id} onSelect={() => setSelectedId(d.id)} />
              ))}
            </div>

            {/* Right: the full detail of the selected tender, re-animated on each selection change */}
            <div className="lg:sticky lg:top-4">
              {selected ? (
                <div key={selected.id} className="animate-fade-in">
                  <DocumentDetail
                    doc={selected}
                    steps={steps}
                    onToggle={toggleDocument}
                    onAddRaBill={() => addRaBill(selected.id)}
                    onAddType={addType}
                  />
                </div>
              ) : (
                <TenderEmpty icon={FileText} title="Select a tender" hint="Choose one on the left to see its documents." />
              )}
            </div>
          </div>
        )}
      </div>
    </TenderShell>
  );
}

/** Pull "31" and "Work Order Issued" out of a progress blob like "🟠 31% & Work Order Issued". */
function parseProgress(s?: string | null): { pct: number | null; label: string } {
  if (!s) return { pct: null, label: "" };
  const m = /(\d+)\s*%/.exec(s);
  const pct = m ? Math.min(100, Number(m[1])) : null;
  const label = s
    .replace(/[^\x00-\x7F]/g, "") // strip status emoji
    .replace(/\d+\s*%/, "")
    .replace(/^[\s|&·:-]+/, "")
    .trim();
  return { pct, label };
}

/** A compact, selectable box in the left list. */
function DocBox({ doc, steps, active, onSelect }: { doc: TenderDocuments; steps: TrackerStep[]; active: boolean; onSelect: () => void }) {
  const { pct, label } = parseProgress(doc.progress);
  const done = steps.filter((st) => {
    const p = doc[st.key] as DocPair | undefined;
    return p?.soft && p?.hard;
  }).length;

  return (
    <button
      onClick={onSelect}
      className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-all duration-150 ${
        active ? "border-brand-accent bg-cyan-50/50 ring-1 ring-inset ring-brand-accent/30" : "border-gray-200 bg-white hover:border-cyan-300 hover:bg-gray-50"
      }`}
    >
      {pct != null && <ProgressRing pct={pct} size={38} />}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-gray-800" title={doc.nameOfWork ?? ""}>
          {tval(doc.nameOfWork)}
        </div>
        <div className="truncate text-[11px] text-gray-400">
          Tender ID {tval(doc.tenderId)}
          {label ? ` · ${label}` : ""}
        </div>
        <div className="mt-0.5 text-[11px] text-gray-400">{done}/{steps.length} complete</div>
      </div>
    </button>
  );
}

/** The full document detail shown on the right. */
function DocumentDetail({
  doc,
  steps,
  onToggle,
  onAddRaBill,
  onAddType,
}: {
  doc: TenderDocuments;
  steps: TrackerStep[];
  onToggle: (id: string, key: string, copy: keyof DocPair, raIndex?: number) => void;
  onAddRaBill: () => void;
  onAddType: () => void;
}) {
  const { pct, label } = parseProgress(doc.progress);
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-800" title={doc.nameOfWork ?? ""}>
            {tval(doc.nameOfWork)}
          </h3>
          <p className="text-[11px] text-gray-400">Tender ID {tval(doc.tenderId)}</p>
        </div>
        {pct != null && (
          <div className="flex shrink-0 items-center gap-2">
            <ProgressRing pct={pct} size={44} />
            {label && <span className="max-w-[120px] text-[11px] leading-tight text-gray-500">{label}</span>}
          </div>
        )}
      </div>

      {/* Soft / Hard column headers */}
      <div className="grid grid-cols-[1fr_44px_44px] items-center border-b border-gray-100 px-1 pb-1.5 text-[11px] font-medium text-gray-400">
        <span />
        <span className="text-center">Soft</span>
        <span className="text-center">Hard</span>
      </div>

      <div className="divide-y divide-gray-50">
        {steps.map((step) => {
          const pair = (doc[step.key] as DocPair | undefined) ?? { soft: false, hard: false };
          return (
            <div key={step.key} className="grid grid-cols-[1fr_44px_44px] items-center py-2">
              <span className="truncate pr-2 text-[13px] text-gray-600" title={step.label}>
                {step.label}
              </span>
              <div className="flex justify-center">
                <CheckBox on={pair.soft} onClick={() => onToggle(doc.id, step.key, "soft")} label={`${step.label} soft copy`} />
              </div>
              <div className="flex justify-center">
                <CheckBox on={pair.hard} onClick={() => onToggle(doc.id, step.key, "hard")} label={`${step.label} hard copy`} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-1 flex justify-end">
        <button onClick={onAddType} className="flex items-center gap-0.5 text-[12px] font-medium text-brand-accent hover:underline">
          Add more <Plus size={12} />
        </button>
      </div>

      {/* Running Account Bills — unbounded; the workbook's five columns were never the real limit. */}
      <div className="mt-3 border-t border-gray-100 pt-3">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[13px] font-medium text-gray-600">Running Account Bills</span>
          <button onClick={onAddRaBill} className="flex items-center gap-0.5 text-[11px] font-medium text-brand-accent hover:underline">
            <Plus size={11} /> Add bill
          </button>
        </div>
        <div className="grid grid-cols-5 gap-1.5">
          {doc.raBills.map((pair, i) => (
            <div key={i} className="rounded-lg border border-gray-100 p-1.5 text-center">
              <div className="mb-1 text-[10px] font-medium text-gray-400">{raLabel(i)}</div>
              <div className="flex justify-center gap-1">
                <MiniPill label="S" on={pair.soft} onClick={() => onToggle(doc.id, "raBills", "soft", i)} />
                <MiniPill label="H" on={pair.hard} onClick={() => onToggle(doc.id, "raBills", "hard", i)} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {doc.viewDocuments && (
        <p className="mt-3 flex items-center gap-1.5 text-[11px] text-brand-accent">
          <FolderOpen size={12} /> {doc.viewDocuments}
        </p>
      )}
    </div>
  );
}

function ProgressRing({ pct, size = 40 }: { pct: number; size?: number }) {
  const stroke = 4;
  const r = size / 2 - stroke;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - pct / 100);
  const mid = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <circle cx={mid} cy={mid} r={r} fill="none" stroke="#e5e7eb" strokeWidth={stroke} />
      <circle
        cx={mid}
        cy={mid}
        r={r}
        fill="none"
        stroke={pct >= 100 ? "#10b981" : "#f59e0b"}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${mid} ${mid})`}
      />
      <text x={mid} y={mid + 1} textAnchor="middle" dominantBaseline="middle" className="fill-gray-700 text-[9px] font-semibold">
        {pct}%
      </text>
    </svg>
  );
}

function CheckBox({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-pressed={on}
      className={`flex h-5 w-5 items-center justify-center rounded transition-colors duration-150 active:scale-90 ${
        on ? "bg-emerald-500 text-white hover:bg-emerald-600" : "border border-gray-300 text-transparent hover:border-emerald-300 hover:text-emerald-300"
      }`}
    >
      <Check size={12} />
    </button>
  );
}

function MiniPill({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium transition-colors duration-150 active:scale-95 ${
        on ? "bg-emerald-500 text-white hover:bg-emerald-600" : "border border-gray-200 text-gray-400 hover:border-emerald-300 hover:text-emerald-500"
      }`}
    >
      {label}
    </button>
  );
}
