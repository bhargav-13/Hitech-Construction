/**
 * Org-wide payroll settings kept server-side as raw JSON text (payroll_settings): the payslip
 * template, custom staff field definitions and TDS tax profiles. Each has a typed shape, a default,
 * and a forgiving parser — a malformed or older value falls back to the defaults field by field.
 */

import { useCallback, useEffect, useState } from "react";
import { getPayrollSetting, savePayrollSetting } from "./api";
import type { PayrollSettingKey } from "./api";

// ---------------- Payslip template ----------------

export interface PayslipTemplate {
  title: string;
  /** Overrides the firm profile's name / address on the letterhead when set. */
  companyName: string;
  companyAddress: string;
  /** Header bands and net-pay band colour. */
  accent: string;
  headerNote: string;
  footerNote: string;
  signatory: string;
  /** Employee block. */
  fields: {
    staffCode: boolean;
    designation: boolean;
    department: boolean;
    joiningDate: boolean;
    payableDays: boolean;
    pan: boolean;
    uan: boolean;
    bank: boolean;
    ifsc: boolean;
  };
  /** Earnings column lists salary / overtime / piece work / one-offs instead of one gross line. */
  earningsBreakdown: boolean;
  amountInWords: boolean;
  /** Show net pay rounded to the nearest rupee, with the round-off line. */
  roundOff: boolean;
}

export const DEFAULT_PAYSLIP_TEMPLATE: PayslipTemplate = {
  title: "SALARY SLIP",
  companyName: "",
  companyAddress: "",
  accent: "#0e2a47",
  headerNote: "",
  footerNote: "This is a computer-generated salary slip and does not require a signature.",
  signatory: "Authorised Signatory",
  fields: {
    staffCode: true, designation: true, department: true, joiningDate: true, payableDays: true,
    pan: true, uan: false, bank: true, ifsc: true,
  },
  earningsBreakdown: true,
  amountInWords: true,
  roundOff: false,
};

export const PAYSLIP_FIELD_LABELS: Record<keyof PayslipTemplate["fields"], string> = {
  staffCode: "Staff ID",
  designation: "Designation",
  department: "Department",
  joiningDate: "Date of joining",
  payableDays: "Payable days",
  pan: "PAN",
  uan: "UAN",
  bank: "Bank A/c",
  ifsc: "IFSC",
};

function parsePayslipTemplate(raw: string | null): PayslipTemplate {
  const v = safeJson<Partial<PayslipTemplate>>(raw);
  if (!v || typeof v !== "object") return DEFAULT_PAYSLIP_TEMPLATE;
  return {
    ...DEFAULT_PAYSLIP_TEMPLATE,
    ...v,
    fields: { ...DEFAULT_PAYSLIP_TEMPLATE.fields, ...(v.fields ?? {}) },
  };
}

// ---------------- Custom staff fields ----------------

export type CustomFieldType = "TEXT" | "NUMBER" | "DATE" | "DROPDOWN";
export interface CustomFieldDef {
  id: string;
  label: string;
  type: CustomFieldType;
  /** DROPDOWN choices. */
  options: string[];
}

function parseCustomFields(raw: string | null): CustomFieldDef[] {
  const v = safeJson<CustomFieldDef[]>(raw);
  return Array.isArray(v)
    ? v.filter((f) => f && f.id && f.label).map((f) => ({ ...f, options: Array.isArray(f.options) ? f.options : [] }))
    : [];
}

/** A profile's custom field values, {fieldId: value}. */
export function parseCustomValues(raw: string | null | undefined): Record<string, string> {
  const v = safeJson<Record<string, string>>(raw ?? null);
  return v && typeof v === "object" && !Array.isArray(v) ? v : {};
}

// ---------------- Tax profiles ----------------

export interface TaxProfileDef {
  id: string;
  profileName: string;
  description: string;
  pan: string;
  tan: string;
  tdsCircle: string;
  deductorType: "EMPLOYEE" | "NON_EMPLOYEE";
  deductorName: string;
  fatherName: string;
}

function parseTaxProfiles(raw: string | null): TaxProfileDef[] {
  const v = safeJson<TaxProfileDef[]>(raw);
  return Array.isArray(v) ? v.filter((t) => t && t.id) : [];
}

// ---------------- Plumbing ----------------

function safeJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function newId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

const PARSERS = {
  PAYSLIP_TEMPLATE: parsePayslipTemplate,
  CUSTOM_FIELDS: parseCustomFields,
  TAX_PROFILES: parseTaxProfiles,
} as const;

type ValueOf<K extends PayrollSettingKey> = ReturnType<(typeof PARSERS)[K]>;

/** One fetch per key per page load — the payslip download reads the template on every click. */
const cache = new Map<PayrollSettingKey, Promise<unknown>>();

export function loadPayrollSetting<K extends PayrollSettingKey>(key: K): Promise<ValueOf<K>> {
  let p = cache.get(key);
  if (!p) {
    p = getPayrollSetting(key)
      .then((r) => PARSERS[key](r.value))
      .catch(() => {
        cache.delete(key);
        return PARSERS[key](null);
      });
    cache.set(key, p);
  }
  return p as Promise<ValueOf<K>>;
}

export function usePayrollSetting<K extends PayrollSettingKey>(key: K) {
  const [value, setValue] = useState<ValueOf<K>>(() => PARSERS[key](null) as ValueOf<K>);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    loadPayrollSetting(key).then((v) => {
      if (!cancelled) {
        setValue(v);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [key]);

  const save = useCallback(
    async (next: ValueOf<K>) => {
      const r = await savePayrollSetting(key, JSON.stringify(next));
      const parsed = PARSERS[key](r.value) as ValueOf<K>;
      cache.set(key, Promise.resolve(parsed));
      setValue(parsed);
      return parsed;
    },
    [key],
  );

  return { value, loading, save };
}
