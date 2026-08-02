"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Drawer } from "@/components/Drawer";
import type { Tender, TenderAttachment, TenderStage, TenderStatus } from "@/lib/tenderTypes";
import {
  STAGE_META,
  STATUS_META,
  SOURCE_META,
  EMD_MODE_META,
  EMD_STATE_META,
  SECURITY_TYPE_META,
  LOSS_REASON_META,
  PRIORITY_META,
} from "@/lib/tenderTypes";
import { transitionsFor, stateOf } from "@/lib/tenderStateMachine";
import { useTenderStore } from "@/lib/tenderStore";
import { useCompanyProfile, bidFlags, FLAG_TONE_CLASS } from "@/lib/tenderProfile";
import { TenderFlow } from "@/components/tender/TenderFlow";
import {
  DEADLINE_TONE_CLASS,
  deadlineLabel,
  deadlineTone,
  tdate,
  tiso,
  tmoney,
  tval,
} from "@/lib/tenderHelpers";
import { ArrowUpRight, ExternalLink, FolderPlus, Paperclip, Pencil, Trash2, Upload } from "lucide-react";

/** 2 MB per file — attachments live in localStorage until there is a backend to store them. */
const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;

/** Detail of a tender — every field from the source sheet, plus its live position in the flow and
 *  the actions allowed from its current state (driven by tenderStateMachine). */
export function TenderDetailDrawer({
  tender,
  onClose,
  onEdit,
  onRequestLoss,
  onRequestProject,
}: {
  tender: Tender;
  onClose: () => void;
  onEdit?: (t: Tender) => void;
  /** Losing a tender always goes through the reason prompt, wherever it is triggered from. */
  onRequestLoss?: (t: Tender, to: TenderStage, status: TenderStatus | undefined, label: string) => void;
  onRequestProject?: (t: Tender) => void;
}) {
  const setStage = useTenderStore((s) => s.setStage);
  const setStatus = useTenderStore((s) => s.setStatus);
  const updateTender = useTenderStore((s) => s.updateTender);
  const addAttachment = useTenderStore((s) => s.addAttachment);
  const removeAttachment = useTenderStore((s) => s.removeAttachment);
  const profile = useCompanyProfile();
  // Read the live record so the flow + buttons update in place after a transition.
  const live = useTenderStore((s) => s.tenders.find((x) => x.id === tender.id)) ?? tender;
  const t = live;

  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const transitions = transitionsFor(t.stage);
  const flags = t.stage === "SORTING" || t.stage === "RESEARCH" ? bidFlags(t, profile) : [];

  async function attach(files: FileList) {
    for (const file of Array.from(files)) {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        setMsg(`"${file.name}" is over 2 MB — too large to hold in the browser.`);
        continue;
      }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      const attachment: TenderAttachment = {
        id: `att-${Date.now().toString(36)}-${file.name}`,
        name: file.name,
        size: file.size,
        type: file.type,
        addedOn: tiso(new Date()),
        dataUrl,
      };
      addAttachment(t.id, attachment);
    }
  }

  /** Mark the EMD refunded — this is what stops it counting as blocked capital. */
  function releaseEmd() {
    updateTender(t.id, { emdState: "RELEASED", emdReleasedOn: tiso(new Date()) });
    setMsg("EMD marked as released.");
  }

  return (
    <Drawer title={`Tender ${t.tenderId || ""}`.trim()} onClose={onClose} width="max-w-2xl">
      <div className="space-y-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Chip className={SOURCE_META[t.source].chip}>{SOURCE_META[t.source].label}</Chip>
            <Chip className={STAGE_META[t.stage].chip}>{STAGE_META[t.stage].label}</Chip>
            {t.status && <Chip className={STATUS_META[t.status].chip}>{STATUS_META[t.status].label}</Chip>}
            {t.priority && <Chip className={PRIORITY_META[t.priority].chip}>{PRIORITY_META[t.priority].label} priority</Chip>}
            {t.projectId != null &&
              (t.projectId > 0 ? (
                <Link
                  href={`/project/${t.projectId}`}
                  className="inline-flex items-center gap-1 rounded-full bg-cyan-50 px-2 py-0.5 text-xs font-medium text-brand-accent ring-1 ring-inset ring-cyan-600/20 hover:bg-cyan-100"
                >
                  Project #{t.projectId} <ArrowUpRight size={11} />
                </Link>
              ) : (
                <Chip className="bg-amber-50 text-amber-700 ring-amber-600/20">Handoff pending sync</Chip>
              ))}
          </div>
          <h3 className="mt-2 text-base font-semibold text-gray-800">{tval(t.nameOfWork)}</h3>
          <p className="text-sm text-gray-500">{tval(t.department)}</p>
        </div>

        {/* Eligibility warnings, computed against our own registration and turnover */}
        {flags.length > 0 && (
          <div className="space-y-1.5">
            {flags.map((f) => (
              <div
                key={f.label}
                className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs ring-1 ring-inset ${FLAG_TONE_CLASS[f.tone]}`}
              >
                <span className="font-semibold">{f.label}</span>
                <span className="opacity-80">{f.detail}</span>
              </div>
            ))}
          </div>
        )}

        {/* Where it is in the flow */}
        <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-3">
          <TenderFlow stage={t.stage} projectId={t.projectId} />
          <p className="mt-2 text-xs text-gray-500">{stateOf(t.stage)?.description}</p>
        </div>

        {/* What you can do next — generated from the state machine */}
        <div className="flex flex-wrap gap-2">
          {transitions.map((tr) => (
            <button
              key={`${tr.to}-${tr.label}`}
              onClick={() => {
                if (tr.to === "LOST" && onRequestLoss) onRequestLoss(t, tr.to, tr.status, tr.label);
                else if (tr.status) setStatus(t.id, tr.status as TenderStatus);
                else setStage(t.id, tr.to);
              }}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-150 active:scale-95 ${
                tr.tone === "primary"
                  ? "bg-brand-accent text-white hover:opacity-90"
                  : tr.tone === "danger"
                    ? "bg-rose-50 text-rose-600 ring-1 ring-inset ring-rose-600/20 hover:bg-rose-100"
                    : "border border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {tr.label}
            </button>
          ))}
          {t.stage === "WON" && t.projectId == null && onRequestProject && (
            <button
              onClick={() => onRequestProject(t)}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition-all duration-150 hover:bg-emerald-700 active:scale-95"
            >
              <FolderPlus size={14} /> Create Project
            </button>
          )}
          {onEdit && (
            <button
              onClick={() => onEdit(t)}
              className="ml-auto flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 transition-all duration-150 hover:bg-gray-50 active:scale-95"
            >
              <Pencil size={13} /> Edit
            </button>
          )}
        </div>
        {msg && <div className="rounded-lg bg-cyan-50 px-3 py-2 text-sm text-brand-accent ring-1 ring-inset ring-cyan-600/20">{msg}</div>}

        <Section title="Commercials">
          <Field label="Estimated Cost">{tmoney(t.estimatedCost)}</Field>
          <Field label="Contract Value">{tmoney(t.contractValue)}</Field>
          <Field label="Variance %">{t.variancePct == null ? "—" : `${t.variancePct}%`}</Field>
          <Field label="Fee">{tmoney(t.fee)}</Field>
          <Field label="GST">{tval(t.gst)}</Field>
          <Field label="Deposit Details">{tval(t.depositDetails)}</Field>
        </Section>

        {/* EMD gets its own block: it is the money actually at stake. */}
        <Section title="EMD">
          <Field label="Amount">{tmoney(t.emd)}</Field>
          <Field label="Instrument">{t.emdMode ? EMD_MODE_META[t.emdMode].label : tval(t.emdType)}</Field>
          <Field label="State">
            {t.emdState ? (
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${EMD_STATE_META[t.emdState].chip}`}>
                {EMD_STATE_META[t.emdState].label}
              </span>
            ) : (
              "—"
            )}
          </Field>
          <Field label="Instrument No.">{tval(t.emdInstrumentNo)}</Field>
          <Field label="Paid On">{tdate(t.emdPaidOn)}</Field>
          <Field label="Released On">{tdate(t.emdReleasedOn)}</Field>
          <Field label="Expiry / Maturity">{tdate(t.emdExpiry)}</Field>
          {t.emdState === "PAID" && !t.emdReleasedOn && (
            <div className="col-span-2">
              <button
                onClick={releaseEmd}
                className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition-colors duration-150 hover:bg-emerald-100"
              >
                Mark EMD released
              </button>
              <p className="mt-1 text-[11px] text-gray-400">
                Until this is set the amount keeps counting as blocked capital on the dashboard.
              </p>
            </div>
          )}
        </Section>

        <Section title="Security Deposit">
          <Field label="Type">{t.securityType ? SECURITY_TYPE_META[t.securityType].label : "—"}</Field>
          <Field label="Amount">{tmoney(t.securityAmount)}</Field>
          <Field label="Additional Type">{t.additionalSecurityType ? SECURITY_TYPE_META[t.additionalSecurityType].label : "—"}</Field>
          <Field label="Additional Amount">{tmoney(t.additionalSecurityAmount)}</Field>
          <Field label="BG Charges">{tmoney(t.bgCharges)}</Field>
          <Field label="Released On">{tdate(t.securityReleasedOn)}</Field>
          {t.securityDetails && (
            <Field label="As recorded in the sheet" wide>
              {t.securityDetails}
            </Field>
          )}
        </Section>

        <Section title="Schedule">
          <Field label="Deadline">
            <DateWithBadge value={t.deadline} />
          </Field>
          <Field label="Duration">
            {tval(t.duration)}
            {t.durationMonths != null && <span className="text-gray-400"> ({t.durationMonths} mo)</span>}
          </Field>
          <Field label="Validity">
            {tval(t.validity)}
            {t.validityDays != null && <span className="text-gray-400"> ({t.validityDays} d)</span>}
          </Field>
          <Field label="Pre-bid Info">{tval(t.preBidInfo)}</Field>
          <Field label="Pre-bid Date">
            <DateWithBadge value={t.preBidDate} />
          </Field>
          <Field label="Hardcopy Due">
            <DateWithBadge value={t.hardcopyDue} />
          </Field>
          <Field label="Tech Open">{tval(t.techOpen)}</Field>
          <Field label="Price Open">{tval(t.priceOpen)}</Field>
          <Field label="Bid Opening">{tdate(t.openingDate)}</Field>
          <Field label="Submission Date">{tdate(t.submissionDate)}</Field>
          <Field label="Due Date">{tdate(t.dueDate)}</Field>
          <Field label="Date Received">{tdate(t.dateOfReceived)}</Field>
          <Field label="Received Status">{tval(t.receivedStatus)}</Field>
          <Field label="DLP">{tval(t.dlp)}</Field>
        </Section>

        <Section title="Eligibility">
          <Field label="PQ Criteria">{tval(t.pqCriteria)}</Field>
          <Field label="Class">{tval(t.classReq)}</Field>
          <Field label="Lab Test">{tval(t.labTest)}</Field>
          <Field label="Price Escalation">{tval(t.priceEscalation)}</Field>
          {t.source === "GEM" && (
            <>
              <Field label="GeM Category">{tval(t.gemCategory)}</Field>
              <Field label="MSME Relaxation">{tval(t.msmeRelaxation)}</Field>
              <Field label="Experience & Turnover">{tval(t.experienceTurnover)}</Field>
              <Field label="Eligibility Status">{tval(t.eligibilityStatus)}</Field>
            </>
          )}
        </Section>

        <Section title="Bid / Award">
          <Field label="Firm">{tval(t.firm)}</Field>
          <Field label="Price Bid Stage">{tval(t.priceBidStage)}</Field>
        </Section>

        {/* Outcome intelligence — the part the spreadsheet has no answer for. */}
        {(t.lossReason || t.l1Bidder || t.ourRank != null) && (
          <Section title="Outcome">
            <Field label="Loss Reason">{t.lossReason ? LOSS_REASON_META[t.lossReason].label : "—"}</Field>
            <Field label="Our Rank">{t.ourRank == null ? "—" : `L${t.ourRank}`}</Field>
            <Field label="L1 Bidder">{tval(t.l1Bidder)}</Field>
            <Field label="L1 Value">{tmoney(t.l1Value)}</Field>
            {t.lossNote && (
              <Field label="Note" wide>
                {t.lossNote}
              </Field>
            )}
          </Section>
        )}

        <Section title="Location">
          <Field label="Location" wide>{tval(t.location)}</Field>
          <Field label="Office Address" wide>{tval(t.officeAddress)}</Field>
        </Section>

        {/* Attachments */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-[11px] font-semibold tracking-wide text-gray-400 uppercase">Attachments</h4>
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1 text-xs font-medium text-brand-accent hover:underline"
            >
              <Upload size={12} /> Add file
            </button>
            <input
              ref={fileRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) void attach(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
          {(t.attachments ?? []).length === 0 ? (
            <p className="text-xs text-gray-400">Nothing attached yet.</p>
          ) : (
            <ul className="divide-y divide-gray-50 rounded-lg border border-gray-100">
              {(t.attachments ?? []).map((a) => (
                <li key={a.id} className="flex items-center gap-2 px-3 py-2">
                  <Paperclip size={13} className="shrink-0 text-gray-300" />
                  <a
                    href={a.dataUrl}
                    download={a.name}
                    className="min-w-0 flex-1 truncate text-sm text-gray-700 hover:text-brand-accent"
                    title={a.name}
                  >
                    {a.name}
                  </a>
                  <span className="shrink-0 text-[11px] text-gray-400">{(a.size / 1024).toFixed(0)} KB</span>
                  <button
                    onClick={() => removeAttachment(t.id, a.id)}
                    aria-label={`Remove ${a.name}`}
                    className="shrink-0 rounded p-1 text-gray-300 hover:bg-rose-50 hover:text-rose-500"
                  >
                    <Trash2 size={13} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <Section title="Documents & Notes">
          <Field label="Stage Documents" wide>{tval(t.stageDocuments)}</Field>
          <Field label="Uploaded Documents" wide>{tval(t.uploadedDocuments)}</Field>
          <Field label="View Documents" wide>
            {t.viewDocuments ? (
              /^https?:\/\//.test(t.viewDocuments) ? (
                <a
                  href={t.viewDocuments}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-brand-accent hover:underline"
                >
                  Open link <ExternalLink size={12} />
                </a>
              ) : (
                t.viewDocuments
              )
            ) : (
              "—"
            )}
          </Field>
          <Field label="Remarks" wide>{tval(t.remarks)}</Field>
        </Section>
      </div>
    </Drawer>
  );
}

function DateWithBadge({ value }: { value?: string | null }) {
  const tone = deadlineTone(value);
  return (
    <span className="inline-flex items-center gap-1.5">
      {tdate(value)}
      {tone !== "none" && tone !== "ok" && (
        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${DEADLINE_TONE_CLASS[tone]}`}>
          {deadlineLabel(value)}
        </span>
      )}
    </span>
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

function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2" : ""}>
      <div className="text-[11px] text-gray-400">{label}</div>
      <div className="mt-0.5 text-sm whitespace-pre-wrap text-gray-700">{children}</div>
    </div>
  );
}

function Chip({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${className}`}>{children}</span>
  );
}
