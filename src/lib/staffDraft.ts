"use client";

import { create } from "zustand";

/**
 * Carries an existing ERP user into the Add-Staff flow so an admin who already created the person
 * in Settings → Users can turn them into a staff member without retyping their name/email/phone.
 * Transient (not persisted): the user picker sets it, the Add-Staff page reads it once and clears.
 */
export interface StaffDraftUser {
  id: number;
  name: string;
  email: string;
  phone: string | null;
}

interface StaffDraftState {
  fromUser: StaffDraftUser | null;
  setFromUser: (u: StaffDraftUser | null) => void;
  clear: () => void;
}

export const useStaffDraft = create<StaffDraftState>((set) => ({
  fromUser: null,
  setFromUser: (u) => set({ fromUser: u }),
  clear: () => set({ fromUser: null }),
}));
