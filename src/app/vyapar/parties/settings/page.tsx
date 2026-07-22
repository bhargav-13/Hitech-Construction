"use client";

import { VyaparShell } from "@/components/vyapar/VyaparShell";
import { usePartySettings, DEFAULT_PARTY_SETTINGS } from "@/lib/usePartySettings";
import { Info, RotateCcw } from "lucide-react";

/** Settings → Party, matching Vyapar's page (minus loyalty points, which we don't use). */
export default function PartySettingsPage() {
  const { settings, patch, save } = usePartySettings();

  const setField = <K extends "fieldsEnabled" | "fieldsInPrint">(key: K, i: number, v: boolean) => {
    const next = [...settings[key]] as [boolean, boolean, boolean, boolean];
    next[i] = v;
    patch({ [key]: next } as never);
  };
  const setName = (i: number, v: string) => {
    const next = [...settings.fieldNames] as [string, string, string, string];
    next[i] = v;
    patch({ fieldNames: next });
  };

  return (
    <VyaparShell>
      <div className="animate-fade-in space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-gray-800">Party Settings</h2>
            <p className="mt-0.5 text-sm text-gray-500">Controls which fields and behaviours the party module offers.</p>
          </div>
          <button
            onClick={() => save(DEFAULT_PARTY_SETTINGS)}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition-all duration-150 hover:bg-gray-50 active:scale-95"
          >
            <RotateCcw size={14} /> Reset to defaults
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* General */}
          <section className="rounded-xl border border-gray-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-semibold text-gray-800">General</h3>
            <div className="space-y-1">
              <Toggle
                label="Party Grouping"
                hint="Group parties (Wholesale, Retail…) and filter the list by group."
                checked={settings.partyGrouping}
                onChange={(v) => patch({ partyGrouping: v })}
              />
              <Toggle
                label="Shipping Address"
                hint="Offer a separate delivery address on each party."
                checked={settings.shippingAddress}
                onChange={(v) => patch({ shippingAddress: v })}
              />
              <Toggle
                label="Manage Party Status"
                hint="Mark parties active or inactive without deleting them."
                checked={settings.managePartyStatus}
                onChange={(v) => patch({ managePartyStatus: v })}
              />
            </div>
          </section>

          {/* Payment reminder */}
          <section className="rounded-xl border border-gray-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-semibold text-gray-800">Payment Reminder</h3>
            <Toggle
              label="Enable Payment Reminder"
              hint="Flag parties whose payment is overdue."
              checked={settings.paymentReminder}
              onChange={(v) => patch({ paymentReminder: v })}
            />
            {settings.paymentReminder && (
              <div className="animate-fade-in mt-3 space-y-3">
                <label className="flex items-center gap-2 text-sm text-gray-600">
                  Remind me for payment due in
                  <input
                    type="number"
                    min={0}
                    value={settings.reminderDays}
                    onChange={(e) => patch({ reminderDays: Math.max(0, Number(e.target.value) || 0) })}
                    className="w-20 rounded-lg border border-gray-200 px-2 py-1 text-sm outline-none focus:border-cyan-500"
                  />
                  days
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-medium tracking-wide text-gray-400 uppercase">
                    Reminder Message
                  </span>
                  <textarea
                    value={settings.reminderMessage}
                    onChange={(e) => patch({ reminderMessage: e.target.value })}
                    rows={3}
                    className="input resize-none"
                  />
                  <span className="mt-1 block text-xs text-gray-400">
                    Placeholders: <code className="rounded bg-gray-100 px-1">{"{party}"}</code>{" "}
                    <code className="rounded bg-gray-100 px-1">{"{amount}"}</code>{" "}
                    <code className="rounded bg-gray-100 px-1">{"{invoice}"}</code>
                  </span>
                </label>
              </div>
            )}
          </section>

          {/* Additional fields */}
          <section className="rounded-xl border border-gray-200 bg-white p-4 lg:col-span-2">
            <div className="mb-1 flex items-center gap-1.5">
              <h3 className="text-sm font-semibold text-gray-800">Additional Fields</h3>
              <Info size={12} className="text-gray-300" />
            </div>
            <p className="mb-3 text-xs text-gray-500">
              Four extra fields you can capture per party. The fourth is a date. Name them here and they appear on the
              party form and detail card.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={`rounded-lg border p-3 transition-colors duration-150 ${
                    settings.fieldsEnabled[i] ? "border-cyan-200 bg-cyan-50/30" : "border-gray-200"
                  }`}
                >
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={settings.fieldsEnabled[i]}
                      onChange={(e) => setField("fieldsEnabled", i, e.target.checked)}
                      className="h-4 w-4 accent-cyan-600"
                    />
                    <input
                      value={settings.fieldNames[i]}
                      onChange={(e) => setName(i, e.target.value)}
                      placeholder={`Additional Field ${i + 1}${i === 3 ? " (date)" : ""}`}
                      disabled={!settings.fieldsEnabled[i]}
                      className="w-full rounded-md border border-gray-200 px-2 py-1 text-sm outline-none focus:border-cyan-500 disabled:bg-gray-50 disabled:text-gray-400"
                    />
                  </label>
                  <label className="mt-2 flex items-center justify-between pl-6 text-xs text-gray-500">
                    Show in print
                    <button
                      type="button"
                      role="switch"
                      aria-checked={settings.fieldsInPrint[i]}
                      disabled={!settings.fieldsEnabled[i]}
                      onClick={() => setField("fieldsInPrint", i, !settings.fieldsInPrint[i])}
                      className={`relative h-5 w-9 rounded-full transition-colors duration-200 disabled:opacity-40 ${
                        settings.fieldsInPrint[i] ? "bg-brand-accent" : "bg-gray-200"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all duration-200 ${
                          settings.fieldsInPrint[i] ? "left-[18px]" : "left-0.5"
                        }`}
                      />
                    </button>
                  </label>
                </div>
              ))}
            </div>
          </section>
        </div>

        <p className="text-xs text-gray-400">
          Saved on this device for now — these move to your company profile when the settings API lands.
        </p>
      </div>
    </VyaparShell>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg px-1 py-2 transition-colors duration-150 hover:bg-gray-50">
      <div className="min-w-0">
        <div className="text-sm text-gray-700">{label}</div>
        {hint && <div className="mt-0.5 text-xs text-gray-400">{hint}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${
          checked ? "bg-brand-accent" : "bg-gray-200"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-200 ${
            checked ? "left-[22px]" : "left-0.5"
          }`}
        />
      </button>
    </div>
  );
}
