import { apiRequest } from "./api";

// Mirrors vyapar-service (com.hitech.erp.vyapar). Billing & accounting: parties, items,
// invoices (sale/purchase/estimate/…) and payments.

export type PartyType = "CUSTOMER" | "SUPPLIER";
// Every document type Vyapar can create — the backend stores this verbatim on the invoice.
export type DocType =
  | "SALE"
  | "PAYMENT_IN"
  | "SALE_RETURN"
  | "SALE_ORDER"
  | "ESTIMATE"
  | "PROFORMA"
  | "DELIVERY_CHALLAN"
  | "PURCHASE"
  | "PAYMENT_OUT"
  | "PURCHASE_RETURN"
  | "PURCHASE_ORDER"
  | "EXPENSE"
  | "PARTY_TRANSFER";

/** GST registration types offered by Vyapar's party form. */
export const GST_TYPES = [
  "Unregistered/Consumer",
  "Registered Business - Regular",
  "Registered Business - Composition",
  "Overseas",
  "SEZ",
] as const;
export type GstType = (typeof GST_TYPES)[number];

export interface Party {
  id: number;
  name: string;
  partyType: PartyType;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  gstType: string | null;
  state: string | null;
  billingAddress: string | null;
  shippingAddress: string | null;
  city: string | null;
  /** Optional grouping (e.g. "Wholesale", "Retail") — Vyapar's Party Grouping setting. */
  partyGroup: string | null;
  openingBalance: number;
  /** Date the opening balance is stated as of. */
  openingDate: string | null;
  /** null = no credit limit; a number caps how much this party may owe. */
  creditLimit: number | null;
  /** Four configurable extras, matching Vyapar's Additional Fields tab. */
  field1: string | null;
  field2: string | null;
  field3: string | null;
  field4: string | null;
  isActive: boolean;
  /** The bank/cash account this party belongs to (null = all accounts). */
  bankAccountId: number | null;
  /** Opening balance + every posted document and payment. Positive = receivable. */
  balance: number;
}

/** A single line in a party's ledger — documents and payments interleaved by date. */
export interface PartyLedgerRow {
  id: number;
  kind: "INVOICE" | "PAYMENT";
  type: string;
  number: string | null;
  date: string | null;
  total: number;
  balance: number;
  status?: string;
}

export interface Item {
  id: number;
  name: string;
  category: string | null;
  description: string | null;
  itemCode: string | null;
  hsn: string | null;
  unit: string;
  salePrice: number;
  /** Whether salePrice already includes tax. */
  salePriceWithTax: boolean;
  /** Discount offered on the sale price. */
  saleDiscount: number;
  saleDiscountType: "PERCENT" | "AMOUNT";
  /** Optional second price tier for bulk buyers. */
  wholesalePrice: number | null;
  wholesaleMinQty: number | null;
  purchasePrice: number;
  purchasePriceWithTax: boolean;
  taxPercent: number;
  stockQty: number;
  /** Opening stock and the price it came in at. */
  openingQty: number;
  openingPrice: number;
  openingDate: string | null;
  lowStockAlert: number;
  location: string | null;
  isService: boolean;
  isActive: boolean;
  /** The bank/cash account this item belongs to (null = all accounts). */
  bankAccountId: number | null;
  stockValue: number;
  lowStock: boolean;
}

/** A single movement in an item's stock ledger. */
export interface ItemLedgerRow {
  id: number;
  type: string;
  ref: string | null;
  name: string | null;
  date: string | null;
  quantity: number;
  pricePerUnit: number;
  status: string | null;
}

/** Item categories and units are managed as their own small masters. */
export interface ItemCategory { id: number; name: string; itemCount: number }
export interface ItemUnit { id: number; name: string; shortName: string; itemCount: number }

export interface InvoiceLine {
  id?: number;
  itemId: number | null;
  itemName: string;
  description: string | null;
  unit: string | null;
  quantity: number;
  rate: number;
  discountPercent: number;
  discountAmount: number;
  taxPercent: number;
  taxAmount: number;
  amount: number;
}

export interface Invoice {
  id: number;
  docType: DocType;
  invoiceNo: string;
  partyId: number | null;
  partyName: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  subTotal: number;
  discount: number;
  taxAmount: number;
  total: number;
  paidAmount: number;
  balance: number;
  paymentType: string;
  isCash: boolean;
  stateOfSupply: string | null;
  invoicePrefix: string | null;
  terms: string | null;
  discountPercent: number;
  roundOff: number;
  status: "Paid" | "Partial" | "Unpaid";
  notes: string | null;
  /** The bank/cash account this document belongs to (null = all accounts). */
  bankAccountId: number | null;
  lines: InvoiceLine[];
}

export interface Payment {
  id: number;
  direction: "IN" | "OUT";
  partyId: number | null;
  partyName: string | null;
  invoiceId: number | null;
  paymentDate: string | null;
  amount: number;
  mode: string;
  reference: string | null;
  notes: string | null;
  /** The bank/cash account this payment belongs to (null = all accounts). */
  bankAccountId: number | null;
}

export interface DashboardSummary {
  totalReceivable: number;
  receivableParties: number;
  totalPayable: number;
  payableParties: number;
  totalSale: number;
  totalPurchase: number;
  cashInHand: number;
  stockItems: number;
  stockValue: number;
  lowStockCount: number;
  salesTrend: { label: string; value: number }[];
}

const BASE = "/api/v1/vyapar";

// A query-string helper: appends ?key=value pairs, skipping null/undefined/empty.
function qs(params: Record<string, string | number | null | undefined>): string {
  const parts = Object.entries(params).filter(([, v]) => v !== null && v !== undefined && v !== "");
  return parts.length ? `?${parts.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&")}` : "";
}

// ---- Dashboard ----
export const getDashboard = (bankAccountId?: number) =>
  apiRequest<DashboardSummary>(`${BASE}/dashboard${qs({ bankAccountId })}`);

// ---- Parties ----
export const getParties = (type?: PartyType, bankAccountId?: number) =>
  apiRequest<Party[]>(`${BASE}/parties${qs({ type, bankAccountId })}`);
export const createParty = (body: Partial<Party>) =>
  apiRequest<Party>(`${BASE}/parties`, { method: "POST", body });
export const updateParty = (id: number, body: Partial<Party>) =>
  apiRequest<Party>(`${BASE}/parties/${id}`, { method: "PUT", body });
export const deleteParty = (id: number) =>
  apiRequest<void>(`${BASE}/parties/${id}`, { method: "DELETE" });
/** Full ledger for one party (documents + payments, newest first). */
export const getPartyLedger = (id: number) =>
  apiRequest<PartyLedgerRow[]>(`${BASE}/parties/${id}/ledger`);
/** Bulk create from an imported sheet. */
export const importParties = (rows: Partial<Party>[]) =>
  apiRequest<Party[]>(`${BASE}/parties/import`, { method: "POST", body: { rows } });

// ---- Items ----
export const getItems = (bankAccountId?: number) => apiRequest<Item[]>(`${BASE}/items${qs({ bankAccountId })}`);
export const createItem = (body: Partial<Item>) =>
  apiRequest<Item>(`${BASE}/items`, { method: "POST", body });
export const updateItem = (id: number, body: Partial<Item>) =>
  apiRequest<Item>(`${BASE}/items/${id}`, { method: "PUT", body });
export const deleteItem = (id: number) =>
  apiRequest<void>(`${BASE}/items/${id}`, { method: "DELETE" });
export const getItemLedger = (id: number) =>
  apiRequest<ItemLedgerRow[]>(`${BASE}/items/${id}/ledger`);
/** Manual stock correction (add/reduce) with a reason. */
export const adjustStock = (id: number, body: { mode: "ADD" | "REDUCE"; quantity: number; atPrice?: number; date?: string; note?: string }) =>
  apiRequest<Item>(`${BASE}/items/${id}/adjust`, { method: "POST", body });
export const importItems = (rows: Partial<Item>[]) =>
  apiRequest<Item[]>(`${BASE}/items/import`, { method: "POST", body: { rows } });
export const getItemCategories = () => apiRequest<ItemCategory[]>(`${BASE}/item-categories`);
export const getItemUnits = () => apiRequest<ItemUnit[]>(`${BASE}/item-units`);

// ---- Invoices ----
export interface InvoiceInput {
  docType: DocType;
  invoiceNo?: string;
  partyId: number | null;
  invoiceDate?: string;
  dueDate?: string | null;
  discount?: number;
  discountPercent?: number;
  paidAmount?: number;
  paymentType?: string;
  isCash?: boolean;
  stateOfSupply?: string | null;
  invoicePrefix?: string | null;
  terms?: string | null;
  roundOff?: number;
  notes?: string | null;
  /** The bank/cash account this document belongs to (undefined = all accounts). */
  bankAccountId?: number | null;
  lines: {
    itemId: number | null;
    itemName: string;
    description?: string | null;
    unit?: string | null;
    quantity: number;
    rate: number;
    discountPercent?: number;
    discountAmount?: number;
    taxPercent: number;
  }[];
}

export const getInvoices = (docType?: DocType, bankAccountId?: number) =>
  apiRequest<Invoice[]>(`${BASE}/invoices${qs({ docType, bankAccountId })}`);
export const getInvoice = (id: number) => apiRequest<Invoice>(`${BASE}/invoices/${id}`);
export const createInvoice = (body: InvoiceInput) =>
  apiRequest<Invoice>(`${BASE}/invoices`, { method: "POST", body });
export const updateInvoice = (id: number, body: InvoiceInput) =>
  apiRequest<Invoice>(`${BASE}/invoices/${id}`, { method: "PUT", body });
export const deleteInvoice = (id: number) =>
  apiRequest<void>(`${BASE}/invoices/${id}`, { method: "DELETE" });

// ---- Payments ----
export const getPayments = (direction?: "IN" | "OUT", bankAccountId?: number) =>
  apiRequest<Payment[]>(`${BASE}/payments${qs({ direction, bankAccountId })}`);
export const createPayment = (body: Partial<Payment> & { bankAccountId?: number | null }) =>
  apiRequest<Payment>(`${BASE}/payments`, { method: "POST", body });
export const deletePayment = (id: number) =>
  apiRequest<void>(`${BASE}/payments/${id}`, { method: "DELETE" });

/** Human labels for each document type — used in tabs, titles and number prefixes. */
/** Indian states for the GST place-of-supply picker. */
export const STATES_OF_SUPPLY = [
  "Andhra Pradesh", "Assam", "Bihar", "Chhattisgarh", "Delhi", "Goa", "Gujarat", "Haryana",
  "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra",
  "Odisha", "Punjab", "Rajasthan", "Tamil Nadu", "Telangana", "Uttar Pradesh", "Uttarakhand",
  "West Bengal",
];

export const DOC_LABEL: Record<DocType, string> = {
  SALE: "Sale Invoice",
  PAYMENT_IN: "Payment-In",
  SALE_RETURN: "Sale Return / Credit Note",
  SALE_ORDER: "Sale Order",
  ESTIMATE: "Estimate / Quotation",
  PROFORMA: "Proforma Invoice",
  DELIVERY_CHALLAN: "Delivery Challan",
  PURCHASE: "Purchase Bill",
  PAYMENT_OUT: "Payment-Out",
  PURCHASE_RETURN: "Purchase Return / Debit Note",
  PURCHASE_ORDER: "Purchase Order",
  EXPENSE: "Expense",
  PARTY_TRANSFER: "Party To Party Transfer",
};

// ---- Cash & Bank ----
export interface BankAccount {
  id: number;
  name: string;
  openingBalance: number;
  openingDate: string | null;
  accountNumber: string | null;
  ifsc: string | null;
  bankName: string | null;
  accountHolder: string | null;
  upiId: string | null;
  printUpiQr: boolean;
  printBankDetails: boolean;
  isActive: boolean;
  /** Opening balance plus every posted movement. */
  balance: number;
}

/** One movement against a bank or cash account. */
export interface CashBankTxn {
  id: number;
  accountId: number | null;
  type: string;
  name: string | null;
  date: string | null;
  amount: number;
  /** in = money arriving, out = money leaving. */
  direction: "in" | "out";
  note: string | null;
}

export interface Cheque {
  id: number;
  chequeNo: string;
  partyName: string | null;
  invoiceNo: string | null;
  direction: "IN" | "OUT";
  amount: number;
  chequeDate: string | null;
  transferDate: string | null;
  status: "OPEN" | "DEPOSITED" | "WITHDRAWN" | "REOPENED";
  accountId: number | null;
}

export interface LoanAccount {
  id: number;
  name: string;
  lender: string | null;
  accountNumber: string | null;
  loanAmount: number;
  balance: number;
  interestRate: number;
  termMonths: number;
  startDate: string | null;
  emiAmount: number;
}

const CB = `${BASE}`;
export const getBankAccounts = () => apiRequest<BankAccount[]>(`${CB}/bank-accounts`);
export const createBankAccount = (body: Partial<BankAccount>) =>
  apiRequest<BankAccount>(`${CB}/bank-accounts`, { method: "POST", body });
export const updateBankAccount = (id: number, body: Partial<BankAccount>) =>
  apiRequest<BankAccount>(`${CB}/bank-accounts/${id}`, { method: "PUT", body });
export const deleteBankAccount = (id: number) =>
  apiRequest<void>(`${CB}/bank-accounts/${id}`, { method: "DELETE" });
export const getAccountTxns = (id: number) =>
  apiRequest<CashBankTxn[]>(`${CB}/bank-accounts/${id}/transactions`);

/** Bank↔cash, bank↔bank transfers and manual balance adjustments. */
export const postCashBankEntry = (body: {
  kind: "BANK_TO_CASH" | "CASH_TO_BANK" | "BANK_TO_BANK" | "ADJUST_BANK" | "ADJUST_CASH";
  fromAccountId?: number | null;
  toAccountId?: number | null;
  amount: number;
  date?: string;
  description?: string;
  /** For adjustments: increase or decrease the balance. */
  mode?: "ADD" | "REDUCE";
}) => apiRequest<CashBankTxn>(`${CB}/cash-bank/entries`, { method: "POST", body });

export const getCashTxns = () => apiRequest<CashBankTxn[]>(`${CB}/cash-in-hand`);
export const getCheques = () => apiRequest<Cheque[]>(`${CB}/cheques`);
export const updateCheque = (id: number, body: Partial<Cheque>) =>
  apiRequest<Cheque>(`${CB}/cheques/${id}`, { method: "PUT", body });
export const getLoanAccounts = () => apiRequest<LoanAccount[]>(`${CB}/loan-accounts`);
export const createLoanAccount = (body: Partial<LoanAccount>) =>
  apiRequest<LoanAccount>(`${CB}/loan-accounts`, { method: "POST", body });

// ---- Firm profile — the letterhead stamped onto every PDF and print-out ----
export interface FirmProfile {
  businessName: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  state: string | null;
  /** A small base64 data URL, or null if no logo has been uploaded. */
  logoDataUrl: string | null;
  footerNote: string | null;
}

export const getFirmProfile = () => apiRequest<FirmProfile>(`${BASE}/firm-profile`);
export const updateFirmProfile = (body: Partial<FirmProfile>) =>
  apiRequest<FirmProfile>(`${BASE}/firm-profile`, { method: "PUT", body });
