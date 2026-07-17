import type { TxnType } from "./types";

export interface TxnStyle {
  tint: string; // tailwind bg+text for the icon chip
  sign: "+" | "-" | "";
  amountColor: string;
}

// Visual treatment per flow. Keeps the transaction list scannable at a glance.
export function txnStyle(type: TxnType, flow: "in" | "out" | "neutral"): TxnStyle {
  if (flow === "in") return { tint: "bg-green-100 text-green-600", sign: "+", amountColor: "text-green-600" };
  if (flow === "out") return { tint: "bg-rose-100 text-rose-600", sign: "-", amountColor: "text-rose-600" };
  return { tint: "bg-cyan-100 text-cyan-600", sign: "", amountColor: "text-gray-700" };
}

export const PAYMENT_TYPES: TxnType[] = [
  "Payment In",
  "Payment Out",
  "Debit Note",
  "Credit Note",
  "Party to Party Payment",
  "Internal Transfer",
];
export const SALES_TYPES: TxnType[] = ["Sales Invoice", "Material Sales"];
export const EXPENSE_TYPES: TxnType[] = [
  "Material Purchase",
  "Material Return",
  "Material Transfer",
  "Sub Con Bill",
  "Other Expense",
  "Equipment Expense",
];
