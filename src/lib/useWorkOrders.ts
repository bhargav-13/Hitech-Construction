"use client";

import { useCallback, useEffect, useState } from "react";
import * as api from "./workOrderApi";
import type { WorkOrder } from "./workOrderApi";
import { useVyaparProjectId } from "./projectScope";

/**
 * Loads work orders for the selected project and keeps them in step after a write.
 *
 * Every mutating call returns the whole order back, because one change ripples: a bill moves
 * `billedValue` and `outstanding`, a progress edit moves `physicalProgress` and `workDoneValue`.
 * Splicing the server's copy in — rather than refetching — keeps the detail screen from flickering
 * through a loading state each time a figure is nudged.
 */
export function useWorkOrders() {
  const projectId = useVyaparProjectId();
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setWorkOrders(await api.getWorkOrders(projectId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load work orders.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const splice = useCallback((updated: WorkOrder) => {
    setWorkOrders((prev) => prev.map((w) => (w.id === updated.id ? updated : w)));
  }, []);

  return { workOrders, loading, error, reload: load, splice, setError };
}

/**
 * One work order, loaded on its own.
 *
 * The detail screen is reached directly from a link — a shared URL, a browser refresh — so it
 * cannot assume the list has been loaded first.
 */
export function useWorkOrder(id: number | null) {
  const [workOrder, setWorkOrder] = useState<WorkOrder | null>(null);
  const [loading, setLoading] = useState(id != null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (id == null) return;
    setLoading(true);
    setError("");
    try {
      setWorkOrder(await api.getWorkOrder(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load this work order.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  return { workOrder, setWorkOrder, loading, error, setError, reload: load };
}
