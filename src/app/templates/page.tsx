"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Check as CheckIcon, Download, ExternalLink, ImagePlus, Lock, RotateCcw, Trash2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Spinner } from "@/components/Spinner";
import { useAuthStore } from "@/lib/authStore";
import {
  MODULE_LABEL,
  TEMPLATE_KINDS,
  defaultTemplate,
  readImage,
  useDocTemplate,
  type DocKind,
  type DocTemplate,
  type TemplateModule,
} from "@/lib/docTemplates";
import { renderDocPdf } from "@/lib/docPdf";
import { sampleModel } from "@/lib/docModels";
import { downloadPdf } from "@/lib/vyaparExport";
import { LETTER_FIELDS, SAMPLE_LETTER_VALUES, isLetterKind } from "@/lib/letters";
import { printLetter } from "@/lib/letterPrint";

/**
 * Templates — design every PDF the ERP prints, the way Payroll → Payslip Design works for salary
 * slips: settings on the left, the real PDF on the right, redrawn as you type.
 *
 * The left rail lists only the modules this person can open; changing a design needs edit rights on
 * that module (checked again on the server). Nothing saved = the default, which follows the layout of
 * the client's Onsite documents.
 */
export default function TemplatesPage() {
  const user = useAuthStore((s) => s.user);
  const perms = useMemo(() => user?.permissions ?? [], [user]);
  const superAdmin = (user?.role?.name ?? "").toLowerCase() === "super admin";
  const canView = (m: TemplateModule) => superAdmin || perms.includes(`${m}:VIEW`);
  const canEdit = (m: TemplateModule) => superAdmin || perms.includes(`${m}:EDIT`);

  const kinds = TEMPLATE_KINDS.filter((k) => canView(k.module));
  const modules = [...new Set(kinds.map((k) => k.module))];
  const [selected, setSelected] = useState<DocKind | null>(() =>
    typeof window === "undefined" ? null : ((new URLSearchParams(window.location.search).get("kind") as DocKind | null) ?? null),
  );
  const active = kinds.find((k) => k.kind === selected) ?? kinds.find((k) => !k.externalHref) ?? null;

  return (
    <AppShell title="Templates">
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Templates</h2>
          <p className="mt-0.5 text-sm text-gray-500">
            Design the PDFs each module prints — letterhead, colours, which blocks show, terms, signature and stamp.
          </p>
        </div>

        {kinds.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-12 text-center text-sm text-gray-500">
            You don&apos;t have access to any module that prints documents.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[230px_minmax(0,1fr)]">
            {/* Module → document rail */}
            <nav className="h-fit space-y-4 rounded-xl border border-gray-200 bg-white p-3">
              {modules.map((m) => (
                <div key={m}>
                  <div className="mb-1 flex items-center justify-between px-2 text-[11px] font-semibold tracking-wide text-gray-400 uppercase">
                    {MODULE_LABEL[m]}
                    {!canEdit(m) && <Lock size={11} aria-label="View only" />}
                  </div>
                  <ul className="space-y-0.5">
                    {kinds
                      .filter((k) => k.module === m)
                      .map((k) =>
                        k.externalHref ? (
                          <li key={k.kind}>
                            <Link
                              href={k.externalHref}
                              className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                            >
                              {k.label} <ExternalLink size={12} className="text-gray-400" />
                            </Link>
                          </li>
                        ) : (
                          <li key={k.kind}>
                            <button
                              onClick={() => setSelected(k.kind)}
                              className={`w-full rounded-lg px-2 py-1.5 text-left text-sm transition-colors ${
                                active?.kind === k.kind ? "bg-brand-accent/10 font-medium text-brand-accent" : "text-gray-700 hover:bg-gray-50"
                              }`}
                            >
                              {k.label}
                            </button>
                          </li>
                        ),
                      )}
                  </ul>
                </div>
              ))}
            </nav>

            {active && <Designer key={active.kind} kind={active.kind} label={active.label} hint={active.hint} editable={canEdit(active.module)} />}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Designer({ kind, label, hint, editable }: { kind: DocKind; label: string; hint: string; editable: boolean }) {
  const { value, loading, customised, save, reset } = useDocTemplate(kind);
  if (loading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center text-gray-400">
        <Spinner size={18} />
      </div>
    );
  }
  // The form starts from the saved design; it owns its draft from then on.
  return <DesignerForm kind={kind} label={label} hint={hint} editable={editable} value={value} customised={customised} save={save} reset={reset} />;
}

function DesignerForm({
  kind,
  label,
  hint,
  editable,
  value,
  customised,
  save,
  reset,
}: {
  kind: DocKind;
  label: string;
  hint: string;
  editable: boolean;
  value: DocTemplate;
  customised: boolean;
  save: (t: DocTemplate) => Promise<void>;
  reset: () => Promise<void>;
}) {
  const [t, setT] = useState<DocTemplate>(value);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const dirty = JSON.stringify(t) !== JSON.stringify(value);

  const set = (patch: Partial<DocTemplate>) => {
    setSaved(false);
    setT((p) => ({ ...p, ...patch }));
  };
  const setShow = (key: keyof DocTemplate["show"], v: boolean) => set({ show: { ...t.show, [key]: v } });

  async function onSave() {
    setSaving(true);
    try {
      await save(t);
      setSaved(true);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Couldn't save the design.");
    } finally {
      setSaving(false);
    }
  }

  async function onReset() {
    if (!confirm(`Put ${label} back to the default design? Your saved changes go.`)) return;
    try {
      await reset();
      setT(defaultTemplate(kind));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Couldn't reset.");
    }
  }

  const isReport = kind === "REPORT";
  const isLetter = isLetterKind(kind);
  const SHOW_LABELS: [keyof DocTemplate["show"], string][] = isReport
    ? [["pageNumbers", "Page numbers"]]
    : isLetter
      ? [
          ["partyPanel", "\"To\" block (employee)"],
          ["signature", "Signature block"],
          ["pageNumbers", "Page numbers"],
        ]
      : [
        ["partyPanel", "Party / details panels"],
        ["addresses", "Bill To / Ship To"],
        ["hsn", "HSN column"],
        ["tax", "Tax column"],
        ["itemDescription", "Item descriptions"],
        ["totals", "Totals"],
        ["taxSummary", "GST tax summary"],
        ["amountInWords", "Amount in words"],
        ["bank", "Bank details"],
        ["terms", "Terms & conditions"],
        ["signature", "Signature block"],
        ["pageNumbers", "Page numbers"],
      ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-gray-800">{label}</h3>
          <p className="text-xs text-gray-500">
            {hint} · {customised ? "custom design" : "default design (Onsite layout)"}
            {!editable && " · view only — you need edit rights on this module to change it"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {editable && customised && (
            <button onClick={onReset} className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">
              <RotateCcw size={14} /> Defaults
            </button>
          )}
          <SampleButton kind={kind} template={t} />
          {editable && (
            <button
              onClick={onSave}
              disabled={saving || (!dirty && !saved)}
              className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {saved && !dirty ? <CheckIcon size={14} /> : null}
              {saving ? "Saving…" : saved && !dirty ? "Saved" : "Save Design"}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
          <fieldset disabled={!editable} className="min-w-0 space-y-3">
            <Card title="Header">
              {!isReport && <Text label={isLetter ? "Letter heading" : "Document title"} value={t.title} onChange={(v) => set({ title: v })} />}
              <Text label="Company name" value={t.companyName} onChange={(v) => set({ companyName: v })} placeholder="From the firm profile" />
              <Text label="Address" value={t.companyAddress} onChange={(v) => set({ companyAddress: v })} placeholder="From the firm profile" multiline />
              {!isReport && <Text label="Line under the header" value={t.headerNote} onChange={(v) => set({ headerNote: v })} placeholder="e.g. Subject to Rajkot jurisdiction" />}
              <div className="grid grid-cols-2 gap-3">
                {!isReport && (
                  <label className="block">
                    <span className="mb-1 block text-xs text-gray-500">Style</span>
                    <select value={t.style} onChange={(e) => set({ style: e.target.value as DocTemplate["style"] })} className="input">
                      <option value="classic">Classic (Onsite)</option>
                      <option value="band">Colour band</option>
                    </select>
                  </label>
                )}
                <label className="block">
                  <span className="mb-1 block text-xs text-gray-500">Text size</span>
                  <select value={t.fontScale} onChange={(e) => set({ fontScale: e.target.value as DocTemplate["fontScale"] })} className="input">
                    <option value="small">Small</option>
                    <option value="normal">Normal</option>
                    <option value="large">Large</option>
                  </select>
                </label>
              </div>
              <label className="flex items-center justify-between">
                <span className="text-sm text-gray-700">Colour</span>
                <input type="color" value={t.accent} onChange={(e) => set({ accent: e.target.value })} className="h-9 w-16 cursor-pointer rounded border border-gray-200" />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <Check label="Logo" checked={t.showLogo} onChange={(v) => set({ showLogo: v })} />
                <Check label="GSTIN" checked={t.showGstin} onChange={(v) => set({ showGstin: v })} />
                <Check label="Phone & email" checked={t.showContact} onChange={(v) => set({ showContact: v })} />
              </div>
            </Card>

            <Card title="What prints">
              <div className="grid grid-cols-2 gap-2">
                {SHOW_LABELS.map(([k, l]) => (
                  <Check key={k} label={l} checked={t.show[k]} onChange={(v) => setShow(k, v)} />
                ))}
              </div>
            </Card>

            {isLetter && (
              <Card title="Letter wording">
                <Text label="Subject" value={t.subject} onChange={(v) => set({ subject: v })} />
                <Text label="Body" value={t.body} onChange={(v) => set({ body: v })} multiline rows={16} />
                <div>
                  <div className="mb-1 text-xs text-gray-500">Placeholders — filled from the employee when the letter is made</div>
                  <div className="flex flex-wrap gap-1">
                    {LETTER_FIELDS.map((f) => (
                      <span
                        key={f.key}
                        title={f.auto ? `${f.label} — from the payroll profile` : `${f.label} — asked when generating`}
                        className={`rounded px-1.5 py-0.5 font-mono text-[10.5px] ${f.auto ? "bg-cyan-50 text-cyan-800" : "bg-amber-50 text-amber-800"}`}
                      >
                        {`{{${f.key}}}`}
                      </span>
                    ))}
                  </div>
                  <p className="mt-1 text-[11px] text-gray-400">Blue fill in automatically; amber are asked for on the generate screen.</p>
                </div>
              </Card>
            )}

            {!isReport && !isLetter && (
              <Card title="Terms & conditions">
                <Text
                  label="Default terms"
                  value={t.defaultTerms}
                  onChange={(v) => set({ defaultTerms: v })}
                  placeholder="Printed when the document has no terms of its own"
                  multiline
                  rows={5}
                />
              </Card>
            )}

            {!isReport && (
              <Card title="Signature & stamp">
                <Text label="Signatory" value={t.signatory} onChange={(v) => set({ signatory: v })} placeholder="Authorised Signatory" />
                <Check label='"For <company>" above the signature' checked={t.forFirmLine} onChange={(v) => set({ forFirmLine: v })} />
                <ImageSlot label="Signature" hint="PNG with a transparent background looks best" value={t.signatureImage} onChange={(v) => set({ signatureImage: v })} />
                <ImageSlot label="Company stamp / seal" value={t.stampImage} onChange={(v) => set({ stampImage: v })} />
              </Card>
            )}

            <Card title="Footer">
              <Text label="Footer note" value={t.footerNote} onChange={(v) => set({ footerNote: v })} placeholder="From the firm profile" multiline />
            </Card>
          </fieldset>

          <Preview kind={kind} template={t} />
        </div>
    </div>
  );
}

/** The real PDF, drawn from a sample document with the unsaved design, shown in an iframe. */
function Preview({ kind, template }: { kind: DocKind; template: DocTemplate }) {
  const [shown, setShown] = useState<{ key: string; url: string } | null>(null);
  const last = useRef<string | null>(null);
  const key = useMemo(() => kind + JSON.stringify(template), [kind, template]);
  // Busy until the PDF on screen was drawn from exactly this design.
  const busy = shown?.key !== key;
  const url = shown?.url ?? null;

  useEffect(() => {
    let live = true;
    // Redraw shortly after typing stops, not on every key.
    const timer = window.setTimeout(async () => {
      const doc = await buildPreview(kind, template).catch(() => undefined);
      if (!live || !doc) return;
      const next = String(doc.output("bloburl"));
      if (last.current) URL.revokeObjectURL(last.current);
      last.current = next;
      setShown({ key, url: next });
    }, 450);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [kind, template, key]);

  useEffect(() => () => {
    if (last.current) URL.revokeObjectURL(last.current);
  }, []);

  return (
    <div className="relative min-h-[640px] overflow-hidden rounded-xl border border-gray-200 bg-gray-100 xl:sticky xl:top-4 xl:h-[calc(100vh-140px)]">
      {url && <iframe title="Preview" src={`${url}#toolbar=0&navpanes=0&view=FitH`} className="h-full min-h-[640px] w-full" />}
      {busy && (
        <div className="absolute top-3 right-3 flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-xs text-gray-500 shadow">
          <Spinner size={12} /> Updating preview
        </div>
      )}
    </div>
  );
}

async function buildPreview(kind: DocKind, template: DocTemplate) {
  if (isLetterKind(kind)) return printLetter(kind, SAMPLE_LETTER_VALUES, { template });
  if (kind === "REPORT") {
    return (await downloadPdf(
      "Party Statement",
      ["Date", "Type", "Number", "Debit", "Credit", "Balance"],
      [
        ["01-10-2026", "Opening", "", "", "", "Rs. 1,20,000.00"],
        ["03-10-2026", "Purchase", "PB-41", "", "Rs. 2,84,800.00", "Rs. 4,04,800.00"],
        ["12-10-2026", "Payment-Out", "PO-18", "Rs. 2,00,000.00", "", "Rs. 2,04,800.00"],
        ["24-10-2026", "Purchase", "PB-52", "", "Rs. 4,80,183.00", "Rs. 6,84,983.00"],
      ],
      { subtitle: "Shree Nakoda Cement Products", rightAlignFrom: 3, template, preview: true },
    )) as unknown as { output: (t: string) => unknown } | undefined;
  }
  return renderDocPdf(await sampleModel(kind), { template });
}

function SampleButton({ kind, template }: { kind: DocKind; template: DocTemplate }) {
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    try {
      const doc = await buildPreview(kind, template);
      (doc as unknown as { save: (n: string) => void } | undefined)?.save(`${kind.toLowerCase()}-sample.pdf`);
    } finally {
      setBusy(false);
    }
  }
  return (
    <button onClick={run} disabled={busy} className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50">
      <Download size={14} /> {busy ? "Preparing…" : "Sample PDF"}
    </button>
  );
}

function ImageSlot({ label, hint, value, onChange }: { label: string; hint?: string; value: string | null; onChange: (v: string | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div>
      <div className="mb-1 text-xs text-gray-500">{label}</div>
      <div className="flex items-center gap-3">
        <div className="flex h-16 w-32 items-center justify-center overflow-hidden rounded-lg border border-dashed border-gray-300 bg-white">
          {value ? <img src={value} alt="" className="max-h-full max-w-full object-contain" /> : <span className="text-[11px] text-gray-400">None</span>}
        </div>
        <div className="flex flex-col gap-1">
          <input
            ref={input}
            type="file"
            accept="image/png,image/jpeg"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              try {
                onChange(await readImage(f));
              } catch (err) {
                alert(err instanceof Error ? err.message : "Couldn't use that image.");
              }
            }}
          />
          <button type="button" onClick={() => input.current?.click()} className="flex items-center gap-1 text-xs font-medium text-brand-accent hover:underline">
            <ImagePlus size={13} /> {value ? "Change" : "Upload"}
          </button>
          {value && (
            <button type="button" onClick={() => onChange(null)} className="flex items-center gap-1 text-xs text-gray-500 hover:text-rose-600">
              <Trash2 size={12} /> Remove
            </button>
          )}
        </div>
      </div>
      {hint && <p className="mt-1 text-[11px] text-gray-400">{hint}</p>}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
      <h4 className="text-sm font-semibold text-gray-800">{title}</h4>
      {children}
    </section>
  );
}

function Text({
  label,
  value,
  onChange,
  placeholder,
  multiline,
  rows = 2,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-gray-500">{label}</span>
      {multiline ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={rows} className="input resize-y" />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="input" />
      )}
    </label>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-cyan-600" />
      {label}
    </label>
  );
}
