"use client";

import { useState } from "react";
import { TenderShell } from "@/components/tender/TenderShell";
import { useCompanyProfile, DEFAULT_PROFILE } from "@/lib/tenderProfile";
import { useTenderStore } from "@/lib/tenderStore";
import { exportWorkbook } from "@/lib/tenderExcel";
import { ConfirmDialog } from "@/components/tender/ConfirmDialog";
import { inr } from "@/lib/format";
import { Building2, Download, RotateCcw, Save } from "lucide-react";

/**
 * Our own credentials, which turn the Sorting screen from a list into a go/no-go aid.
 *
 * Every eligibility flag on a tender is computed against these numbers — the judgement that used
 * to live in one person's head, written down once and applied to every row.
 */
export default function TenderSettingsPage() {
  const profile = useCompanyProfile();
  const update = useCompanyProfile((s) => s.update);
  const resetProfile = useCompanyProfile((s) => s.reset);

  const tenders = useTenderStore((s) => s.tenders);
  const hardcopy = useTenderStore((s) => s.hardcopy);
  const materials = useTenderStore((s) => s.materials);
  const handoffs = useTenderStore((s) => s.handoffs);
  const resetData = useTenderStore((s) => s.reset);

  const [draft, setDraft] = useState({
    registrationClass: profile.registrationClass,
    turnover: String(profile.turnover),
    largestWorkValue: String(profile.largestWorkValue),
    emdHeadroom: String(profile.emdHeadroom),
    minEstimatedCost: String(profile.minEstimatedCost),
    maxEstimatedCost: String(profile.maxEstimatedCost),
  });
  const [saved, setSaved] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  function save() {
    update({
      registrationClass: draft.registrationClass.trim().toUpperCase() || DEFAULT_PROFILE.registrationClass,
      turnover: Number(draft.turnover) || 0,
      largestWorkValue: Number(draft.largestWorkValue) || 0,
      emdHeadroom: Number(draft.emdHeadroom) || 0,
      minEstimatedCost: Number(draft.minEstimatedCost) || 0,
      maxEstimatedCost: Number(draft.maxEstimatedCost) || 0,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <TenderShell>
      <div className="max-w-3xl space-y-5">
        <div>
          <h1 className="text-lg font-semibold text-gray-800">Tender Settings</h1>
          <p className="text-sm text-gray-500">
            Our firm&apos;s credentials and bidding limits. Every eligibility flag on the Sorting and Research screens is
            computed against these.
          </p>
        </div>

        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-gray-700">
            <Building2 size={14} className="text-gray-400" /> Company profile
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Registration class"
              hint="A is highest. A tender needing a higher class is flagged as ineligible."
            >
              <input
                className="input"
                value={draft.registrationClass}
                onChange={(e) => setDraft({ ...draft, registrationClass: e.target.value })}
                placeholder="e.g. B"
              />
            </Field>
            <Money
              label="Average annual turnover"
              hint="Checked against the turnover figure in a tender's PQ criteria."
              value={draft.turnover}
              onChange={(v) => setDraft({ ...draft, turnover: v })}
            />
            <Money
              label="Largest work completed"
              hint="Tenders more than 3× this are flagged as a likely PQ experience failure."
              value={draft.largestWorkValue}
              onChange={(v) => setDraft({ ...draft, largestWorkValue: v })}
            />
            <Money
              label="EMD headroom"
              hint="Warn when paying another EMD would push blocked capital past this."
              value={draft.emdHeadroom}
              onChange={(v) => setDraft({ ...draft, emdHeadroom: v })}
            />
            <Money
              label="Minimum tender value"
              hint="Below this a tender is flagged as too small to be worth bidding."
              value={draft.minEstimatedCost}
              onChange={(v) => setDraft({ ...draft, minEstimatedCost: v })}
            />
            <Money
              label="Maximum tender value"
              hint="Above this a tender is flagged as beyond our execution capacity."
              value={draft.maxEstimatedCost}
              onChange={(v) => setDraft({ ...draft, maxEstimatedCost: v })}
            />
          </div>
          <div className="mt-4 flex items-center gap-2">
            <button
              onClick={save}
              className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-3.5 py-2 text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95"
            >
              <Save size={15} /> Save profile
            </button>
            <button
              onClick={() => {
                resetProfile();
                setDraft({
                  registrationClass: DEFAULT_PROFILE.registrationClass,
                  turnover: String(DEFAULT_PROFILE.turnover),
                  largestWorkValue: String(DEFAULT_PROFILE.largestWorkValue),
                  emdHeadroom: String(DEFAULT_PROFILE.emdHeadroom),
                  minEstimatedCost: String(DEFAULT_PROFILE.minEstimatedCost),
                  maxEstimatedCost: String(DEFAULT_PROFILE.maxEstimatedCost),
                });
              }}
              className="rounded-lg border border-gray-200 px-3.5 py-2 text-sm text-gray-600 transition-colors duration-150 hover:bg-gray-50"
            >
              Restore defaults
            </button>
            {saved && <span className="text-sm text-emerald-600">Saved.</span>}
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="mb-1 text-sm font-semibold text-gray-700">Data</h2>
          <p className="mb-3 text-xs text-gray-400">
            This module runs entirely in the browser — {tenders.length} tenders, {hardcopy.length} dispatches and{" "}
            {materials.length} material parties are held in local storage until the backend exists.
            {handoffs.length > 0 && ` ${handoffs.length} tender(s) have been handed over to the Project module.`}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => exportWorkbook({ tenders, hardcopy, materials, handoffs })}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3.5 py-2 text-sm text-gray-600 transition-colors duration-150 hover:bg-gray-50"
            >
              <Download size={15} /> Export full workbook
            </button>
            <button
              onClick={() => setConfirmReset(true)}
              className="flex items-center gap-1.5 rounded-lg border border-rose-200 px-3.5 py-2 text-sm text-rose-600 transition-colors duration-150 hover:bg-rose-50"
            >
              <RotateCcw size={15} /> Reset demo data
            </button>
          </div>
        </section>
      </div>

      {confirmReset && (
        <ConfirmDialog
          title="Reset demo data"
          tone="danger"
          confirmLabel="Reset everything"
          body={
            <>
              Every change made in this browser — stage moves, loss reasons, EMD releases, imports and attachments — is
              discarded, and the module is reseeded from the client&apos;s workbook. This cannot be undone.
            </>
          }
          onCancel={() => setConfirmReset(false)}
          onConfirm={() => {
            resetData();
            setConfirmReset(false);
          }}
        />
      )}
    </TenderShell>
  );
}

function Field({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-600">{label}</label>
      {children}
      <p className="mt-1 text-[11px] leading-relaxed text-gray-400">{hint}</p>
    </div>
  );
}

function Money({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const n = Number(value);
  return (
    <Field label={label} hint={hint}>
      <input type="number" className="input" value={value} onChange={(e) => onChange(e.target.value)} />
      {Number.isFinite(n) && n > 0 && <span className="mt-0.5 block text-[11px] text-gray-500">{inr(n)}</span>}
    </Field>
  );
}
