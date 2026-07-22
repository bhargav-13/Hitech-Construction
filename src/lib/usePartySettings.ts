"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Party module preferences, mirroring Vyapar's Settings → Party page. Stored locally for now so
 * the UI is fully usable ahead of the backend; the shape is what the API will persist later.
 */
export interface PartySettings {
  /** Group parties (Wholesale, Retail…) — adds a Party Group field and list grouping. */
  partyGrouping: boolean;
  /** Offer a separate shipping address on the party form. */
  shippingAddress: boolean;
  /** Track an Active/Inactive status per party. */
  managePartyStatus: boolean;
  /** Nudge for overdue receivables. */
  paymentReminder: boolean;
  /** Days after the due date before a party is flagged. */
  reminderDays: number;
  reminderMessage: string;
  /** Four configurable extras: enabled flag, label, and whether it prints on documents. */
  fieldsEnabled: [boolean, boolean, boolean, boolean];
  fieldNames: [string, string, string, string];
  fieldsInPrint: [boolean, boolean, boolean, boolean];
}

export const DEFAULT_PARTY_SETTINGS: PartySettings = {
  partyGrouping: false,
  shippingAddress: true,
  managePartyStatus: false,
  paymentReminder: true,
  reminderDays: 1,
  reminderMessage:
    "Hi {party}, a gentle reminder that {amount} is pending against {invoice}. Kindly arrange the payment. Thank you.",
  fieldsEnabled: [false, false, false, false],
  fieldNames: ["", "", "", ""],
  fieldsInPrint: [false, false, false, false],
};

const KEY = "vyapar.partySettings.v1";

export function usePartySettings() {
  const [settings, setSettings] = useState<PartySettings>(DEFAULT_PARTY_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setSettings({ ...DEFAULT_PARTY_SETTINGS, ...(JSON.parse(raw) as PartySettings) });
    } catch {
      /* ignore a malformed preference blob */
    }
    setLoaded(true);
  }, []);

  const save = useCallback((next: PartySettings) => {
    setSettings(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable — keep the in-memory value */
    }
  }, []);

  const patch = useCallback(
    (p: Partial<PartySettings>) => save({ ...settings, ...p }),
    [settings, save]
  );

  return { settings, save, patch, loaded };
}
