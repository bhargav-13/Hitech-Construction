import type { TenderStage, TenderStatus } from "./tenderTypes";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  TENDER LIFECYCLE — STATE MACHINE (State pattern)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A tender is ALWAYS in exactly one state (its `stage`). The only way to progress a tender is a
 * transition defined here. The UI never hard-codes "what comes next" — every action button on
 * every screen is generated from `transitionsFor(stage)`. So to change the business flow — reorder
 * stages, rename a button, add/remove a step — you edit ONLY this file and the whole app follows.
 *
 * The flow (confirmed with the client):
 *
 *     SORTING ──▶ RESEARCH ──▶ APPLIED ──▶ WON ──▶ (Project)
 *        │           │            │
 *        └──▶ LOST ◀─┘            └──▶ LOST
 *
 *   • SORTING   first pass — every incoming tender is analysed and sorted here.
 *   • RESEARCH  deep-dive to decide whether to bid.
 *   • APPLIED   bid submitted; awaiting outcome.
 *   • WON       awarded — becomes a Project (side-action, not a transition).
 *   • LOST      not awarded, or dropped before bidding. Can be re-opened.
 *
 * Everything here is intentionally data, not code — no `switch`, no `if`. Adding a state is adding
 * an entry to TENDER_STATES; adding a move is adding an entry to its `transitions`.
 */

/** Visual weight of a transition button. */
export type TransitionTone = "primary" | "danger" | "default";

/** One allowed move out of a state. */
export interface TenderTransition {
  /** Destination stage. */
  to: TenderStage;
  /** Optional applied-stage status to stamp on arrival (e.g. moving to APPLIED sets SUBMITTED). */
  status?: TenderStatus;
  /** Button label shown to the user. */
  label: string;
  /** primary = the main forward move, danger = drop / lost, default = everything else. */
  tone?: TransitionTone;
}

/** A single state (stage) and the moves out of it. */
export interface TenderStateDef {
  stage: TenderStage;
  label: string;
  /** One line, safe to show the client (tooltips, help text). */
  description: string;
  /** Allowed moves. Empty = terminal apart from side-actions (e.g. WON → Create Project). */
  transitions: TenderTransition[];
}

export const TENDER_STATES: TenderStateDef[] = [
  {
    stage: "SORTING",
    label: "Sorting",
    description: "First pass — all incoming tenders are analysed and sorted here.",
    transitions: [
      { to: "RESEARCH", label: "Move to Research", tone: "primary" },
      { to: "LOST", status: "LOST", label: "Drop (not pursuing)", tone: "danger" },
    ],
  },
  {
    stage: "RESEARCH",
    label: "Research",
    description: "Deep-dive to decide whether to bid.",
    transitions: [
      { to: "APPLIED", status: "SUBMITTED", label: "Apply (bid)", tone: "primary" },
      { to: "LOST", status: "LOST", label: "Closed / Lost", tone: "danger" },
      { to: "SORTING", label: "Back to Sorting" },
    ],
  },
  {
    stage: "APPLIED",
    label: "Applied",
    description: "Bid submitted — awaiting outcome. Use the status control for interim stages.",
    transitions: [
      { to: "WON", status: "WON", label: "Mark Won", tone: "primary" },
      { to: "LOST", status: "LOST", label: "Mark Lost", tone: "danger" },
    ],
  },
  {
    stage: "WON",
    label: "Won",
    description: "Awarded — ready to become a project.",
    transitions: [
      // No stage moves: the meaningful next step is the "Create Project" side-action.
    ],
  },
  {
    stage: "LOST",
    label: "Lost / Closed",
    description: "Not awarded or not pursued. Can be re-opened if retendered.",
    transitions: [{ to: "RESEARCH", label: "Re-open (Research)" }],
  },
];

const BY_STAGE: Record<string, TenderStateDef> = Object.fromEntries(
  TENDER_STATES.map((s) => [s.stage, s]),
);

/** The state definition for a stage. */
export const stateOf = (stage: TenderStage): TenderStateDef | undefined => BY_STAGE[stage];

/** Allowed moves out of a stage (drives every action button). */
export const transitionsFor = (stage: TenderStage): TenderTransition[] =>
  BY_STAGE[stage]?.transitions ?? [];

/** Is `to` reachable from `from` in one step? */
export const canTransition = (from: TenderStage, to: TenderStage): boolean =>
  transitionsFor(from).some((t) => t.to === to);

/** Stages in flow order (for steppers / funnels). Won & Lost are outcomes, shown separately. */
export const FLOW_ORDER: TenderStage[] = ["SORTING", "RESEARCH", "APPLIED", "WON"];
