"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { apiRequest, getActiveCompanyId, setActiveCompanyId } from "./api";

/**
 * Which of the group's firms the app is currently working in.
 *
 * The group trades as two companies — Hi-Tech Construction and R.P. Enterprise — behind one login,
 * and their books, sites and staff are separate. Rather than a query parameter on every endpoint,
 * the choice rides on every request as an `X-Company-Id` header; the backend validates it against
 * the caller's grants and 403s anything they can't reach.
 */
export interface Company {
  id: number;
  code: string;
  name: string;
  legalName: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  gstin: string | null;
  pan: string | null;
  phone: string | null;
  email: string | null;
  logoDataUrl: string | null;
  footerNote: string | null;
  /** Chrome accent, so it's obvious at a glance which firm's books are on screen. */
  accent: string;
  /**
   * False = listed but not selectable. A company is only safe to enter once every module scopes
   * its data by company; until then switching would file work under the wrong firm silently.
   */
  enabled: boolean;
}

/**
 * The active id itself lives in `lib/api.ts` next to the token helpers — `request()` has to stamp
 * the header and is not a component, and keeping it there avoids this module and `api` importing
 * each other. Everything below is the React-facing half: the list, the active company, the switch.
 */

interface CompanyScopeState {
  companyId: number | null;
  companies: Company[];
  loading: boolean;
  setCompanies: (list: Company[]) => void;
}

export const useCompanyScope = create<CompanyScopeState>((set) => ({
  companyId: getActiveCompanyId(),
  companies: [],
  loading: true,
  setCompanies: (list) =>
    set((s) => {
      // Settle on a company as soon as the list is known: whatever was stored, if it's still
      // reachable and usable, otherwise the first usable one. Without this the header stays absent
      // and every request runs unscoped — which today is harmless but silently wrong later.
      const usable = list.filter((c) => c.enabled);
      const stored = usable.find((c) => c.id === s.companyId);
      const next = stored ?? usable[0] ?? null;
      if (next && next.id !== getActiveCompanyId()) setActiveCompanyId(next.id);
      return { companies: list, companyId: next?.id ?? null, loading: false };
    }),
}));

/**
 * Switch company, then reload the page.
 *
 * The reload is deliberate. Changing company invalidates essentially everything the app is holding:
 * the global project scope (a project id from one firm is meaningless in the other), every zustand
 * store that has cached rows — tasks, tenders, payroll, procurement — and every list already
 * rendered. Invalidating all of that by hand is a large surface to get wrong, and getting it wrong
 * shows one company's data under the other's name. Switching happens a few times a day at most, so
 * paying a reload for a guaranteed-clean slate is the right trade.
 *
 * The caller is responsible for confirming unsaved work first (see `formDirty`).
 */
export function switchCompany(id: number) {
  if (id === getActiveCompanyId()) return;
  setActiveCompanyId(id);
  // The reload also resets the global project scope, which lives in an unpersisted store and so
  // comes back as "All Projects" — the right answer, since a project id belongs to the company
  // being left behind. If that store ever gains `persist`, clear its key here too.
  window.location.reload();
}

/**
 * Fetch the list once per page load, shared by every component that asks.
 *
 * Held as a module-level promise rather than per-component state: the sidebar and the settings
 * screen both want this, and a guard in each of them would mean two requests for the same list.
 * Kicking it off outside React also keeps the effect below free of a synchronous setState.
 */
let inFlight: Promise<void> | null = null;

function ensureCompaniesLoaded(): Promise<void> {
  inFlight ??= (async () => {
    try {
      useCompanyScope.getState().setCompanies(await apiRequest<Company[]>("/api/v1/companies"));
    } catch {
      // Backend not up, or an older build without the endpoint: fall back to no switcher rather
      // than blocking the sidebar from rendering.
      useCompanyScope.getState().setCompanies([]);
    }
  })();
  return inFlight;
}

/** The companies this user may work in, plus the active one. */
export function useCompanies(): {
  companies: Company[];
  active: Company | null;
  loading: boolean;
} {
  const companies = useCompanyScope((s) => s.companies);
  const companyId = useCompanyScope((s) => s.companyId);
  const loading = useCompanyScope((s) => s.loading);

  useEffect(() => {
    ensureCompaniesLoaded();
  }, []);

  return {
    companies,
    active: companies.find((c) => c.id === companyId) ?? null,
    loading,
  };
}

/** Tailwind classes for a company's accent, keyed off the `accent` column. */
export const COMPANY_ACCENT: Record<string, { bar: string; tile: string; ring: string }> = {
  cyan: { bar: "bg-cyan-500", tile: "bg-white text-[#0e2a47]", ring: "bg-cyan-500/20" },
  amber: { bar: "bg-amber-500", tile: "bg-amber-500 text-white", ring: "bg-amber-500/20" },
  emerald: { bar: "bg-emerald-500", tile: "bg-emerald-500 text-white", ring: "bg-emerald-500/20" },
  violet: { bar: "bg-violet-500", tile: "bg-violet-500 text-white", ring: "bg-violet-500/20" },
};

export function companyAccent(company: Company | null) {
  return COMPANY_ACCENT[company?.accent ?? "cyan"] ?? COMPANY_ACCENT.cyan;
}

/** Two-letter mark for a company with no logo uploaded — "Hi-Tech Construction" → "HT". */
export function companyInitials(name: string): string {
  const words = name.replace(/[^A-Za-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  if (words.length === 0) return "??";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
