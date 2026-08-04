/**
 * Payroll report engine — turns each catalogue entry into a real dataset built from live backend
 * data (members, profiles, attendance muster, the latest payroll run's payslips). Used by the
 * Reports page to make every "Generate" (print) and "Export" (CSV/PDF) button actually work.
 */

import {
  getUsers, getPayrollProfiles, getMuster, getPayrollRun,
} from "./api";
import type { UserResponse, PayrollProfileResponse, PayslipApi, AttendanceApiResponse } from "./api";
import { inr } from "./format";

export interface ReportData {
  title: string;
  head: string[];
  rows: (string | number)[][];
  /** Columns from this index right-align (numeric) in the PDF. */
  rightAlignFrom?: number;
}

export interface ReportContext {
  members: UserResponse[];
  profiles: Map<number, PayrollProfileResponse>;
  muster: AttendanceApiResponse[];
  payslips: PayslipApi[];
  month: string;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Fetch everything the reports need in one shot (current month). Missing pieces degrade gracefully. */
export async function loadReportContext(): Promise<ReportContext> {
  const now = new Date();
  const month = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  const from = `${month}-01`;
  const to = `${month}-${pad(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate())}`;

  const usersRes = await getUsers(0, 500);
  const members = usersRes.content.filter((u) => u.onPayroll);
  const ids = members.map((m) => m.id);

  const [profilesArr, muster, run] = await Promise.all([
    ids.length ? getPayrollProfiles(ids).catch(() => []) : Promise.resolve([]),
    getMuster(from, to).catch(() => [] as AttendanceApiResponse[]),
    getPayrollRun(month).catch(() => null),
  ]);

  const profiles = new Map<number, PayrollProfileResponse>();
  for (const p of profilesArr) profiles.set(p.userId, p);
  const payslips = run?.payslips ?? [];
  return { members, profiles, muster, payslips, month };
}

/** Per-member attendance tallies from the muster. */
function tally(ctx: ReportContext) {
  const map = new Map<number, { p: number; a: number; hd: number; pl: number; wo: number; ot: number; fine: number }>();
  for (const m of ctx.members) map.set(m.id, { p: 0, a: 0, hd: 0, pl: 0, wo: 0, ot: 0, fine: 0 });
  for (const r of ctx.muster) {
    const t = map.get(r.userId);
    if (!t) continue;
    if (r.code === "P") t.p++;
    else if (r.code === "A") t.a++;
    else if (r.code === "HD") t.hd++;
    else if (r.code === "PL") t.pl++;
    else if (r.code === "WO") t.wo++;
    t.ot += Number(r.overtimeHours ?? 0);
    t.fine += Number(r.fineHours ?? 0);
  }
  return map;
}

const nameOf = (ctx: ReportContext, id: number) => ctx.members.find((m) => m.id === id)?.fullName ?? "";
const deptOf = (m: UserResponse) => m.departmentName ?? "—";

/** Builders keyed by the exact report name from PAYROLL_REPORT_GROUPS. */
export const REPORT_BUILDERS: Record<string, (ctx: ReportContext) => ReportData> = {
  "Muster Roll & Daily Logs": (ctx) => {
    const t = tally(ctx);
    return {
      title: `Muster Roll — ${ctx.month}`,
      head: ["Member", "Department", "Present", "Absent", "Half Day", "Paid Leave", "Week Off", "OT (hrs)"],
      rows: ctx.members.map((m) => {
        const x = t.get(m.id)!;
        return [m.fullName, deptOf(m), x.p, x.a, x.hd, x.pl, x.wo, x.ot.toFixed(1)];
      }),
      rightAlignFrom: 2,
    };
  },
  "Leave Management": (ctx) => {
    const t = tally(ctx);
    return {
      title: `Leave Management — ${ctx.month}`,
      head: ["Member", "Department", "Paid Leave Days", "Absent Days"],
      rows: ctx.members.map((m) => { const x = t.get(m.id)!; return [m.fullName, deptOf(m), x.pl, x.a]; }),
      rightAlignFrom: 2,
    };
  },
  "Attendance Audit": (ctx) => {
    const t = tally(ctx);
    return {
      title: `Attendance Audit — ${ctx.month}`,
      head: ["Member", "Department", "Present", "Overtime (hrs)", "Fine (hrs)"],
      rows: ctx.members.map((m) => { const x = t.get(m.id)!; return [m.fullName, deptOf(m), x.p, x.ot.toFixed(1), x.fine.toFixed(1)]; }),
      rightAlignFrom: 2,
    };
  },
  "Payroll Logs": (ctx) => ({
    title: `Payroll — ${ctx.month}`,
    head: ["Member", "Gross", "PF", "ESIC", "PT", "Other Ded.", "Loan EMI", "Net"],
    rows: ctx.payslips.map((s) => [nameOf(ctx, s.userId), inr(s.gross), inr(s.pf), inr(s.esic), inr(s.pt), inr(s.otherDeductions), inr(s.loanEmi), inr(s.net)]),
    rightAlignFrom: 1,
  }),
  "Salary Slips & Transfers": (ctx) => ({
    title: `Salary Transfers — ${ctx.month}`,
    head: ["Member", "Net Pay", "Bank A/c", "IFSC", "Bank"],
    rows: ctx.payslips.map((s) => {
      const p = ctx.profiles.get(s.userId);
      return [nameOf(ctx, s.userId), inr(s.net), p?.bankAccount ?? "—", p?.ifsc ?? "—", p?.bankName ?? "—"];
    }),
    rightAlignFrom: 1,
  }),
  "Deductions & Advances": (ctx) => ({
    title: `Deductions — ${ctx.month}`,
    head: ["Member", "PF", "ESIC", "PT", "Other Ded.", "Loan EMI"],
    rows: ctx.payslips.map((s) => [nameOf(ctx, s.userId), inr(s.pf), inr(s.esic), inr(s.pt), inr(s.otherDeductions), inr(s.loanEmi)]),
    rightAlignFrom: 1,
  }),
  "PF & ESIC": (ctx) => ({
    title: `PF & ESIC — ${ctx.month}`,
    head: ["Member", "Gross", "PF", "ESIC"],
    rows: ctx.payslips.map((s) => [nameOf(ctx, s.userId), inr(s.gross), inr(s.pf), inr(s.esic)]),
    rightAlignFrom: 1,
  }),
  "PT & LWF": (ctx) => ({
    title: `Professional Tax — ${ctx.month}`,
    head: ["Member", "Gross", "PT"],
    rows: ctx.payslips.map((s) => [nameOf(ctx, s.userId), inr(s.gross), inr(s.pt)]),
    rightAlignFrom: 1,
  }),
  "Compliance Overtime": (ctx) => {
    const t = tally(ctx);
    return {
      title: `Overtime — ${ctx.month}`,
      head: ["Member", "Department", "Overtime (hrs)"],
      rows: ctx.members.map((m) => [m.fullName, deptOf(m), t.get(m.id)!.ot.toFixed(1)]),
      rightAlignFrom: 2,
    };
  },
  "Scorecards & Leaderboards": (ctx) => {
    const t = tally(ctx);
    const scored = ctx.members
      .map((m) => {
        const x = t.get(m.id)!;
        const worked = x.p + x.a + x.hd + x.pl;
        const rate = worked > 0 ? Math.round(((x.p + x.hd * 0.5 + x.pl) / worked) * 100) : 0;
        return { m, x, rate };
      })
      .sort((a, b) => b.rate - a.rate);
    return {
      title: `Attendance Scorecard — ${ctx.month}`,
      head: ["Rank", "Member", "Present", "Absent", "Attendance %"],
      rows: scored.map((s, i) => [i + 1, s.m.fullName, s.x.p, s.x.a, `${s.rate}%`]),
      rightAlignFrom: 2,
    };
  },
  "Staff Lifecycle": (ctx) => ({
    title: "Staff Lifecycle",
    head: ["Member", "Department", "Designation", "Joining Date"],
    rows: ctx.members.map((m) => {
      const p = ctx.profiles.get(m.id);
      return [m.fullName, deptOf(m), p?.designation ?? "—", p?.joiningDate ?? "—"];
    }),
  }),
  "HR MIS & Details": (ctx) => ({
    title: "HR MIS",
    head: ["Member", "Email", "Department", "Designation", "Monthly CTC", "Bank A/c"],
    rows: ctx.members.map((m) => {
      const p = ctx.profiles.get(m.id);
      return [m.fullName, m.email, deptOf(m), p?.designation ?? "—", p ? inr(p.salary.monthlyCtc) : "—", p?.bankAccount ?? "—"];
    }),
    rightAlignFrom: 4,
  }),
};

/** Reports without a dedicated dataset yet fall back to a member roster so the export still works. */
export function buildReport(name: string, ctx: ReportContext): ReportData {
  const builder = REPORT_BUILDERS[name];
  if (builder) return builder(ctx);
  return {
    title: name,
    head: ["Member", "Department", "Designation"],
    rows: ctx.members.map((m) => [m.fullName, deptOf(m), ctx.profiles.get(m.id)?.designation ?? "—"]),
  };
}
