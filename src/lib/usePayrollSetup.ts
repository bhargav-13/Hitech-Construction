"use client";

import { useCallback, useEffect, useState } from "react";
import * as api from "./api";
import type {
  ShiftResponse,
  ShiftRequest,
  HolidayPolicyResponse,
  HolidayPolicyRequest,
  LeavePolicyResponse,
  LeavePolicyRequest,
  PayrollProfileResponse,
} from "./api";

/**
 * Fetch hooks for the real Payroll setup policies (Shifts, Holiday Policy, Leave Policy) and
 * per-member Payroll Profiles — backed by payroll-service (see api.ts). Each hook follows the same
 * shape as useUsers/useDepartments/useProjects: fetch on mount, expose a `refresh`, and CRUD
 * helpers that call the API then refresh so every screen reading the hook stays in sync.
 */

export function useShifts() {
  const [shifts, setShifts] = useState<ShiftResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setShifts(await api.getShifts());
      setError("");
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Unable to load shifts.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const create = async (body: ShiftRequest) => {
    const created = await api.createShift(body);
    await refresh();
    return created;
  };
  const update = async (id: number, body: ShiftRequest) => {
    const updated = await api.updateShift(id, body);
    await refresh();
    return updated;
  };
  const remove = async (id: number) => {
    await api.deleteShift(id);
    await refresh();
  };

  return { shifts, loading, error, refresh, create, update, remove };
}

export function useHolidayPolicies() {
  const [holidayPolicies, setHolidayPolicies] = useState<HolidayPolicyResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setHolidayPolicies(await api.getHolidayPolicies());
      setError("");
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Unable to load holiday policies.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const create = async (body: HolidayPolicyRequest) => {
    const created = await api.createHolidayPolicy(body);
    await refresh();
    return created;
  };
  const update = async (id: number, body: HolidayPolicyRequest) => {
    const updated = await api.updateHolidayPolicy(id, body);
    await refresh();
    return updated;
  };
  const remove = async (id: number) => {
    await api.deleteHolidayPolicy(id);
    await refresh();
  };

  return { holidayPolicies, loading, error, refresh, create, update, remove };
}

export function useLeavePolicies() {
  const [leavePolicies, setLeavePolicies] = useState<LeavePolicyResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setLeavePolicies(await api.getLeavePolicies());
      setError("");
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Unable to load leave policies.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const create = async (body: LeavePolicyRequest) => {
    const created = await api.createLeavePolicy(body);
    await refresh();
    return created;
  };
  const update = async (id: number, body: LeavePolicyRequest) => {
    const updated = await api.updateLeavePolicy(id, body);
    await refresh();
    return updated;
  };
  const remove = async (id: number) => {
    await api.deleteLeavePolicy(id);
    await refresh();
  };

  return { leavePolicies, loading, error, refresh, create, update, remove };
}

/**
 * All payroll profiles, keyed by member (user) id. Pass `userIds` to scope the fetch to the
 * currently-visible on-payroll members (e.g. the People list); omit to fetch every profile.
 */
export function usePayrollProfiles(userIds?: number[]) {
  const [profiles, setProfiles] = useState<Record<number, PayrollProfileResponse>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const key = userIds ? userIds.slice().sort((a, b) => a - b).join(",") : "";

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.getPayrollProfiles(userIds);
      const map: Record<number, PayrollProfileResponse> = {};
      for (const p of list) map[p.userId] = p;
      setProfiles(map);
      setError("");
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Unable to load payroll profiles.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const save = async (body: PayrollProfileResponse) => {
    const saved = await api.savePayrollProfile(body);
    setProfiles((prev) => ({ ...prev, [saved.userId]: saved }));
    return saved;
  };

  return { profiles, loading, error, refresh, save };
}
