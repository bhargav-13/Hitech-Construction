"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Award,
  Banknote,
  Building2,
  CalendarDays,
  ExternalLink,
  FileText,
  Landmark,
  MapPin,
  Search,
  ShieldCheck,
  Trophy,
} from "lucide-react";
import { Drawer } from "@/components/Drawer";
import { Select } from "@/components/Select";
import { TenderForm } from "@/components/tender/TenderForm";
import { useTenderStore } from "@/lib/tenderStore";
import { getAccessToken } from "@/lib/api";
import { bucketOf } from "@/lib/tenderMetrics";
import {
  BUCKET_META,
  EMD_MODE_META,
  EMD_STATE_META,
  LOSS_REASON_META,
  SOURCE_META,
  STATUS_META,
  type Tender,
  type TenderBucket,
} from "@/lib/tenderTypes";
import { tdate, tmoney, tval } from "@/lib/tenderHelpers";
import { projectAvatarColor } from "@/lib/projectHelpers";

/** Decided tenders — the ones worth keeping as reference for the next bid. */
const PAST_BUCKETS: TenderBucket[] = ["WON", "COMPLETED", "LOST", "CANCELLED_RETENDERED"];

export function isPastTender(t: Tender): boolean {
  return PAST_BUCKETS.includes(bucketOf(t));
}

/** When the tender was decided, as near as the record says — for sorting newest first. */
function decidedOn(t: Tender): string {
  return t.dateOfReceived || t.submissionDate || t.deadline || t.dueDate || "";
}

/**
 * Tender Library — the history of tenders already decided, as a reference shelf.
 *
 * The live pipeline (Sorting → Research → Applied) is for work in hand; once a tender is won,
 * completed, lost or retendered it drops out of view there. This keeps that history in one place
 * next to the other masters — who the department was, what we quoted, who beat us and by how much —
 * and lets older tenders from before the system be added so the record is complete.
 * It reads the same tender records as the Tender module, so there is no second copy.
 */
export function TenderLibrary() {
  const tenders = useTenderStore((s) => s.tenders);
  const backend = useTenderStore((s) => s.backend);
  const hydrate = useTenderStore((s) => s.hydrateFromBackend);
  const [search, setSearch] = useState("");
  const [bucket, setBucket] = useState<"ALL" | TenderBucket>("ALL");
  const [dept, setDept] = useState("ALL");
  const [openId, setOpenId] = useState<string | null>(null);
  const [form, setForm] = useState<{ mode: "create" } | { mode: "edit"; tender: Tender } | null>(null);

  // The Tender shell normally loads these; the Library can be the first screen opened.
  useEffect(() => {
    if (!backend && getAccessToken()) void hydrate();
  }, [backend, hydrate]);

  const past = useMemo(
    () => tenders.filter(isPastTender).sort((a, b) => decidedOn(b).localeCompare(decidedOn(a))),
    [tenders],
  );

  const countBy = useMemo(() => {
    const m = new Map<TenderBucket, number>();
    for (const t of past) m.set(bucketOf(t), (m.get(bucketOf(t)) ?? 0) + 1);
    return m;
  }, [past]);

  const departments = useMemo(
    () => [...new Set(past.map((t) => t.department).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b)),
    [past],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return past.filter((t) => {
      if (bucket !== "ALL" && bucketOf(t) !== bucket) return false;
      if (dept !== "ALL" && t.department !== dept) return false;
      if (!q) return true;
      return [t.nameOfWork, t.department, t.tenderId, t.location, t.l1Bidder]
        .some((v) => (v ?? "").toLowerCase().includes(q));
    });
  }, [past, bucket, dept, search]);

  const totals = useMemo(() => {
    const won = filtered.filter((t) => ["WON", "COMPLETED"].includes(bucketOf(t)));
    return {
      wonValue: won.reduce((s, t) => s + (t.contractValue ?? t.estimatedCost ?? 0), 0),
      wonCount: won.length,
    };
  }, [filtered]);

  const open = openId ? tenders.find((t) => t.id === openId) : undefined;

  return (
    <div className="animate-fade-in space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-xl text-sm text-gray-500">
          Past tenders — won, completed, lost, cancelled and retendered — kept as a reference for the next bid. Add
          older tenders from before the system to complete the record.
        </p>
        <button
          onClick={() => setForm({ mode: "create" })}
          className="shrink-0 rounded-lg bg-brand-accent px-4 py-2 text-sm font-medium text-white transition-all duration-150 hover:opacity-90 active:scale-95"
        >
          + Add Past Tender
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Chip label="All" count={past.length} active={bucket === "ALL"} onClick={() => setBucket("ALL")} />
        {PAST_BUCKETS.map((b) => (
          <Chip
            key={b}
            label={BUCKET_META[b].label}
            count={countBy.get(b) ?? 0}
            active={bucket === b}
            onClick={() => setBucket(b)}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-gray-400">
          {filtered.length} of {past.length} tenders
          {totals.wonCount > 0 && (
            <>
              {" "}· {totals.wonCount} won worth <span className="font-medium text-gray-600">{tmoney(totals.wonValue)}</span>
            </>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-1.5 transition-colors duration-150 focus-within:border-cyan-400">
            <Search size={14} className="text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search work, department, ID, L1…"
              className="w-56 bg-transparent text-sm outline-none"
            />
          </div>
          <Select
            value={dept}
            onChange={setDept}
            size="sm"
            className="min-w-[200px]"
            options={[{ value: "ALL", label: "All departments" }, ...departments.map((d) => ({ value: d, label: d }))]}
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white py-12 text-center text-sm text-gray-400">
          {past.length === 0 ? "No decided tenders yet. Add a past tender to start the library." : "No tenders match."}
        </div>
      ) : (
        <div className="w-full min-w-0 overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium text-gray-500">
                <th className="px-4 py-3">Tender</th>
                <th className="px-4 py-3">Department</th>
                <th className="px-4 py-3 text-right">Est. Cost</th>
                <th className="px-4 py-3 text-right">Contract Value</th>
                <th className="px-4 py-3">Outcome</th>
                <th className="px-4 py-3">L1 / Rank</th>
                <th className="px-4 py-3">Date</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => {
                const b = bucketOf(t);
                return (
                  <tr
                    key={t.id}
                    onClick={() => setOpenId(t.id)}
                    className="cursor-pointer border-b border-gray-50 transition-colors duration-150 last:border-b-0 even:bg-gray-50/50 hover:bg-cyan-50/40"
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <TenderAvatar tender={t} size={32} />
                        <div className="min-w-0">
                          <div className="max-w-[360px] truncate font-medium text-gray-800" title={t.nameOfWork ?? ""}>
                            {tval(t.nameOfWork)}
                          </div>
                          <div className="font-mono text-xs text-gray-400">{tval(t.tenderId)}</div>
                        </div>
                      </div>
                    </td>
                    <td className="max-w-[220px] truncate px-4 py-2.5 text-gray-600" title={t.department ?? ""}>
                      {tval(t.department)}
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap text-gray-600">{tmoney(t.estimatedCost)}</td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap text-gray-800">{tmoney(t.contractValue)}</td>
                    <td className="px-4 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset ${BUCKET_META[b].chip}`}>
                        {BUCKET_META[b].label}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-500">
                      {t.l1Bidder ? <span className="text-gray-700">{t.l1Bidder}</span> : "—"}
                      {t.ourRank != null && <span className="ml-1 text-gray-400">· we were L{t.ourRank}</span>}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-gray-500">{tdate(decidedOn(t))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {open && !form && (
        <TenderProfileDrawer
          tender={open}
          onClose={() => setOpenId(null)}
          onEdit={() => setForm({ mode: "edit", tender: open })}
        />
      )}
      {form && (
        <TenderForm
          tender={form.mode === "edit" ? form.tender : undefined}
          initialStage="WON"
          onClose={() => setForm(null)}
        />
      )}
    </div>
  );
}

/** Read-only profile of one past tender, laid out like the party profile. */
function TenderProfileDrawer({ tender: t, onClose, onEdit }: { tender: Tender; onClose: () => void; onEdit: () => void }) {
  const b = bucketOf(t);
  const lost = b === "LOST" || b === "CANCELLED_RETENDERED";
  const variance =
    t.variancePct != null
      ? `${t.variancePct > 0 ? "+" : ""}${t.variancePct}%`
      : t.contractValue != null && t.estimatedCost
        ? `${(((t.contractValue - t.estimatedCost) / t.estimatedCost) * 100).toFixed(2)}%`
        : "—";

  return (
    <Drawer title={t.tenderId ? `Tender ${t.tenderId}` : "Past tender"} onClose={onClose} width="max-w-3xl">
      <div className="space-y-5">
        <div className="flex flex-wrap items-start gap-4 rounded-xl border border-gray-200 bg-gradient-to-r from-cyan-50/60 to-white p-4">
          <TenderAvatar tender={t} size={72} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${BUCKET_META[b].chip}`}>
                {BUCKET_META[b].label}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${SOURCE_META[t.source].chip}`}>
                {SOURCE_META[t.source].label}
              </span>
            </div>
            <h3 className="mt-1.5 text-base font-semibold text-gray-900">{tval(t.nameOfWork)}</h3>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600">
              {t.department && (
                <span className="flex items-center gap-1.5"><Building2 size={13} className="text-gray-400" /> {t.department}</span>
              )}
              {t.location && (
                <span className="flex items-center gap-1.5"><MapPin size={13} className="text-gray-400" /> {t.location}</span>
              )}
            </div>
          </div>
          <div className="flex shrink-0 flex-col gap-2">
            <button
              onClick={onEdit}
              className="rounded-lg border border-brand-accent px-4 py-2 text-sm font-medium text-brand-accent transition-all duration-150 hover:bg-cyan-50 active:scale-95"
            >
              Edit details
            </button>
            <Link
              href={`/tender/applied?open=${encodeURIComponent(t.id)}`}
              className="flex items-center justify-center gap-1 text-xs font-medium text-gray-500 hover:text-brand-accent"
            >
              Open in Tender <ExternalLink size={11} />
            </Link>
          </div>
        </div>

        <Section title="Tender" icon={FileText}>
          <FieldGrid>
            <Field label="Tender ID" value={tval(t.tenderId)} mono />
            <Field label="Class" value={tval(t.classReq)} />
            <Field label="Status" value={t.status ? STATUS_META[t.status].label : "—"} />
            <Field label="Duration" value={tval(t.duration)} />
            <Field label="DLP" value={tval(t.dlp)} />
            <Field label="Firm" value={tval(t.firm)} />
          </FieldGrid>
        </Section>

        <Section title="Commercials" icon={Banknote}>
          <FieldGrid>
            <Field label="Estimated cost" value={tmoney(t.estimatedCost)} />
            <Field label="Contract value" value={tmoney(t.contractValue)} />
            <Field label="Variance" value={variance} />
            <Field label="Fee" value={tmoney(t.fee)} />
            <Field label="GST" value={tval(t.gst)} />
          </FieldGrid>
        </Section>

        <Section title="Dates" icon={CalendarDays}>
          <FieldGrid>
            <Field label="Deadline" value={tdate(t.deadline)} />
            <Field label="Submitted" value={tdate(t.submissionDate)} />
            <Field label="Result received" value={tdate(t.dateOfReceived)} />
          </FieldGrid>
        </Section>

        <Section title="EMD & Security" icon={Landmark}>
          <FieldGrid>
            <Field label="EMD" value={tmoney(t.emd)} />
            <Field label="Instrument" value={t.emdMode ? EMD_MODE_META[t.emdMode].label : "—"} />
            <Field label="EMD state" value={t.emdState ? EMD_STATE_META[t.emdState].label : "—"} />
            <Field label="Instrument no." value={tval(t.emdInstrumentNo)} mono />
            <Field label="EMD released" value={tdate(t.emdReleasedOn)} />
            <Field label="Security deposit" value={tmoney(t.securityAmount)} />
          </FieldGrid>
        </Section>

        <Section title={lost ? "Why it was lost" : "Result"} icon={lost ? ShieldCheck : Trophy}>
          <FieldGrid>
            {lost && (
              <Field
                label="Reason"
                value={t.lossReasonLabel || (t.lossReason ? LOSS_REASON_META[t.lossReason].label : "Unspecified")}
              />
            )}
            <Field label="L1 bidder" value={tval(t.l1Bidder)} icon={Award} />
            <Field label="L1 value" value={tmoney(t.l1Value)} />
            <Field label="Our rank" value={t.ourRank != null ? `L${t.ourRank}` : "—"} />
          </FieldGrid>
          {t.lossNote && <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">{t.lossNote}</p>}
        </Section>

        {(t.remarks || (t.customFields ?? []).length > 0) && (
          <Section title="Notes" icon={FileText}>
            {(t.customFields ?? []).length > 0 && (
              <FieldGrid>
                {t.customFields!.map((c) => (
                  <Field key={c.id} label={c.label} value={c.value || "—"} />
                ))}
              </FieldGrid>
            )}
            {t.remarks && <p className="mt-3 text-sm whitespace-pre-wrap text-gray-600">{t.remarks}</p>}
          </Section>
        )}
      </div>
    </Drawer>
  );
}

function Chip({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-medium transition-all duration-150 active:scale-95 ${
        active ? "bg-brand-accent text-white shadow-sm" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
      }`}
    >
      {label} <span className={active ? "opacity-75" : "text-gray-400"}>{count}</span>
    </button>
  );
}

function TenderAvatar({ tender, size }: { tender: Tender; size: number }) {
  const name = (tender.department || tender.nameOfWork || "T").trim();
  const parts = name.split(/\s+/).filter(Boolean);
  const initials = parts.length > 1 ? (parts[0][0] + parts[1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-xl font-semibold text-white ${projectAvatarColor(tender.department ?? tender.id)}`}
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.32)) }}
    >
      {initials}
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        <Icon size={15} className="text-brand-accent" />
        <h4 className="text-xs font-semibold tracking-wide text-gray-700 uppercase">{title}</h4>
      </div>
      {children}
    </div>
  );
}

function FieldGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">{children}</div>;
}

function Field({
  label,
  value,
  mono,
  icon: Icon,
}: {
  label: string;
  value: string;
  mono?: boolean;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] tracking-wide text-gray-400 uppercase">{label}</div>
      <div className={`mt-0.5 flex items-center gap-1.5 truncate text-sm font-medium text-gray-800 ${mono ? "font-mono" : ""}`}>
        {Icon && <Icon size={12} className="shrink-0 text-gray-300" />}
        {value}
      </div>
    </div>
  );
}
