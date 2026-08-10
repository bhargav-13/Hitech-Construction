/**
 * Per-entity import configs for the generic {@link import("@/components/vyapar/ImportDialog").ImportDialog}.
 * Each covers one flat/master Vyapar record type — column targets, header auto-detection, a starter
 * template, the preview columns and how to persist the parsed rows (bulk endpoint where one exists,
 * otherwise a one-by-one create fallback).
 */

import * as vyapar from "./vyaparApi";
import type { DocType } from "./vyaparApi";
import type { ImportConfig } from "@/components/vyapar/ImportDialog";
import { toIsoDate } from "./format";

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
    // Vyapar exports dates day-first (31/10/2025); store them as ISO so the ledger sorts right.
    coerce: (key, value) => (key === "paymentDate" ? toIsoDate(value) : undefined),
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
      // Import every row we can — one bad row must not abort the whole sheet (that's how a
      // 400-row import silently landed only ~80). Failures are logged, not thrown.
      for (const r of rows) {
        try {
          await vyapar.createPayment(r);
          created++;
        } catch (err) {
          console.error("Payment import: skipped a row", r, err);
        }
      }
      return created;
    },
  };
}

export const paymentInImportConfig = paymentImportConfig("IN");
export const paymentOutImportConfig = paymentImportConfig("OUT");

// ---- Documents (sale, purchase, estimate, orders, returns, challan, expense) ----
/**
 * The mapped columns that live on a line rather than the bill header. `amount` is here because a
 * Vyapar transaction export is one row per bill with only a Total Amount (no per-line rate) — that
 * amount becomes a single synthetic line — while an item-wise export carries a real per-line
 * quantity/rate. Both shapes fold into the same document model.
 */
const DOC_LINE_FIELDS = ["itemName", "description", "unit", "quantity", "rate", "amount", "discountPercent", "taxPercent"];

/**
 * Import config for a billing document, built to match how Vyapar actually exports.
 *
 * Real Vyapar transaction reports are **one row per bill** and frequently have a blank invoice
 * number — so keying/grouping on the invoice number (as we used to) silently dropped every blank
 * row and merged unrelated bills, which is how a full export landed only a fraction of its rows.
 * Instead the required field is the amount (always present); each row becomes its own bill (blank
 * invoice numbers never merge — see {@link import("@/components/vyapar/ImportDialog").ImportDialog}),
 * and rows that share a *non-blank* invoice number still fold into one multi-line bill. When a row
 * has no item detail, its Total Amount becomes a single line so the bill total is preserved.
 * Parties are matched to existing masters by name; unknown/blank parties import as cash bills.
 */
export function documentImportConfig(docType: DocType): ImportConfig {
  const label = vyapar.DOC_LABEL[docType] ?? "Document";
  const supplierSide = docType === "PURCHASE" || docType === "PURCHASE_ORDER" || docType === "PURCHASE_RETURN";
  const lineLabel = docType === "EXPENSE" ? "Expense" : supplierSide ? "Purchase" : "Sale";
  return {
    title: `Import ${label} from Excel`,
    entityNoun: "documents",
    requiredKey: "amount",
    requiredLabel: "Amount",
    scoped: true,
    base: { docType },
    fields: [
      { key: "amount", label: "Amount *", numeric: true },
      { key: "invoiceNo", label: "Invoice / Bill No." },
      { key: "partyName", label: supplierSide ? "Supplier Name" : "Customer Name" },
      { key: "invoiceDate", label: "Date" },
      { key: "dueDate", label: "Due Date" },
      { key: "paidAmount", label: "Received / Paid Amount", numeric: true },
      { key: "paymentStatus", label: "Payment Status" },
      { key: "paymentType", label: "Payment Type" },
      { key: "stateOfSupply", label: "State of Supply" },
      { key: "description", label: "Description / Notes" },
      { key: "itemName", label: "Item Name" },
      { key: "unit", label: "Unit" },
      { key: "quantity", label: "Quantity", numeric: true },
      { key: "rate", label: "Rate / Unit Price", numeric: true },
      { key: "discountPercent", label: "Discount %", numeric: true },
      { key: "taxPercent", label: "Tax %", numeric: true },
    ],
    guess: (header) => {
      const h = norm(header);
      // Order matters: match the more specific money columns before the generic "amount".
      if (has(h, "receivedpaid", "paidamount", "amountpaid", "amountreceived")) return "paidAmount";
      if (has(h, "balancedue", "balance")) return "skip"; // derived from total − paid
      if (has(h, "totalamount", "netamount", "grandtotal", "invoiceamount") || h === "amount" || h === "total") return "amount";
      if (has(h, "paymentstatus") || h === "status") return "paymentStatus";
      if (has(h, "invoiceno", "billno", "txnno", "voucherno", "documentno", "docno") || h === "invoicenotxnno") return "invoiceNo";
      if (has(h, "orderno", "challanno", "challanorderno")) return "skip"; // reference we don't store
      // Skip contact/identity columns before the party match — "Party Phone No." must not be read
      // as the party name (it contains "party").
      if (has(h, "phone", "mobile", "contact", "gstin")) return "skip";
      if (has(h, "party", "customer", "supplier", "vendor")) return "partyName";
      if (has(h, "duedate")) return "dueDate";
      if (h.includes("date")) return "invoiceDate";
      if (has(h, "paymenttype", "paymentmode", "mode")) return "paymentType";
      if (has(h, "stateofsupply", "placeofsupply") || h === "state") return "stateOfSupply";
      if (has(h, "itemname", "product", "particular") || h === "item") return "itemName";
      if (has(h, "unitprice", "rate", "price")) return "rate";
      if (has(h, "qty", "quantity")) return "quantity";
      if (h === "unit") return "unit";
      if (has(h, "discountpercent", "discperc")) return "discountPercent";
      if (h.includes("discount")) return "skip"; // flat discount amount — avoid double-counting
      if (has(h, "taxpercent", "gstpercent")) return "taxPercent";
      if (h === "tax" || has(h, "taxamount")) return "skip";
      if (has(h, "description", "narration", "remark", "note") || h === "desc") return "description";
      // GSTIN, phone, HSN/SAC, category, code, transaction type, etc. — not needed.
      return "skip";
    },
    // Vyapar exports dates day-first (31/10/2025); normalize to ISO so the books sort/filter and
    // don't render as "undefined/undefined/31/10/2025".
    coerce: (key, value) => (key === "invoiceDate" || key === "dueDate" ? toIsoDate(value) : undefined),
    template: {
      name: `${docType.toLowerCase()}-import-template`,
      head: ["Date", "Invoice No", supplierSide ? "Supplier Name" : "Customer Name", "Total Amount", "Received/Paid Amount", "Payment Status", "Description"],
      row: ["2026-08-01", "", supplierSide ? "Steel Suppliers" : "Acme Traders", "125000", "0", "Unpaid", "Cement — site A"],
    },
    preview: [
      { key: "invoiceDate", label: "Date" },
      { key: "invoiceNo", label: "Bill No.", render: (v) => v || "(auto)" },
      { key: "partyName", label: "Party" },
      { key: "amount", label: "Amount", align: "right", render: (v) => v ?? "0" },
      { key: "paymentStatus", label: "Status", render: (v) => v ?? "—" },
    ],
    group: { byKey: "invoiceNo", lineFields: DOC_LINE_FIELDS },
    commit: async (records) => {
      // Match party names to existing masters (case-insensitive). The invoice's party name is
      // derived from a linked master on the backend, so an unmatched name would show as "—" —
      // auto-create the party (as Vyapar does on import) so vendors/customers and their balances
      // come through.
      const parties = await vyapar.getParties();
      const byName = new Map(parties.map((p) => [p.name.trim().toLowerCase(), p.id]));
      const newPartyType: vyapar.PartyType = supplierSide || docType === "EXPENSE" ? "SUPPLIER" : "CUSTOMER";
      let created = 0;
      for (const rec of records) {
        const d = rec as Record<string, unknown>;
        const rawName = d.partyName ? String(d.partyName).trim() : "";
        const nameKey = rawName.toLowerCase();
        let partyId: number | null = nameKey ? byName.get(nameKey) ?? null : null;
        if (rawName && partyId == null) {
          try {
            const p = await vyapar.createParty({ name: rawName, partyType: newPartyType });
            partyId = p.id;
            byName.set(nameKey, p.id);
          } catch (err) {
            console.error("Document import: couldn't create party", rawName, err);
          }
        }
        const rawLines = (d.lines as Record<string, unknown>[]) ?? [];
        const lines = rawLines
          .map((l) => {
            const qty = Number(l.quantity) || 1;
            const amt = Number(l.amount) || 0;
            // Prefer an explicit rate; otherwise spread the row's Total Amount across the quantity
            // so a header-only bill (no per-line rate) keeps its exact total.
            const rate = Number(l.rate) || (amt ? amt / qty : 0);
            const name = String(l.itemName ?? "").trim() || String(l.description ?? "").trim() || lineLabel;
            return {
              itemId: null,
              itemName: name,
              description: l.description ? String(l.description) : null,
              unit: l.unit ? String(l.unit) : null,
              quantity: qty,
              rate,
              discountPercent: Number(l.discountPercent) || 0,
              taxPercent: Number(l.taxPercent) || 0,
            };
          })
          .filter((l) => l.rate > 0 || l.quantity > 0);
        if (lines.length === 0) continue;

        // Payment: a "Paid" status settles the bill in full (even if the paid column reads 0/blank);
        // otherwise an explicit paid amount makes it partial, and anything else stays unpaid.
        const status = String(d.paymentStatus ?? "").trim().toLowerCase();
        const paidCol = d.paidAmount != null && String(d.paidAmount) !== "" ? Number(d.paidAmount) || 0 : null;
        const fullyPaid = status === "paid" || status === "received";
        const isCash = fullyPaid;
        const paidAmount = fullyPaid ? undefined : paidCol != null && paidCol > 0 ? paidCol : 0;
        // Import every document we can — one bad row must not abort the rest of the sheet.
        try {
          await vyapar.createInvoice({
            docType,
            projectId: (d.projectId as number | null) ?? null,
            invoiceNo: d.invoiceNo ? String(d.invoiceNo) : undefined,
            partyId,
            invoiceDate: d.invoiceDate ? String(d.invoiceDate) : undefined,
            dueDate: d.dueDate ? String(d.dueDate) : null,
            paymentType: d.paymentType ? String(d.paymentType) : undefined,
            stateOfSupply: d.stateOfSupply ? String(d.stateOfSupply) : null,
            notes: d.description ? String(d.description) : null,
            isCash,
            paidAmount,
            lines,
          });
          created++;
        } catch (err) {
          console.error("Document import: skipped a document", d.invoiceNo, err);
        }
      }
      return created;
    },
  };
}
