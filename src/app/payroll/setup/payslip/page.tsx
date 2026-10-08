"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PayrollShell } from "@/components/payroll/PayrollShell";
import { Spinner } from "@/components/Spinner";
import { ApiError } from "@/lib/api";
import type { PayslipApi } from "@/lib/api";
import { DEFAULT_PAYSLIP_TEMPLATE, PAYSLIP_FIELD_LABELS, usePayrollSetting } from "@/lib/payrollSettings";
import type { PayslipTemplate } from "@/lib/payrollSettings";
import { downloadPayslip, payslipColumns } from "@/lib/payslipExport";
import { getCachedFirmProfile } from "@/lib/vyaparExport";
import { inr } from "@/lib/format";
import { ArrowLeft, Download, RotateCcw } from "lucide-react";

/** A believable slip to preview the template against. */
const SAMPLE: PayslipApi = {
  id: 0, userId: 0, memberName: "Sample Employee", gross: 31250, pf: 1800, esic: 0, pt: 200, otherDeductions: 0,
  deductionsDetail: "PF|1800;Professional Tax|200", loanEmi: 1000, reimbursements: 500.4, net: 26250.4,
  payableDays: 29, totalDays: 30, month: "2026-09", otAmount: 1250, fineAmount: 100, variableEarnings: 1000,
  variableDeductions: 0, advanceDeduction: 2000, workAmount: 0, earningsDetail: "Diwali bonus|1000", tds: 400,
} as PayslipApi;

/** Payslip designer — PagarBook's "Customise Payslip": what the printed slip shows and how it reads. */
export default function PayslipDesignerPage() {
  const { value, loading, save } = usePayrollSetting("PAYSLIP_TEMPLATE");
  const [t, setT] = useState<PayslipTemplate>(DEFAULT_PAYSLIP_TEMPLATE);
  const [firmName, setFirmName] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Copy the saved value into the editable draft whenever it (re)loads — during render, not in an effect.
  const [synced, setSynced] = useState<typeof value | null>(null);
  if (!loading && synced !== value) {
    setSynced(value);
    setT(value);
  }
  useEffect(() => { getCachedFirmProfile().then((f) => setFirmName(f?.businessName ?? "")).catch(() => {}); }, []);

  const set = <K extends keyof PayslipTemplate>(k: K, v: PayslipTemplate[K]) => setT((x) => ({ ...x, [k]: v }));
  const dirty = JSON.stringify(t) !== JSON.stringify(value);

  async function onSave() {
    setSaving(true);
    setMsg(null);
    try {
      await save(t);
      setMsg({ ok: true, text: "Saved — every payslip downloaded from now on uses this design." });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof ApiError ? err.message : "Unable to save." });
    } finally {
      setSaving(false);
    }
  }

  const { earnings, deductions } = payslipColumns(SAMPLE, t.earningsBreakdown);
  const net = t.roundOff ? Math.round(SAMPLE.net) : SAMPLE.net;
  const shownFields = (Object.keys(PAYSLIP_FIELD_LABELS) as (keyof PayslipTemplate["fields"])[]).filter((k) => t.fields[k]);

  return (
    <PayrollShell requireAdmin>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/payroll/setup" className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-600 hover:bg-gray-50">
              <ArrowLeft size={14} /> Setup
            </Link>
            <div>
              <h2 className="text-lg font-semibold text-gray-800">Payslip Design</h2>
              <p className="mt-0.5 text-sm text-gray-500">Choose what the printed salary slip shows.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setT(DEFAULT_PAYSLIP_TEMPLATE)} className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">
              <RotateCcw size={14} /> Defaults
            </button>
            <button onClick={() => downloadPayslip(SAMPLE, "Sample Employee", { template: t })} className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">
              <Download size={14} /> Sample PDF
            </button>
            <button onClick={onSave} disabled={saving || !dirty} className="rounded-lg bg-brand-accent px-3.5 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
              {saving ? "Saving…" : "Save Design"}
            </button>
          </div>
        </div>
        {msg && <div className={`rounded-lg px-4 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-600"}`}>{msg.text}</div>}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-400"><Spinner size={16} className="text-brand-accent" /> Loading…</div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,380px)_1fr]">
            {/* ---- Controls ---- */}
            <div className="space-y-4">
              <Card title="Header">
                <Text label="Slip title" value={t.title} onChange={(v) => set("title", v)} />
                <Text label="Company name" value={t.companyName} placeholder={firmName || "From firm profile"} onChange={(v) => set("companyName", v)} />
                <Text label="Address line" value={t.companyAddress} placeholder="From firm profile" onChange={(v) => set("companyAddress", v)} />
                <label className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-xs text-gray-500">Colour</span>
                  <input type="color" value={t.accent} onChange={(e) => set("accent", e.target.value)} className="h-8 w-14 cursor-pointer rounded border border-gray-200" />
                </label>
                <Text label="Note under the header" value={t.headerNote} multiline onChange={(v) => set("headerNote", v)} />
              </Card>
              <Card title="Employee details">
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(PAYSLIP_FIELD_LABELS) as (keyof PayslipTemplate["fields"])[]).map((k) => (
                    <Check key={k} label={PAYSLIP_FIELD_LABELS[k]} checked={t.fields[k]} onChange={(v) => set("fields", { ...t.fields, [k]: v })} />
                  ))}
                </div>
              </Card>
              <Card title="Amounts">
                <Check label="Break earnings into salary / OT / work / one-offs" checked={t.earningsBreakdown} onChange={(v) => set("earningsBreakdown", v)} />
                <Check label="Round net pay to the nearest rupee" checked={t.roundOff} onChange={(v) => set("roundOff", v)} />
                <Check label="Net pay in words" checked={t.amountInWords} onChange={(v) => set("amountInWords", v)} />
              </Card>
              <Card title="Footer">
                <Text label="Signatory" value={t.signatory} onChange={(v) => set("signatory", v)} />
                <Text label="Footer note" value={t.footerNote} multiline onChange={(v) => set("footerNote", v)} />
              </Card>
            </div>

            {/* ---- Preview ---- */}
            <div className="rounded-xl border border-gray-200 bg-gray-100 p-4">
              <div className="mx-auto max-w-[640px] bg-white p-6 text-[12px] text-gray-800 shadow-sm">
                <div className="flex items-start justify-between gap-4 border-b border-gray-200 pb-3">
                  <div>
                    <div className="text-base font-bold" style={{ color: t.accent }}>{t.companyName || firmName || "Your Company"}</div>
                    <div className="text-[10px] text-gray-500">{t.companyAddress || "Address · phone · email from the firm profile"}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold">{t.title || "SALARY SLIP"}</div>
                    <div className="text-[10px] text-gray-500">September 2026</div>
                  </div>
                </div>
                {t.headerNote && <p className="mt-2 whitespace-pre-line text-[11px] text-gray-600">{t.headerNote}</p>}
                <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 border-b border-gray-200 pb-3">
                  <Detail label="Employee" value="Sample Employee" />
                  {shownFields.map((k) => <Detail key={k} label={PAYSLIP_FIELD_LABELS[k]} value={k === "payableDays" ? "29 of 30" : "—"} />)}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <Column title="Earnings" rows={earnings} accent={t.accent} />
                  <Column title="Deductions" rows={deductions} accent={t.accent} />
                </div>
                <div className="mt-3 flex items-center justify-between px-3 py-2 font-bold text-white" style={{ background: t.accent }}>
                  <span>NET PAY</span><span>{inr(net)}</span>
                </div>
                {t.roundOff && <div className="mt-1 text-right text-[10px] text-gray-500">Includes round off of {inr(net - SAMPLE.net)}</div>}
                {t.amountInWords && <div className="mt-2 text-[10px] text-gray-500">Amount in words: <span className="font-semibold text-gray-700">Twenty Six Thousand…</span></div>}
                <div className="mt-6 flex items-end justify-between gap-4 text-[10px] text-gray-500">
                  <span className="max-w-[60%]">{t.footerNote}</span>
                  <span className="border-t border-gray-300 pt-1">{t.signatory}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </PayrollShell>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
      <div className="text-sm font-semibold text-gray-800">{title}</div>
      {children}
    </div>
  );
}

function Text({ label, value, onChange, placeholder, multiline }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; multiline?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-gray-500">{label}</span>
      {multiline ? (
        <textarea rows={2} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="input w-full resize-none" />
      ) : (
        <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="input w-full" />
      )}
    </label>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-brand-accent" />
      {label}
    </label>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="w-24 shrink-0 text-gray-500">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

function Column({ title, rows, accent }: { title: string; rows: [string, number][]; accent: string }) {
  const total = rows.reduce((a, [, v]) => a + v, 0);
  return (
    <div className="border border-gray-200">
      <div className="flex justify-between px-2 py-1 text-[10px] font-bold text-white uppercase" style={{ background: accent }}>
        <span>{title}</span><span>Amount</span>
      </div>
      {rows.map(([n, v]) => (
        <div key={n} className="flex justify-between px-2 py-0.5"><span className="text-gray-600">{n}</span><span>{inr(v)}</span></div>
      ))}
      <div className="flex justify-between border-t border-gray-200 px-2 py-1 font-bold"><span>Total</span><span>{inr(total)}</span></div>
    </div>
  );
}
