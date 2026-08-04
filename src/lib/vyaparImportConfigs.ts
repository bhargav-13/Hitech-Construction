/**
 * Per-entity import configs for the generic {@link import("@/components/vyapar/ImportDialog").ImportDialog}.
 * Each covers one flat/master Vyapar record type — column targets, header auto-detection, a starter
 * template, the preview columns and how to persist the parsed rows (bulk endpoint where one exists,
 * otherwise a one-by-one create fallback).
 */

import * as vyapar from "./vyaparApi";
import type { DocType } from "./vyaparApi";
import type { ImportConfig } from "@/components/vyapar/ImportDialog";

const has = (h: string, ...needles: string[]) => needles.some((n) => h.includes(n));
const norm = (header: string) => header.toLowerCase().replace(/[^a-z]/g, "");

// ---- Parties ----
export const partyImportConfig: ImportConfig = {
  title: "Import Parties from Excel",
  entityNoun: "parties",
  requiredKey: "name",
  requiredLabel: "Party Name",
  base: { partyType: "CUSTOMER" },
  fields: [
    { key: "name", label: "Party Name *" },
    { key: "partyType", label: "Party Type (Customer/Supplier)" },
    { key: "phone", label: "Phone Number" },
    { key: "email", label: "Email" },
    { key: "gstin", label: "GSTIN" },
    { key: "gstType", label: "GST Type" },
    { key: "state", label: "State" },
    { key: "billingAddress", label: "Billing Address" },
    { key: "shippingAddress", label: "Shipping Address" },
    { key: "partyGroup", label: "Party Group" },
    { key: "openingBalance", label: "Opening Balance", numeric: true },
    { key: "creditLimit", label: "Credit Limit", numeric: true },
  ],
  guess: (header) => {
    const h = norm(header);
    if (has(h, "partyname", "customer", "supplier") || h === "name") return "name";
    if (h.includes("type")) return "partyType";
    if (has(h, "phone", "mobile", "contact")) return "phone";
    if (h.includes("email")) return "email";
    if (h.includes("gstin") || h === "gst") return "gstin";
    if (h.includes("gsttype")) return "gstType";
    if (h.includes("state")) return "state";
    if (h.includes("shipping")) return "shippingAddress";
    if (has(h, "address", "billing")) return "billingAddress";
    if (h.includes("group")) return "partyGroup";
    if (has(h, "opening", "balance")) return "openingBalance";
    if (has(h, "credit", "limit")) return "creditLimit";
    return "skip";
  },
  coerce: (key, value) => (key === "partyType" ? (/supp|vendor/i.test(value) ? "SUPPLIER" : "CUSTOMER") : undefined),
  template: {
    name: "party-import-template",
    head: ["Party Name", "Party Type", "Phone Number", "Email", "GSTIN", "State", "Billing Address", "Opening Balance"],
    row: ["Acme Traders", "Customer", "9876543210", "acme@example.com", "24ABCDE1234F1Z5", "Gujarat", "Rajkot", "0"],
  },
  preview: [
    { key: "name", label: "Name" },
    { key: "partyType", label: "Type", render: (v) => (/supp|vendor/i.test(v ?? "") ? "Supplier" : "Customer") },
    { key: "phone", label: "Phone" },
    { key: "gstin", label: "GSTIN" },
    { key: "openingBalance", label: "Opening", align: "right", render: (v) => v ?? "0" },
  ],
  commit: async (records) => {
    const rows = records as Partial<vyapar.Party>[];
    try {
      return (await vyapar.importParties(rows)).length;
    } catch {
      let created = 0;
      for (const r of rows) {
        await vyapar.createParty(r);
        created++;
      }
      return created;
    }
  },
};

// ---- Items ----
export const itemImportConfig: ImportConfig = {
  title: "Import Items from Excel",
  entityNoun: "items",
  requiredKey: "name",
  requiredLabel: "Item Name",
  base: { unit: "NONE", isService: false },
  fields: [
    { key: "name", label: "Item Name *" },
    { key: "itemCode", label: "Item Code" },
    { key: "hsn", label: "HSN / SAC" },
    { key: "category", label: "Category" },
    { key: "unit", label: "Unit" },
    { key: "salePrice", label: "Sale Price", numeric: true },
    { key: "purchasePrice", label: "Purchase Price", numeric: true },
    { key: "taxPercent", label: "Tax %", numeric: true },
    { key: "openingQty", label: "Opening Quantity", numeric: true },
    { key: "lowStockAlert", label: "Min Stock", numeric: true },
    { key: "location", label: "Location" },
    { key: "description", label: "Description" },
  ],
  guess: (header) => {
    const h = norm(header);
    if (has(h, "itemname") || h === "name" || h === "item") return "name";
    if (has(h, "code", "barcode")) return "itemCode";
    if (has(h, "hsn", "sac")) return "hsn";
    if (h.includes("categ")) return "category";
    if (h.includes("unit")) return "unit";
    if (h.includes("saleprice") || h === "mrp" || h === "price") return "salePrice";
    if (has(h, "purchase", "cost")) return "purchasePrice";
    if (has(h, "tax", "gst")) return "taxPercent";
    if (has(h, "opening", "qty", "stock")) return "openingQty";
    if (h.includes("min")) return "lowStockAlert";
    if (has(h, "location", "rack")) return "location";
    if (h.includes("desc")) return "description";
    return "skip";
  },
  template: {
    name: "item-import-template",
    head: ["Item Name", "Item Code", "HSN", "Category", "Unit", "Sale Price", "Purchase Price", "Tax %", "Opening Quantity", "Min Stock"],
    row: ["TMT Bar 12mm", "ITM001", "7214", "Steel", "KG", "62", "55", "18", "1200", "200"],
  },
  preview: [
    { key: "name", label: "Name" },
    { key: "itemCode", label: "Code" },
    { key: "unit", label: "Unit" },
    { key: "salePrice", label: "Sale", align: "right", render: (v) => v ?? "0" },
    { key: "openingQty", label: "Qty", align: "right", render: (v) => v ?? "0" },
  ],
  commit: async (records) => {
    const rows = records as Partial<vyapar.Item>[];
    try {
      return (await vyapar.importItems(rows)).length;
    } catch {
      let created = 0;
      for (const r of rows) {
        await vyapar.createItem(r);
        created++;
      }
      return created;
    }
  },
};

// ---- Bank accounts (global — not scoped) ----
export const bankAccountImportConfig: ImportConfig = {
  title: "Import Bank Accounts from Excel",
  entityNoun: "bank accounts",
  requiredKey: "name",
  requiredLabel: "Account Name",
  base: { isActive: true },
  fields: [
    { key: "name", label: "Account Name *" },
    { key: "bankName", label: "Bank Name" },
    { key: "accountNumber", label: "Account Number" },
    { key: "ifsc", label: "IFSC Code" },
    { key: "accountHolder", label: "Account Holder" },
    { key: "upiId", label: "UPI ID" },
    { key: "openingBalance", label: "Opening Balance", numeric: true },
  ],
  guess: (header) => {
    const h = norm(header);
    if (has(h, "accountname", "displayname") || h === "name" || h === "account") return "name";
    if (has(h, "bankname", "bank")) return "bankName";
    if (has(h, "accountnumber", "accountno", "acno")) return "accountNumber";
    if (h.includes("ifsc")) return "ifsc";
    if (has(h, "holder", "beneficiary")) return "accountHolder";
    if (h.includes("upi")) return "upiId";
    if (has(h, "opening", "balance")) return "openingBalance";
    return "skip";
  },
  template: {
    name: "bank-account-import-template",
    head: ["Account Name", "Bank Name", "Account Number", "IFSC Code", "Account Holder", "UPI ID", "Opening Balance"],
    row: ["Current A/c", "HDFC Bank", "50100123456789", "HDFC0001234", "Hi-Tech Construction", "hitech@okhdfc", "0"],
  },
  preview: [
    { key: "name", label: "Account" },
    { key: "bankName", label: "Bank" },
    { key: "accountNumber", label: "A/c No." },
    { key: "openingBalance", label: "Opening", align: "right", render: (v) => v ?? "0" },
  ],
  commit: async (records) => {
    const rows = records as Partial<vyapar.BankAccount>[];
    let created = 0;
    for (const r of rows) {
      await vyapar.createBankAccount(r);
      created++;
    }
    return created;
  },
};

// ---- Loan accounts (global — not scoped) ----
export const loanAccountImportConfig: ImportConfig = {
  title: "Import Loan Accounts from Excel",
  entityNoun: "loan accounts",
  requiredKey: "name",
  requiredLabel: "Loan Name",
  fields: [
    { key: "name", label: "Loan Name *" },
    { key: "lender", label: "Lender" },
    { key: "accountNumber", label: "Account Number" },
    { key: "loanAmount", label: "Loan Amount", numeric: true },
    { key: "balance", label: "Current Balance", numeric: true },
    { key: "interestRate", label: "Interest Rate %", numeric: true },
    { key: "termMonths", label: "Term (Months)", numeric: true },
    { key: "emiAmount", label: "EMI Amount", numeric: true },
    { key: "startDate", label: "Start Date" },
  ],
  guess: (header) => {
    const h = norm(header);
    if (has(h, "loanname") || h === "name" || h === "loan") return "name";
    if (has(h, "lender", "bank", "financier")) return "lender";
    if (has(h, "accountnumber", "accountno", "acno")) return "accountNumber";
    if (has(h, "loanamount", "principal", "sanction")) return "loanAmount";
    if (h.includes("balance") || h.includes("outstanding")) return "balance";
    if (has(h, "interest", "rate")) return "interestRate";
    if (has(h, "term", "tenure", "months")) return "termMonths";
    if (h.includes("emi")) return "emiAmount";
    if (has(h, "start", "date")) return "startDate";
    return "skip";
  },
  template: {
    name: "loan-account-import-template",
    head: ["Loan Name", "Lender", "Account Number", "Loan Amount", "Current Balance", "Interest Rate %", "Term (Months)", "EMI Amount", "Start Date"],
    row: ["Excavator Loan", "ICICI Bank", "LN0098765", "2500000", "1800000", "11", "60", "54000", "2024-04-01"],
  },
  preview: [
    { key: "name", label: "Loan" },
    { key: "lender", label: "Lender" },
    { key: "loanAmount", label: "Amount", align: "right", render: (v) => v ?? "0" },
    { key: "balance", label: "Balance", align: "right", render: (v) => v ?? "0" },
    { key: "emiAmount", label: "EMI", align: "right", render: (v) => v ?? "0" },
  ],
  commit: async (records) => {
    const rows = records as Partial<vyapar.LoanAccount>[];
    let created = 0;
    for (const r of rows) {
      await vyapar.createLoanAccount(r);
      created++;
    }
    return created;
  },
};

/** Payment fields shared by the in/out importers. */
function paymentImportConfig(direction: "IN" | "OUT"): ImportConfig {
  const inbound = direction === "IN";
  return {
    title: `Import ${inbound ? "Payment-In" : "Payment-Out"} from Excel`,
    entityNoun: "payments",
    requiredKey: "amount",
    requiredLabel: "Amount",
    scoped: true,
    base: { direction, mode: "Cash" },
    fields: [
      { key: "partyName", label: "Party Name" },
      { key: "paymentDate", label: "Payment Date" },
      { key: "amount", label: "Amount *", numeric: true },
      { key: "mode", label: "Payment Mode" },
      { key: "reference", label: "Reference No." },
      { key: "notes", label: "Notes" },
    ],
    guess: (header) => {
      const h = norm(header);
      if (has(h, "party", "customer", "supplier", "name")) return "partyName";
      if (h.includes("date")) return "paymentDate";
      if (has(h, "amount", "received", "paid")) return "amount";
      if (has(h, "mode", "method", "type")) return "mode";
      if (has(h, "reference", "ref", "txn", "utr")) return "reference";
      if (has(h, "note", "remark", "desc")) return "notes";
      return "skip";
    },
    template: {
      name: `payment-${inbound ? "in" : "out"}-import-template`,
      head: ["Party Name", "Payment Date", "Amount", "Payment Mode", "Reference No.", "Notes"],
      row: inbound
        ? ["Acme Traders", "2026-08-01", "50000", "UPI", "TXN12345", "Advance received"]
        : ["Steel Suppliers", "2026-08-01", "75000", "Bank Transfer", "UTR998877", "Bill settlement"],
    },
    preview: [
      { key: "partyName", label: "Party" },
      { key: "paymentDate", label: "Date" },
      { key: "amount", label: "Amount", align: "right", render: (v) => v ?? "0" },
      { key: "mode", label: "Mode", render: (v) => v ?? "Cash" },
      { key: "reference", label: "Reference" },
    ],
    commit: async (records) => {
      const rows = records as (Partial<vyapar.Payment> & { bankAccountId?: number | null })[];
      let created = 0;
      for (const r of rows) {
        await vyapar.createPayment(r);
        created++;
      }
      return created;
    },
  };
}

export const paymentInImportConfig = paymentImportConfig("IN");
export const paymentOutImportConfig = paymentImportConfig("OUT");

// ---- Documents (sale, purchase, estimate, orders, returns, challan) ----
/** The mapped columns that describe a single line item within a document. */
const DOC_LINE_FIELDS = ["itemName", "description", "unit", "quantity", "rate", "discountPercent", "taxPercent"];

/**
 * Import config for a multi-line billing document. The sheet is one row per line item; rows sharing
 * the same Document No. are folded into one document (its lines), with the party/date/etc. taken
 * from the group's first row. Parties are matched to existing masters by name.
 */
export function documentImportConfig(docType: DocType): ImportConfig {
  const label = vyapar.DOC_LABEL[docType] ?? "Document";
  const supplierSide = docType === "PURCHASE" || docType === "PURCHASE_ORDER" || docType === "PURCHASE_RETURN";
  return {
    title: `Import ${label} from Excel`,
    entityNoun: "documents",
    requiredKey: "invoiceNo",
    requiredLabel: "Document No.",
    scoped: true,
    base: { docType },
    fields: [
      { key: "invoiceNo", label: "Document No. *" },
      { key: "partyName", label: supplierSide ? "Supplier Name" : "Customer Name" },
      { key: "invoiceDate", label: "Date" },
      { key: "dueDate", label: "Due Date" },
      { key: "paymentType", label: "Payment Type" },
      { key: "stateOfSupply", label: "State of Supply" },
      { key: "notes", label: "Notes" },
      { key: "itemName", label: "Item Name" },
      { key: "description", label: "Item Description" },
      { key: "unit", label: "Unit" },
      { key: "quantity", label: "Quantity", numeric: true },
      { key: "rate", label: "Rate / Price", numeric: true },
      { key: "discountPercent", label: "Discount %", numeric: true },
      { key: "taxPercent", label: "Tax %", numeric: true },
    ],
    guess: (header) => {
      const h = norm(header);
      if (has(h, "invoiceno", "documentno", "docno", "billno", "orderno", "challanno", "voucherno") || h === "no" || h === "number")
        return "invoiceNo";
      if (has(h, "party", "customer", "supplier", "vendor")) return "partyName";
      if (has(h, "duedate")) return "dueDate";
      if (h.includes("date")) return "invoiceDate";
      if (has(h, "paymenttype", "paymentmode", "mode")) return "paymentType";
      if (has(h, "state", "supply")) return "stateOfSupply";
      if (has(h, "note", "remark")) return "notes";
      if (has(h, "itemname", "item", "product", "particular")) return "itemName";
      if (has(h, "description", "desc")) return "description";
      if (h.includes("unit")) return "unit";
      if (has(h, "qty", "quantity")) return "quantity";
      if (has(h, "rate", "price", "amount")) return "rate";
      if (has(h, "discount", "disc")) return "discountPercent";
      if (has(h, "tax", "gst")) return "taxPercent";
      return "skip";
    },
    template: {
      name: `${docType.toLowerCase()}-import-template`,
      head: ["Document No.", supplierSide ? "Supplier Name" : "Customer Name", "Date", "Item Name", "Unit", "Quantity", "Rate", "Tax %"],
      row: ["INV-1001", supplierSide ? "Steel Suppliers" : "Acme Traders", "2026-08-01", "TMT Bar 12mm", "KG", "1200", "62", "18"],
    },
    preview: [
      { key: "invoiceNo", label: "Doc No." },
      { key: "partyName", label: "Party" },
      { key: "itemName", label: "Item" },
      { key: "quantity", label: "Qty", align: "right", render: (v) => v ?? "1" },
      { key: "rate", label: "Rate", align: "right", render: (v) => v ?? "0" },
    ],
    group: { byKey: "invoiceNo", lineFields: DOC_LINE_FIELDS },
    commit: async (records) => {
      // Match line-level party names to existing party masters (case-insensitive).
      const parties = await vyapar.getParties();
      const byName = new Map(parties.map((p) => [p.name.trim().toLowerCase(), p.id]));
      let created = 0;
      for (const rec of records) {
        const d = rec as Record<string, unknown>;
        const nameKey = d.partyName ? String(d.partyName).trim().toLowerCase() : "";
        const lines = ((d.lines as Record<string, unknown>[]) ?? [])
          .map((l) => ({
            itemId: null,
            itemName: String(l.itemName ?? "").trim(),
            description: l.description ? String(l.description) : null,
            unit: l.unit ? String(l.unit) : null,
            quantity: Number(l.quantity) || 1,
            rate: Number(l.rate) || 0,
            discountPercent: Number(l.discountPercent) || 0,
            taxPercent: Number(l.taxPercent) || 0,
          }))
          .filter((l) => l.itemName);
        if (lines.length === 0) continue;
        await vyapar.createInvoice({
          docType,
          projectId: (d.projectId as number | null) ?? null,
          invoiceNo: d.invoiceNo ? String(d.invoiceNo) : undefined,
          partyId: nameKey ? byName.get(nameKey) ?? null : null,
          invoiceDate: d.invoiceDate ? String(d.invoiceDate) : undefined,
          dueDate: d.dueDate ? String(d.dueDate) : null,
          paymentType: d.paymentType ? String(d.paymentType) : undefined,
          stateOfSupply: d.stateOfSupply ? String(d.stateOfSupply) : null,
          notes: d.notes ? String(d.notes) : null,
          isCash: false,
          paidAmount: 0,
          lines,
        });
        created++;
      }
      return created;
    },
  };
}
