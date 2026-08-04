"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PayrollShell } from "@/components/payroll/PayrollShell";
import { Spinner } from "@/components/Spinner";
import { Select } from "@/components/Select";
import { inr } from "@/lib/format";
import { getSalaryTemplate, saveSalaryTemplate, ApiError } from "@/lib/api";
import {
  DEFAULT_COMPONENTS, decodeComponents, encodeComponents, basicAmount, componentAmount, CALC_LABEL,
  type SalaryComponent, type ComponentCalc,
} from "@/lib/salaryComponents";
import { ArrowLeft, Check, Coins, Plus, X } from "lucide-react";

const CALCS: ComponentCalc[] = ["CTC", "BASIC", "GROSS", "FLAT"];
/** A sample CTC used only to preview each component's rupee value on this setup screen. */
const PREVIEW_CTC = 30000;

/**
 * Salary Components (Setup) — the org-wide default earnings & deductions every new employee starts
 * with. Editable anytime; existing employees keep their own saved components (overridable on their
 * profile). Persisted as delimited text via the salary-template endpoint.
 */
export default function SalaryComponentsSetupPage() {
  const [components, setComponents] = useState<SalaryComponent[]>(DEFAULT_COMPONENTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getSalaryTemplate()
      .then((t) => {
        const decoded = decodeComponents(t.components);
        if (decoded.length) setComponents(decoded);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const setComp = (i: number, patch: Partial<SalaryComponent>) =>
    setComponents((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const addComp = (kind: SalaryComponent["kind"]) =>
    setComponents((cs) => [...cs, { name: "", kind, calc: kind === "EARNING" ? "CTC" : "FLAT", value: 0, cap: null, threshold: null }]);
  const removeComp = (i: number) => setComponents((cs) => cs.filter((_, j) => j !== i));

  const basic = basicAmount(components, PREVIEW_CTC);

  async function save() {
    setSaving(true);
    setError("");
    try {
      await saveSalaryTemplate(encodeComponents(components) || null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save the template.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PayrollShell requireAdmin>
      <div className="mx-auto max-w-3xl space-y-5">
        <Link href="/payroll/setup" className="inline-flex items-center gap-1 text-sm text-gray-500 transition-colors hover:text-brand-accent">
          <ArrowLeft size={15} /> Back to Setup
        </Link>

        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-cyan-50 text-brand-accent"><Coins size={18} /></div>
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Salary Components</h2>
            <p className="text-sm text-gray-500">The default earnings &amp; deductions new employees inherit. Values can be overridden per employee on their profile.</p>
          </div>
        </div>

        {error && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-400"><Spinner size={16} className="text-brand-accent" /> Loading…</div>
        ) : (
          <div className="space-y-5 rounded-2xl border border-gray-200 bg-white p-5">
            <Group title="Earnings" kind="EARNING" components={components} basic={basic} setComp={setComp} removeComp={removeComp} onAdd={() => addComp("EARNING")} />
            <Group title="Deductions" kind="DEDUCTION" components={components} basic={basic} setComp={setComp} removeComp={removeComp} onAdd={() => addComp("DEDUCTION")} />

            <p className="text-xs text-gray-400">Preview amounts use a sample CTC of {inr(PREVIEW_CTC)}. “Cap” limits the base before the % (e.g. PF 12% of basic capped at ₹15,000); “min gross” only applies the component above that gross (e.g. PT above ₹15,000).</p>

            <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-4">
              {saved && <span className="text-sm font-medium text-emerald-600">Saved</span>}
              <button
                onClick={save}
                disabled={saving}
                className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-4 py-2 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95 disabled:opacity-50"
              >
                <Check size={15} /> {saving ? "Saving…" : "Save default template"}
              </button>
            </div>
          </div>
        )}
      </div>
    </PayrollShell>
  );
}

function Group({
  title, kind, components, basic, setComp, removeComp, onAdd,
}: {
  title: string;
  kind: SalaryComponent["kind"];
  components: SalaryComponent[];
  basic: number;
  setComp: (i: number, patch: Partial<SalaryComponent>) => void;
  removeComp: (i: number) => void;
  onAdd: () => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-800">{title}</span>
        <button type="button" onClick={onAdd} className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-brand-accent transition-colors hover:bg-cyan-50/50">
          <Plus size={13} /> Add {kind === "EARNING" ? "earning" : "deduction"}
        </button>
      </div>
      <div className="space-y-2">
        {components.map((c, i) =>
          c.kind !== kind ? null : (
            <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 p-2">
              <input value={c.name} onChange={(e) => setComp(i, { name: e.target.value })} className="input min-w-[120px] flex-1" placeholder="Component name" />
              <Select value={c.calc} onChange={(v) => setComp(i, { calc: v as ComponentCalc })} size="sm" className="w-32" options={CALCS.map((k) => ({ value: k, label: CALC_LABEL[k] }))} />
              <input type="number" value={c.value} onChange={(e) => setComp(i, { value: Number(e.target.value) })} className="input w-20" placeholder={c.calc === "FLAT" ? "₹" : "%"} />
              {c.calc !== "FLAT" && (
                <input type="number" value={c.cap ?? ""} onChange={(e) => setComp(i, { cap: e.target.value === "" ? null : Number(e.target.value) })} className="input w-24" placeholder="cap ₹" />
              )}
              <input type="number" value={c.threshold ?? ""} onChange={(e) => setComp(i, { threshold: e.target.value === "" ? null : Number(e.target.value) })} className="input w-28" placeholder="min gross" />
              <span className="ml-auto w-20 text-right text-sm font-medium text-gray-700">{inr(Math.round(componentAmount(c, { ctc: PREVIEW_CTC, basic, gross: PREVIEW_CTC })))}</span>
              <button type="button" onClick={() => removeComp(i)} aria-label="Remove component" className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-rose-50 hover:text-rose-600"><X size={15} /></button>
            </div>
          )
        )}
        {components.filter((c) => c.kind === kind).length === 0 && <p className="text-xs text-gray-400">None yet.</p>}
      </div>
    </div>
  );
}
