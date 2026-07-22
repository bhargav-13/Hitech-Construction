"use client";

import { useCallback, useEffect, useState } from "react";
import * as api from "./departmentsApi";
import type { Department } from "./departmentsApi";

/** Shared loader for the department directory — used by filters, pickers and Settings. */
export function useDepartments() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setDepartments(await api.getDepartments());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load departments");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const departmentName = useCallback(
    (id: string | number | null | undefined) => {
      if (id == null || id === "") return "—";
      return departments.find((d) => String(d.id) === String(id))?.name ?? "—";
    },
    [departments]
  );

  return { departments, loading, error, reload, departmentName };
}
