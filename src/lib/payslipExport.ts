/** Builds a downloadable PDF payslip from a payslip record — earnings, itemised deductions, net. */

import { downloadPdf } from "./vyaparExport";
import { inr } from "./format";
import type { PayslipApi } from "./api";

/** Component/amount rows for a payslip: gross, each deduction (negative), loan/reimb, then net. */
export function payslipRows(s: PayslipApi): (string | number)[][] {
  const rows: (string | number)[][] = [["Gross Salary", inr(s.gross)]];

  const deductions: [string, number][] = [];
  if (s.deductionsDetail) {
    // The backend breakdown already lists every deduction component by name.
    for (const part of s.deductionsDetail.split(";")) {
      const [name, amt] = part.split("|");
      if (name) deductions.push([name, Number(amt) || 0]);
    }
  } else {
    if (s.pf) deductions.push(["PF", s.pf]);
    if (s.esic) deductions.push(["ESIC", s.esic]);
    if (s.pt) deductions.push(["Professional Tax", s.pt]);
    if (s.otherDeductions) deductions.push(["Other Deductions", s.otherDeductions]);
  }
  for (const [name, amt] of deductions) rows.push([name, "- " + inr(amt)]);
  if (s.loanEmi) rows.push(["Loan EMI", "- " + inr(s.loanEmi)]);
  if (s.reimbursements) rows.push(["Reimbursements", "+ " + inr(s.reimbursements)]);
  rows.push(["Net Pay", inr(s.net)]);
  return rows;
}

export function downloadPayslip(s: PayslipApi, memberName: string) {
  const title = `Payslip - ${memberName}${s.month ? " - " + s.month : ""}`;
  return downloadPdf(title, ["Component", "Amount"], payslipRows(s), {
    rightAlignFrom: 1,
    subtitle: `${memberName} · ${s.payableDays}/${s.totalDays} payable days`,
  });
}
