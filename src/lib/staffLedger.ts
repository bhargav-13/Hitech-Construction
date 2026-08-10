/**
 * Projects a member's real payroll records (loans, reimbursements, salary payslips) into a ledger
 * the Vyapar Parties view shows alongside customer/supplier ledgers — so a person and their money
 * live in one place. Sourced from the live payroll-service (see {@link import("./payrollClient")}),
 * keyed by ERP member id.
 */

import type { PayrollLoan, PayrollPayslip, PayrollReimbursement } from "./payrollClient";

export interface StaffLedgerRow {
  id: string;
  /** Loan / Reimbursement / Salary. */
  type: string;
  ref: string | null;
  date: string | null;
  amount: number;
  status: string;
}

export interface StaffFinancials {
  rows: StaffLedgerRow[];
  /** Loan money the staff still owes back (a receivable). */
  outstandingLoans: number;
  /** Reimbursements approved/pending but not yet paid (a payable to the staff). */
  pendingReimbursements: number;
  /** Total net salary paid across payslips. */
  totalPaid: number;
  /** Net position: positive = they owe us (loans), negative = we owe them (reimbursements). */
  balance: number;
}

const REIMB_LABEL: Record<string, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  PAID: "Paid",
};

/** The receivable/payable balance from loans and reimbursements alone — all the list needs. */
export function staffBalance(loans: PayrollLoan[], reimbursements: PayrollReimbursement[]): number {
  const outstandingLoans = loans.reduce((s, l) => s + Math.max(0, Number(l.outstanding) || 0), 0);
  const pending = reimbursements
    .filter((r) => r.status === "PENDING" || r.status === "APPROVED")
    .reduce((s, r) => s + (r.approvedAmount ?? r.requestedAmount ?? 0), 0);
  return outstandingLoans - pending;
}

/** The full ledger + totals for one member, from their loans, reimbursements and payslips. */
export function staffFinancials(
  loans: PayrollLoan[],
  reimbursements: PayrollReimbursement[],
  payslips: PayrollPayslip[]
): StaffFinancials {
  const rows: StaffLedgerRow[] = [
    ...loans.map((l) => ({
      id: `loan-${l.id}`,
      type: `Loan · ${l.name}`,
      ref: null,
      date: l.disbursementDate,
      amount: Number(l.principal) || 0,
      status:
        Number(l.outstanding) > 0
          ? `₹${Math.round(Number(l.outstanding)).toLocaleString("en-IN")} outstanding`
          : "Cleared",
    })),
    ...reimbursements.map((r) => ({
      id: `reimb-${r.id}`,
      type: `Reimbursement · ${r.expenseType}`,
      ref: r.claimId,
      date: r.expenseDate,
      amount: r.approvedAmount ?? r.requestedAmount ?? 0,
      status: REIMB_LABEL[r.status] ?? r.status,
    })),
    ...payslips.map((p) => ({
      id: `slip-${p.id}`,
      type: "Salary",
      ref: p.month,
      // Payslips are monthly; anchor the row to the month for sorting/display.
      date: p.month ? `${p.month}-01` : null,
      amount: Number(p.net) || 0,
      status: "Payslip",
    })),
  ].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

  const outstandingLoans = loans.reduce((s, l) => s + Math.max(0, Number(l.outstanding) || 0), 0);
  const pendingReimbursements = reimbursements
    .filter((r) => r.status === "PENDING" || r.status === "APPROVED")
    .reduce((s, r) => s + (r.approvedAmount ?? r.requestedAmount ?? 0), 0);
  const totalPaid = payslips.reduce((s, p) => s + (Number(p.net) || 0), 0);

  return { rows, outstandingLoans, pendingReimbursements, totalPaid, balance: outstandingLoans - pendingReimbursements };
}
