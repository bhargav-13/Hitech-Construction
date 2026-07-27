"use client";

import { useEffect, useState } from "react";
import * as api from "./api";
import type { RoleResponse, UserResponse } from "./api";

/**
 * Bridges Payroll staff to the real user-management module so an admin creates a staff member and
 * their login in one step instead of entering both separately. Staff records live in the payroll
 * store (UI-first); the linked account is a genuine ERP user created via `/api/v1/users`.
 */

/** Roles for the login role-picker + existing users for the "link existing account" flow. */
export function useRolesAndUsers(): { roles: RoleResponse[]; users: UserResponse[]; loading: boolean; reload: () => void } {
  const [roles, setRoles] = useState<RoleResponse[]>([]);
  const [users, setUsers] = useState<UserResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [r, u] = await Promise.all([api.getRoles().catch(() => []), api.getUsers(0, 200).catch(() => ({ content: [] as UserResponse[], page: 0, size: 0, totalElements: 0, totalPages: 0 }))]);
        if (!cancelled) {
          setRoles(r);
          setUsers(u.content);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tick]);

  return { roles, users, loading, reload: () => setTick((t) => t + 1) };
}

/** A sensible default role for a new staff login: the first non-system, non-"Super Admin" role. */
export function defaultStaffRoleId(roles: RoleResponse[]): number | undefined {
  const preferred = roles.find((r) => /team member|staff|employee/i.test(r.name));
  if (preferred) return preferred.id;
  const nonAdmin = roles.find((r) => !r.isSystem && !/super\s*admin/i.test(r.name));
  return (nonAdmin ?? roles[0])?.id;
}

/** A readable temporary password the admin can share; the staff changes it on first login. */
export function suggestPassword(name: string): string {
  const first = (name.trim().split(/\s+/)[0] || "Staff").replace(/[^a-zA-Z]/g, "");
  const cap = first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
  return `${cap}@${Math.floor(1000 + Math.random() * 9000)}`;
}

/** Create the login account for a staff member. Throws ApiError (e.g. duplicate email) to the caller. */
export async function createStaffLogin(input: {
  email: string;
  password: string;
  fullName: string;
  phone?: string | null;
  roleId: number;
}): Promise<UserResponse> {
  return api.createUser({
    email: input.email.trim(),
    password: input.password,
    fullName: input.fullName.trim(),
    phoneNumber: input.phone?.trim() || undefined,
    roleId: input.roleId,
  });
}
