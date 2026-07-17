"use client";

import { useEffect, useState } from "react";
import * as api from "./api";

export interface ProjectOption {
  id: string;
  name: string;
}

/**
 * Projects for pickers/labels, read from the real project-service. Taskopad uses this rather
 * than the legacy mock store so task↔project links line up with the migrated Project module.
 */
export function useProjects(): { projects: ProjectOption[]; loading: boolean } {
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.getProjects({ page: 0, size: 200 });
        if (!cancelled) setProjects(res.content.map((p) => ({ id: String(p.id), name: p.name })));
      } catch {
        if (!cancelled) setProjects([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { projects, loading };
}
