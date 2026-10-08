/**
 * The printed salary slip.
 *
 * It used to be the generic two-column export — "Component | Amount" over the firm's letterhead —
 * which is a data dump, not a payslip. Nobody could tell from it who the person was, what they were
 * paid for, or how many days they worked, and it is a document people take to a bank.
 *
 * This builds the layout an Indian salary slip actually has: who the employee is, what the month's
 * attendance was, earnings and deductions side by side so the two columns balance to the net, the
 * net in words, and a signature block. Earnings and deductions come from the same
 * `deductionsDetail` breakdown the run already produces — nothing new is derived here, so the slip
 * and the payroll register can never disagree.
 */

import { getCachedFirmProfile, amountInWords } from "./vyaparExport";
import { inr } from "./format";
import type { PayslipApi, PayrollProfileResponse, UserResponse } from "./api";
import { loadPayrollSetting } from "./payrollSettings";
import type { PayslipTemplate } from "./payrollSettings";

/**
 * Money for the PDF. jsPDF's built-in fonts have no ₹ glyph: it printed as "¹" and threw off the
 * width maths, so digits came out spaced apart and the Net Pay figure ran past the edge of its band.
 * The printed slip uses "Rs." and two decimals, the same as the invoice PDF.
 */
function pdfMoney(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  return `${v < 0 ? "-" : ""}Rs. ${Math.abs(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Component/amount rows for a payslip: gross, each deduction (negative), loan/reimb, then net. */
export function payslipRows(s: PayslipApi): (string | number)[][] {
  // Gross is total earnings: salary for the payable days + overtime + piece work + one-off earnings.
  const ot = Number(s.otAmount ?? 0);
  const work = Number(s.workAmount ?? 0);
  const varEarn = Number(s.variableEarnings ?? 0);
  const rows: (string | number)[][] = [];
  if (ot || work || varEarn) {
    rows.push(["Salary (payable days)", inr(Number(s.gross) - ot - work - varEarn)]);
    if (ot) rows.push(["Overtime", "+ " + inr(ot)]);
    if (work) rows.push(["Piece-rate work", "+ " + inr(work)]);
    if (s.earningsDetail) {
      for (const part of s.earningsDetail.split(";")) {
        const [name, amt] = part.split("|");
        if (name) rows.push([name, "+ " + inr(Number(amt) || 0)]);
      }
    } else if (varEarn) rows.push(["Other earnings", "+ " + inr(varEarn)]);
  }
  rows.push(["Gross Salary", inr(s.gross)]);
  for (const [name, amt] of deductionsOf(s)) rows.push([name, "- " + inr(amt)]);
  if (Number(s.fineAmount ?? 0)) rows.push(["Fines", "- " + inr(Number(s.fineAmount))]);
  if (Number(s.variableDeductions ?? 0)) rows.push(["Other deductions (one-off)", "- " + inr(Number(s.variableDeductions))]);
  if (Number(s.advanceDeduction ?? 0)) rows.push(["Advance recovered", "- " + inr(Number(s.advanceDeduction))]);
  if (s.loanEmi) rows.push(["Loan EMI", "- " + inr(s.loanEmi)]);
  if (Number(s.tds ?? 0)) rows.push(["TDS (income tax)", "- " + inr(Number(s.tds))]);
  if (s.reimbursements) rows.push(["Reimbursements", "+ " + inr(s.reimbursements)]);
  rows.push(["Net Pay", inr(s.net)]);
  return rows;
}

/**
 * Both columns of the printed slip. Every line the run deducted is listed, so total earnings −
 * total deductions is the net (the slip used to print only gross and the statutory lines, and
 * fines / advances / one-offs were missing, so the columns never balanced).
 */
export function payslipColumns(s: PayslipApi, breakdown: boolean) {
  const ot = Number(s.otAmount ?? 0);
  const work = Number(s.workAmount ?? 0);
  const varEarn = Number(s.variableEarnings ?? 0);
  const earnings: [string, number][] = [];
  if (breakdown && (ot || work || varEarn)) {
    earnings.push(["Salary (payable days)", Number(s.gross) - ot - work - varEarn]);
    if (ot) earnings.push(["Overtime", ot]);
    if (work) earnings.push(["Piece-rate work", work]);
    if (s.earningsDetail) {
      for (const part of s.earningsDetail.split(";")) {
        const [name, amt] = part.split("|");
        if (name) earnings.push([name, Number(amt) || 0]);
      }
    } else if (varEarn) earnings.push(["Other earnings", varEarn]);
  } else {
    earnings.push(["Gross Salary", Number(s.gross)]);
  }
  if (s.reimbursements) earnings.push(["Reimbursements", Number(s.reimbursements)]);

  const deductions: [string, number][] = [...deductionsOf(s)];
  if (Number(s.fineAmount ?? 0)) deductions.push(["Fines", Number(s.fineAmount)]);
  if (Number(s.variableDeductions ?? 0)) deductions.push(["Other deductions", Number(s.variableDeductions)]);
  if (Number(s.advanceDeduction ?? 0)) deductions.push(["Advance recovered", Number(s.advanceDeduction)]);
  if (s.loanEmi) deductions.push(["Loan EMI", Number(s.loanEmi)]);
  if (Number(s.tds ?? 0)) deductions.push(["TDS (income tax)", Number(s.tds)]);
  return { earnings, deductions };
}

/**
 * The leave a slip covers, in one line — "2 paid · 1 unpaid (Casual Leave 2 · Sick Leave 1)".
 * Null when the month had none, so callers can skip the row.
 */
export function leaveSummary(s: PayslipApi): string | null {
  const paid = Number(s.paidLeaveDays ?? 0);
  const unpaid = Number(s.unpaidLeaveDays ?? 0);
  if (!paid && !unpaid && !s.leaveDetail) return null;
  const parts: string[] = [];
  if (paid) parts.push(`${paid} paid`);
  if (unpaid) parts.push(`${unpaid} unpaid`);
  const head = parts.join(" · ") || "Approved";
  return s.leaveDetail ? `${head} (${s.leaveDetail})` : head;
}

/** Every deduction on this slip, by name. Falls back to the flat columns on an older record. */
function deductionsOf(s: PayslipApi): [string, number][] {
  if (s.deductionsDetail) {
    const out: [string, number][] = [];
    // The backend breakdown already lists every deduction component by name.
    for (const part of s.deductionsDetail.split(";")) {
      const [name, amt] = part.split("|");
      if (name) out.push([name, Number(amt) || 0]);
    }
    return out;
  }
  const out: [string, number][] = [];
  if (s.pf) out.push(["PF", s.pf]);
  if (s.esic) out.push(["ESIC", s.esic]);
  if (s.pt) out.push(["Professional Tax", s.pt]);
  if (s.otherDeductions) out.push(["Other Deductions", s.otherDeductions]);
  return out;
}

/** "2026-08" → "August 2026". Anything unparseable is printed as it came. */
function monthLabel(month: string | null): string {
  if (!month) return "";
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return month;
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

export interface PayslipContext {
  /** The member's directory record — designation, department, joining date live here or on the profile. */
  member?: UserResponse | null;
  profile?: PayrollProfileResponse | null;
  /** Use this template instead of the saved one (the designer's sample download). */
  template?: PayslipTemplate;
}

function hexRgb(hex: string, fallback: [number, number, number]): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export async function downloadPayslip(s: PayslipApi, memberName: string, ctx: PayslipContext = {}) {
  const [{ jsPDF }, firm, saved] = await Promise.all([
    import("jspdf"), getCachedFirmProfile(), ctx.template ? Promise.resolve(ctx.template) : loadPayrollSetting("PAYSLIP_TEMPLATE"),
  ]);
  const t = saved;

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;
  const contentWidth = pageWidth - margin * 2;

  const INK: [number, number, number] = [17, 24, 39];
  const NAVY: [number, number, number] = hexRgb(t.accent, [14, 42, 71]);
  const HAIRLINE: [number, number, number] = [225, 229, 234];
  const setText = (c: [number, number, number]) => doc.setTextColor(c[0], c[1], c[2]);
  const setFill = (c: [number, number, number]) => doc.setFillColor(c[0], c[1], c[2]);
  const gray = (n: number) => doc.setTextColor(n, n, n);
  const line = (y: number) => {
    doc.setDrawColor(HAIRLINE[0], HAIRLINE[1], HAIRLINE[2]);
    doc.setLineWidth(0.75);
    doc.line(margin, y, pageWidth - margin, y);
  };

  // ---- Letterhead ----
  let y = 46;
  const companyName = t.companyName.trim() || firm?.businessName || "";
  if (companyName) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    setText(NAVY);
    doc.text(companyName, margin, y, { maxWidth: contentWidth - 150 });
    const meta = t.companyAddress.trim()
      || [firm?.address, firm?.phone, firm?.email].filter(Boolean).join("  ·  ");
    if (meta) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      gray(120);
      doc.text(meta, margin, y + 13, { maxWidth: contentWidth });
      y += 13;
    }
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  setText(INK);
  doc.text(t.title || "SALARY SLIP", pageWidth - margin, 46, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  gray(110);
  doc.text(monthLabel(s.month), pageWidth - margin, 60, { align: "right" });

  y += 18;
  line(y);
  y += 20;
  if (t.headerNote.trim()) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    gray(90);
    const lines = doc.splitTextToSize(t.headerNote.trim(), contentWidth) as string[];
    doc.text(lines, margin, y);
    y += lines.length * 11 + 8;
  }

  // ---- Who this is, and what they worked ----
  const profile = ctx.profile;
  const f = t.fields;
  const details: [string, string][] = [["Employee", memberName]];
  if (f.staffCode) details.push(["Staff ID", profile?.details?.staffCode || "—"]);
  if (f.designation) details.push(["Designation", profile?.designation || "—"]);
  if (f.department) details.push(["Department", ctx.member?.departmentName || "—"]);
  if (f.joiningDate) details.push(["Date of joining", profile?.joiningDate || "—"]);
  if (f.payableDays) details.push(["Payable days", `${s.payableDays} of ${s.totalDays}`]);
  const leave = leaveSummary(s);
  if (leave) details.push(["Leave", leave]);
  if (s.claimDetail) details.push(["Claims paid", s.claimDetail]);
  if (f.pan) details.push(["PAN", profile?.pan || "—"]);
  if (f.uan) details.push(["UAN", profile?.details?.uan || "—"]);
  if (f.bank) details.push(["Bank A/c", profile?.bankAccount || "—"]);
  if (f.ifsc) details.push(["IFSC", profile?.ifsc || "—"]);
  const colW = contentWidth / 2;
  doc.setFontSize(8.5);
  details.forEach(([label, value], i) => {
    const x = margin + (i % 2) * colW;
    const rowY = y + Math.floor(i / 2) * 15;
    doc.setFont("helvetica", "normal");
    gray(120);
    doc.text(label, x, rowY);
    doc.setFont("helvetica", "bold");
    setText(INK);
    doc.text(value, x + 90, rowY, { maxWidth: colW - 100 });
  });
  y += Math.ceil(details.length / 2) * 15 + 10;
  line(y);
  y += 22;

  // ---- Earnings (left) and deductions (right), so the two sides visibly balance ----
  const { earnings, deductions } = payslipColumns(s, t.earningsBreakdown);

  const gapX = 16;
  const halfW = (contentWidth - gapX) / 2;
  const rightX = margin + halfW + gapX;
  const headerH = 20;

  setFill(NAVY);
  doc.rect(margin, y, halfW, headerH, "F");
  doc.rect(rightX, y, halfW, headerH, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text("EARNINGS", margin + 10, y + 13.5);
  doc.text("AMOUNT", margin + halfW - 10, y + 13.5, { align: "right" });
  doc.text("DEDUCTIONS", rightX + 10, y + 13.5);
  doc.text("AMOUNT", rightX + halfW - 10, y + 13.5, { align: "right" });

  const rowH = 16;
  const bodyTop = y + headerH;
  const bodyRows = Math.max(earnings.length, deductions.length, 3);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  for (let i = 0; i < bodyRows; i++) {
    const rowY = bodyTop + i * rowH + 12;
    if (earnings[i]) {
      gray(70);
      doc.text(earnings[i][0], margin + 10, rowY, { maxWidth: halfW - 90 });
      setText(INK);
      doc.text(pdfMoney(earnings[i][1]), margin + halfW - 10, rowY, { align: "right" });
    }
    if (deductions[i]) {
      gray(70);
      doc.text(deductions[i][0], rightX + 10, rowY, { maxWidth: halfW - 90 });
      setText(INK);
      doc.text(pdfMoney(deductions[i][1]), rightX + halfW - 10, rowY, { align: "right" });
    }
  }

  const totalsY = bodyTop + bodyRows * rowH;
  const totalEarnings = earnings.reduce((a, [, v]) => a + v, 0);
  const totalDeductions = deductions.reduce((a, [, v]) => a + v, 0);

  doc.setDrawColor(HAIRLINE[0], HAIRLINE[1], HAIRLINE[2]);
  doc.rect(margin, y, halfW, totalsY - y + rowH + 4);
  doc.rect(rightX, y, halfW, totalsY - y + rowH + 4);
  doc.line(margin, totalsY, margin + halfW, totalsY);
  doc.line(rightX, totalsY, rightX + halfW, totalsY);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  setText(INK);
  doc.text("Total Earnings", margin + 10, totalsY + 14);
  doc.text(pdfMoney(totalEarnings), margin + halfW - 10, totalsY + 14, { align: "right" });
  doc.text("Total Deductions", rightX + 10, totalsY + 14);
  doc.text(pdfMoney(totalDeductions), rightX + halfW - 10, totalsY + 14, { align: "right" });

  y = totalsY + rowH + 24;

  // ---- Net pay, in a band so it reads first, then the same figure in words ----
  const netH = 30;
  setFill(NAVY);
  doc.rect(margin, y, contentWidth, netH, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  const net = t.roundOff ? Math.round(Number(s.net)) : Number(s.net);
  doc.text("NET PAY", margin + 12, y + 20);
  doc.text(pdfMoney(net), pageWidth - margin - 12, y + 20, { align: "right" });
  y += netH + 16;
  const roundDiff = net - Number(s.net);
  if (t.roundOff && Math.abs(roundDiff) >= 0.005) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    gray(120);
    doc.text(`Includes round off of ${pdfMoney(roundDiff)}`, pageWidth - margin, y - 4, { align: "right" });
    y += 8;
  }

  if (t.amountInWords) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    gray(110);
    doc.text("Amount in words", margin, y);
    doc.setFont("helvetica", "bold");
    setText(INK);
    doc.text(amountInWords(net), margin, y + 13, { maxWidth: contentWidth });
    y += 44;
  } else {
    y += 8;
  }

  // ---- Signature, and the note that makes an unsigned slip acceptable ----
  doc.setDrawColor(200, 200, 200);
  doc.line(pageWidth - margin - 160, y + 26, pageWidth - margin, y + 26);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  gray(120);
  doc.text(t.signatory || "Authorised Signatory", pageWidth - margin - 160, y + 38);
  if (t.footerNote.trim()) {
    doc.text(t.footerNote.trim(), margin, y + 38, { maxWidth: contentWidth - 180 });
  }

  const safe = `${memberName}-${s.month ?? ""}`.replace(/[\\/:*?"<>|]/g, "-");
  doc.save(`Payslip-${safe}.pdf`);
}

const VOUCHER_TITLES: Record<string, string> = {
  SALARY: "SALARY PAYMENT VOUCHER",
  ADVANCE: "ADVANCE SALARY VOUCHER",
  BONUS: "BONUS PAYMENT VOUCHER",
  GENERAL: "PAYMENT VOUCHER",
  ADJUSTMENT: "ADJUSTMENT VOUCHER",
  FNF: "FULL & FINAL SETTLEMENT VOUCHER",
};

/**
 * A one-page voucher for a payment made outside the payslip — bonus, advance, off-cycle or full
 * and final — so it can be signed by the receiver. `lines` adds a breakdown (the F&F statement).
 */
export async function downloadPaymentVoucher(
  p: { id?: number; category: string; mode?: string | null; amount: number; recordDate: string; month?: string | null; description?: string | null },
  memberName: string,
  opts: { profile?: PayrollProfileResponse | null; lines?: [string, number][] } = {},
) {
  const [{ jsPDF }, firm, t] = await Promise.all([import("jspdf"), getCachedFirmProfile(), loadPayrollSetting("PAYSLIP_TEMPLATE")]);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;
  const contentWidth = pageWidth - margin * 2;
  const ACCENT = hexRgb(t.accent, [14, 42, 71]);

  let y = 46;
  const companyName = t.companyName.trim() || firm?.businessName || "";
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(ACCENT[0], ACCENT[1], ACCENT[2]);
  if (companyName) doc.text(companyName, margin, y, { maxWidth: contentWidth - 200 });
  const meta = t.companyAddress.trim() || [firm?.address, firm?.phone].filter(Boolean).join("  ·  ");
  if (meta) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(meta, margin, y + 13, { maxWidth: contentWidth - 200 });
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(17, 24, 39);
  doc.text(VOUCHER_TITLES[p.category] ?? "PAYMENT VOUCHER", pageWidth - margin, 46, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(110, 110, 110);
  if (p.id) doc.text(`Voucher no. PV-${p.id}`, pageWidth - margin, 60, { align: "right" });
  y = 84;
  doc.setDrawColor(225, 229, 234);
  doc.line(margin, y, pageWidth - margin, y);
  y += 22;

  const rows: [string, string][] = [
    ["Paid to", memberName],
    ["Designation", opts.profile?.designation || "—"],
    ["Date", p.recordDate],
    ["Salary cycle", p.month ? monthLabel(p.month) : "—"],
    ["Mode", p.mode || "—"],
    ["PAN", opts.profile?.pan || "—"],
  ];
  doc.setFontSize(9);
  rows.forEach(([label, value], i) => {
    const x = margin + (i % 2) * (contentWidth / 2);
    const ry = y + Math.floor(i / 2) * 16;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120, 120, 120);
    doc.text(label, x, ry);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(17, 24, 39);
    doc.text(value, x + 80, ry, { maxWidth: contentWidth / 2 - 90 });
  });
  y += Math.ceil(rows.length / 2) * 16 + 12;

  if (opts.lines?.length) {
    doc.setFillColor(ACCENT[0], ACCENT[1], ACCENT[2]);
    doc.rect(margin, y, contentWidth, 20, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.text("PARTICULARS", margin + 10, y + 13.5);
    doc.text("AMOUNT", pageWidth - margin - 10, y + 13.5, { align: "right" });
    y += 20;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    for (const [label, amt] of opts.lines) {
      y += 16;
      doc.setTextColor(70, 70, 70);
      doc.text(label, margin + 10, y);
      doc.setTextColor(17, 24, 39);
      doc.text(pdfMoney(amt), pageWidth - margin - 10, y, { align: "right" });
    }
    y += 10;
    doc.line(margin, y, pageWidth - margin, y);
    y += 14;
  }

  doc.setFillColor(ACCENT[0], ACCENT[1], ACCENT[2]);
  doc.rect(margin, y, contentWidth, 30, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text("AMOUNT PAID", margin + 12, y + 20);
  doc.text(pdfMoney(p.amount), pageWidth - margin - 12, y + 20, { align: "right" });
  y += 46;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(110, 110, 110);
  doc.text("Amount in words", margin, y);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(17, 24, 39);
  doc.text(amountInWords(p.amount), margin, y + 13, { maxWidth: contentWidth });
  y += 30;
  if (p.description) {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(90, 90, 90);
    doc.text(`Narration: ${p.description}`, margin, y + 6, { maxWidth: contentWidth });
    y += 20;
  }

  y += 40;
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, y, margin + 160, y);
  doc.line(pageWidth - margin - 160, y, pageWidth - margin, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text("Receiver's signature", margin, y + 12);
  doc.text(t.signatory || "Authorised Signatory", pageWidth - margin - 160, y + 12);

  const safe = `${memberName}-${p.recordDate}`.replace(/[\/:*?"<>|]/g, "-");
  doc.save(`Voucher-${safe}.pdf`);
}
