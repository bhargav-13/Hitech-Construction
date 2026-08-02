"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Tender } from "./tenderTypes";
import { tdays } from "./tenderHelpers";

/**
 * Our own firm's credentials, so the Sorting screen can decide go/no-go instead of just listing
 * tenders. The workbook made this judgement in someone's head; here it is written down once and
 * applied to all 285 rows automatically.
 */
export interface CompanyProfile {
  /** Registration class we hold (A is highest in the client's departments). */
  registrationClass: string;
  /** Average annual turnover, ₹ — checked against a tender's PQ turnover requirement. */
  turnover: number;
  /** Value of the largest similar work completed, ₹ — the usual PQ experience test. */
  largestWorkValue: number;
  /** How much EMD we can have blocked at once before cash flow hurts, ₹. */
  emdHeadroom: number;
  /** Ignore tenders below this estimated cost — too small to be worth bidding. */
  minEstimatedCost: number;
  /** Ignore tenders above this estimated cost — beyond our execution capacity. */
  maxEstimatedCost: number;
}

export const DEFAULT_PROFILE: CompanyProfile = {
  registrationClass: "B",
  turnover: 50_000_000,
  largestWorkValue: 25_000_000,
  emdHeadroom: 5_000_000,
  minEstimatedCost: 1_000_000,
  maxEstimatedCost: 500_000_000,
};

interface ProfileState extends CompanyProfile {
  update: (patch: Partial<CompanyProfile>) => void;
  reset: () => void;
}

export const useCompanyProfile = create<ProfileState>()(
  persist(
    (set) => ({
      ...DEFAULT_PROFILE,
      update: (patch) => set(patch),
      reset: () => set(DEFAULT_PROFILE),
    }),
    { name: "hitech.tenderProfile.v1", storage: createJSONStorage(() => localStorage) },
  ),
);

/* ---------- bid scoring ---------- */

/** Higher rank = higher class. Departments in the workbook use A/B/C/D/E, occasionally "AA". */
const CLASS_RANK: Record<string, number> = { AA: 6, A: 5, B: 4, C: 3, D: 2, E: 1 };

/** Pull the class letter out of text like "B Class & Above", "Class-C and above", "Special Cat A". */
export function classRankOf(text?: string | null): number | null {
  if (!text) return null;
  const m = /\b(AA|[A-E])\s*(?:class|cat)?\b/i.exec(text) ?? /(?:class|cat)\s*[-:]?\s*(AA|[A-E])\b/i.exec(text);
  if (!m) return null;
  return CLASS_RANK[m[1].toUpperCase()] ?? null;
}

/** First rupee amount mentioned in a PQ criteria blob, treated as the turnover/experience bar. */
function requirementAmount(text?: string | null): number | null {
  if (!text) return null;
  const m = /([\d,]+(?:\.\d+)?)\s*(cr|crore|lakh|lac|l\b)?/i.exec(text.replace(/₹/g, ""));
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  const unit = (m[2] ?? "").toLowerCase();
  if (unit.startsWith("cr")) return n * 10_000_000;
  if (unit.startsWith("l")) return n * 100_000;
  return n;
}

export type FlagTone = "block" | "warn" | "info";

export interface BidFlag {
  tone: FlagTone;
  label: string;
  detail: string;
}

/**
 * Automatic go/no-go checks for one tender against our profile. `block` flags mean we are not
 * eligible at all; `warn` flags mean a human should look. Nothing here mutates the tender — the
 * decision stays with the user, this just stops them reading 285 rows by hand.
 */
export function bidFlags(t: Tender, profile: CompanyProfile, emdBlocked = 0): BidFlag[] {
  const flags: BidFlag[] = [];

  const need = classRankOf(t.classReq);
  const have = CLASS_RANK[profile.registrationClass.toUpperCase()] ?? null;
  if (need != null && have != null && have < need) {
    flags.push({
      tone: "block",
      label: "Class short",
      detail: `Needs ${t.classReq} — we hold ${profile.registrationClass}.`,
    });
  }

  const pq = requirementAmount(t.pqCriteria);
  if (pq != null && pq > profile.turnover) {
    flags.push({
      tone: "warn",
      label: "PQ turnover",
      detail: `PQ appears to need ₹${pq.toLocaleString("en-IN")} against our ₹${profile.turnover.toLocaleString("en-IN")}.`,
    });
  }

  if (t.estimatedCost != null) {
    if (t.estimatedCost < profile.minEstimatedCost) {
      flags.push({ tone: "info", label: "Below floor", detail: "Smaller than the minimum value we bid on." });
    } else if (t.estimatedCost > profile.maxEstimatedCost) {
      flags.push({ tone: "warn", label: "Above capacity", detail: "Larger than the maximum value we bid on." });
    }
    if (t.estimatedCost > profile.largestWorkValue * 3) {
      flags.push({
        tone: "warn",
        label: "Experience gap",
        detail: "More than 3× our largest completed work — PQ experience is likely to fail.",
      });
    }
  }

  if (t.emd != null && emdBlocked + t.emd > profile.emdHeadroom) {
    flags.push({
      tone: "warn",
      label: "EMD headroom",
      detail: "Paying this EMD would push blocked capital past the limit set in the profile.",
    });
  }

  const days = tdays(t.deadline);
  if (days != null && days < 0) {
    flags.push({ tone: "block", label: "Deadline passed", detail: "The submission deadline is in the past." });
  } else if (days != null && days <= 2) {
    flags.push({ tone: "warn", label: "Closing", detail: `Only ${days === 0 ? "today" : `${days} day(s)`} left to submit.` });
  }

  return flags;
}

export const FLAG_TONE_CLASS: Record<FlagTone, string> = {
  block: "bg-rose-50 text-rose-700 ring-rose-600/20",
  warn: "bg-amber-50 text-amber-700 ring-amber-600/20",
  info: "bg-gray-100 text-gray-600 ring-gray-500/20",
};

/** Worst flag on a tender, for a single at-a-glance row indicator. */
export function worstFlag(flags: BidFlag[]): BidFlag | null {
  return flags.find((f) => f.tone === "block") ?? flags.find((f) => f.tone === "warn") ?? flags[0] ?? null;
}
