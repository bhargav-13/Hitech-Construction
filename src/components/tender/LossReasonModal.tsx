"use client";

import { useState } from "react";
import { Modal } from "@/components/Modal";
import { Select } from "@/components/Select";
import { LOSS_REASON_META } from "@/lib/tenderTypes";
import type { LossReason, Tender } from "@/lib/tenderTypes";
import { useTenderStore } from "@/lib/tenderStore";
import { Plus, XCircle } from "lucide-react";

const BUILTIN_OPTIONS = (Object.keys(LOSS_REASON_META) as LossReason[]).map((r) => ({
  value: r,
  label: LOSS_REASON_META[r].label,
}));

/** A custom reason is stored as `custom:<label>`; built-in reasons use the LossReason enum key. */
const CUSTOM_PREFIX = "custom:";
const isBuiltin = (v: string): v is LossReason => v in LOSS_REASON_META;

/**
 * Asked for whenever a tender leaves the pipeline as lost or dropped.
 *
 * The client's workbook records only that a tender was lost, so "why do we lose 28 of 48?" is
 * unanswerable there. Two mandatory clicks here turn every loss into data, and the L1 fields
 * quietly build a competitor price history nobody is keeping today.
 */
export function LossReasonModal({
  tender,
  actionLabel,
  onCancel,
  onConfirm,
}: {
  tender: Tender;
  actionLabel: string;
  onCancel: () => void;
  onConfirm: (patch: Partial<Tender>) => void;
}) {
  const customLossReasons = useTenderStore((s) => s.customLossReasons);
  const addLossReason = useTenderStore((s) => s.addLossReason);

  const [reason, setReason] = useState<string>(
    tender.lossReasonLabel ? `${CUSTOM_PREFIX}${tender.lossReasonLabel}` : tender.lossReason ?? "PRICE_TOO_HIGH",
  );
  const [note, setNote] = useState(tender.lossNote ?? "");
  const [l1Bidder, setL1Bidder] = useState(tender.l1Bidder ?? "");
  const [l1Value, setL1Value] = useState(tender.l1Value != null ? String(tender.l1Value) : "");
  const [ourRank, setOurRank] = useState(tender.ourRank != null ? String(tender.ourRank) : "");

  const options = [
    ...BUILTIN_OPTIONS,
    ...customLossReasons.map((r) => ({ value: `${CUSTOM_PREFIX}${r}`, label: r })),
  ];
  const isCustom = reason.startsWith(CUSTOM_PREFIX);
  const hint = isBuiltin(reason) ? LOSS_REASON_META[reason].hint : "Custom reason.";

  // Competitor fields make sense when we were beaten on price or on any bespoke/other reason.
  const showCompetitor = reason === "PRICE_TOO_HIGH" || reason === "OTHER" || isCustom;

  function addReason() {
    const label = window.prompt("New loss reason");
    const clean = label?.trim();
    if (!clean) return;
    addLossReason(clean);
    setReason(`${CUSTOM_PREFIX}${clean}`);
  }

  function submit() {
    onConfirm({
      // Custom reasons ride under the OTHER enum with the label kept separately for display.
      lossReason: isBuiltin(reason) ? reason : "OTHER",
      lossReasonLabel: isCustom ? reason.slice(CUSTOM_PREFIX.length) : null,
      lossNote: note.trim() || null,
      l1Bidder: l1Bidder.trim() || null,
      l1Value: l1Value.trim() === "" ? null : Number(l1Value),
      ourRank: ourRank.trim() === "" ? null : Number(ourRank),
    });
  }

  return (
    <Modal onClose={onCancel}>
      <div className="p-5">
        <div className="mb-1 flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-rose-50 text-rose-600">
            <XCircle size={16} />
          </span>
          <h2 className="text-base font-semibold text-gray-800">{actionLabel}</h2>
        </div>
        <p className="mb-4 truncate text-xs text-gray-500" title={tender.nameOfWork ?? ""}>
          {tender.nameOfWork ?? `Tender ${tender.tenderId}`}
        </p>

        <div className="space-y-3">
          <Field label="Reason" required>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <Select value={reason} onChange={(v) => setReason(v)} options={options} />
              </div>
              <button
                type="button"
                onClick={addReason}
                title="Add a new reason"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition-colors hover:border-brand-accent hover:text-brand-accent"
              >
                <Plus size={15} />
              </button>
            </div>
            <p className="mt-1 text-[11px] text-gray-400">{hint}</p>
          </Field>

          {showCompetitor && (
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-gray-100 bg-gray-50/60 p-3">
              <div className="col-span-2 text-[11px] font-semibold tracking-wide text-gray-400 uppercase">
                Who won it (optional)
              </div>
              <Field label="L1 bidder" className="col-span-2">
                <input className="input" value={l1Bidder} onChange={(e) => setL1Bidder(e.target.value)} placeholder="Firm name" />
              </Field>
              <Field label="L1 value (₹)">
                <input type="number" className="input" value={l1Value} onChange={(e) => setL1Value(e.target.value)} />
              </Field>
              <Field label="Our rank">
                <input type="number" min={1} className="input" value={ourRank} onChange={(e) => setOurRank(e.target.value)} placeholder="e.g. 3" />
              </Field>
            </div>
          )}

          <Field label="Note">
            <textarea
              className="input min-h-[64px]"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Anything worth remembering next time this department floats a tender"
            />
          </Field>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg border border-gray-200 px-3.5 py-2 text-sm text-gray-600 transition-colors duration-150 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            className="rounded-lg bg-rose-600 px-3.5 py-2 text-sm font-semibold text-white transition-all duration-150 hover:bg-rose-700 active:scale-95"
          >
            {actionLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Field({
  label,
  children,
  required,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-xs font-medium text-gray-600">
        {label}
        {required && <span className="ml-0.5 text-rose-500">*</span>}
      </label>
      {children}
    </div>
  );
}
