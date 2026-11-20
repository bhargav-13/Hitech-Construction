"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ClipboardList, FolderPlus } from "lucide-react";
import { Modal } from "@/components/Modal";
import { inr } from "@/lib/format";
import { analysisTotals, groupedBoq } from "@/lib/tenderAnalysisCalc";
import { findAnalysis, useAnalysisStore } from "@/lib/tenderAnalysisStore";
import { DEFAULT_HANDOFF, type HandoffOptions } from "@/lib/projectBoqStore";
import type { Tender } from "@/lib/tenderTypes";
import { tmoney } from "@/lib/tenderHelpers";

/**
 * Handing a won tender to the Project module.
 *
 * <p>This used to be a one-line confirmation. It now also decides what the project starts life
 * with, because the alternative — an empty project alongside a fully costed analysis nobody can
 * reach from it — is exactly the gap that keeps the client in the spreadsheet.
 */
export function HandoffDialog({
  tender,
  busy,
  onCancel,
  onConfirm,
}: {
  tender: Tender;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (opts: HandoffOptions | null) => void;
}) {
  const analyses = useAnalysisStore((s) => s.analyses);
  const analysis = findAnalysis(analyses, tender);
  const [opts, setOpts] = useState<HandoffOptions>({
    ...DEFAULT_HANDOFF,
    boqNo: `BOQ-${tender.tenderId}`,
    clientName: tender.department ?? null,
  });

  const totals = useMemo(() => (analysis ? analysisTotals(analysis) : null), [analysis]);
  const groups = useMemo(
    () => (analysis ? groupedBoq(analysis.boqLines, analysis.groups) : []),
    [analysis],
  );

  const hasBoq = !!analysis && analysis.boqLines.length > 0;
  // KAN-141: first ask whether the project comes with the health analysis or without it.
  const [mode, setMode] = useState<"CHOOSE" | "WITH" | "WITHOUT">("CHOOSE");
  const targetCount =
    opts.targets === "PER_GROUP" ? groups.length : opts.targets === "PER_LINE" ? (analysis?.boqLines.length ?? 0) : 0;
  const boqValue =
    totals && opts.rateBasis === "AWARDED" ? totals.revenueAtBid : totals ? totals.tenderValue : 0;

  const set = <K extends keyof HandoffOptions>(k: K, v: HandoffOptions[K]) =>
    setOpts((o) => ({ ...o, [k]: v }));

  return (
    <Modal onClose={onCancel} wide guardOnClose={false}>
      <div className="p-5">
        <h2 className="text-base font-semibold text-gray-800">Hand over to the Project module</h2>
        <p className="mt-1 text-sm leading-relaxed text-gray-600">
          <strong className="font-medium text-gray-800">{tender.nameOfWork ?? tender.tenderId}</strong> will be created
          as a project with a contract value of {tmoney(tender.contractValue ?? tender.estimatedCost)}
          {tender.duration ? `, a ${tender.duration} completion period` : ""} and{" "}
          {tender.department ?? "the department"} as the customer. Execution is tracked there from then on.
        </p>

        {mode === "CHOOSE" ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <ModeCard
              icon={FolderPlus}
              title="Without health analysis"
              detail="Create the project now. It starts empty — no BOQ, no budget, no targets. They can be added in the project later."
              onClick={() => setMode("WITHOUT")}
            />
            <ModeCard
              icon={ClipboardList}
              title="After health analysis"
              detail={
                hasBoq
                  ? `Bring the analysis across — ${analysis!.boqLines.length} BOQ items, the cost estimate as budget, and targets.`
                  : "No analysis yet for this tender. Do the health analysis first, then create the project with its BOQ."
              }
              onClick={() => setMode("WITH")}
            />
          </div>
        ) : mode === "WITHOUT" ? (
          <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
            The project starts empty — no BOQ, no targets.
            {hasBoq ? " The health analysis stays with the tender and is not copied." : ""}
          </div>
        ) : !hasBoq ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-800">
            This tender has no health analysis yet. Open it, fill in the BOQ and costs, then come back to Create
            Project — the BOQ, budget and targets will come across with it.
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="rounded-xl border border-gray-200">
              <header className="border-b border-gray-100 bg-gray-50 px-4 py-2">
                <h3 className="text-[11px] font-semibold tracking-wide text-gray-500 uppercase">
                  Bring the BOQ across
                </h3>
              </header>

              <div className="divide-y divide-gray-100">
                <Row
                  title="Create the project BOQ from this analysis"
                  detail={`${analysis!.boqLines.length} items · ${inr(boqValue)}`}
                >
                  <Choice
                    options={[
                      { value: "AWARDED", label: `Awarded rate (−${analysis!.bidPct.toFixed(2)}%)` },
                      { value: "TENDER", label: "Tender rate" },
                    ]}
                    value={opts.rateBasis}
                    onChange={(v) => set("rateBasis", v as HandoffOptions["rateBasis"])}
                  />
                </Row>

                <Row
                  title="Carry the cost estimate as the project budget"
                  detail={
                    totals
                      ? `labour ${inr(totals.labour)} · material ${inr(totals.material)} · expenses ${inr(totals.expenses)}`
                      : ""
                  }
                >
                  <Toggle checked={opts.carryCost} onChange={(v) => set("carryCost", v)} label="Carry cost estimate" />
                </Row>

                <Row
                  title="Create targets to measure the work"
                  detail={
                    opts.targets === "NONE"
                      ? "BOQ only — targets can be added later"
                      : `${targetCount} target${targetCount === 1 ? "" : "s"}, tracked by quantity`
                  }
                >
                  <Choice
                    options={[
                      { value: "PER_GROUP", label: `Per family (${groups.length})` },
                      { value: "PER_LINE", label: `Per line (${analysis!.boqLines.length})` },
                      { value: "NONE", label: "None" },
                    ]}
                    value={opts.targets}
                    onChange={(v) => set("targets", v as HandoffOptions["targets"])}
                  />
                </Row>

                <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <label htmlFor="boq-no" className="text-sm text-gray-600">
                    BOQ number
                  </label>
                  <input
                    id="boq-no"
                    value={opts.boqNo}
                    onChange={(e) => set("boqNo", e.target.value)}
                    className="w-48 rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm focus:border-brand-accent focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {totals && opts.carryCost && (
              <p className="text-xs text-gray-500">
                The project starts with a budget of{" "}
                <strong className="font-medium text-gray-700">{inr(totals.cost)}</strong> against{" "}
                <strong className="font-medium text-gray-700">{inr(boqValue)}</strong> of billable work — a planned
                margin of{" "}
                <strong
                  className={`font-semibold ${boqValue - totals.cost < 0 ? "text-rose-600" : "text-emerald-600"}`}
                >
                  {inr(boqValue - totals.cost)}
                </strong>
                . Site progress is then measured against that promise rather than against nothing.
              </p>
            )}
            {opts.targets === "PER_LINE" && (analysis?.boqLines.length ?? 0) > 40 && (
              <p className="text-xs text-amber-700">
                {analysis!.boqLines.length} targets is a lot for one site team to report against. Per family is
                usually what gets kept up to date.
              </p>
            )}
          </div>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          {mode !== "CHOOSE" && (
            <button
              onClick={() => setMode("CHOOSE")}
              className="mr-auto flex items-center gap-1 rounded-lg px-2 py-2 text-sm text-gray-500 transition-colors duration-150 hover:bg-gray-50"
            >
              <ArrowLeft size={14} /> Back
            </button>
          )}
          <button
            onClick={onCancel}
            className="rounded-lg border border-gray-200 px-3.5 py-2 text-sm text-gray-600 transition-colors duration-150 hover:bg-gray-50"
          >
            Cancel
          </button>
          {mode === "WITH" && !hasBoq ? (
            <Link
              href={`/tender/analysis/${tender.id}`}
              className="rounded-lg bg-brand-accent px-3.5 py-2 text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95"
            >
              Open health analysis
            </Link>
          ) : mode !== "CHOOSE" ? (
            <button
              onClick={() => onConfirm(mode === "WITH" && hasBoq ? opts : null)}
              disabled={busy}
              className="rounded-lg bg-brand-accent px-3.5 py-2 text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95 disabled:opacity-60"
            >
              {busy ? "Creating…" : mode === "WITH" ? "Create project with analysis" : "Create project"}
            </button>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}

function Row({ title, detail, children }: { title: string; detail: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-sm text-gray-700">{title}</div>
        <div className="mt-0.5 text-[11px] tabular-nums text-gray-400">{detail}</div>
      </div>
      {children}
    </div>
  );
}

function Choice({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex shrink-0 rounded-lg bg-gray-100 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded-md px-2.5 py-1 text-xs transition-colors duration-150 ${
            value === o.value ? "bg-white font-medium text-gray-800 shadow-sm" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors duration-150 ${
        checked ? "bg-brand-accent" : "bg-gray-200"
      }`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all duration-150 ${
          checked ? "left-[18px]" : "left-0.5"
        }`}
      />
    </button>
  );
}

function ModeCard({
  icon: Icon,
  title,
  detail,
  onClick,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-start gap-2 rounded-xl border border-gray-200 p-4 text-left transition-all duration-150 hover:border-brand-accent hover:bg-cyan-50/40 active:scale-[0.99]"
    >
      <Icon size={20} className="text-brand-accent" />
      <span className="text-sm font-semibold text-gray-800">{title}</span>
      <span className="text-xs leading-relaxed text-gray-500">{detail}</span>
    </button>
  );
}
