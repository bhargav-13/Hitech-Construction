"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Billing milestones and sales invoices for a project's BOQ.
 *
 * <p>The BOQ itself (items, families, targets) is real, served by the backend. Milestones and
 * invoices are the next slice of that module and do not have a backend yet, so — like the rest of
 * the UI-first work on this screen — they live client-side in localStorage, keyed by project. The
 * shape here is the contract a backend will fill later: same fields, same names.
 */

export type MilestoneStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED";

export interface ProjectMilestone {
  id: string;
  name: string;
  /** "percent" means {@link value} is a share of the BOQ value; "amount" means it is rupees. */
  valueMode: "percent" | "amount";
  value: number;
  dueDate: string;
  /** Milestone ids that must finish first. */
  dependencies: string[];
  status: MilestoneStatus;
  /** The sales invoice raised for this milestone, if any. */
  invoiceId: string | null;
}

export interface ProjectSalesInvoice {
  id: string;
  invoiceNo: string;
  clientName: string;
  invoiceDate: string;
  amount: number;
}

const storageKey = (kind: string, projectId: number) => `hitech.boq.${projectId}.${kind}`;

function load<T>(kind: string, projectId: number): T[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(kind, projectId));
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}

function persist<T>(kind: string, projectId: number, list: T[]) {
  try {
    window.localStorage.setItem(storageKey(kind, projectId), JSON.stringify(list));
  } catch {
    /* private mode / quota — the list still works for this session. */
  }
}

/** A tiny localStorage-backed list keyed by project, with add / update / remove. */
function useLocalList<T extends { id: string }>(kind: string, projectId: number) {
  const [items, setItems] = useState<T[]>([]);

  // localStorage is only there in the browser, so seed after mount rather than during render.
  useEffect(() => {
    setItems(load<T>(kind, projectId));
  }, [kind, projectId]);

  const update = useCallback(
    (fn: (prev: T[]) => T[]) => {
      setItems((prev) => {
        const next = fn(prev);
        persist(kind, projectId, next);
        return next;
      });
    },
    [kind, projectId],
  );

  const upsert = useCallback(
    (row: T) =>
      update((prev) => {
        const idx = prev.findIndex((r) => r.id === row.id);
        if (idx === -1) return [...prev, row];
        const copy = [...prev];
        copy[idx] = row;
        return copy;
      }),
    [update],
  );

  const remove = useCallback((id: string) => update((prev) => prev.filter((r) => r.id !== id)), [update]);

  return { items, upsert, remove };
}

export const newId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());

export const useMilestones = (projectId: number) => useLocalList<ProjectMilestone>("milestones", projectId);
export const useSalesInvoices = (projectId: number) => useLocalList<ProjectSalesInvoice>("invoices", projectId);

/** Rupee value of a milestone against a given BOQ contract value. */
export const milestoneAmount = (m: ProjectMilestone, boqValue: number) =>
  m.valueMode === "percent" ? (boqValue * m.value) / 100 : m.value;
