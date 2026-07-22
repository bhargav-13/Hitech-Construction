"use client";

import { useEffect, useState } from "react";
import { create } from "zustand";
import * as vyapar from "./vyaparApi";
import type { BankAccount } from "./vyaparApi";

/**
 * The bank/cash account selected in the Vyapar header dropdown. "all" = every account combined.
 * Replaces the old project-scope picker for Vyapar routes — Vyapar books are personal and are
 * organised by bank account, not by construction project. Kept in a store (not URL) so it
 * persists as the user moves between Vyapar tabs.
 */
interface BankScopeState {
  bankAccountId: string | "all";
  setBankAccountId: (id: string | "all") => void;
}

export const useBankScope = create<BankScopeState>((set) => ({
  bankAccountId: "all",
  setBankAccountId: (id) => set({ bankAccountId: id }),
}));

/**
 * The scoped bank account as a number for backend calls — "all" (or a non-numeric id) becomes
 * `undefined`, which every Vyapar API function treats as "every account".
 */
export function useVyaparBankId(): number | undefined {
  const bankAccountId = useBankScope((s) => s.bankAccountId);
  if (bankAccountId === "all") return undefined;
  const n = Number(bankAccountId);
  return Number.isFinite(n) ? n : undefined;
}

/** Bank accounts for the scope picker — a light list fetch, not the full ledger. */
export function useBankAccounts(): { accounts: BankAccount[]; loading: boolean } {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await vyapar.getBankAccounts();
        if (!cancelled) setAccounts(res);
      } catch {
        if (!cancelled) setAccounts([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { accounts, loading };
}

/**
 * Payment Type options for invoice/expense/payment forms — the actual Cash In Hand account plus
 * every bank account the user has set up, instead of the generic "Cash / Bank / UPI / Cheque"
 * placeholder list. `paymentType` is stored as free text, so the option value is the account name
 * itself (e.g. "MITESH CASH", "HI-TECH CONSTRUCTION").
 */
export function usePaymentTypeOptions(): { value: string; label: string }[] {
  const { accounts } = useBankAccounts();
  return [
    { value: "Cash", label: "Cash In Hand" },
    ...accounts.filter((a) => a.isActive).map((a) => ({ value: a.name, label: a.name })),
  ];
}
