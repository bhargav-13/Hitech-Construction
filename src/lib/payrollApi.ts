/**
 * Payroll domain types + a UI-first data layer.
 *
 * The Payroll module is being built UI-first (backend persistence lands after the screens are
 * approved), so this store seeds a realistic construction-company workforce into localStorage and
 * serves every screen from it. The shapes here mirror what the backend contract will be, so the
 * swap to real endpoints is a drop-in later.
 */
"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { useAuthStore } from "./authStore";
import type { StaffCategory, AttendanceCode } from "./payrollConfig";
import { DEPARTMENTS } from "./payrollConfig";

// ---------------- Types ----------------

export type WorkType = "DAILY" | "HOURLY" | "PIECE";

export interface SalaryStructure {
  /** Regular: monthly CTC split into components. Contractor: monthlyRate only. */
  monthlyCtc: number;
  basic: number;
  hra: number;
  otherAllowances: number;
  /** Work-basis pay. */
  workType: WorkType | null;
  workRate: number;
  /** Statutory opt-ins. */
  pf: boolean;
  esic: boolean;
  pt: boolean;
}

export interface Employee {
  id: string;
  name: string;
  staffId: string;
  category: StaffCategory;
  department: string;
  designation: string;
  phone: string;
  email: string | null;
  joiningDate: string;
  active: boolean;
  salary: SalaryStructure;
  bankAccount: string | null;
  ifsc: string | null;
  bankName: string | null;
  pan: string | null;
  /** Linked ERP user account (real user-management id), so this employee can log in. null = no login yet. */
  userId: number | null;
}

export interface AttendanceEntry {
  code: AttendanceCode;
  inTime: string | null;
  outTime: string | null;
  overtimeHours: number;
  fineHours: number;
}

export type LoanInterestType = "FLAT" | "SIMPLE" | "COMPOUND";

export interface Loan {
  id: string;
  employeeId: string;
  name: string;
  description: string | null;
  principal: number;
  tenureMonths: number;
  annualRate: number;
  interestType: LoanInterestType;
  disbursementDate: string;
  startMonth: string;
  emi: number;
  outstanding: number;
}

export type ReimbursementStatus = "PENDING" | "APPROVED" | "REJECTED" | "PAID";

export interface Reimbursement {
  id: string;
  employeeId: string;
  expenseType: string;
  claimId: string;
  expenseDate: string;
  appliedAt: string;
  approvedAt: string | null;
  settlementDate: string | null;
  requestedAmount: number;
  approvedAmount: number | null;
  approvedBy: string | null;
  status: ReimbursementStatus;
}

export type PaymentCategory = "SALARY" | "ADVANCE" | "BONUS" | "REIMBURSEMENT";
export type PaymentStatus = "SAVED_OFFLINE" | "PENDING" | "PROCESSING" | "COMPLETED";

export interface Payment {
  id: string;
  employeeId: string;
  date: string;
  cycleMonth: string;
  department: string;
  description: string;
  category: PaymentCategory;
  amount: number;
  status: PaymentStatus;
}

export type DeductorType = "EMPLOYEE" | "NON_EMPLOYEE";

export interface TaxProfile {
  id: string;
  profileName: string;
  description: string | null;
  pan: string;
  tan: string;
  tdsCircle: string;
  deductorType: DeductorType;
  deductorName: string;
  fatherName: string;
}

// ---------------- Seed data ----------------

const today = new Date();
const iso = (d: Date) => d.toISOString().slice(0, 10);
const monthsAgo = (n: number) => {
  const d = new Date(today);
  d.setMonth(d.getMonth() - n);
  return iso(d);
};

/** A believable Hitech Construction roster spread across departments and pay types. */
function seedEmployees(): Employee[] {
  // The first two names deliberately match real ERP user accounts (rakesh@hitech.local /
  // vishwas@hitech.local) so their auto-generated emails link them to those logins — this lets a
  // Project Manager and a Team Member sign in and see their own self-service payroll.
  const rows: Array<[string, StaffCategory, string, string, number, WorkType | null]> = [
    ["Rakesh Shah", "REGULAR", "Site Execution", "Project Manager", 85000, null],
    ["Vishwas Bhai Ujjain", "REGULAR", "Civil", "Site Engineer", 48000, null],
    ["Priya Nair", "REGULAR", "Accounts", "Accountant", 42000, null],
    ["Suresh Patel", "REGULAR", "Safety", "Safety Officer", 39000, null],
    ["Vikram Singh", "REGULAR", "Electrical", "Site Engineer", 46000, null],
    ["Deepak Yadav", "CONTRACTOR", "Civil", "Supervisor", 32000, null],
    ["Ravi Verma", "CONTRACTOR", "Plumbing", "Plumber", 26000, null],
    ["Manoj Gupta", "CONTRACTOR", "Store & Logistics", "Store Keeper", 24000, null],
    ["Sanjay Mishra", "WORK_BASIS", "Civil", "Mason", 0, "DAILY"],
    ["Arun Das", "WORK_BASIS", "Civil", "Helper", 0, "DAILY"],
    ["Kiran Rao", "WORK_BASIS", "Electrical", "Electrician", 0, "HOURLY"],
    ["Lokesh Jain", "WORK_BASIS", "Site Execution", "Labour", 0, "DAILY"],
  ];
  const dailyRate: Record<WorkType, number> = { DAILY: 750, HOURLY: 120, PIECE: 0 } as const as Record<WorkType, number>;
  return rows.map(([name, category, department, designation, ctc, workType], i) => {
    const basic = Math.round(ctc * 0.5);
    const hra = Math.round(ctc * 0.2);
    return {
      id: `emp-${i + 1}`,
      name,
      staffId: `HC${String(i + 1).padStart(4, "0")}`,
      category,
      department,
      designation,
      phone: `98${String(76543210 - i * 111).slice(0, 8)}`,
      email: category === "REGULAR" ? `${name.split(" ")[0].toLowerCase()}@hitech.local` : null,
      joiningDate: monthsAgo(6 + i),
      active: i !== 11,
      salary: {
        monthlyCtc: ctc,
        basic,
        hra,
        otherAllowances: ctc - basic - hra,
        workType,
        workRate: workType ? dailyRate[workType] : 0,
        pf: category === "REGULAR",
        esic: category === "REGULAR" && ctc <= 21000,
        pt: category !== "WORK_BASIS",
      },
      bankAccount: category !== "WORK_BASIS" ? `50100${String(123456 + i * 7)}` : null,
      ifsc: category !== "WORK_BASIS" ? "HDFC0001234" : null,
      bankName: category !== "WORK_BASIS" ? "HDFC Bank" : null,
      pan: category === "REGULAR" ? `ABCDE${1000 + i}F` : null,
      userId: null,
    };
  });
}

function seedLoans(): Loan[] {
  return [
    {
      id: "loan-1",
      employeeId: "emp-1",
      name: "Vehicle Advance",
      description: "Two-wheeler down payment",
      principal: 120000,
      tenureMonths: 12,
      annualRate: 10,
      interestType: "FLAT",
      disbursementDate: monthsAgo(3),
      startMonth: monthsAgo(2).slice(0, 7),
      emi: 11000,
      outstanding: 88000,
    },
    {
      id: "loan-2",
      employeeId: "emp-3",
      name: "Medical Loan",
      description: "Family medical emergency",
      principal: 60000,
      tenureMonths: 10,
      annualRate: 0,
      interestType: "FLAT",
      disbursementDate: monthsAgo(2),
      startMonth: monthsAgo(1).slice(0, 7),
      emi: 6000,
      outstanding: 48000,
    },
  ];
}

function seedReimbursements(): Reimbursement[] {
  return [
    {
      id: "rb-1", employeeId: "emp-2", expenseType: "Travel", claimId: "CLM-1042", expenseDate: monthsAgo(0),
      appliedAt: monthsAgo(0), approvedAt: null, settlementDate: null, requestedAmount: 3200, approvedAmount: null,
      approvedBy: null, status: "PENDING",
    },
    {
      id: "rb-2", employeeId: "emp-4", expenseType: "Site Supplies", claimId: "CLM-1041", expenseDate: monthsAgo(0),
      appliedAt: monthsAgo(0), approvedAt: monthsAgo(0), settlementDate: null, requestedAmount: 5400, approvedAmount: 5400,
      approvedBy: "Rakesh Shah", status: "APPROVED",
    },
    {
      id: "rb-3", employeeId: "emp-5", expenseType: "Fuel", claimId: "CLM-1039", expenseDate: monthsAgo(1),
      appliedAt: monthsAgo(1), approvedAt: monthsAgo(1), settlementDate: monthsAgo(1), requestedAmount: 2100, approvedAmount: 2100,
      approvedBy: "Rakesh Shah", status: "PAID",
    },
  ];
}

function seedPayments(): Payment[] {
  const m = monthsAgo(1).slice(0, 7);
  return [
    { id: "pay-1", employeeId: "emp-1", date: monthsAgo(1), cycleMonth: m, department: "Site Execution", description: "Salary", category: "SALARY", amount: 82000, status: "COMPLETED" },
    { id: "pay-2", employeeId: "emp-2", date: monthsAgo(1), cycleMonth: m, department: "Civil", description: "Salary", category: "SALARY", amount: 46500, status: "COMPLETED" },
    { id: "pay-3", employeeId: "emp-6", date: monthsAgo(0), cycleMonth: monthsAgo(0).slice(0, 7), department: "Civil", description: "Advance payout", category: "ADVANCE", amount: 10000, status: "PENDING" },
    { id: "pay-4", employeeId: "emp-3", date: monthsAgo(0), cycleMonth: monthsAgo(0).slice(0, 7), department: "Accounts", description: "Salary", category: "SALARY", amount: 40500, status: "SAVED_OFFLINE" },
  ];
}

function seedTaxProfiles(): TaxProfile[] {
  return [
    {
      id: "tax-1", profileName: "Head Office Tax Profile", description: "Primary deductor for regular staff",
      pan: "AAAAA0000A", tan: "AHMH00000H", tdsCircle: "AHM/WD/001/24", deductorType: "EMPLOYEE",
      deductorName: "Rakesh Shah", fatherName: "Mohan Kumar",
    },
  ];
}

// ---------------- Store ----------------

interface PayrollState {
  employees: Employee[];
  attendanceOverrides: Record<string, AttendanceEntry>;
  loans: Loan[];
  reimbursements: Reimbursement[];
  payments: Payment[];
  taxProfiles: TaxProfile[];
  /** Employees whose payroll is locked / held / stopped for the current cycle. */
  payrollFlags: Record<string, "LOCKED" | "HOLD" | "STOP" | "PROCESSED">;

  addEmployee: (e: Omit<Employee, "id" | "staffId">) => Employee;
  updateEmployee: (id: string, patch: Partial<Employee>) => void;
  /** Attach (or detach with null) a real ERP user account to an employee so they can log in. */
  linkUser: (employeeId: string, userId: number | null) => void;
  setAttendance: (employeeId: string, date: string, entry: AttendanceEntry) => void;
  addLoan: (l: Omit<Loan, "id">) => void;
  addReimbursement: (r: Omit<Reimbursement, "id">) => void;
  setReimbursementStatus: (id: string, status: ReimbursementStatus, approvedAmount?: number) => void;
  addPayment: (p: Omit<Payment, "id">) => void;
  addTaxProfile: (t: Omit<TaxProfile, "id">) => void;
  setPayrollFlag: (employeeId: string, flag: "LOCKED" | "HOLD" | "STOP" | "PROCESSED" | null) => void;
}

const rid = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 9)}`;

export const usePayrollStore = create<PayrollState>()(
  persist(
    (set) => ({
      employees: seedEmployees(),
      attendanceOverrides: {},
      loans: seedLoans(),
      reimbursements: seedReimbursements(),
      payments: seedPayments(),
      taxProfiles: seedTaxProfiles(),
      payrollFlags: { "emp-1": "PROCESSED", "emp-2": "PROCESSED", "emp-7": "HOLD" },

      addEmployee: (e) => {
        const created: Employee = { ...e, id: rid("emp"), staffId: `HC${String(Math.floor(Math.random() * 9000) + 1000)}` };
        set((s) => ({ employees: [created, ...s.employees] }));
        return created;
      },
      updateEmployee: (id, patch) =>
        set((s) => ({ employees: s.employees.map((e) => (e.id === id ? { ...e, ...patch } : e)) })),
      linkUser: (employeeId, userId) =>
        set((s) => ({ employees: s.employees.map((e) => (e.id === employeeId ? { ...e, userId } : e)) })),
      setAttendance: (employeeId, date, entry) =>
        set((s) => ({ attendanceOverrides: { ...s.attendanceOverrides, [`${employeeId}|${date}`]: entry } })),
      addLoan: (l) => set((s) => ({ loans: [{ ...l, id: rid("loan") }, ...s.loans] })),
      addReimbursement: (r) => set((s) => ({ reimbursements: [{ ...r, id: rid("rb") }, ...s.reimbursements] })),
      setReimbursementStatus: (id, status, approvedAmount) =>
        set((s) => ({
          reimbursements: s.reimbursements.map((r) =>
            r.id === id
              ? {
                  ...r,
                  status,
                  approvedAmount: approvedAmount ?? r.approvedAmount ?? r.requestedAmount,
                  approvedAt: status === "APPROVED" || status === "PAID" ? (r.approvedAt ?? iso(new Date())) : r.approvedAt,
                  settlementDate: status === "PAID" ? iso(new Date()) : r.settlementDate,
                  approvedBy: status === "APPROVED" || status === "PAID" ? (r.approvedBy ?? "Rakesh Shah") : r.approvedBy,
                }
              : r
          ),
        })),
      addPayment: (p) => set((s) => ({ payments: [{ ...p, id: rid("pay") }, ...s.payments] })),
      addTaxProfile: (t) => set((s) => ({ taxProfiles: [{ ...t, id: rid("tax") }, ...s.taxProfiles] })),
      setPayrollFlag: (employeeId, flag) =>
        set((s) => {
          const next = { ...s.payrollFlags };
          if (flag === null) delete next[employeeId];
          else next[employeeId] = flag;
          return { payrollFlags: next };
        }),
    }),
    { name: "hitech.payroll.v2", storage: createJSONStorage(() => localStorage) }
  )
);

// ---------------- Derived helpers ----------------

/**
 * Deterministic default attendance for an employee on a date — Sundays are week-offs, most days
 * present, with a sprinkling of absences/half-days/leave so the dashboard and muster look real.
 * User edits live in `attendanceOverrides` and take precedence via {@link getAttendance}.
 */
export function genAttendance(staffId: string, date: string): AttendanceEntry {
  const d = new Date(date + "T00:00:00");
  const isFuture = d.getTime() > Date.now();
  if (d.getDay() === 0) return { code: "WO", inTime: null, outTime: null, overtimeHours: 0, fineHours: 0 };
  if (isFuture) return { code: "NM", inTime: null, outTime: null, overtimeHours: 0, fineHours: 0 };
  // Cheap deterministic hash from staffId + date.
  let h = 0;
  const key = staffId + date;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) & 0xffff;
  const r = h % 100;
  if (r < 78) {
    const late = r % 7 === 0;
    const ot = r % 11 === 0 ? 2 : 0;
    return { code: "P", inTime: late ? "09:35" : "09:00", outTime: ot ? "20:00" : "18:00", overtimeHours: ot, fineHours: late ? 0.5 : 0 };
  }
  if (r < 86) return { code: "HD", inTime: "09:00", outTime: "13:30", overtimeHours: 0, fineHours: 0 };
  if (r < 92) return { code: "PL", inTime: null, outTime: null, overtimeHours: 0, fineHours: 0 };
  return { code: "A", inTime: null, outTime: null, overtimeHours: 0, fineHours: 0 };
}

/** Attendance for an employee/date — user override if present, else the deterministic default. */
export function getAttendance(overrides: Record<string, AttendanceEntry>, emp: Employee, date: string): AttendanceEntry {
  return overrides[`${emp.id}|${date}`] ?? genAttendance(emp.staffId, date);
}

export function daysInMonth(year: number, month0: number): string[] {
  const n = new Date(year, month0 + 1, 0).getDate();
  return Array.from({ length: n }, (_, i) => `${year}-${String(month0 + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`);
}

export interface MonthlySummary {
  present: number;
  absent: number;
  halfDay: number;
  paidLeave: number;
  unmarked: number;
  weekOff: number;
  overtime: number;
  fine: number;
  payableDays: number;
}

/** Roll an employee's month of attendance into the muster-roll totals. */
export function monthlySummary(overrides: Record<string, AttendanceEntry>, emp: Employee, dates: string[]): MonthlySummary {
  const s: MonthlySummary = { present: 0, absent: 0, halfDay: 0, paidLeave: 0, unmarked: 0, weekOff: 0, overtime: 0, fine: 0, payableDays: 0 };
  for (const date of dates) {
    const e = getAttendance(overrides, emp, date);
    s.overtime += e.overtimeHours;
    s.fine += e.fineHours;
    switch (e.code) {
      case "P": s.present++; s.payableDays += 1; break;
      case "HD": s.halfDay++; s.payableDays += 0.5; break;
      case "PL": s.paidLeave++; s.payableDays += 1; break;
      case "A": s.absent++; break;
      case "WO": s.weekOff++; s.payableDays += 1; break;
      case "NM": s.unmarked++; break;
    }
  }
  return s;
}

/** Standard reducing-balance / flat EMI, matching the loan form's live preview. */
export function computeEmi(principal: number, annualRate: number, tenure: number, type: LoanInterestType): number {
  if (!principal || !tenure) return 0;
  if (type === "FLAT") {
    const interest = (principal * annualRate * (tenure / 12)) / 100;
    return Math.round((principal + interest) / tenure);
  }
  if (type === "SIMPLE" || !annualRate) {
    const interest = (principal * annualRate * (tenure / 12)) / 100;
    return Math.round((principal + interest) / tenure);
  }
  const r = annualRate / 12 / 100;
  return Math.round((principal * r * Math.pow(1 + r, tenure)) / (Math.pow(1 + r, tenure) - 1));
}

// ---------------- Payslip (shared by admin payroll run + self-service payslips) ----------------

export interface Payslip {
  gross: number;
  pf: number;
  esic: number;
  pt: number;
  loanEmi: number;
  net: number;
  payableDays: number;
  totalDays: number;
}

/** One employee's payslip for a month, derived from attendance × salary − statutory − loan EMI. */
export function computePayslip(emp: Employee, overrides: Record<string, AttendanceEntry>, loans: Loan[], dates: string[]): Payslip {
  const s = monthlySummary(overrides, emp, dates);
  const totalDays = dates.length;
  let gross: number;
  if (emp.category === "WORK_BASIS") {
    gross = Math.round(emp.salary.workRate * (s.present + s.halfDay * 0.5) + emp.salary.workRate * (s.overtime / 8));
  } else {
    gross = Math.round((emp.salary.monthlyCtc * s.payableDays) / totalDays);
  }
  const pf = emp.salary.pf ? Math.round(Math.min(emp.salary.basic, 15000) * 0.12 * (s.payableDays / totalDays)) : 0;
  const esic = emp.salary.esic ? Math.round(gross * 0.0075) : 0;
  const pt = emp.salary.pt && gross > 15000 ? 200 : 0;
  const loanEmi = loans.filter((l) => l.employeeId === emp.id && l.outstanding > 0).reduce((a, l) => a + l.emi, 0);
  const net = Math.max(0, gross - pf - esic - pt - loanEmi);
  return { gross, pf, esic, pt, loanEmi, net, payableDays: s.payableDays, totalDays };
}

// ---------------- Access model (admin vs self-service) ----------------

const MANAGE_ACTIONS = ["PAYROLL:CREATE", "PAYROLL:EDIT", "PAYROLL:DELETE", "PAYROLL:APPROVE"];

export interface PayrollAccess {
  /** Can view the module at all (nav is already gated on this). */
  canView: boolean;
  /** Full HR/admin module: all staff, payroll runs, approvals, everyone's salaries. */
  isAdmin: boolean;
  /** VIEW-only: sees only their own attendance, payslips, loans and reimbursements. */
  isSelfService: boolean;
}

/**
 * What the signed-in user may do in Payroll. Anyone holding a manage action (CREATE/EDIT/DELETE/
 * APPROVE) is treated as an HR admin and gets the full module; a plain PAYROLL:VIEW is self-service.
 */
export function usePayrollAccess(): PayrollAccess {
  const perms = useAuthStore((s) => s.user?.permissions) ?? [];
  const canView = perms.includes("PAYROLL:VIEW");
  const isAdmin = MANAGE_ACTIONS.some((p) => perms.includes(p));
  return { canView, isAdmin, isSelfService: canView && !isAdmin };
}

/**
 * The employee record for the signed-in user — matched first by an explicit user link, then by a
 * matching email. null when the account isn't tied to any staff member yet (show a "contact HR" hint).
 */
export function useMyEmployee(): Employee | null {
  const user = useAuthStore((s) => s.user);
  const employees = usePayrollStore((s) => s.employees);
  if (!user) return null;
  return (
    employees.find((e) => e.userId === user.id) ??
    employees.find((e) => e.email != null && e.email.toLowerCase() === user.email.toLowerCase()) ??
    null
  );
}

export { DEPARTMENTS };
