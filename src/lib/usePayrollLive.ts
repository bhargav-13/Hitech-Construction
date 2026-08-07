"use client";

import { useCallback, useEffect, useState } from "react";
import * as api from "./api";
import type {
  AttendanceApiResponse,
  LeaveBalanceApi,
  LeaveRequestApi,
  LoanApi,
  LoanRequestApi,
  LocationApi,
  LocationRequestApi,
  PayrollProfileResponse,
  PayrollRunApi,
  PayrollRunSummaryApi,
  PayslipApi,
  PunchRequestBody,
  ReimbursementApi,
  ReimbursementCreateBody,
} from "./api";

/**
 * Fetch hooks for the real Payroll data layer (attendance, leave, loans, reimbursements,
 * payroll runs). These replace the old client-side seeded stores now that the backend is real.
 * Same pattern as usePayrollSetup: fetch on mount, expose a refresh + typed mutators.
 */

// ---- Attendance ----

export function useMemberAttendance(userId: number | null, from: string, to: string) {
  const [rows, setRows] = useState<AttendanceApiResponse[]>([]);
  const [loading, setLoading] = useState(!!userId);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      setRows(await api.getMemberAttendance(userId, from, to));
      setError("");
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Unable to load attendance.");
    } finally {
      setLoading(false);
    }
  }, [userId, from, to]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { rows, loading, error, refresh };
}

export function useMuster(from: string, to: string) {
  const [rows, setRows] = useState<AttendanceApiResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Range key of the last *completed* load. Lets callers tell an initial load / range change
  // (block with a loader) apart from a post-edit revalidation (keep the current rows on screen).
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api.getMuster(from, to));
      setError("");
      setLoadedKey(`${from}:${to}`);
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Unable to load muster.");
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const edit = async (body: api.AttendanceEditRequestBody) => {
    const updated = await api.editAttendance(body);
    await refresh();
    return updated;
  };

  // True once the current range has loaded at least once; stays true through revalidations.
  const ready = loadedKey === `${from}:${to}`;

  return { rows, loading, ready, error, refresh, edit };
}

export function useProjectAttendance(projectId: number | null, from: string, to: string) {
  const [rows, setRows] = useState<AttendanceApiResponse[]>([]);
  const [loading, setLoading] = useState(!!projectId);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      setRows(await api.getProjectAttendance(projectId, from, to));
      setError("");
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Unable to load project attendance.");
    } finally {
      setLoading(false);
    }
  }, [projectId, from, to]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { rows, loading, error, refresh };
}

export function useTodayAttendance() {
  const [today, setToday] = useState<AttendanceApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setToday(await api.getTodayAttendance());
      setError("");
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Unable to load today's attendance.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const punch = async (body: PunchRequestBody) => {
    const updated = await api.punchAttendance(body);
    setToday(updated);
    return updated;
  };

  return { today, loading, error, refresh, punch };
}

// ---- Work locations (geofences) ----

/** All work-site geofences (admin). CRUD helpers refresh the list so every screen stays in sync. */
export function useLocations() {
  const [locations, setLocations] = useState<LocationApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setLocations(await api.getLocations());
      setError("");
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Unable to load work locations.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const create = async (body: LocationRequestApi) => {
    const created = await api.createLocation(body);
    await refresh();
    return created;
  };
  const update = async (id: number, body: LocationRequestApi) => {
    const updated = await api.updateLocation(id, body);
    await refresh();
    return updated;
  };
  const remove = async (id: number) => {
    await api.deleteLocation(id);
    await refresh();
  };

  return { locations, loading, error, refresh, create, update, remove };
}

// ---- Profile (self-service) ----

/** The signed-in member's own payroll profile (salary, statutory, bank). null = no profile yet. */
export function useMyProfile(userId: number | null) {
  const [profile, setProfile] = useState<PayrollProfileResponse | null>(null);
  const [loading, setLoading] = useState(!!userId);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!userId) {
      setProfile(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setProfile(await api.getPayrollProfile(userId));
      setError("");
    } catch (err) {
      if (err instanceof api.ApiError && err.status === 404) {
        setProfile(null);
        setError("");
      } else {
        setError(err instanceof api.ApiError ? err.message : "Unable to load your profile.");
      }
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { profile, loading, error, refresh };
}

// ---- Leave ----

export function useMyLeave() {
  const [requests, setRequests] = useState<LeaveRequestApi[]>([]);
  const [balance, setBalance] = useState<LeaveBalanceApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [rs, bal] = await Promise.all([api.myLeave(), api.myLeaveBalance()]);
      setRequests(rs);
      setBalance(bal);
      setError("");
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Unable to load leave.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const apply = async (body: { leaveTypeName: string; fromDate: string; toDate: string; reason?: string }) => {
    const created = await api.applyLeave(body);
    await refresh();
    return created;
  };
  const cancel = async (id: number) => {
    await api.cancelLeave(id);
    await refresh();
  };

  return { requests, balance, loading, error, refresh, apply, cancel };
}

export function usePendingLeave() {
  const [requests, setRequests] = useState<LeaveRequestApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setRequests(await api.pendingLeave());
      setError("");
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Unable to load pending requests.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const decide = async (id: number, action: "APPROVE" | "REJECT", note?: string) => {
    const decided = await api.decideLeave(id, { action, note });
    await refresh();
    return decided;
  };

  return { requests, loading, error, refresh, decide };
}

// ---- Loans ----

export function useLoans() {
  const [loans, setLoans] = useState<LoanApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setLoans(await api.getLoansApi());
      setError("");
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Unable to load loans.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const create = async (body: LoanRequestApi) => {
    const created = await api.createLoanApi(body);
    await refresh();
    return created;
  };
  const update = async (id: number, body: LoanRequestApi) => {
    const updated = await api.updateLoanApi(id, body);
    await refresh();
    return updated;
  };
  const remove = async (id: number) => {
    await api.deleteLoanApi(id);
    await refresh();
  };

  return { loans, loading, error, refresh, create, update, remove };
}

export function useMyLoans() {
  const [loans, setLoans] = useState<LoanApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setLoans(await api.myLoansApi());
      setError("");
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Unable to load your loans.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { loans, loading, error, refresh };
}

// ---- Reimbursements ----

export function useReimbursements() {
  const [rows, setRows] = useState<ReimbursementApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api.getReimbursementsApi());
      setError("");
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Unable to load reimbursements.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const create = async (body: ReimbursementCreateBody) => {
    const created = await api.createReimbursementApi(body);
    await refresh();
    return created;
  };
  const decide = async (id: number, action: "APPROVE" | "REJECT" | "PAY", approvedAmount?: number) => {
    const decided = await api.decideReimbursementApi(id, { action, approvedAmount });
    await refresh();
    return decided;
  };

  return { rows, loading, error, refresh, create, decide };
}

export function useMyReimbursements() {
  const [rows, setRows] = useState<ReimbursementApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api.myReimbursementsApi());
      setError("");
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Unable to load your reimbursements.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const create = async (body: ReimbursementCreateBody) => {
    const created = await api.createReimbursementApi(body);
    await refresh();
    return created;
  };

  return { rows, loading, error, refresh, create };
}

// ---- Payroll Runs & Payslips ----

export function usePayrollRuns() {
  const [runs, setRuns] = useState<PayrollRunSummaryApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setRuns(await api.listPayrollRuns());
      setError("");
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Unable to load payroll runs.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const generate = async (month: string) => {
    const run = await api.generatePayrollRun(month);
    await refresh();
    return run;
  };
  const lock = async (month: string) => {
    const run = await api.lockPayrollRun(month);
    await refresh();
    return run;
  };
  const unlock = async (month: string) => {
    const run = await api.unlockPayrollRun(month);
    await refresh();
    return run;
  };
  const pay = async (month: string) => {
    const run = await api.markPayrollRunPaid(month);
    await refresh();
    return run;
  };

  return { runs, loading, error, refresh, generate, lock, unlock, pay };
}

export function usePayrollRun(month: string) {
  const [run, setRun] = useState<PayrollRunApi | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setRun(await api.getPayrollRun(month));
      setError("");
    } catch (err) {
      if (err instanceof api.ApiError && err.status === 404) {
        setRun(null);
        setError("");
      } else {
        setError(err instanceof api.ApiError ? err.message : "Unable to load the payroll run.");
      }
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { run, loading, error, refresh };
}

export function useMyPayslips() {
  const [slips, setSlips] = useState<PayslipApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setSlips(await api.myPayslips());
      setError("");
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Unable to load your payslips.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { slips, loading, error, refresh };
}
