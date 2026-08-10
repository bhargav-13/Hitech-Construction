/**
 * Thin client for the real payroll-service (`/api/v1/payroll`). The rest of the Payroll module still
 * runs on a seeded client-side store; this file talks to the live backend for the financial records
 * the unified party ledger needs — loans, reimbursements and payslips, all keyed by ERP member id.
 */

import { apiRequest } from "./api";

export interface PayrollLoan {
  id: number;
  userId: number;
  memberName: string | null;
  name: string;
  description: string | null;
  principal: number;
  tenureMonths: number;
  annualRate: number;
  interestType: string;
  disbursementDate: string | null;
  startMonth: string | null;
  emi: number;
  outstanding: number;
}

export interface PayrollReimbursement {
  id: number;
  userId: number;
  memberName: string | null;
  expenseType: string;
  claimId: string | null;
  expenseDate: string | null;
  appliedAt: string | null;
  approvedAt: string | null;
  settlementDate: string | null;
  requestedAmount: number;
  approvedAmount: number | null;
  approverId: number | null;
  approverName: string | null;
  status: string;
}

export interface PayrollPayslip {
  id: number;
  userId: number;
  memberName: string | null;
  gross: number;
  pf: number;
  esic: number;
  pt: number;
  otherDeductions: number;
  deductionsDetail: string | null;
  loanEmi: number;
  reimbursements: number;
  net: number;
  payableDays: number;
  totalDays: number;
  month: string;
}

const BASE = "/api/v1/payroll";

/** All loans (manager-gated). Used to compute every member's balance in one call. */
export const getAllLoans = () => apiRequest<PayrollLoan[]>(`${BASE}/loans`);
/** All reimbursements (manager-gated). */
export const getAllReimbursements = () => apiRequest<PayrollReimbursement[]>(`${BASE}/reimbursements`);
/** One member's payslips across every run (self or manager). */
export const getMemberPayslips = (userId: number) =>
  apiRequest<PayrollPayslip[]>(`${BASE}/payslips/member/${userId}`);
