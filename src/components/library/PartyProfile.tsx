"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Banknote,
  Building2,
  CalendarDays,
  FileText,
  IdCard,
  Landmark,
  Mail,
  MapPin,
  Phone,
  Receipt,
  ShieldCheck,
  Trophy,
  Wallet,
} from "lucide-react";
import { Spinner } from "@/components/Spinner";
import { StarRating } from "@/components/library/StarRating";
import { projectAvatarColor } from "@/lib/projectHelpers";
import { inr } from "@/lib/format";
import { decodeComponents } from "@/lib/salaryComponents";
import * as api from "@/lib/api";
import type { PayrollProfileResponse } from "@/lib/api";
import { PARTY_TYPE_STYLE, type LibraryParty } from "@/lib/libraryTypes";
import { useTenderStore } from "@/lib/tenderStore";
import { bucketOf } from "@/lib/tenderMetrics";
import { BUCKET_META, type Tender } from "@/lib/tenderTypes";
import { tmoney, tval } from "@/lib/tenderHelpers";
import { useCan } from "@/lib/permissions";

/** One uploaded identity document, exactly as the payroll wizard stores it. */
type DocRow = { type: string; fileName: string; dataUrl: string };

function parseDocuments(raw: string | null | undefined): DocRow[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((d) => ({
        type: String(d?.type ?? ""),
        fileName: String(d?.fileName ?? ""),
        dataUrl: String(d?.dataUrl ?? ""),
      }))
      .filter((d) => d.type || d.dataUrl);
  } catch {
    return [];
  }
}

const isImage = (dataUrl: string) => /^data:image\//i.test(dataUrl) || /\.(png|jpe?g|gif|webp)$/i.test(dataUrl);

const CATEGORY_LABEL: Record<string, string> = {
  REGULAR: "Regular Employee",
  CONTRACTOR: "Contractor",
  WORK_BASIS: "Work Basis",
};

/**
 * Everything the business holds about one party, read-only, in the Library drawer.
 *
 * The list rows only ever showed a name, a phone and a type, so opening a person still meant going
 * to Payroll for their profile and to Vyapar for their ledger details. This pulls the whole record
 * together: photo, contact, posting, and — for a member with a payroll profile — their category,
 * salary, bank details and every uploaded ID document previewed in place rather than as a filename.
 */
export function PartyProfile({
  party,
  rating,
  onRate,
  onEdit,
}: {
  party: LibraryParty;
  rating: number;
  onRate: (stars: number) => void;
  onEdit: () => void;
}) {
  const user = party.raw.source === "member" ? party.raw.user : null;
  const vp = party.raw.source === "vyapar" ? party.raw.party : null;

  const [profile, setProfile] = useState<PayrollProfileResponse | null>(null);
  const [profileLoading, setProfileLoading] = useState(!!user);

  // A member's payroll profile is where the documents, salary and bank details live. It's optional
  // (and self-or-manager gated), so a 404/403 just means "nothing extra to show" — not an error.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    api
      .getPayrollProfile(user.id)
      .then((p) => { if (!cancelled) setProfile(p); })
      .catch(() => { if (!cancelled) setProfile(null); })
      .finally(() => { if (!cancelled) setProfileLoading(false); });
    return () => { cancelled = true; };
  }, [user]);

  const can = useCan();
  const allTenders = useTenderStore((st) => st.tenders);
  // A client is usually the tendering department; a vendor can show up as the L1 bidder who beat us.
  const tenderHistory = useMemo(() => {
    if (!vp || !can("TENDER_TENDERS")) return [];
    const key = squash(party.name);
    if (key.length < 3) return [];
    return allTenders.filter((t) => squash(t.department) === key || squash(t.l1Bidder) === key);
  }, [vp, can, party.name, allTenders]);

  const documents = parseDocuments(profile?.documents);
  const components = decodeComponents(profile?.components);

  return (
    <div className="space-y-5">
      {/* ---- Header card ---- */}
      <div className="flex flex-wrap items-start gap-4 rounded-xl border border-gray-200 bg-gradient-to-r from-cyan-50/60 to-white p-4">
        <Avatar party={party} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-gray-900">{party.name}</h3>
            <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${PARTY_TYPE_STYLE[party.type]}`}>{party.type}</span>
            {!party.isActive && (
              <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">Inactive</span>
            )}
          </div>
          {party.subtitle && <p className="mt-0.5 text-sm text-gray-500">{party.subtitle}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600">
            {party.phone && (
              <span className="flex items-center gap-1.5"><Phone size={13} className="text-gray-400" /> {party.phone}</span>
            )}
            {party.email && (
              <span className="flex items-center gap-1.5"><Mail size={13} className="text-gray-400" /> {party.email}</span>
            )}
          </div>
          <div className="mt-2.5 flex items-center gap-2">
            <span className="text-[11px] tracking-wide text-gray-400 uppercase">Rating</span>
            <StarRating value={rating} onChange={onRate} size={15} />
          </div>
        </div>
        <button
          onClick={onEdit}
          className="shrink-0 rounded-lg border border-brand-accent px-4 py-2 text-sm font-medium text-brand-accent transition-all duration-150 hover:bg-cyan-50 active:scale-95"
        >
          Edit details
        </button>
      </div>

      {/* ---- Member: org placement ---- */}
      {user && (
        <Section title="Organisation" icon={Building2}>
          <FieldGrid>
            <Field label="Role" value={user.role.name} />
            <Field label="Department" value={user.departmentName ?? "—"} />
            <Field label="Posting" value={user.staffType === "SITE" ? "Site" : user.staffType === "OFFICE" ? "Office" : "—"} />
            <Field label="On payroll" value={user.onPayroll ? "Yes" : "No"} />
            <Field label="Can sign in" value={user.isLoginUser ? "Yes" : "No — directory entry only"} />
            <Field label="Status" value={user.isActive ? "Active" : "Deactivated"} />
          </FieldGrid>
        </Section>
      )}

      {/* ---- Member: payroll profile ---- */}
      {user && (
        profileLoading ? (
          <div className="flex items-center gap-2 rounded-xl border border-dashed border-gray-200 bg-white px-4 py-6 text-sm text-gray-400">
            <Spinner size={14} className="text-brand-accent" /> Loading payroll details…
          </div>
        ) : !profile ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-5 text-sm text-gray-400">
            No payroll profile set up for this member yet — salary, bank details and ID documents appear here once HR completes it.
          </div>
        ) : (
          <>
            <Section title="Employment" icon={IdCard}>
              <FieldGrid>
                <Field label="Category" value={CATEGORY_LABEL[profile.category] ?? profile.category} />
                <Field label="Designation" value={profile.designation ?? "—"} />
                <Field label="Joining date" value={profile.joiningDate ?? "—"} icon={CalendarDays} />
                <Field label="PAN" value={profile.pan ?? "—"} mono />
              </FieldGrid>
            </Section>

            <Section title="Salary" icon={Wallet}>
              <FieldGrid>
                {profile.category === "WORK_BASIS" ? (
                  <>
                    <Field label="Work type" value={profile.salary.workType ?? "—"} />
                    <Field label="Rate" value={profile.salary.workRate ? inr(profile.salary.workRate) : "—"} />
                  </>
                ) : (
                  <>
                    <Field label="Monthly CTC" value={profile.salary.monthlyCtc ? inr(profile.salary.monthlyCtc) : "—"} />
                    <Field label="Basic" value={profile.salary.basic ? inr(profile.salary.basic) : "—"} />
                    <Field label="HRA" value={profile.salary.hra ? inr(profile.salary.hra) : "—"} />
                    <Field label="Other allowances" value={profile.salary.otherAllowances ? inr(profile.salary.otherAllowances) : "—"} />
                  </>
                )}
              </FieldGrid>
              {components.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {components.map((c) => (
                    <span
                      key={`${c.kind}-${c.name}`}
                      className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                        c.kind === "EARNING" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-600"
                      }`}
                    >
                      {c.name} · {c.calc === "FLAT" ? inr(c.value) : `${c.value}% of ${c.calc.toLowerCase()}`}
                    </span>
                  ))}
                </div>
              )}
            </Section>

            <Section title="Bank" icon={Landmark}>
              <FieldGrid>
                <Field label="Account number" value={profile.bankAccount ?? "—"} mono />
                <Field label="IFSC" value={profile.ifsc ?? "—"} mono />
                <Field label="Bank" value={profile.bankName ?? "—"} />
              </FieldGrid>
            </Section>

            <Section title={`Documents${documents.length ? ` · ${documents.length}` : ""}`} icon={FileText}>
              {documents.length === 0 ? (
                <p className="text-sm text-gray-400">No ID documents uploaded.</p>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {documents.map((d, i) => (
                    <DocumentCard key={`${d.type}-${i}`} doc={d} />
                  ))}
                </div>
              )}
            </Section>
          </>
        )
      )}

      {/* ---- Vyapar party details ---- */}
      {vp && (
        <>
          <Section title="Tax & Registration" icon={ShieldCheck}>
            <FieldGrid>
              <Field label="GSTIN" value={vp.gstin ?? "—"} mono />
              <Field label="GST type" value={vp.gstType ?? "—"} />
              <Field label="Party group" value={vp.partyGroup ?? "—"} />
              <Field label="Vyapar type" value={vp.partyType === "CUSTOMER" ? "Customer" : "Supplier"} />
            </FieldGrid>
          </Section>

          <Section title="Address" icon={MapPin}>
            <FieldGrid>
              <Field label="City" value={vp.city ?? "—"} />
              <Field label="State" value={vp.state ?? "—"} />
            </FieldGrid>
            {vp.billingAddress && (
              <p className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-sm whitespace-pre-wrap text-gray-600">{vp.billingAddress}</p>
            )}
          </Section>

          {tenderHistory.length > 0 && (
            <Section title={`Tender history · ${tenderHistory.length}`} icon={Trophy}>
              <TenderHistory tenders={tenderHistory} partyName={party.name} />
            </Section>
          )}

          <Section title="Money" icon={Banknote}>
            <FieldGrid>
              <Field
                label="Current balance"
                value={party.balance == null ? "—" : `${inr(Math.abs(party.balance))} ${party.balance >= 0 ? "receivable" : "payable"}`}
              />
              <Field label="Opening balance" value={vp.openingBalance != null ? inr(vp.openingBalance) : "—"} />
              <Field label="Credit limit" value={vp.creditLimit != null ? inr(vp.creditLimit) : "No limit"} icon={Receipt} />
            </FieldGrid>
          </Section>
        </>
      )}
    </div>
  );
}

/** Lower-case, punctuation-free form used to match a party name against tender text. */
function squash(v: string | null | undefined): string {
  return (v ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function TenderHistory({ tenders, partyName }: { tenders: Tender[]; partyName: string }) {
  const key = squash(partyName);
  return (
    <ul className="divide-y divide-gray-100">
      {tenders.slice(0, 12).map((t) => {
        const b = bucketOf(t);
        const asCompetitor = squash(t.l1Bidder) === key && squash(t.department) !== key;
        return (
          <li key={t.id} className="flex items-center gap-3 py-2">
            <div className="min-w-0 flex-1">
              <Link
                href={`/tender/${t.stage === "SORTING" ? "sorting" : t.stage === "RESEARCH" ? "research" : "applied"}?open=${encodeURIComponent(t.id)}`}
                className="block truncate text-sm font-medium text-gray-800 hover:text-brand-accent"
                title={t.nameOfWork ?? ""}
              >
                {tval(t.nameOfWork)}
              </Link>
              <div className="text-xs text-gray-400">
                {tval(t.tenderId)}
                {asCompetitor ? " · beat us as L1" : ""}
              </div>
            </div>
            <span className="text-sm whitespace-nowrap text-gray-600">{tmoney(t.contractValue ?? t.estimatedCost)}</span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ring-1 ring-inset ${BUCKET_META[b].chip}`}>
              {BUCKET_META[b].label}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** A document tile: images preview inline, anything else gets a file card. Both open full size. */
function DocumentCard({ doc }: { doc: DocRow }) {
  const label = doc.type || doc.fileName || "Document";
  if (!doc.dataUrl) {
    return (
      <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-6 text-center text-xs text-gray-400">
        {label}
        <div className="mt-1 text-[11px]">Not uploaded</div>
      </div>
    );
  }
  return (
    <a
      href={doc.dataUrl}
      target="_blank"
      rel="noreferrer"
      title={doc.fileName || label}
      className="group block overflow-hidden rounded-lg border border-gray-200 bg-white transition-all duration-150 hover:-translate-y-0.5 hover:border-brand-accent hover:shadow-md"
    >
      <div className="flex h-28 items-center justify-center bg-gray-50">
        {isImage(doc.dataUrl) ? (
          // Data-URL scans — a plain img is correct (next/image can't optimize data URLs).
          // eslint-disable-next-line @next/next/no-img-element
          <img src={doc.dataUrl} alt={label} className="h-full w-full object-cover" />
        ) : (
          <FileText size={28} className="text-gray-300 transition-colors group-hover:text-brand-accent" />
        )}
      </div>
      <div className="px-2.5 py-2">
        <div className="truncate text-xs font-medium text-gray-700 group-hover:text-brand-accent">{label}</div>
        {doc.fileName && <div className="truncate text-[11px] text-gray-400">{doc.fileName}</div>}
      </div>
    </a>
  );
}

function Avatar({ party }: { party: LibraryParty }) {
  if (party.photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={party.photoUrl}
        alt={party.name}
        className="h-20 w-20 shrink-0 rounded-xl object-cover ring-2 ring-white shadow-sm"
      />
    );
  }
  const parts = party.name.trim().split(/\s+/).filter(Boolean);
  const initials =
    parts.length === 0 ? "?" : parts.length === 1 ? parts[0].slice(0, 2).toUpperCase() : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (
    <div
      className={`flex h-20 w-20 shrink-0 items-center justify-center rounded-xl text-2xl font-semibold text-white shadow-sm ${projectAvatarColor(party.key)}`}
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
