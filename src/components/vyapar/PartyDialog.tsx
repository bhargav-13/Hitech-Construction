"use client";

import { useState } from "react";
import { Drawer } from "@/components/Drawer";
import { Select } from "@/components/Select";
import { DatePicker } from "@/components/DatePicker";
import * as vyapar from "@/lib/vyaparApi";
import { GST_TYPES, STATES_OF_SUPPLY } from "@/lib/vyaparApi";
import type { Party } from "@/lib/vyaparApi";
import { usePartySettings } from "@/lib/usePartySettings";
import { useVyaparBankId } from "@/lib/bankScope";
import { Info, Plus, X } from "lucide-react";

const TABS = ["GST & Address", "Credit & Balance", "Additional Fields"] as const;
type Tab = (typeof TABS)[number];

/**
 * Add / edit a party — the same three-tab layout Vyapar uses (GST & Address, Credit & Balance,
 * Additional Fields), with the always-visible Name / GSTIN / Phone header row.
 */
export function PartyDialog({
  existing,
  defaultType = "CUSTOMER",
  onClose,
  onSaved,
}: {
  existing?: Party;
  defaultType?: vyapar.PartyType;
  onClose: () => void;
  onSaved: (saved: Party, again: boolean) => void;
}) {
  const { settings } = usePartySettings();
  const bankAccountId = useVyaparBankId();
  const [tab, setTab] = useState<Tab>("GST & Address");

  const [name, setName] = useState(existing?.name ?? "");
  const [gstin, setGstin] = useState(existing?.gstin ?? "");
  const [phone, setPhone] = useState(existing?.phone ?? "");
  const [partyType, setPartyType] = useState<vyapar.PartyType>(existing?.partyType ?? defaultType);

  const [gstType, setGstType] = useState(existing?.gstType ?? GST_TYPES[0]);
  const [state, setState] = useState(existing?.state ?? "");
  const [email, setEmail] = useState(existing?.email ?? "");
  const [billingAddress, setBillingAddress] = useState(existing?.billingAddress ?? "");
  const [shippingAddress, setShippingAddress] = useState(existing?.shippingAddress ?? "");
  const [shipOpen, setShipOpen] = useState(!!existing?.shippingAddress);
  const [partyGroup, setPartyGroup] = useState(existing?.partyGroup ?? "");

  const [openingBalance, setOpeningBalance] = useState(existing?.openingBalance ?? 0);
  const [openingDate, setOpeningDate] = useState(existing?.openingDate ?? new Date().toISOString().slice(0, 10));
  const [limitOn, setLimitOn] = useState(existing?.creditLimit != null);
  const [creditLimit, setCreditLimit] = useState(existing?.creditLimit ?? 0);

  const [f1, setF1] = useState(existing?.field1 ?? "");
  const [f2, setF2] = useState(existing?.field2 ?? "");
  const [f3, setF3] = useState(existing?.field3 ?? "");
  const [f4, setF4] = useState(existing?.field4 ?? "");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(again: boolean) {
    if (!name.trim()) {
      setError("Party name is required.");
      setTab("GST & Address");
      return;
    }
    setSaving(true);
    setError("");
    const body: Partial<Party> = {
      name: name.trim(),
      bankAccountId: existing ? existing.bankAccountId : bankAccountId ?? null,
      partyType,
      gstin: gstin.trim() || null,
      gstType,
      phone: phone.trim() || null,
      email: email.trim() || null,
      state: state || null,
      billingAddress: billingAddress.trim() || null,
      shippingAddress: shipOpen ? shippingAddress.trim() || null : null,
      partyGroup: partyGroup || null,
      openingBalance: Number(openingBalance) || 0,
      openingDate,
      creditLimit: limitOn ? Number(creditLimit) || 0 : null,
      field1: f1 || null,
      field2: f2 || null,
      field3: f3 || null,
      field4: f4 || null,
    };
    try {
      const saved = existing ? await vyapar.updateParty(existing.id, body) : await vyapar.createParty(body);
      onSaved(saved, again);
      if (again) {
        // "Save & New" keeps the dialog open with a clean form.
        setName(""); setGstin(""); setPhone(""); setEmail("");
        setBillingAddress(""); setShippingAddress(""); setOpeningBalance(0);
        setF1(""); setF2(""); setF3(""); setF4("");
        setTab("GST & Address");
        setSaving(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save this party.");
      setSaving(false);
    }
  }

  return (
    <Drawer
      title={existing ? "Edit Party" : "Add Party"}
      onClose={onClose}
      onSave={() => submit(false)}
      saveLabel={saving ? "Saving…" : "Save"}
      width="max-w-3xl"
    >
      <div className="space-y-5">
        {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}

        {/* Always-visible header row */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Party Name" required>
            <input value={name} onChange={(e) => setName(e.target.value)} className="input" autoFocus />
          </Field>
          <Field label="GSTIN" hint="15-character GST number; we prefill state from it">
            <input
              value={gstin}
              onChange={(e) => {
                const v = e.target.value.toUpperCase();
                setGstin(v);
                // GSTIN's first two digits are the state code — infer the state for the user.
                const st = STATE_BY_GST_CODE[v.slice(0, 2)];
                if (st && !state) setState(st);
                if (v.length === 15 && gstType === GST_TYPES[0]) setGstType(GST_TYPES[1]);
              }}
              placeholder="24ABCDE1234F1Z5"
              maxLength={15}
              className="input font-mono uppercase"
            />
          </Field>
          <Field label="Phone Number">
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className="input" />
          </Field>
        </div>

        {/* Tabs */}
        <div className="flex gap-5 border-b border-gray-200">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`relative -mb-px px-0.5 pb-2.5 text-sm font-medium whitespace-nowrap transition-colors duration-150 ${
                tab === t ? "text-brand-accent" : "text-gray-500 hover:text-gray-800"
              }`}
            >
              {t}
              <span
                className={`absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-brand-accent transition-all duration-200 ${
                  tab === t ? "opacity-100" : "opacity-0"
                }`}
              />
            </button>
          ))}
        </div>

        {tab === "GST & Address" && (
          <div className="animate-fade-in grid grid-cols-1 gap-5 lg:grid-cols-3">
            <div className="space-y-3">
              <Field label="Party Type">
                <Select
                  value={partyType}
                  onChange={(v) => setPartyType(v as vyapar.PartyType)}
                  options={[
                    { value: "CUSTOMER", label: "Customer" },
                    { value: "SUPPLIER", label: "Supplier" },
                  ]}
                />
              </Field>
              <Field label="GST Type">
                <Select value={gstType} onChange={setGstType} options={GST_TYPES.map((g) => ({ value: g, label: g }))} />
              </Field>
              <Field label="State">
                <Select
                  value={state}
                  onChange={setState}
                  placeholder="Select state"
                  options={[{ value: "", label: "Select state" }, ...STATES_OF_SUPPLY.map((s) => ({ value: s, label: s }))]}
                />
              </Field>
              <Field label="Email ID">
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" />
              </Field>
              {settings.partyGrouping && (
                <Field label="Party Group">
                  <input
                    value={partyGroup}
                    onChange={(e) => setPartyGroup(e.target.value)}
                    placeholder="e.g. Wholesale"
                    className="input"
                  />
                </Field>
              )}
            </div>

            <div>
              <Field label="Billing Address">
                <textarea
                  value={billingAddress}
                  onChange={(e) => setBillingAddress(e.target.value)}
                  rows={5}
                  className="input resize-none"
                />
              </Field>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[11px] font-medium tracking-wide text-gray-400 uppercase">Shipping Address</span>
                {shipOpen && (
                  <button
                    onClick={() => {
                      setShipOpen(false);
                      setShippingAddress("");
                    }}
                    className="text-gray-300 transition-colors duration-150 hover:text-rose-600"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
              {shipOpen ? (
                <>
                  <textarea
                    value={shippingAddress}
                    onChange={(e) => setShippingAddress(e.target.value)}
                    rows={5}
                    className="input resize-none"
                  />
                  <button
                    onClick={() => setShippingAddress(billingAddress)}
                    className="mt-1.5 text-xs font-medium text-brand-accent transition-colors duration-150 hover:underline"
                  >
                    Same as billing address
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setShipOpen(true)}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-300 py-6 text-sm font-medium text-brand-accent transition-all duration-150 hover:border-brand-accent hover:bg-cyan-50/40"
                >
                  <Plus size={14} /> Enable Shipping Address
                </button>
              )}
            </div>
          </div>
        )}

        {tab === "Credit & Balance" && (
          <div className="animate-fade-in max-w-xl space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Opening Balance" hint="What this party already owed when you started">
                <input
                  type="number"
                  value={openingBalance}
                  onChange={(e) => setOpeningBalance(Number(e.target.value))}
                  className="input"
                />
              </Field>
              <Field label="As Of Date">
                <DatePicker value={openingDate} onChange={setOpeningDate} placeholder="As of date" />
              </Field>
            </div>
            <p className="text-xs text-gray-400">
              Positive means the party owes you (receivable); negative means you owe them.
            </p>

            <div>
              <div className="mb-2 flex items-center gap-1.5">
                <span className="text-sm font-medium text-gray-700">Credit Limit</span>
                <Info size={12} className="text-gray-300" />
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-sm ${!limitOn ? "font-medium text-brand-accent" : "text-gray-400"}`}>No Limit</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={limitOn}
                  onClick={() => setLimitOn((v) => !v)}
                  className={`relative h-6 w-11 rounded-full transition-colors duration-200 ${limitOn ? "bg-brand-accent" : "bg-gray-200"}`}
                >
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-200 ${limitOn ? "left-[22px]" : "left-0.5"}`} />
                </button>
                <span className={`text-sm ${limitOn ? "font-medium text-brand-accent" : "text-gray-400"}`}>Custom Limit</span>
              </div>
              {limitOn && (
                <div className="animate-fade-in mt-3 max-w-xs">
                  <Field label="Limit Amount">
                    <input
                      type="number"
                      value={creditLimit}
                      onChange={(e) => setCreditLimit(Number(e.target.value))}
                      className="input"
                    />
                  </Field>
                  <p className="mt-1 text-xs text-gray-400">
                    We&apos;ll warn on a new sale once this party&apos;s balance would cross the limit.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "Additional Fields" && (
          <div className="animate-fade-in max-w-xl space-y-3">
            <p className="text-xs text-gray-500">
              Extra details you want on every party. Rename these in{" "}
              <span className="font-medium text-gray-700">Party Settings</span>.
            </p>
            {[
              { label: settings.fieldNames[0] || "Additional Field 1", value: f1, set: setF1, date: false },
              { label: settings.fieldNames[1] || "Additional Field 2", value: f2, set: setF2, date: false },
              { label: settings.fieldNames[2] || "Additional Field 3", value: f3, set: setF3, date: false },
              { label: settings.fieldNames[3] || "Additional Field 4", value: f4, set: setF4, date: true },
            ].map((f, i) =>
              settings.fieldsEnabled[i] ? (
                <Field key={i} label={f.label}>
                  {f.date ? (
                    <DatePicker value={f.value} onChange={f.set} placeholder={f.label} />
                  ) : (
                    <input value={f.value} onChange={(e) => f.set(e.target.value)} className="input" />
                  )}
                </Field>
              ) : null
            )}
            {settings.fieldsEnabled.every((e) => !e) && (
              <div className="rounded-lg border border-dashed border-gray-300 py-8 text-center text-sm text-gray-400">
                No additional fields enabled yet — turn them on in Party Settings.
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
          <button
            onClick={() => submit(true)}
            disabled={saving}
            className="rounded-lg border border-brand-accent px-4 py-2 text-sm font-medium text-brand-accent transition-all duration-150 hover:bg-cyan-50 active:scale-95 disabled:opacity-60"
          >
            Save &amp; New
          </button>
        </div>
      </div>
    </Drawer>
  );
}

/** GSTIN state-code prefix → state, so entering a GSTIN fills the state automatically. */
const STATE_BY_GST_CODE: Record<string, string> = {
  "03": "Punjab", "06": "Haryana", "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh",
  "10": "Bihar", "19": "West Bengal", "20": "Jharkhand", "21": "Odisha", "22": "Chhattisgarh",
  "23": "Madhya Pradesh", "24": "Gujarat", "27": "Maharashtra", "29": "Karnataka", "32": "Kerala",
  "33": "Tamil Nadu", "36": "Telangana", "37": "Andhra Pradesh", "05": "Uttarakhand", "02": "Himachal Pradesh",
  "30": "Goa", "18": "Assam",
};

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-1 text-[11px] font-medium tracking-wide text-gray-400 uppercase">
        {label}
        {required && <span className="text-rose-500">*</span>}
        {hint && <Info size={11} className="text-gray-300" aria-label={hint} />}
      </span>
      {children}
    </label>
  );
}
