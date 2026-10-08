/**
 * Payroll report engine — PagarBook's report catalogue (Attendance, Leave, Payroll, Statutory,
 * Payment Logs, Employees, Deductions, Loans, Reimbursements, Miscellaneous, Audit), each built from
 * live backend data for one month. Used by the Reports page for preview, PDF, Excel and CSV.
 */

import {
  allLeave, getAttendanceLogsBetween, getHolidayPolicies, getLoansApi, getMuster, getPaymentsApi, getPayrollProfiles,
  getPayrollRun, getReimbursementsApi, getShifts, getPayrollPeople, getVariablesApi, getWorkLogsApi,
} from "./api";
import type {
  AttendanceApiResponse, AttendanceLogApi, HolidayPolicyResponse, LeaveRequestApi, LoanApi, PaymentApi,
  PayrollProfileResponse, PayslipApi, ReimbursementApi, ShiftResponse, UserResponse, VariableApi, WorkLogApi,
} from "./api";
import { ATTENDANCE_META } from "./payrollConfig";
import { payGroupOf } from "./payrollGroups";
import { todayIST } from "./datetime";

export interface ReportData {
  title: string;
  head: string[];
  rows: (string | number)[][];
  /** Columns from this index right-align (numeric) in the PDF. */
  rightAlignFrom?: number;
}

export interface ReportContext {
  /** Everyone on payroll. */
  members: UserResponse[];
  profiles: Map<number, PayrollProfileResponse>;
  muster: AttendanceApiResponse[];
  payslips: PayslipApi[];
  prevPayslips: PayslipApi[];
  payments: PaymentApi[];
  variables: VariableApi[];
  workLogs: WorkLogApi[];
  loans: LoanApi[];
  leave: LeaveRequestApi[];
  reimbursements: ReimbursementApi[];
  auditLogs: AttendanceLogApi[];
  holidayPolicies: HolidayPolicyResponse[];
  shifts: ShiftResponse[];
  month: string;
  from: string;
  to: string;
  days: number;
}

const pad = (n: number) => String(n).padStart(2, "0");
const num = (v: number | null | undefined) => Math.round(Number(v ?? 0) * 100) / 100;

/** `yyyy-MM` for right now, in the browser's calendar — the default month for every report. */
export function currentReportMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
}

function prevMonth(month: string) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

/** Fetch everything the reports need for one month. Missing pieces degrade to empty lists. */
export async function loadReportContext(month: string = currentReportMonth()): Promise<ReportContext> {
  const [year, monthNo] = month.split("-").map(Number);
  const days = new Date(year, monthNo, 0).getDate();
  const from = `${month}-01`;
  const to = `${month}-${pad(days)}`;

  const usersRes = await getPayrollPeople();
  const members = usersRes.content.filter((u) => u.onPayroll);
  const ids = members.map((m) => m.id);
  const safe = <T,>(p: Promise<T>, fallback: T) => p.catch(() => fallback);

  const [profilesArr, muster, run, prevRun, payments, variables, workLogs, loans, leave, reimbursements, auditLogs, holidayPolicies, shifts] =
    await Promise.all([
      ids.length ? safe(getPayrollProfiles(ids), []) : Promise.resolve([]),
      safe(getMuster(from, to), [] as AttendanceApiResponse[]),
      safe(getPayrollRun(month), null),
      safe(getPayrollRun(prevMonth(month)), null),
      safe(getPaymentsApi({ month }), [] as PaymentApi[]),
      safe(getVariablesApi({ month }), [] as VariableApi[]),
      safe(getWorkLogsApi(from, to), [] as WorkLogApi[]),
      safe(getLoansApi(), [] as LoanApi[]),
      safe(allLeave(), [] as LeaveRequestApi[]),
      safe(getReimbursementsApi(), [] as ReimbursementApi[]),
      safe(getAttendanceLogsBetween(from, to), [] as AttendanceLogApi[]),
      safe(getHolidayPolicies(), [] as HolidayPolicyResponse[]),
      safe(getShifts(), [] as ShiftResponse[]),
    ]);

  const profiles = new Map<number, PayrollProfileResponse>();
  for (const p of profilesArr) profiles.set(p.userId, p);
  return {
    members, profiles, muster, payslips: run?.payslips ?? [], prevPayslips: prevRun?.payslips ?? [],
    payments, variables, workLogs, loans, leave, reimbursements, auditLogs, holidayPolicies, shifts,
    month, from, to, days,
  };
}

/** Per-member attendance tallies from the muster. */
function tally(ctx: ReportContext) {
  const map = new Map<number, { p: number; a: number; hd: number; pl: number; wo: number; od: number; l: number; ot: number; otAmt: number; fineH: number; fine: number; inP: number; payable: number }>();
  for (const m of ctx.members) map.set(m.id, { p: 0, a: 0, hd: 0, pl: 0, wo: 0, od: 0, l: 0, ot: 0, otAmt: 0, fineH: 0, fine: 0, inP: 0, payable: 0 });
  for (const r of ctx.muster) {
    const t = map.get(r.userId);
    if (!t) continue;
    if (r.code === "P") t.p++;
    else if (r.code === "A") t.a++;
    else if (r.code === "HD") t.hd++;
    else if (r.code === "PL") t.pl++;
    else if (r.code === "WO") t.wo++;
    else if (r.code === "OD") t.od++;
    else if (r.code === "L") t.l++;
    t.ot += Number(r.overtimeHours ?? 0);
    t.otAmt += Number(r.otAmount ?? 0);
    t.fineH += Number(r.fineHours ?? 0);
    t.fine += Number(r.fineAmount ?? 0);
    if (r.inTime) t.inP++;
    t.payable += Number(r.payableDays ?? 0);
  }
  return map;
}

const nameOf = (ctx: ReportContext, id: number) => ctx.members.find((m) => m.id === id)?.fullName ?? `#${id}`;
const deptOf = (m: UserResponse | undefined) => m?.departmentName ?? "—";
const codeOf = (ctx: ReportContext, id: number) => ctx.profiles.get(id)?.details?.staffCode ?? String(id);
const d = (v: string | null | undefined) => v ?? "—";

function dateRange(ctx: ReportContext) {
  const out: string[] = [];
  for (let i = 1; i <= ctx.days; i++) out.push(`${ctx.month}-${pad(i)}`);
  return out;
}

/** Report catalogue: PagarBook's categories, each report a name, a description and a builder. */
export interface ReportDef {
  name: string;
  desc: string;
  build: (ctx: ReportContext) => ReportData;
}
export interface ReportCategory {
  key: string;
  title: string;
  icon: "calendar" | "leave" | "wallet" | "shield" | "bank" | "users" | "minus" | "landmark" | "receipt" | "grid" | "audit";
  reports: ReportDef[];
}

const slipBy = (ctx: ReportContext) => new Map(ctx.payslips.map((s) => [s.userId, s]));

export const REPORT_CATALOGUE: ReportCategory[] = [
  {
    key: "attendance", title: "Attendance", icon: "calendar",
    reports: [
      {
        name: "Attendance Report", desc: "Staff level summary for the attendance cycle",
        build: (ctx) => {
          const t = tally(ctx);
          return {
            title: `Attendance Report — ${ctx.month}`,
            head: ["Staff ID", "Staff", "Department", "Present", "Absent", "Half Day", "Paid Leave", "Unpaid Leave", "On Duty", "Week Off", "Payable Days", "OT (hrs)", "Fine (hrs)"],
            rows: ctx.members.map((m) => { const x = t.get(m.id)!; return [codeOf(ctx, m.id), m.fullName, deptOf(m), x.p, x.a, x.hd, x.pl, x.l, x.od, x.wo, num(x.payable), num(x.ot), num(x.fineH)]; }),
            rightAlignFrom: 3,
          };
        },
      },
      {
        name: "Muster Roll Report", desc: "Monthly view of day-wise attendance, fine, OT of all staff",
        build: (ctx) => {
          const dates = dateRange(ctx);
          const map = new Map(ctx.muster.map((r) => [`${r.userId}|${r.date}`, r]));
          const t = tally(ctx);
          return {
            title: `Muster Roll — ${ctx.month}`,
            head: ["Staff", ...dates.map((x) => x.slice(8)), "P", "A", "HD", "PL", "OT h", "Fine ₹"],
            rows: ctx.members.map((m) => {
              const x = t.get(m.id)!;
              return [m.fullName, ...dates.map((dt) => { const r = map.get(`${m.id}|${dt}`); return r && r.code !== "NM" ? r.code : "-"; }), x.p, x.a, x.hd, x.pl, num(x.ot), num(x.fine)];
            }),
          };
        },
      },
      {
        name: "Daily Attendance Report", desc: "Day wise attendance with punch in / out and hours",
        build: (ctx) => ({
          title: `Daily Attendance — ${ctx.month}`,
          head: ["Date", "Staff", "Status", "In", "Out", "Worked (h)", "OT (h)", "Fine ₹", "Note"],
          rows: [...ctx.muster].sort((a, b) => a.date.localeCompare(b.date) || a.memberName.localeCompare(b.memberName))
            .map((r) => [r.date, r.memberName, ATTENDANCE_META[r.code]?.label ?? r.code, d(r.inTime), d(r.outTime), r.workedHours != null ? num(r.workedHours) : "—", num(r.overtimeHours), num(r.fineAmount), r.note ?? ""]),
        }),
      },
      {
        name: "Punch In Punch Out Report", desc: "Punch in / out times with the GPS location of each punch",
        build: (ctx) => ({
          title: `Punch In / Out — ${ctx.month}`,
          head: ["Date", "Staff", "Punch In", "In Location", "Punch Out", "Out Location"],
          rows: ctx.muster.filter((r) => r.inTime || r.outTime).map((r) => [
            r.date, r.memberName, d(r.inTime), r.punchInLat != null ? `${r.punchInLat}, ${r.punchInLng}` : "—",
            d(r.outTime), r.punchOutLat != null ? `${r.punchOutLat}, ${r.punchOutLng}` : "—",
          ]),
        }),
      },
      {
        name: "Attendance Notes Report", desc: "Day-wise attendance notes — only staff with a note in the cycle",
        build: (ctx) => ({
          title: `Attendance Notes — ${ctx.month}`,
          head: ["Date", "Staff", "Status", "Note"],
          rows: ctx.muster.filter((r) => r.note).map((r) => [r.date, r.memberName, ATTENDANCE_META[r.code]?.label ?? r.code, r.note!]),
        }),
      },
      {
        name: "Shift Attendance Report", desc: "Each staff member's shift and present days",
        build: (ctx) => {
          const t = tally(ctx);
          return {
            title: `Shift Attendance — ${ctx.month}`,
            head: ["Staff", "Shift", "Timings", "Present", "Half Day", "Punched In"],
            rows: ctx.members.map((m) => {
              const s = ctx.shifts.find((x) => x.id === ctx.profiles.get(m.id)?.shiftId);
              const x = t.get(m.id)!;
              return [m.fullName, s?.name ?? "No shift", s ? `${s.startTime}–${s.endTime}` : "—", x.p, x.hd, x.inP];
            }),
            rightAlignFrom: 3,
          };
        },
      },
      {
        name: "Scorecard Report", desc: "Each staff's attendance score and leaderboard rank",
        build: (ctx) => {
          const t = tally(ctx);
          const scored = ctx.members.map((m) => {
            const x = t.get(m.id)!;
            const worked = x.p + x.a + x.hd + x.pl + x.l + x.od;
            const rate = worked > 0 ? Math.round(((x.p + x.od + x.hd * 0.5 + x.pl) / worked) * 100) : 0;
            return { m, x, rate };
          }).sort((a, b) => b.rate - a.rate);
          return {
            title: `Attendance Scorecard — ${ctx.month}`,
            head: ["Rank", "Staff", "Present", "Absent", "Late fines (h)", "Attendance %"],
            rows: scored.map((s, i) => [i + 1, s.m.fullName, s.x.p, s.x.a, num(s.x.fineH), `${s.rate}%`]),
            rightAlignFrom: 2,
          };
        },
      },
    ],
  },
  {
    key: "leave", title: "Leave", icon: "leave",
    reports: [
      {
        name: "Applied Leaves Report", desc: "All leave applications overlapping the month",
        build: (ctx) => ({
          title: `Applied Leaves — ${ctx.month}`,
          head: ["Staff", "Leave Type", "From", "To", "Days", "Status", "Reason", "Applied"],
          rows: ctx.leave.filter((l) => l.fromDate <= ctx.to && l.toDate >= ctx.from)
            .map((l) => [l.memberName, l.leaveTypeName, l.fromDate, l.toDate, num(l.days), l.status, l.reason ?? "", l.createdAt?.slice(0, 10) ?? ""]),
        }),
      },
      {
        name: "Leave Summary Report", desc: "Approved leave taken per staff, by leave type",
        build: (ctx) => {
          const approved = ctx.leave.filter((l) => l.status === "APPROVED" && l.fromDate <= ctx.to && l.toDate >= ctx.from);
          const types = [...new Set(approved.map((l) => l.leaveTypeName))];
          return {
            title: `Leave Summary — ${ctx.month}`,
            head: ["Staff", ...types, "Total"],
            rows: ctx.members.map((m) => {
              const mine = approved.filter((l) => l.userId === m.id);
              const per = types.map((t) => num(mine.filter((l) => l.leaveTypeName === t).reduce((a, l) => a + Number(l.days), 0)));
              return [m.fullName, ...per, num(per.reduce((a, b) => a + b, 0))];
            }).filter((r) => Number(r[r.length - 1]) > 0),
            rightAlignFrom: 1,
          };
        },
      },
      {
        name: "LOP Summary Report", desc: "Staff-wise loss of pay days for the payroll cycle",
        build: (ctx) => ({
          title: `LOP Summary — ${ctx.month}`,
          head: ["Staff", "Total Days", "Payable Days", "LOP Days (computed)", "LOP Override", "Reason"],
          rows: ctx.payslips.map((s) => [s.memberName, s.totalDays, num(s.payableDays), num(s.lopDays), s.lopOverride != null ? num(s.lopOverride) : "—", s.lopReason ?? ""]),
          rightAlignFrom: 1,
        }),
      },
    ],
  },
  {
    key: "payroll", title: "Payroll", icon: "wallet",
    reports: [
      {
        name: "Staff Payroll Report", desc: "Complete payroll of all staff for the cycle",
        build: (ctx) => ({
          title: `Staff Payroll — ${ctx.month}`,
          head: ["Staff ID", "Staff", "Staff Type", "Payable Days", "Gross", "OT", "Piece work", "One-off +", "PF", "ESIC", "PT", "Other", "Fines", "One-off −", "Advance", "Loan EMI", "Reimb.", "Net", "Status"],
          rows: ctx.payslips.map((s) => [
            codeOf(ctx, s.userId), s.memberName, payGroupOf(ctx.profiles.get(s.userId)), num(s.payableDays), num(s.gross), num(s.otAmount), num(s.workAmount), num(s.variableEarnings),
            num(s.pf), num(s.esic), num(s.pt), num(s.otherDeductions), num(s.fineAmount), num(s.variableDeductions), num(s.advanceDeduction), num(s.loanEmi), num(s.reimbursements), num(s.net),
            s.payStatus === "PAID" ? "Paid" : s.holdStatus ?? "Unpaid",
          ]),
          rightAlignFrom: 3,
        }),
      },
      {
        name: "Payroll Components Summary Report", desc: "Component-wise payroll payout totals",
        build: (ctx) => {
          const sum = (f: (s: PayslipApi) => number) => num(ctx.payslips.reduce((a, s) => a + f(s), 0));
          const lines: [string, number][] = [
            ["Gross earnings", sum((s) => Number(s.gross))], ["of which overtime", sum((s) => Number(s.otAmount ?? 0))],
            ["of which piece work", sum((s) => Number(s.workAmount ?? 0))], ["of which one-off earnings", sum((s) => Number(s.variableEarnings ?? 0))],
            ["PF", sum((s) => Number(s.pf))], ["ESIC", sum((s) => Number(s.esic))], ["Professional Tax", sum((s) => Number(s.pt))],
            ["Other deductions", sum((s) => Number(s.otherDeductions))], ["Fines", sum((s) => Number(s.fineAmount ?? 0))],
            ["One-off deductions", sum((s) => Number(s.variableDeductions ?? 0))], ["Advance recovered", sum((s) => Number(s.advanceDeduction ?? 0))], ["TDS", sum((s) => Number(s.tds ?? 0))],
            ["Loan EMI", sum((s) => Number(s.loanEmi))], ["Reimbursements", sum((s) => Number(s.reimbursements))], ["Net payout", sum((s) => Number(s.net))],
          ];
          return { title: `Payroll Components — ${ctx.month}`, head: ["Component", "Amount"], rows: lines, rightAlignFrom: 1 };
        },
      },
      {
        name: "Payroll Difference - Employee Wise", desc: "Compare each employee's payroll with the previous month",
        build: (ctx) => {
          const prev = new Map(ctx.prevPayslips.map((s) => [s.userId, s]));
          const ids = [...new Set([...ctx.payslips.map((s) => s.userId), ...ctx.prevPayslips.map((s) => s.userId)])];
          const cur = slipBy(ctx);
          return {
            title: `Payroll Difference — ${prevMonth(ctx.month)} vs ${ctx.month}`,
            head: ["Staff", "Gross (prev)", "Gross (this)", "Net (prev)", "Net (this)", "Change", "Change %"],
            rows: ids.map((id) => {
              const a = prev.get(id); const b = cur.get(id);
              const pn = Number(a?.net ?? 0); const cn = Number(b?.net ?? 0);
              return [b?.memberName ?? a?.memberName ?? nameOf(ctx, id), num(a?.gross), num(b?.gross), num(pn), num(cn), num(cn - pn), pn ? `${num(((cn - pn) / pn) * 100)}%` : "—"];
            }),
            rightAlignFrom: 1,
          };
        },
      },
      {
        name: "Payroll Difference - Component Wise", desc: "Compare component totals across two months",
        build: (ctx) => {
          const tot = (list: PayslipApi[], f: (s: PayslipApi) => number) => num(list.reduce((a, s) => a + f(s), 0));
          const comps: [string, (s: PayslipApi) => number][] = [
            ["Gross", (s) => Number(s.gross)], ["Overtime", (s) => Number(s.otAmount ?? 0)], ["PF", (s) => Number(s.pf)], ["ESIC", (s) => Number(s.esic)],
            ["PT", (s) => Number(s.pt)], ["Fines", (s) => Number(s.fineAmount ?? 0)], ["Advance", (s) => Number(s.advanceDeduction ?? 0)],
            ["Loan EMI", (s) => Number(s.loanEmi)], ["Net", (s) => Number(s.net)],
          ];
          return {
            title: `Component Difference — ${prevMonth(ctx.month)} vs ${ctx.month}`,
            head: ["Component", prevMonth(ctx.month), ctx.month, "Change"],
            rows: comps.map(([n, f]) => { const a = tot(ctx.prevPayslips, f); const b = tot(ctx.payslips, f); return [n, a, b, num(b - a)]; }),
            rightAlignFrom: 1,
          };
        },
      },
      {
        name: "Staff Overtime Report", desc: "OT hours and OT amount per staff",
        build: (ctx) => {
          const t = tally(ctx);
          return {
            title: `Staff Overtime — ${ctx.month}`,
            head: ["Staff", "Department", "OT Hours", "OT Amount"],
            rows: ctx.members.map((m) => { const x = t.get(m.id)!; return [m.fullName, deptOf(m), num(x.ot), num(x.otAmt)]; }).filter((r) => Number(r[2]) > 0 || Number(r[3]) > 0),
            rightAlignFrom: 2,
          };
        },
      },
      {
        name: "Variable Earning Component Report", desc: "All one-off earnings in the cycle",
        build: (ctx) => ({
          title: `Variable Earnings — ${ctx.month}`,
          head: ["Date", "Staff", "Component", "Description", "Amount"],
          rows: ctx.variables.filter((v) => v.kind === "EARNING").map((v) => [v.entryDate, v.memberName, v.name, v.description ?? "", num(v.amount)]),
          rightAlignFrom: 4,
        }),
      },
      {
        name: "Salary Hold & Stop Report", desc: "Salaries held or stopped in the cycle, with reasons",
        build: (ctx) => ({
          title: `Salary Hold / Stop — ${ctx.month}`,
          head: ["Staff", "Status", "Net Amount", "Reason"],
          rows: ctx.payslips.filter((s) => s.holdStatus).map((s) => [s.memberName, s.holdStatus === "HOLD" ? "Held" : "Stopped", num(s.net), s.holdReason ?? ""]),
          rightAlignFrom: 2,
        }),
      },
    ],
  },
  {
    key: "statutory", title: "Statutory", icon: "shield",
    reports: [
      {
        name: "PF Excel Report", desc: "Monthly PF contributions by employee and employer",
        build: (ctx) => ({
          title: `PF — ${ctx.month}`,
          head: ["UAN", "PF Number", "Staff", "Gross Wages", "EPF Wages", "Employee PF (12%)", "Employer PF (12%)"],
          rows: ctx.payslips.filter((s) => Number(s.pf) > 0).map((s) => {
            const p = ctx.profiles.get(s.userId);
            const wages = num(Number(s.pf) / 0.12);
            return [d(p?.details?.uan), d(p?.details?.pfNumber), s.memberName, num(s.gross), wages, num(s.pf), num(s.pf)];
          }),
          rightAlignFrom: 3,
        }),
      },
      {
        name: "ESI Report", desc: "ESI with staff and employer contribution",
        build: (ctx) => ({
          title: `ESI — ${ctx.month}`,
          head: ["ESI Number", "Staff", "Payable Days", "Gross Wages", "Employee ESI (0.75%)", "Employer ESI (3.25%)"],
          rows: ctx.payslips.filter((s) => Number(s.esic) > 0).map((s) => [d(ctx.profiles.get(s.userId)?.details?.esiNumber), s.memberName, num(s.payableDays), num(s.gross), num(s.esic), num(Number(s.gross) * 0.0325)]),
          rightAlignFrom: 2,
        }),
      },
      {
        name: "PT Report", desc: "Professional tax deducted per staff",
        build: (ctx) => ({
          title: `Professional Tax — ${ctx.month}`,
          head: ["Staff", "Gross", "PT"],
          rows: ctx.payslips.filter((s) => Number(s.pt) > 0).map((s) => [s.memberName, num(s.gross), num(s.pt)]),
          rightAlignFrom: 1,
        }),
      },
      {
        name: "Register of Deductions", desc: "Statutory and other deductions grouped by type",
        build: (ctx) => {
          const rows: (string | number)[][] = [];
          for (const s of ctx.payslips) {
            const add = (type: string, amt: number | undefined) => { if (Number(amt ?? 0) > 0) rows.push([type, s.memberName, num(amt)]); };
            add("PF", s.pf); add("ESIC", s.esic); add("Professional Tax", s.pt); add("Fines", s.fineAmount);
            add("Advance", s.advanceDeduction); add("Loan EMI", s.loanEmi); add("TDS", Number(s.tds ?? 0)); add("Other", Number(s.otherDeductions) + Number(s.variableDeductions ?? 0));
          }
          rows.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
          return { title: `Register of Deductions — ${ctx.month}`, head: ["Deduction", "Staff", "Amount"], rows, rightAlignFrom: 2 };
        },
      },
      {
        name: "Register of Employees (Form A)", desc: "Statutory register of employee details",
        build: (ctx) => ({
          title: "Register of Employees (Form A)",
          head: ["Sl", "Staff ID", "Name", "Gender", "Father's Name", "Date of Birth", "Designation", "Date of Joining", "UAN", "ESI No", "PAN", "Address"],
          rows: ctx.members.map((m, i) => {
            const p = ctx.profiles.get(m.id);
            const x = p?.details;
            return [i + 1, codeOf(ctx, m.id), m.fullName, d(x?.gender), d(x?.fatherName), d(x?.dateOfBirth), d(p?.designation), d(p?.joiningDate), d(x?.uan), d(x?.esiNumber), d(p?.pan), d(x?.permanentAddress ?? x?.currentAddress)];
          }),
        }),
      },
      {
        name: "Wage Register (Form B)", desc: "Statutory wage register for the salary cycle",
        build: (ctx) => ({
          title: `Wage Register (Form B) — ${ctx.month}`,
          head: ["Sl", "Name", "Designation", "Rate / Month", "Days Worked", "OT", "Gross", "PF", "ESIC", "PT", "Fines", "Advance", "Other", "Net Paid"],
          rows: ctx.payslips.map((s, i) => {
            const p = ctx.profiles.get(s.userId);
            return [i + 1, s.memberName, d(p?.designation), p?.salary.workType ? `${num(p.salary.workRate)}/${p.salary.workType.toLowerCase()}` : num(p?.salary.monthlyCtc),
              num(s.payableDays), num(s.otAmount), num(s.gross), num(s.pf), num(s.esic), num(s.pt), num(s.fineAmount), num(s.advanceDeduction),
              num(Number(s.otherDeductions) + Number(s.variableDeductions ?? 0) + Number(s.loanEmi)), num(s.net)];
          }),
          rightAlignFrom: 3,
        }),
      },
      {
        name: "Overtime Compliance Report", desc: "Staff level overtime hours — check against legal limits",
        build: (ctx) => {
          const t = tally(ctx);
          return {
            title: `Overtime Compliance — ${ctx.month}`,
            head: ["Staff", "OT Hours", "Within 50 h/quarter guide"],
            rows: ctx.members.map((m) => { const x = t.get(m.id)!; return [m.fullName, num(x.ot), x.ot <= 50 / 3 ? "Yes" : "Review"]; }).filter((r) => Number(r[1]) > 0),
            rightAlignFrom: 1,
          };
        },
      },
    ],
  },
  {
    key: "payments", title: "Payment Logs", icon: "bank",
    reports: [
      {
        name: "Payment Logs Report", desc: "Every payment recorded in the cycle",
        build: (ctx) => ({
          title: `Payment Logs — ${ctx.month}`,
          head: ["Date", "Staff", "Category", "Mode", "Description", "Recorded by", "Amount"],
          rows: ctx.payments.map((p) => [p.recordDate, p.memberName, p.category, p.mode, p.description ?? "", p.createdByName ?? "", num(p.amount)]),
          rightAlignFrom: 6,
        }),
      },
      {
        name: "Account Details", desc: "Staff-wise bank account details",
        build: (ctx) => ({
          title: "Account Details",
          head: ["Staff", "Bank", "Account Number", "IFSC", "Account Holder", "UPI ID"],
          rows: ctx.members.map((m) => { const p = ctx.profiles.get(m.id); return [m.fullName, d(p?.bankName), d(p?.bankAccount), d(p?.ifsc), d(p?.details?.accountHolder), d(p?.details?.upiId)]; }),
        }),
      },
      {
        name: "RTGS / Bank Transfer Report", desc: "Net pay with bank details — ready for a bulk transfer upload",
        build: (ctx) => ({
          title: `Bank Transfer — ${ctx.month}`,
          head: ["Beneficiary", "Account Number", "IFSC", "Bank", "Amount", "Narration"],
          rows: ctx.payslips.filter((s) => !s.holdStatus && Number(s.net) > 0).map((s) => {
            const p = ctx.profiles.get(s.userId);
            return [p?.details?.accountHolder ?? s.memberName, d(p?.bankAccount), d(p?.ifsc), d(p?.bankName), num(Number(s.net) - Number(s.paidAmount ?? 0)), `Salary ${ctx.month}`];
          }),
          rightAlignFrom: 4,
        }),
      },
      {
        name: "Advance Salary Report", desc: "Advances paid in the cycle (recovered from the payslip)",
        build: (ctx) => ({
          title: `Advance Salary — ${ctx.month}`,
          head: ["Date", "Staff", "Mode", "Description", "Amount"],
          rows: ctx.payments.filter((p) => p.category === "ADVANCE").map((p) => [p.recordDate, p.memberName, p.mode, p.description ?? "", num(p.amount)]),
          rightAlignFrom: 4,
        }),
      },
    ],
  },
  {
    key: "employees", title: "Employees", icon: "users",
    reports: [
      {
        name: "Staff Details", desc: "Personal details of all staff",
        build: (ctx) => ({
          title: "Staff Details",
          head: ["Staff ID", "Name", "Email", "Phone", "Department", "Designation", "Staff Type", "Gender", "DOB", "Blood Group", "Emergency Contact", "Status"],
          rows: ctx.members.map((m) => {
            const p = ctx.profiles.get(m.id); const x = p?.details;
            return [codeOf(ctx, m.id), m.fullName, d(m.email), d(m.phoneNumber), deptOf(m), d(p?.designation), payGroupOf(p), d(x?.gender), d(x?.dateOfBirth), d(x?.bloodGroup), d(x?.emergencyContact), x?.staffStatus === "DEACTIVATED" ? "Deactivated" : "Active"];
          }),
        }),
      },
      {
        name: "Employee Salary Structure Report", desc: "Salary of every staff member — CTC, basic, rates",
        build: (ctx) => ({
          title: "Salary Structure",
          head: ["Staff", "Staff Type", "Monthly CTC", "Basic", "HRA", "Rate", "PF", "ESIC", "PT"],
          rows: ctx.members.map((m) => {
            const p = ctx.profiles.get(m.id);
            return [m.fullName, payGroupOf(p), num(p?.salary.monthlyCtc), num(p?.salary.basic), num(p?.salary.hra), p?.salary.workType ? `${num(p.salary.workRate)}/${p.salary.workType.toLowerCase()}` : "—", p?.salary.pf ? "Yes" : "No", p?.salary.esic ? "Yes" : "No", p?.salary.pt ? "Yes" : "No"];
          }),
          rightAlignFrom: 2,
        }),
      },
      {
        name: "HR MIS report", desc: "Staff details for HR MIS purposes",
        build: (ctx) => ({
          title: "HR MIS",
          head: ["Staff", "Department", "Posting", "Designation", "Joining Date", "Reporting Manager", "Monthly CTC", "Bank A/c"],
          rows: ctx.members.map((m) => {
            const p = ctx.profiles.get(m.id);
            const mgr = p?.details?.reportingManagerId ? nameOf(ctx, p.details.reportingManagerId) : "—";
            return [m.fullName, deptOf(m), m.staffType === "SITE" ? "Site" : "Office", d(p?.designation), d(p?.joiningDate), mgr, num(p?.salary.monthlyCtc), d(p?.bankAccount)];
          }),
          rightAlignFrom: 6,
        }),
      },
      {
        name: "New Employee Joining Report", desc: "Staff who joined in the cycle",
        build: (ctx) => ({
          title: `New Joinees — ${ctx.month}`,
          head: ["Staff", "Department", "Designation", "Joining Date"],
          rows: ctx.members.filter((m) => { const j = ctx.profiles.get(m.id)?.joiningDate; return j && j >= ctx.from && j <= ctx.to; })
            .map((m) => { const p = ctx.profiles.get(m.id)!; return [m.fullName, deptOf(m), d(p.designation), d(p.joiningDate)]; }),
        }),
      },
      {
        name: "Probation Report", desc: "Staff on probation with end dates",
        build: (ctx) => ({
          title: "Probation",
          head: ["Staff", "Joining Date", "Probation (days)", "Probation Ends", "Status"],
          rows: ctx.members.map((m) => ctx.profiles.get(m.id)).filter((p): p is PayrollProfileResponse => !!p?.joiningDate && !!p.details?.probationDays)
            .map((p) => {
              const end = new Date(`${p.joiningDate}T00:00:00`); end.setDate(end.getDate() + (p.details!.probationDays ?? 0));
              const endKey = `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`;
              return [nameOf(ctx, p.userId), p.joiningDate!, p.details!.probationDays!, endKey, endKey < todayIST() ? "Completed" : "On probation"];
            }),
        }),
      },
      {
        name: "Staff Birthdays Report", desc: "Staff and their dates of birth",
        build: (ctx) => ({
          title: "Staff Birthdays",
          head: ["Staff", "Date of Birth", "Birthday this month"],
          rows: ctx.members.map((m) => [m.fullName, ctx.profiles.get(m.id)?.details?.dateOfBirth ?? ""]).filter((r) => r[1])
            .map((r) => [r[0], r[1], String(r[1]).slice(5, 7) === ctx.month.slice(5) ? "Yes" : ""]),
        }),
      },
      {
        name: "Staff Work Anniversary Report", desc: "Work anniversaries with years completed",
        build: (ctx) => ({
          title: "Work Anniversaries",
          head: ["Staff", "Joining Date", "Years", "Anniversary this month"],
          rows: ctx.members.map((m) => ctx.profiles.get(m.id)).filter((p): p is PayrollProfileResponse => !!p?.joiningDate)
            .map((p) => [nameOf(ctx, p.userId), p.joiningDate!, Number(ctx.month.slice(0, 4)) - Number(p.joiningDate!.slice(0, 4)), p.joiningDate!.slice(5, 7) === ctx.month.slice(5) ? "Yes" : ""]),
        }),
      },
      {
        name: "Employee Exit Report", desc: "Deactivated staff",
        build: (ctx) => ({
          title: "Employee Exit",
          head: ["Staff", "Department", "Designation", "Joining Date", "Status"],
          rows: ctx.members.filter((m) => ctx.profiles.get(m.id)?.details?.staffStatus === "DEACTIVATED")
            .map((m) => { const p = ctx.profiles.get(m.id)!; return [m.fullName, deptOf(m), d(p.designation), d(p.joiningDate), "Deactivated"]; }),
        }),
      },
    ],
  },
  {
    key: "deductions", title: "Deductions", icon: "minus",
    reports: [
      {
        name: "Staff Fine Report", desc: "Fine amounts and hours from late entry, early out and breaks",
        build: (ctx) => ({
          title: `Staff Fines — ${ctx.month}`,
          head: ["Date", "Staff", "Fine (h)", "Fine Amount", "Detail"],
          rows: ctx.muster.filter((r) => Number(r.fineAmount ?? 0) > 0)
            .map((r) => [r.date, r.memberName, num(r.fineHours), num(r.fineAmount), (r.fineDetail ?? "").split(";").map((x) => x.split("|")[0]).join(", ")]),
          rightAlignFrom: 2,
        }),
      },
      {
        name: "Variable Deduction Component Report", desc: "All one-off deductions in the cycle",
        build: (ctx) => ({
          title: `Variable Deductions — ${ctx.month}`,
          head: ["Date", "Staff", "Component", "Description", "Amount"],
          rows: ctx.variables.filter((v) => v.kind === "DEDUCTION").map((v) => [v.entryDate, v.memberName, v.name, v.description ?? "", num(v.amount)]),
          rightAlignFrom: 4,
        }),
      },
    ],
  },
  {
    key: "loans", title: "Loans", icon: "landmark",
    reports: [
      {
        name: "Loan Summary", desc: "Loans disbursed and amount recovered, staff wise",
        build: (ctx) => ({
          title: "Loan Summary",
          head: ["Staff", "Loan", "Disbursed", "Principal", "EMI", "Recovered", "Balance", "Status"],
          rows: ctx.loans.map((l) => [l.memberName, l.name, l.disbursementDate, num(l.principal), num(l.emi), num(Number(l.principal) - Number(l.outstanding)), num(l.outstanding), l.status ?? "ACTIVE"]),
          rightAlignFrom: 3,
        }),
      },
      {
        name: "Loan Outstanding Summary", desc: "Outstanding loan balance with interest, staff wise",
        build: (ctx) => {
          const by = new Map<number, { name: string; count: number; bal: number; emi: number }>();
          for (const l of ctx.loans.filter((x) => Number(x.outstanding) > 0)) {
            const e = by.get(l.userId) ?? { name: l.memberName, count: 0, bal: 0, emi: 0 };
            e.count++; e.bal += Number(l.outstanding); if ((l.status ?? "ACTIVE") === "ACTIVE") e.emi += Number(l.emi);
            by.set(l.userId, e);
          }
          return { title: "Loan Outstanding", head: ["Staff", "Open Loans", "Monthly EMI", "Outstanding"], rows: [...by.values()].map((e) => [e.name, e.count, num(e.emi), num(e.bal)]), rightAlignFrom: 1 };
        },
      },
    ],
  },
  {
    key: "reimbursements", title: "Reimbursements", icon: "receipt",
    reports: [
      {
        name: "Reimbursement Report", desc: "Reimbursement claims with status",
        build: (ctx) => ({
          title: `Reimbursements — ${ctx.month}`,
          head: ["Claim", "Staff", "Expense", "Expense Date", "Requested", "Approved", "Status", "Approver"],
          rows: ctx.reimbursements.filter((r) => r.expenseDate >= ctx.from && r.expenseDate <= ctx.to)
            .map((r) => [r.claimId, r.memberName, r.expenseType, r.expenseDate, num(r.requestedAmount), r.approvedAmount != null ? num(r.approvedAmount) : "—", r.status, r.approverName ?? ""]),
          rightAlignFrom: 4,
        }),
      },
    ],
  },
  {
    key: "misc", title: "Miscellaneous", icon: "grid",
    reports: [
      {
        name: "Work Report", desc: "Item wise and day wise piece-rate work",
        build: (ctx) => ({
          title: `Work Report — ${ctx.month}`,
          head: ["Date", "Staff", "Item", "Units", "Rate", "Amount", "Logged by"],
          rows: ctx.workLogs.map((w) => [w.date, w.memberName, w.itemName, num(w.units), num(w.rate), num(w.amount), w.loggedByName ?? ""]),
          rightAlignFrom: 3,
        }),
      },
      {
        name: "Staff Payout", desc: "What each worker earned from piece-rate work in the cycle",
        build: (ctx) => {
          const by = new Map<number, { name: string; units: number; amt: number; days: Set<string> }>();
          for (const w of ctx.workLogs) {
            const e = by.get(w.userId) ?? { name: w.memberName, units: 0, amt: 0, days: new Set() };
            e.units += Number(w.units); e.amt += Number(w.amount); e.days.add(w.date); by.set(w.userId, e);
          }
          return { title: `Staff Payout — ${ctx.month}`, head: ["Staff", "Days", "Units", "Payout"], rows: [...by.values()].map((e) => [e.name, e.days.size, num(e.units), num(e.amt)]), rightAlignFrom: 1 };
        },
      },
      {
        name: "Holiday List", desc: "Holidays per holiday policy",
        build: (ctx) => ({
          title: "Holiday List",
          head: ["Policy", "Year", "Date", "Holiday", "Type"],
          rows: ctx.holidayPolicies.flatMap((p) => p.holidays.map((h) => [p.name, p.year, h.date, h.name, h.type === "OPTIONAL" ? "Optional" : "Public"])),
        }),
      },
    ],
  },
  {
    key: "audit", title: "Audit", icon: "audit",
    reports: [
      {
        name: "Attendance Audit Logs", desc: "Attendance items marked / edited in the cycle, by whom",
        build: (ctx) => ({
          title: `Attendance Audit Logs — ${ctx.month}`,
          head: ["Day", "Staff", "Change", "By", "When"],
          rows: ctx.auditLogs.map((l) => [l.date, nameOf(ctx, l.userId), l.action, l.actorName ?? "system", l.at?.slice(0, 16).replace("T", " ") ?? ""]),
        }),
      },
    ],
  },
];

const ALL_REPORTS = new Map(REPORT_CATALOGUE.flatMap((c) => c.reports.map((r) => [r.name, r] as const)));
export const REPORT_COUNT = ALL_REPORTS.size;

export function buildReport(name: string, ctx: ReportContext): ReportData {
  const def = ALL_REPORTS.get(name);
  if (!def) return { title: name, head: ["Staff"], rows: ctx.members.map((m) => [m.fullName]) };
  return def.build(ctx);
}

// ---------------- Custom report (group-by builder) ----------------

export type CustomDimension = "Department" | "Staff Type" | "Designation" | "Posting" | "Shift" | "Staff";
export const CUSTOM_DIMENSIONS: CustomDimension[] = ["Department", "Staff Type", "Designation", "Posting", "Shift", "Staff"];
export const CUSTOM_METRICS = [
  "Headcount", "Present Days", "Absent Days", "Half Days", "Paid Leave Days", "Payable Days", "Overtime Hours", "Overtime ₹",
  "Fine ₹", "Gross Salary", "PF", "ESIC", "Advance", "Net Salary", "Piece Work ₹",
] as const;
export type CustomMetric = (typeof CUSTOM_METRICS)[number];

/** PagarBook's custom report, simplified: group rows by one dimension and total the chosen metrics. */
export function buildCustomReport(ctx: ReportContext, by: CustomDimension, metrics: CustomMetric[]): ReportData {
  const t = tally(ctx);
  const slips = slipBy(ctx);
  const work = new Map<number, number>();
  for (const w of ctx.workLogs) work.set(w.userId, (work.get(w.userId) ?? 0) + Number(w.amount));
  const keyOf = (m: UserResponse): string => {
    const p = ctx.profiles.get(m.id);
    switch (by) {
      case "Department": return deptOf(m);
      case "Staff Type": return payGroupOf(p);
      case "Designation": return p?.designation ?? "—";
      case "Posting": return m.staffType === "SITE" ? "Site" : "Office";
      case "Shift": return ctx.shifts.find((s) => s.id === p?.shiftId)?.name ?? "No shift";
      default: return m.fullName;
    }
  };
  const value = (m: UserResponse, metric: CustomMetric): number => {
    const x = t.get(m.id)!; const s = slips.get(m.id);
    switch (metric) {
      case "Headcount": return 1;
      case "Present Days": return x.p;
      case "Absent Days": return x.a;
      case "Half Days": return x.hd;
      case "Paid Leave Days": return x.pl;
      case "Payable Days": return Number(s?.payableDays ?? x.payable);
      case "Overtime Hours": return x.ot;
      case "Overtime ₹": return Number(s?.otAmount ?? x.otAmt);
      case "Fine ₹": return Number(s?.fineAmount ?? x.fine);
      case "Gross Salary": return Number(s?.gross ?? 0);
      case "PF": return Number(s?.pf ?? 0);
      case "ESIC": return Number(s?.esic ?? 0);
      case "Advance": return Number(s?.advanceDeduction ?? 0);
      case "Net Salary": return Number(s?.net ?? 0);
      case "Piece Work ₹": return work.get(m.id) ?? 0;
    }
  };
  const groups = new Map<string, number[]>();
  for (const m of ctx.members) {
    const k = keyOf(m);
    const cur = groups.get(k) ?? metrics.map(() => 0);
    metrics.forEach((metric, i) => { cur[i] += value(m, metric); });
    groups.set(k, cur);
  }
  const rows = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, vals]) => [k, ...vals.map(num)]);
  const totals = metrics.map((_, i) => num(rows.reduce((a, r) => a + Number(r[i + 1]), 0)));
  return {
    title: `Custom report — ${metrics.join(", ")} by ${by} — ${ctx.month}`,
    head: [by, ...metrics],
    rows: rows.length ? [...rows, ["Total", ...totals]] : [],
    rightAlignFrom: 1,
  };
}
