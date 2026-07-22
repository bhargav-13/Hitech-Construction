"use client";

import { useEffect, useState } from "react";
import { getTeam } from "./api";

export interface TeamUser {
  id: string;
  name: string;
  role: string;
  /** Org grouping the person belongs to — used to narrow assignee pickers by department. */
  departmentId: string | null;
  departmentName: string | null;
}

/**
 * Team members from the real user-management-service — used for task assignees/followers so
 * Taskopad shares the same people as Roles & Access. Reads the lightweight `/api/v1/team`
 * directory (any signed-in user), not the admin-only `/api/v1/users`, so non-admin team members
 * can still resolve assignee names.
 */
export function useUsers(): { users: TeamUser[]; loading: boolean } {
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getTeam();
        if (!cancelled) {
          setUsers(
            res.map((u) => ({
              id: String(u.id),
              name: u.fullName,
              role: u.roleName,
              departmentId: u.departmentId != null ? String(u.departmentId) : null,
              departmentName: u.departmentName ?? null,
            }))
          );
        }
      } catch {
        if (!cancelled) setUsers([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { users, loading };
}
