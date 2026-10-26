"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest, getActiveCompanyId } from "./api";

/**
 * Templates — the print design of every PDF the ERP produces.
 *
 * One design per document kind per company, stored on the server as JSON (`/api/v1/templates`) and
 * read by the shared renderer in `docPdf.ts`. A kind with nothing saved prints the built-in default,
 * which follows the layout the client's Onsite documents already use: logo and firm block on the
 * left, the title and number on the right, two grey detail panels, a dark-headed item table, terms,
 * and a signature over "Authorised Signatory".
 */

export type DocKind =
  | "SALE"
  | "SALE_ORDER"
  | "ESTIMATE"
  | "PROFORMA"
  | "DELIVERY_CHALLAN"
  | "SALE_RETURN"
  | "PURCHASE"
  | "PURCHASE_RETURN"
  | "EXPENSE"
  | "REPORT"
  | "PURCHASE_ORDER"
  | "RFQ"
  | "WORK_ORDER"
  | "PAYSLIP";

export type TemplateModule = "VYAPAR" | "PROCUREMENT" | "PAYROLL";

export interface DocTemplate {
  /** classic = Onsite's white letterhead; band = coloured header band (the old invoice look). */
  style: "classic" | "band";
  title: string;
  /** Table header and band colour. */
  accent: string;
  /** Override the firm profile's name / address on this document. Blank = from the firm profile. */
  companyName: string;
  companyAddress: string;
  showLogo: boolean;
  showGstin: boolean;
  showContact: boolean;
  /** Which blocks print. A block the document has no data for is skipped regardless. */
  show: {
    partyPanel: boolean;
    addresses: boolean;
    hsn: boolean;
    tax: boolean;
    itemDescription: boolean;
    taxSummary: boolean;
    totals: boolean;
    amountInWords: boolean;
    bank: boolean;
    terms: boolean;
    signature: boolean;
    pageNumbers: boolean;
  };
  /** Printed when the document itself carries no terms. */
  defaultTerms: string;
  /** A line under the letterhead, e.g. "Subject to Rajkot jurisdiction". */
  headerNote: string;
  footerNote: string;
  signatory: string;
  /** Print "For <firm name>" above the signature. */
  forFirmLine: boolean;
  /** Small data URLs (PNG/JPG). The signature sits over the line; the stamp beside it. */
  signatureImage: string | null;
  stampImage: string | null;
  fontScale: "small" | "normal" | "large";
}

export interface KindInfo {
  kind: DocKind;
  module: TemplateModule;
  label: string;
  hint: string;
  /** Payslip has its own designer (earnings/deductions layout); the page links there. */
  externalHref?: string;
}

export const TEMPLATE_KINDS: KindInfo[] = [
  { kind: "SALE", module: "VYAPAR", label: "Sale Invoice", hint: "GST tax invoice to a customer" },
  { kind: "ESTIMATE", module: "VYAPAR", label: "Estimate / Quotation", hint: "Quotation before the sale" },
  { kind: "PROFORMA", module: "VYAPAR", label: "Proforma Invoice", hint: "Advance invoice" },
  { kind: "SALE_ORDER", module: "VYAPAR", label: "Sale Order", hint: "Order received from a customer" },
  { kind: "DELIVERY_CHALLAN", module: "VYAPAR", label: "Delivery Challan", hint: "Goods sent without a bill" },
  { kind: "SALE_RETURN", module: "VYAPAR", label: "Credit Note", hint: "Sale return" },
  { kind: "PURCHASE", module: "VYAPAR", label: "Purchase Bill", hint: "Supplier bill booked" },
  { kind: "PURCHASE_RETURN", module: "VYAPAR", label: "Debit Note", hint: "Purchase return" },
  { kind: "EXPENSE", module: "VYAPAR", label: "Expense", hint: "Expense voucher" },
  { kind: "REPORT", module: "VYAPAR", label: "Reports & lists", hint: "Ledgers, statements and every exported list" },
  { kind: "PURCHASE_ORDER", module: "PROCUREMENT", label: "Purchase Order", hint: "Order placed on a supplier" },
  { kind: "RFQ", module: "PROCUREMENT", label: "RFQ", hint: "Enquiry sent to suppliers" },
  { kind: "WORK_ORDER", module: "PROCUREMENT", label: "Work Order", hint: "Subcontract order" },
  { kind: "PAYSLIP", module: "PAYROLL", label: "Payslip", hint: "Monthly salary slip", externalHref: "/payroll/setup/payslip" },
];

export const MODULE_LABEL: Record<TemplateModule, string> = {
  VYAPAR: "Vyapar (Accounts)",
  PROCUREMENT: "Procurement",
  PAYROLL: "Payroll",
};

const TITLES: Record<DocKind, string> = {
  SALE: "TAX INVOICE",
  SALE_ORDER: "SALE ORDER",
  ESTIMATE: "QUOTATION",
  PROFORMA: "PROFORMA INVOICE",
  DELIVERY_CHALLAN: "DELIVERY CHALLAN",
  SALE_RETURN: "CREDIT NOTE",
  PURCHASE: "PURCHASE BILL",
  PURCHASE_RETURN: "DEBIT NOTE",
  EXPENSE: "EXPENSE",
  REPORT: "",
  PURCHASE_ORDER: "PURCHASE ORDER",
  RFQ: "RFQ",
  WORK_ORDER: "WORK ORDER",
  PAYSLIP: "SALARY SLIP",
};

/** The default design for a kind — Onsite's layout, in the same dark table header. */
export function defaultTemplate(kind: DocKind): DocTemplate {
  const isRfq = kind === "RFQ";
  return {
    style: "classic",
    title: TITLES[kind],
    accent: "#212529",
    companyName: "",
    companyAddress: "",
    showLogo: true,
    showGstin: true,
    showContact: false,
    show: {
      partyPanel: true,
      addresses: true,
      hsn: true,
      tax: !isRfq,
      itemDescription: true,
      taxSummary: kind === "SALE" || kind === "SALE_RETURN" || kind === "PURCHASE" || kind === "PURCHASE_RETURN",
      totals: !isRfq,
      amountInWords: !isRfq && kind !== "DELIVERY_CHALLAN",
      bank: kind === "SALE" || kind === "PROFORMA" || kind === "ESTIMATE" || kind === "WORK_ORDER",
      terms: true,
      signature: true,
      pageNumbers: true,
    },
    defaultTerms: "",
    headerNote: "",
    footerNote: "",
    signatory: "Authorised Signatory",
    forFirmLine: false,
    signatureImage: null,
    stampImage: null,
    fontScale: "normal",
  };
}

/** Saved JSON laid over the default, so a design saved before a field existed still loads whole. */
export function mergeTemplate(kind: DocKind, saved: Partial<DocTemplate> | null | undefined): DocTemplate {
  const base = defaultTemplate(kind);
  if (!saved) return base;
  return { ...base, ...saved, show: { ...base.show, ...(saved.show ?? {}) } };
}

// ---------------------------------------------------------------- server

interface TemplateRow {
  docKind: string;
  config: string;
  updatedAt: string | null;
}

/** One fetch per company per page load; every PDF on the page reads from it. */
let cache: { company: number | null; rows: Promise<Record<string, Partial<DocTemplate>>> } | null = null;

function loadAll(): Promise<Record<string, Partial<DocTemplate>>> {
  const company = getActiveCompanyId();
  if (cache && cache.company === company) return cache.rows;
  const rows = apiRequest<TemplateRow[]>("/api/v1/templates")
    .then((list) => {
      const out: Record<string, Partial<DocTemplate>> = {};
      for (const r of list ?? []) {
        try {
          out[r.docKind] = JSON.parse(r.config) as Partial<DocTemplate>;
        } catch {
          /* a corrupt row prints the default rather than failing the PDF */
        }
      }
      return out;
    })
    // An older backend without the endpoint, or offline: every document prints its default.
    .catch(() => ({}) as Record<string, Partial<DocTemplate>>);
  cache = { company, rows };
  return rows;
}

export async function getTemplate(kind: DocKind): Promise<DocTemplate> {
  const all = await loadAll();
  return mergeTemplate(kind, all[kind]);
}

/** Which kinds have a saved (non-default) design. */
export async function customisedKinds(): Promise<Set<DocKind>> {
  const all = await loadAll();
  return new Set(Object.keys(all) as DocKind[]);
}

export async function saveTemplate(kind: DocKind, t: DocTemplate): Promise<void> {
  await apiRequest(`/api/v1/templates/${kind}`, { method: "PUT", body: { config: JSON.stringify(t) } });
  cache = null;
}

export async function resetTemplate(kind: DocKind): Promise<void> {
  await apiRequest(`/api/v1/templates/${kind}`, { method: "DELETE" });
  cache = null;
}

/** The design for one kind, with loading state — for the designer and anything previewing it. */
export function useDocTemplate(kind: DocKind) {
  // Tagged with the kind it was loaded for: switching kinds reads as loading until the new one lands.
  const [state, setState] = useState<{ kind: DocKind; value: DocTemplate; customised: boolean } | null>(null);

  useEffect(() => {
    let live = true;
    Promise.all([getTemplate(kind), customisedKinds()]).then(([t, set]) => {
      if (live) setState({ kind, value: t, customised: set.has(kind) });
    });
    return () => {
      live = false;
    };
  }, [kind]);

  const save = useCallback(
    async (next: DocTemplate) => {
      await saveTemplate(kind, next);
      setState({ kind, value: next, customised: true });
    },
    [kind],
  );

  const reset = useCallback(async () => {
    await resetTemplate(kind);
    setState({ kind, value: defaultTemplate(kind), customised: false });
  }, [kind]);

  const loaded = state?.kind === kind ? state : null;
  return {
    value: loaded?.value ?? defaultTemplate(kind),
    loading: !loaded,
    customised: loaded?.customised ?? false,
    save,
    reset,
  };
}

/** Read a picked image file as a data URL, refusing anything too big to keep in a template. */
export function readImage(file: File, maxKb = 300): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) return reject(new Error("Pick an image (PNG or JPG)."));
    if (file.size > maxKb * 1024) return reject(new Error(`Keep it under ${maxKb} KB — crop or compress the image first.`));
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Couldn't read that file."));
    r.readAsDataURL(file);
  });
}
