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
  const rows: (string | number)[][] = [["Gross Salary", inr(s.gross)]];
  for (const [name, amt] of deductionsOf(s)) rows.push([name, "- " + inr(amt)]);
  if (s.loanEmi) rows.push(["Loan EMI", "- " + inr(s.loanEmi)]);
  if (s.reimbursements) rows.push(["Reimbursements", "+ " + inr(s.reimbursements)]);
  rows.push(["Net Pay", inr(s.net)]);
  return rows;
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
}

export async function downloadPayslip(s: PayslipApi, memberName: string, ctx: PayslipContext = {}) {
  const [{ jsPDF }, firm] = await Promise.all([import("jspdf"), getCachedFirmProfile()]);

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;
  const contentWidth = pageWidth - margin * 2;

  const INK: [number, number, number] = [17, 24, 39];
  const NAVY: [number, number, number] = [14, 42, 71];
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
  if (firm?.businessName) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    setText(NAVY);
    doc.text(firm.businessName, margin, y);
    const meta = [firm.address, firm.phone, firm.email].filter(Boolean).join("  ·  ");
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
  doc.text("SALARY SLIP", pageWidth - margin, 46, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  gray(110);
  doc.text(monthLabel(s.month), pageWidth - margin, 60, { align: "right" });

  y += 18;
  line(y);
  y += 20;

  // ---- Who this is, and what they worked ----
  const profile = ctx.profile;
  const details: [string, string][] = [
    ["Employee", memberName],
    ["Designation", profile?.designation || "—"],
    ["Department", ctx.member?.departmentName || "—"],
    ["Date of joining", profile?.joiningDate || "—"],
    ["Payable days", `${s.payableDays} of ${s.totalDays}`],
    ["PAN", profile?.pan || "—"],
    ["Bank A/c", profile?.bankAccount || "—"],
    ["IFSC", profile?.ifsc || "—"],
  ];
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
  const earnings: [string, number][] = [["Gross Salary", s.gross]];
  if (s.reimbursements) earnings.push(["Reimbursements", s.reimbursements]);
  const deductions: [string, number][] = [...deductionsOf(s)];
  if (s.loanEmi) deductions.push(["Loan EMI", s.loanEmi]);

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
  doc.text("NET PAY", margin + 12, y + 20);
  doc.text(pdfMoney(s.net), pageWidth - margin - 12, y + 20, { align: "right" });
  y += netH + 16;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  gray(110);
  doc.text("Amount in words", margin, y);
  doc.setFont("helvetica", "bold");
  setText(INK);
  doc.text(amountInWords(s.net), margin, y + 13, { maxWidth: contentWidth });
  y += 44;

  // ---- Signature, and the note that makes an unsigned slip acceptable ----
  doc.setDrawColor(200, 200, 200);
  doc.line(pageWidth - margin - 160, y + 26, pageWidth - margin, y + 26);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  gray(120);
  doc.text("Authorised Signatory", pageWidth - margin - 160, y + 38);
  doc.text(
    "This is a computer-generated salary slip and does not require a signature.",
    margin,
    y + 38,
    { maxWidth: contentWidth - 180 },
  );

  const safe = `${memberName}-${s.month ?? ""}`.replace(/[\\/:*?"<>|]/g, "-");
  doc.save(`Payslip-${safe}.pdf`);
}
