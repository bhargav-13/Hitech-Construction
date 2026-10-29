"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Download, Eye, Pencil, RotateCcw, Send, Trash2 } from "lucide-react";
import { deleteIssuedLetter, getIssuedLetters, getLetterFile, issueLetter, type IssuedLetterApi } from "@/lib/hrDeskApi";
import { formatDateTimeIST } from "@/lib/datetime";
import { useCan } from "@/lib/permissions";
import { Select } from "@/components/Select";
import { DatePicker } from "@/components/DatePicker";
import { Spinner } from "@/components/Spinner";
import { getPayrollPeople, getPayrollProfiles, type PayrollProfileResponse, type UserResponse } from "@/lib/api";
import { getTemplate, type DocTemplate } from "@/lib/docTemplates";
import { LETTER_DEFS, LETTER_FIELDS, letterDate, placeholdersIn, type LetterKind } from "@/lib/letters";
import { printLetter } from "@/lib/letterPrint";
import { getCachedFirmProfile } from "@/lib/vyaparExport";
import { todayIST } from "@/lib/datetime";

/**
 * Payroll → Others → Employment Letters. Pick a person and a letter; the wording comes from
 * Templates → Payroll (the company's own text), the blanks fill from their payroll profile, and
 * anything the profile can't know — an effective date, a new designation — is asked for here.
 * The result is a real PDF on the company letterhead, not a browser print-out.
 */
export function EmploymentLetters() {
  const [users, setUsers] = useState<UserResponse[]>([]);
  const [userId, setUserId] = useState("");
  const [kind, setKind] = useState<LetterKind>("LETTER_APPOINTMENT");

  useEffect(() => {
    getPayrollPeople()
      .then((r) => setUsers(r.content.filter((u) => u.onPayroll)))
      .catch(() => setUsers([]));
  }, []);

  const member = users.find((u) => String(u.id) === userId) ?? null;
  // Bumped after a share so the history below picks the new row up.
  const [shared, setShared] = useState(0);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-gray-500">Member</span>
          <Select
            value={userId}
            onChange={setUserId}
            placeholder="Select member"
            options={users.map((u) => ({ value: String(u.id), label: u.fullName }))}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-gray-500">Letter type</span>
          <Select value={kind} onChange={(v) => setKind(v as LetterKind)} options={LETTER_DEFS.map((d) => ({ value: d.kind, label: d.label }))} />
        </label>
      </div>

      {member ? (
        // Keyed so switching person or letter starts a fresh form, loaded for that pair.
        <LetterForm key={`${member.id}-${kind}`} member={member} kind={kind} onShared={() => setShared((n) => n + 1)} />
      ) : (
        <p className="rounded-lg border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-gray-400">
          Pick a member to prepare their letter.
        </p>
      )}

      <SharedLetters key={shared} userId={member?.id ?? null} memberName={member?.fullName ?? null} />
    </div>
  );
}

/**
 * KAN-60: which letter went to whom and when. Every letter shared from here is kept with its PDF,
 * who shared it, and when the employee first opened it in Self Service → Inbox & Documents.
 */
function SharedLetters({ userId, memberName }: { userId: number | null; memberName: string | null }) {
  const can = useCan();
  const [rows, setRows] = useState<IssuedLetterApi[] | null>(null);
  const [onlyMember, setOnlyMember] = useState(true);
  const [error, setError] = useState("");
  const load = () =>
    getIssuedLetters()
      .then(setRows)
      .catch((e) => {
        setRows([]);
        setError(e instanceof Error ? e.message : "Couldn't load shared letters.");
      });
  useEffect(() => {
    void load();
  }, []);
  const shown = (rows ?? []).filter((r) => !onlyMember || userId == null || r.userId === userId);

  async function open(r: IssuedLetterApi) {
    try {
      const { dataUrl } = await getLetterFile(r.id);
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = r.fileName;
      a.click();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Couldn't open the letter.");
    }
  }
  async function remove(r: IssuedLetterApi) {
    if (!confirm(`Remove "${r.title}" shared with ${r.memberName ?? "this member"}? They will no longer see it in their inbox.`)) return;
    await deleteIssuedLetter(r.id).catch(() => {});
    void load();
  }

  return (
    <div className="space-y-2 border-t border-gray-100 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-gray-800">Shared letters</h4>
        {userId != null && (
          <label className="flex items-center gap-1.5 text-xs text-gray-500">
            <input type="checkbox" checked={onlyMember} onChange={(e) => setOnlyMember(e.target.checked)} />
            Only {memberName}
          </label>
        )}
      </div>
      {error && <p className="text-xs text-rose-600">{error}</p>}
      {rows == null ? (
        <div className="flex items-center gap-2 py-4 text-sm text-gray-400"><Spinner size={14} className="text-brand-accent" /> Loading…</div>
      ) : shown.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-200 px-4 py-4 text-center text-xs text-gray-400">
          No letters shared yet. Use <b>Share with employee</b> above — it lands in their Self Service inbox and is listed here.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs text-gray-500">
                <th className="px-3 py-2 font-medium">Letter</th>
                <th className="px-3 py-2 font-medium">Shared with</th>
                <th className="px-3 py-2 font-medium">Ref no.</th>
                <th className="px-3 py-2 font-medium">Shared on</th>
                <th className="px-3 py-2 font-medium">By</th>
                <th className="px-3 py-2 font-medium">Opened</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {shown.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2 font-medium text-gray-800">{r.title}</td>
                  <td className="px-3 py-2 text-gray-700">{r.memberName ?? "—"}</td>
                  <td className="px-3 py-2 text-gray-500">{r.refNo ?? "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-gray-600">{formatDateTimeIST(r.issuedAt)}</td>
                  <td className="px-3 py-2 text-gray-500">{r.issuedByName ?? "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {r.seenAt ? (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-700"><CheckCircle2 size={12} /> {formatDateTimeIST(r.seenAt)}</span>
                    ) : (
                      <span className="text-xs text-gray-400">Not yet</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button onClick={() => void open(r)} title="Download the shared PDF" className="rounded p-1 text-gray-400 hover:text-brand-accent"><Download size={14} /></button>
                    {can("PAYROLL_STAFF:EDIT") && (
                      <button onClick={() => void remove(r)} title="Remove" className="rounded p-1 text-gray-400 hover:text-rose-600"><Trash2 size={14} /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const money = (n: number | null | undefined) =>
  n ? `Rs. ${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 })}` : "";

/** Everything the profile can answer, keyed by placeholder. */
function autoValues(member: UserResponse, profile: PayrollProfileResponse | null, company: string): Record<string, string> {
  const d = profile?.details ?? null;
  const ctc = profile?.salary?.monthlyCtc ?? 0;
  return {
    name: member.fullName,
    firstName: member.fullName.split(/\s+/)[0] ?? member.fullName,
    designation: profile?.designation ?? "",
    department: member.departmentName ?? "",
    staffId: d?.staffCode ?? "",
    joiningDate: letterDate(profile?.joiningDate),
    address: d?.currentAddress || d?.permanentAddress || "",
    fatherName: d?.fatherName ?? "",
    monthlyCtc: money(ctc),
    annualCtc: money(ctc * 12),
    basic: money(profile?.salary?.basic),
    pan: profile?.pan ?? "",
    uan: d?.uan ?? "",
    company,
    date: letterDate(todayIST()),
    probationMonths: d?.probationDays ? String(Math.round(d.probationDays / 30)) : "",
    lastWorkingDate: letterDate(d?.exitDate),
  };
}

function LetterForm({ member, kind, onShared }: { member: UserResponse; kind: LetterKind; onShared: () => void }) {
  const def = LETTER_DEFS.find((d) => d.kind === kind)!;
  const [loaded, setLoaded] = useState<{ tpl: DocTemplate; auto: Record<string, string> } | null>(null);
  const [error, setError] = useState("");
  const [manual, setManual] = useState<Record<string, string>>({});
  // Wording for this one letter; null = use the template's as saved.
  const [subject, setSubject] = useState<string | null>(null);
  const [body, setBody] = useState<string | null>(null);
  const [busy, setBusy] = useState<"" | "preview" | "download" | "share">("");
  const [sharedMsg, setSharedMsg] = useState("");

  useEffect(() => {
    let live = true;
    Promise.all([
      getTemplate(kind),
      getPayrollProfiles([member.id]).then((r) => r[0] ?? null).catch(() => null),
      getCachedFirmProfile().catch(() => null),
    ])
      .then(([tpl, profile, firm]) => {
        if (!live) return;
        setLoaded({ tpl, auto: autoValues(member, profile, tpl.companyName.trim() || firm?.businessName || "") });
      })
      .catch(() => live && setError("Couldn't load this member's details."));
    return () => {
      live = false;
    };
  }, [kind, member]);

  const tplSubject = subject ?? loaded?.tpl.subject ?? "";
  const tplBody = body ?? loaded?.tpl.body ?? "";

  /** Placeholders the wording uses that the profile left blank — asked for below. */
  const asks = useMemo(() => {
    if (!loaded) return [];
    const used = placeholdersIn(tplSubject, tplBody);
    return LETTER_FIELDS.filter((f) => used.includes(f.key) && !loaded.auto[f.key]?.trim());
  }, [loaded, tplSubject, tplBody]);

  if (error) return <p className="py-6 text-center text-sm text-rose-600">{error}</p>;
  if (!loaded) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-400">
        <Spinner size={16} className="text-brand-accent" /> Loading…
      </div>
    );
  }

  const values: Record<string, string> = { ...loaded.auto, ...manual };
  const missing = asks.filter((f) => !values[f.key]?.trim());

  async function run(mode: "preview" | "download" | "share") {
    setBusy(mode);
    setSharedMsg("");
    try {
      const doc = await printLetter(kind, values, {
        template: loaded!.tpl,
        subject: tplSubject,
        body: tplBody,
        save: mode === "download",
      });
      if (mode === "preview") window.open(String(doc.output("bloburl")), "_blank");
      if (mode === "share") {
        if (!confirm(`Share this ${def.label} with ${member.fullName}? It goes to their Self Service inbox.`)) return;
        await issueLetter({
          userId: member.id,
          kind,
          title: def.label,
          refNo: values.refNo?.trim() || null,
          fileName: `${def.label} - ${member.fullName}.pdf`,
          dataUrl: String(doc.output("datauristring")),
        });
        setSharedMsg(`Shared with ${member.fullName} — they'll find it under Self Service → Inbox & Documents.`);
        onShared();
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "Couldn't build the letter.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Reference no. (optional)">
          <input value={manual.refNo ?? ""} onChange={(e) => setManual((m) => ({ ...m, refNo: e.target.value }))} className="input" placeholder="e.g. HTC/HR/2026/118" />
        </Field>
        {asks
          .filter((f) => f.key !== "refNo")
          .map((f) => (
            <Field key={f.key} label={f.label}>
              {f.type === "date" ? (
                <DatePicker
                  value={manual[`${f.key}__iso`] ?? ""}
                  onChange={(iso) => setManual((m) => ({ ...m, [`${f.key}__iso`]: iso, [f.key]: letterDate(iso) }))}
                  placeholder="Pick a date"
                />
              ) : f.type === "money" ? (
                <input
                  inputMode="numeric"
                  value={manual[`${f.key}__raw`] ?? ""}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^\d.]/g, "");
                    setManual((m) => ({ ...m, [`${f.key}__raw`]: raw, [f.key]: raw ? money(Number(raw)) : "" }));
                  }}
                  className="input"
                  placeholder="Amount per month"
                />
              ) : (
                <input value={manual[f.key] ?? ""} onChange={(e) => setManual((m) => ({ ...m, [f.key]: e.target.value }))} className="input" />
              )}
            </Field>
          ))}
      </div>

      <details className="rounded-lg border border-gray-200 bg-gray-50/60 px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium text-gray-700">Wording for this letter</summary>
        <div className="mt-3 space-y-2">
          <Field label="Subject">
            <input value={tplSubject} onChange={(e) => setSubject(e.target.value)} className="input" />
          </Field>
          <Field label="Body">
            <textarea value={tplBody} onChange={(e) => setBody(e.target.value)} rows={12} className="input resize-y font-mono text-[12.5px]" />
          </Field>
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-500">
            <span>Changes here apply to this one letter. The company&apos;s wording lives in Templates.</span>
            {(subject !== null || body !== null) && (
              <button
                type="button"
                onClick={() => {
                  setSubject(null);
                  setBody(null);
                }}
                className="flex items-center gap-1 font-medium text-gray-600 hover:text-brand-accent"
              >
                <RotateCcw size={12} /> Back to template wording
              </button>
            )}
          </div>
        </div>
      </details>

      {missing.length > 0 && (
        <p className="text-xs text-amber-700">
          Not filled yet: {missing.map((f) => f.label).join(", ")} — they print as [brackets] until you fill them in.
        </p>
      )}

      {sharedMsg && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{sharedMsg}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href={`/templates?kind=${kind}`} className="flex items-center gap-1 text-xs font-medium text-brand-accent hover:underline">
          <Pencil size={12} /> Edit {def.label} design &amp; default wording
        </Link>
        <div className="flex gap-2">
          <button
            onClick={() => void run("preview")}
            disabled={!!busy}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            <Eye size={15} /> {busy === "preview" ? "Preparing…" : "Preview"}
          </button>
          <button
            onClick={() => void run("download")}
            disabled={!!busy}
            className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            <Download size={15} /> {busy === "download" ? "Preparing…" : "Download PDF"}
          </button>
          <button
            onClick={() => void run("share")}
            disabled={!!busy}
            title="Send the PDF to the employee's Self Service inbox and keep a record of it"
            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            <Send size={15} /> {busy === "share" ? "Sharing…" : "Share with employee"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-gray-500">{label}</span>
      {children}
    </div>
  );
}
