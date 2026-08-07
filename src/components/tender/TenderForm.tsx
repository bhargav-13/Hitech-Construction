"use client";

import { useMemo, useState } from "react";
import { Drawer, DrawerField } from "@/components/Drawer";
import { Select } from "@/components/Select";
import { DatePicker } from "@/components/DatePicker";
import { useTenderStore } from "@/lib/tenderStore";
import {
  STAGE_META,
  STATUS_META,
  EMD_MODE_META,
  EMD_STATE_META,
  SECURITY_TYPE_META,
  PRIORITY_META,
  type EmdMode,
  type EmdState,
  type SecurityType,
  type Tender,
  type TenderPriority,
  type TenderSource,
  type TenderStage,
  type TenderStatus,
} from "@/lib/tenderTypes";
import type { TenderCustomField } from "@/lib/tenderTypes";
import { parseDurationMonths, parseValidityDays, parseLooseDate } from "@/lib/tenderHelpers";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";

const STAGE_OPTIONS = (["SORTING", "RESEARCH", "APPLIED", "WON", "LOST"] as TenderStage[]).map((s) => ({
  value: s,
  label: STAGE_META[s].label,
}));
const SOURCE_OPTIONS: { value: TenderSource; label: string }[] = [
  { value: "PORTAL", label: "Portal" },
  { value: "GEM", label: "GeM" },
];
const STATUS_OPTIONS = (Object.keys(STATUS_META) as TenderStatus[]).map((s) => ({ value: s, label: STATUS_META[s].label }));
const EMD_MODE_OPTIONS = [
  { value: "", label: "—" },
  ...(Object.keys(EMD_MODE_META) as EmdMode[]).map((m) => ({ value: m, label: EMD_MODE_META[m].label })),
];
const EMD_STATE_OPTIONS = (Object.keys(EMD_STATE_META) as EmdState[]).map((s) => ({ value: s, label: EMD_STATE_META[s].label }));
const SECURITY_OPTIONS = [
  { value: "", label: "—" },
  ...(Object.keys(SECURITY_TYPE_META) as SecurityType[]).map((s) => ({ value: s, label: SECURITY_TYPE_META[s].label })),
];
const PRIORITY_OPTIONS = [
  { value: "", label: "—" },
  ...(Object.keys(PRIORITY_META) as TenderPriority[]).map((p) => ({ value: p, label: PRIORITY_META[p].label })),
];

/** Default applied-stage status for a stage, so a directly-created WON/LOST/APPLIED tender is consistent. */
function defaultStatus(stage: TenderStage): TenderStatus | null {
  if (stage === "APPLIED") return "SUBMITTED";
  if (stage === "WON") return "WON";
  if (stage === "LOST") return "LOST";
  return null;
}

/**
 * Add or edit a tender. Everything except the stage is optional — you can jot a tender ID now and
 * fill the rest later. Pass `tender` to edit; omit to create (starting at `initialStage`).
 */
export function TenderForm({
  tender,
  initialStage = "SORTING",
  onClose,
}: {
  tender?: Tender;
  initialStage?: TenderStage;
  onClose: () => void;
}) {
  const addTender = useTenderStore((s) => s.addTender);
  const updateTender = useTenderStore((s) => s.updateTender);
  const isEdit = !!tender;

  const [f, setF] = useState<Partial<Tender>>(
    tender ?? { source: "PORTAL", stage: initialStage, status: defaultStatus(initialStage), emdState: "PENDING" },
  );
  const [showMore, setShowMore] = useState(false);

  const set = (patch: Partial<Tender>) => setF((prev) => ({ ...prev, ...patch }));
  const num = (v: string): number | null => (v === "" ? null : Number(v));

  // --- User-defined custom fields (add/remove freely) ---
  const customFields = f.customFields ?? [];
  const addCustomField = () =>
    set({
      customFields: [
        ...customFields,
        { id: `cf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, label: "", value: "" },
      ],
    });
  const patchCustomField = (id: string, patch: Partial<TenderCustomField>) =>
    set({ customFields: customFields.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  const removeCustomField = (id: string) => set({ customFields: customFields.filter((c) => c.id !== id) });

  const stage = (f.stage ?? "SORTING") as TenderStage;
  const isGem = f.source === "GEM";
  const isApplied = stage === "APPLIED" || stage === "WON" || stage === "LOST";

  function save() {
    const clean: Tender = {
      ...f,
      id: tender?.id ?? `tnd-new-${Date.now()}`,
      source: (f.source ?? "PORTAL") as TenderSource,
      stage,
      tenderId: (f.tenderId ?? "").toString(),
      // Keep status coherent with the stage.
      status: isApplied ? (f.status ?? defaultStatus(stage)) : null,
      // Keep the derived fields in step with what the user typed, exactly as the importer does.
      durationMonths: parseDurationMonths(f.duration),
      validityDays: parseValidityDays(f.validity),
      preBidDate: f.preBidDate ?? parseLooseDate(f.preBidInfo),
      // Drop half-filled custom fields (no label = nothing to show).
      customFields: (f.customFields ?? [])
        .filter((c) => c.label.trim() !== "")
        .map((c) => ({ ...c, label: c.label.trim(), value: c.value.trim() })),
    } as Tender;

    if (isEdit) updateTender(clean.id, clean);
    else addTender(clean);
    onClose();
  }

  const gemFields = useMemo(
    () => (
      <>
        <DrawerField label="GeM Category">
          <input className="input" value={f.gemCategory ?? ""} onChange={(e) => set({ gemCategory: e.target.value })} />
        </DrawerField>
        <DrawerField label="MSME Relaxation">
          <input className="input" value={f.msmeRelaxation ?? ""} onChange={(e) => set({ msmeRelaxation: e.target.value })} />
        </DrawerField>
        <DrawerField label="Eligibility Status">
          <input className="input" value={f.eligibilityStatus ?? ""} onChange={(e) => set({ eligibilityStatus: e.target.value })} />
        </DrawerField>
        <DrawerField label="Bid Opening Date">
          <DatePicker value={f.openingDate ?? ""} onChange={(v) => set({ openingDate: v })} />
        </DrawerField>
      </>
    ),
    [f.gemCategory, f.msmeRelaxation, f.eligibilityStatus, f.openingDate],
  );

  return (
    <Drawer title={isEdit ? "Edit Tender" : "New Tender"} onClose={onClose} onSave={save} saveLabel={isEdit ? "Save changes" : "Add tender"} width="max-w-3xl">
      <div className="space-y-6">
        {/* Pipeline */}
        <Section title="Pipeline">
          <DrawerField label="Stage" required>
            <Select value={stage} onChange={(v) => set({ stage: v as TenderStage, status: defaultStatus(v as TenderStage) })} options={STAGE_OPTIONS} />
          </DrawerField>
          <DrawerField label="Source">
            <Select value={f.source ?? "PORTAL"} onChange={(v) => set({ source: v as TenderSource })} options={SOURCE_OPTIONS} />
          </DrawerField>
          {isApplied && (
            <DrawerField label="Status">
              <Select value={f.status ?? "SUBMITTED"} onChange={(v) => set({ status: v as TenderStatus })} options={STATUS_OPTIONS} />
            </DrawerField>
          )}
          <DrawerField label="Priority">
            <Select
              value={f.priority ?? ""}
              onChange={(v) => set({ priority: (v || null) as TenderPriority | null })}
              options={PRIORITY_OPTIONS}
            />
          </DrawerField>
        </Section>

        {/* Identity */}
        <Section title="Tender">
          <DrawerField label="Department">
            <input className="input" value={f.department ?? ""} onChange={(e) => set({ department: e.target.value })} placeholder="e.g. Rajkot Municipal Corporation" />
          </DrawerField>
          <DrawerField label="Tender ID">
            <input className="input" value={f.tenderId ?? ""} onChange={(e) => set({ tenderId: e.target.value })} placeholder="Portal / GeM ID" />
          </DrawerField>
          <DrawerField label="Name of Work" className="col-span-2">
            <textarea className="input min-h-[60px]" value={f.nameOfWork ?? ""} onChange={(e) => set({ nameOfWork: e.target.value })} placeholder="Scope / title of the work" />
          </DrawerField>
          <DrawerField label="Location">
            <input className="input" value={f.location ?? ""} onChange={(e) => set({ location: e.target.value })} />
          </DrawerField>
          <DrawerField label="Class">
            <input className="input" value={f.classReq ?? ""} onChange={(e) => set({ classReq: e.target.value })} placeholder="e.g. B Class & Above" />
          </DrawerField>
        </Section>

        {/* Commercials */}
        <Section title="Commercials">
          <DrawerField label="Estimated Cost (₹)">
            <input type="number" className="input" value={f.estimatedCost ?? ""} onChange={(e) => set({ estimatedCost: num(e.target.value) })} />
          </DrawerField>
          {isApplied && (
            <>
              <DrawerField label="Contract Value (₹)">
                <input type="number" className="input" value={f.contractValue ?? ""} onChange={(e) => set({ contractValue: num(e.target.value) })} />
              </DrawerField>
              <DrawerField label="Variance %">
                <input type="number" className="input" value={f.variancePct ?? ""} onChange={(e) => set({ variancePct: num(e.target.value) })} />
              </DrawerField>
            </>
          )}
          <DrawerField label="Fee (₹)">
            <input type="number" className="input" value={f.fee ?? ""} onChange={(e) => set({ fee: num(e.target.value) })} />
          </DrawerField>
          <DrawerField label="GST">
            <input className="input" value={f.gst ?? ""} onChange={(e) => set({ gst: e.target.value })} />
          </DrawerField>
        </Section>

        {/* EMD — instrument and payment state are separate fields, because "blocked capital" depends on both. */}
        <Section title="EMD">
          <DrawerField label="EMD (₹)">
            <input type="number" className="input" value={f.emd ?? ""} onChange={(e) => set({ emd: num(e.target.value) })} />
          </DrawerField>
          <DrawerField label="Instrument">
            <Select value={f.emdMode ?? ""} onChange={(v) => set({ emdMode: (v || null) as EmdMode | null })} options={EMD_MODE_OPTIONS} />
          </DrawerField>
          <DrawerField label="State">
            <Select value={f.emdState ?? "PENDING"} onChange={(v) => set({ emdState: v as EmdState })} options={EMD_STATE_OPTIONS} />
          </DrawerField>
          <DrawerField label="Instrument No.">
            <input className="input" value={f.emdInstrumentNo ?? ""} onChange={(e) => set({ emdInstrumentNo: e.target.value })} placeholder="FDR / BG reference" />
          </DrawerField>
          <DrawerField label="Paid On">
            <DatePicker value={f.emdPaidOn ?? ""} onChange={(v) => set({ emdPaidOn: v })} />
          </DrawerField>
          <DrawerField label="Released On">
            <DatePicker value={f.emdReleasedOn ?? ""} onChange={(v) => set({ emdReleasedOn: v })} />
          </DrawerField>
          <DrawerField label="Expiry / Maturity" className="col-span-2">
            <DatePicker value={f.emdExpiry ?? ""} onChange={(v) => set({ emdExpiry: v })} />
          </DrawerField>
        </Section>

        {/* Schedule */}
        <Section title="Schedule">
          <DrawerField label="Deadline">
            <DatePicker value={f.deadline ?? ""} onChange={(v) => set({ deadline: v })} />
          </DrawerField>
          <DrawerField label="Next Follow Up">
            <DatePicker value={f.nextFollowUp ?? ""} onChange={(v) => set({ nextFollowUp: v })} />
          </DrawerField>
          <DrawerField label="Hardcopy Due">
            <DatePicker value={f.hardcopyDue ?? ""} onChange={(v) => set({ hardcopyDue: v })} />
          </DrawerField>
          <DrawerField label="Duration">
            <input className="input" value={f.duration ?? ""} onChange={(e) => set({ duration: e.target.value })} placeholder="e.g. 9 months" />
          </DrawerField>
          <DrawerField label="Validity">
            <input className="input" value={f.validity == null ? "" : String(f.validity)} onChange={(e) => set({ validity: e.target.value })} placeholder="e.g. 120 days" />
          </DrawerField>
          <DrawerField label="Pre-bid Date">
            <DatePicker value={f.preBidDate ?? ""} onChange={(v) => set({ preBidDate: v })} />
          </DrawerField>
          <DrawerField label="DLP">
            <input className="input" value={f.dlp ?? ""} onChange={(e) => set({ dlp: e.target.value })} placeholder="Defect liability period" />
          </DrawerField>
          {isApplied && (
            <>
              <DrawerField label="Submission Date">
                <DatePicker value={f.submissionDate ?? ""} onChange={(v) => set({ submissionDate: v })} />
              </DrawerField>
              <DrawerField label="Due Date">
                <DatePicker value={f.dueDate ?? ""} onChange={(v) => set({ dueDate: v })} />
              </DrawerField>
            </>
          )}
        </Section>

        {isGem && <Section title="GeM Details">{gemFields}</Section>}

        {/* User-defined custom fields — for the one-off columns no fixed schema should model. */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-[11px] font-semibold tracking-wide text-gray-400 uppercase">Additional Fields</h4>
            <button
              type="button"
              onClick={addCustomField}
              className="flex items-center gap-1 text-xs font-medium text-brand-accent hover:underline"
            >
              <Plus size={13} /> Add field
            </button>
          </div>
          {customFields.length === 0 ? (
            <p className="text-xs text-gray-400">No extra fields. Add one for anything the form above doesn&apos;t cover.</p>
          ) : (
            <div className="space-y-2">
              {customFields.map((c) => (
                <div key={c.id} className="flex items-start gap-2">
                  <input
                    className="input w-1/3"
                    value={c.label}
                    onChange={(e) => patchCustomField(c.id, { label: e.target.value })}
                    placeholder="Field name"
                  />
                  <input
                    className="input flex-1"
                    value={c.value}
                    onChange={(e) => patchCustomField(c.id, { value: e.target.value })}
                    placeholder="Value"
                  />
                  <button
                    type="button"
                    onClick={() => removeCustomField(c.id)}
                    aria-label="Remove field"
                    className="mt-1 shrink-0 rounded p-1.5 text-gray-300 transition-colors hover:bg-rose-50 hover:text-rose-500"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Collapsible: less-common fields */}
        <div>
          <button
            type="button"
            onClick={() => setShowMore((v) => !v)}
            className="flex items-center gap-1 text-sm font-medium text-brand-accent"
          >
            {showMore ? <ChevronDown size={15} /> : <ChevronRight size={15} />} More details (optional)
          </button>
          {showMore && (
            <div className="mt-3 space-y-6">
              <Section title="Security Deposit">
                <DrawerField label="Type">
                  <Select value={f.securityType ?? ""} onChange={(v) => set({ securityType: (v || null) as SecurityType | null })} options={SECURITY_OPTIONS} />
                </DrawerField>
                <DrawerField label="Amount (₹)">
                  <input type="number" className="input" value={f.securityAmount ?? ""} onChange={(e) => set({ securityAmount: num(e.target.value) })} />
                </DrawerField>
                <DrawerField label="Additional Type">
                  <Select
                    value={f.additionalSecurityType ?? ""}
                    onChange={(v) => set({ additionalSecurityType: (v || null) as SecurityType | null })}
                    options={SECURITY_OPTIONS}
                  />
                </DrawerField>
                <DrawerField label="Additional Amount (₹)">
                  <input type="number" className="input" value={f.additionalSecurityAmount ?? ""} onChange={(e) => set({ additionalSecurityAmount: num(e.target.value) })} />
                </DrawerField>
                <DrawerField label="BG Charges (₹)">
                  <input type="number" className="input" value={f.bgCharges ?? ""} onChange={(e) => set({ bgCharges: num(e.target.value) })} />
                </DrawerField>
                <DrawerField label="Released On">
                  <DatePicker value={f.securityReleasedOn ?? ""} onChange={(v) => set({ securityReleasedOn: v })} />
                </DrawerField>
              </Section>

              <Section title="Other">
                <TextField label="PQ Criteria" value={f.pqCriteria} onChange={(v) => set({ pqCriteria: v })} wide />
                <TextField label="Pre-bid Info" value={f.preBidInfo} onChange={(v) => set({ preBidInfo: v })} />
                <TextField label="Lab Test" value={f.labTest} onChange={(v) => set({ labTest: v })} />
                <TextField label="Price Escalation" value={f.priceEscalation} onChange={(v) => set({ priceEscalation: v })} />
                <TextField label="Deposit Details" value={f.depositDetails} onChange={(v) => set({ depositDetails: v })} />
                <TextField label="Firm" value={f.firm} onChange={(v) => set({ firm: v })} />
                <TextField label="Office Address" value={f.officeAddress} onChange={(v) => set({ officeAddress: v })} wide />
                <TextField label="View Documents (link/name)" value={f.viewDocuments} onChange={(v) => set({ viewDocuments: v })} wide />
                <TextField label="Remarks" value={f.remarks} onChange={(v) => set({ remarks: v })} wide />
              </Section>
            </div>
          )}
        </div>
      </div>
    </Drawer>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="mb-2 text-[11px] font-semibold tracking-wide text-gray-400 uppercase">{title}</h4>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">{children}</div>
    </div>
  );
}

function TextField({ label, value, onChange, wide }: { label: string; value?: string | number | null; onChange: (v: string) => void; wide?: boolean }) {
  return (
    <DrawerField label={label} className={wide ? "col-span-2" : ""}>
      <input className="input" value={value == null ? "" : String(value)} onChange={(e) => onChange(e.target.value)} />
    </DrawerField>
  );
}
