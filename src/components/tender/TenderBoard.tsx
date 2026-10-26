"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2, FolderPlus, GripVertical, Hourglass, List, Plus, Search } from "lucide-react";
import { Select } from "@/components/Select";
import { useTenderStore } from "@/lib/tenderStore";
import {
  PRIORITY_META,
  SOURCE_META,
  STAGE_META,
  STATUS_META,
  type Tender,
  type TenderSource,
  type TenderStage,
  type TenderStatus,
} from "@/lib/tenderTypes";
import { FOLLOWUP_TONE_CLASS, followUpLabel, followUpTone, tdate, tmoney } from "@/lib/tenderHelpers";
import { stateOf, transitionsFor } from "@/lib/tenderStateMachine";
import { TenderDetailDrawer } from "@/components/tender/TenderDetailDrawer";
import { TenderForm } from "@/components/tender/TenderForm";
import { LossReasonModal } from "@/components/tender/LossReasonModal";
import { HandoffDialog } from "@/components/tender/HandoffDialog";
import { TenderHealthChip } from "@/components/tender/TenderHealthChip";
import { type HandoffOptions } from "@/lib/projectBoqStore";
import { handoffTenderToProject } from "@/lib/tenderProjectHandoff";

/**
 * The tender pipeline as one board — Sorting → Research → Applied → Won → Lost — replacing the
 * three separate stage screens in the rail. Drag a card to the next column to move it.
 *
 * Every drop goes through the same state machine as the buttons (`transitionsFor`): a move the
 * flow doesn't allow (Sorting straight to Won) is refused with the reason; a move into Lost asks
 * for the loss reason first; a move that needs approval is parked and the card says so. The old
 * table screens stay one click away ("List") for bulk moves, column choices and exports.
 */

const COLUMNS: TenderStage[] = ["SORTING", "RESEARCH", "APPLIED", "WON", "LOST"];

/** Where each column's "List" link goes — the full table screens, still there for bulk work. */
const LIST_HREF: Record<TenderStage, string> = {
  SORTING: "/tender/sorting",
  RESEARCH: "/tender/research",
  APPLIED: "/tender/applied",
  WON: "/tender/applied?outcome=WON",
  LOST: "/tender/applied?outcome=LOST",
};

/** A column shows this many cards before "Show all" — the Sorting pile alone runs past 120. */
const PAGE = 40;

export function TenderBoard() {
  const router = useRouter();
  const params = useSearchParams();
  const tenders = useTenderStore((s) => s.tenders);
  const setStage = useTenderStore((s) => s.setStage);
  const setStatus = useTenderStore((s) => s.setStatus);

  const [search, setSearch] = useState("");
  const [source, setSource] = useState<"ALL" | TenderSource>("ALL");
  const [dept, setDept] = useState("ALL");
  const [expanded, setExpanded] = useState<Set<TenderStage>>(new Set());
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<TenderStage | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deepLinkDismissed, setDeepLinkDismissed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Tender | null>(null);
  const [lossPrompt, setLossPrompt] = useState<{ tender: Tender; to: TenderStage; status?: TenderStatus; label: string } | null>(null);
  const [projectPrompt, setProjectPrompt] = useState<Tender | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3500);
  }, []);

  const departments = useMemo(
    () => [...new Set(tenders.map((t) => t.department).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b)),
    [tenders],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tenders.filter((t) => {
      if (source !== "ALL" && t.source !== source) return false;
      if (dept !== "ALL" && t.department !== dept) return false;
      if (!q) return true;
      return (
        (t.nameOfWork ?? "").toLowerCase().includes(q) ||
        (t.department ?? "").toLowerCase().includes(q) ||
        (t.tenderId ?? "").toLowerCase().includes(q)
      );
    });
  }, [tenders, search, source, dept]);

  /** Cards per column: nearest deadline first while bidding, newest decision first once decided. */
  const byStage = useMemo(() => {
    const map: Record<TenderStage, Tender[]> = { SORTING: [], RESEARCH: [], APPLIED: [], WON: [], LOST: [] };
    for (const t of filtered) map[t.stage]?.push(t);
    const byDeadline = (a: Tender, b: Tender) => (a.deadline || "9999").localeCompare(b.deadline || "9999");
    const byRecent = (a: Tender, b: Tender) => (b.deadline || "").localeCompare(a.deadline || "");
    map.SORTING.sort(byDeadline);
    map.RESEARCH.sort(byDeadline);
    map.APPLIED.sort(byRecent);
    map.WON.sort(byRecent);
    map.LOST.sort(byRecent);
    return map;
  }, [filtered]);

  // ?open=<id> opens the drawer, resolved against the live store so a move inside it shows at once.
  const openId = params?.get("open");
  const openDrawerId = selectedId ?? (deepLinkDismissed ? null : (openId ?? null));
  const selected = useMemo(() => (openDrawerId ? (tenders.find((t) => t.id === openDrawerId) ?? null) : null), [tenders, openDrawerId]);
  const closeDrawer = useCallback(() => {
    setSelectedId(null);
    setDeepLinkDismissed(true);
  }, []);

  const dragged = dragId ? (tenders.find((t) => t.id === dragId) ?? null) : null;
  /** Columns the dragged card may land in — highlighted while dragging, the rest dimmed. */
  const allowed = useMemo(() => new Set(dragged ? transitionsFor(dragged.stage).map((x) => x.to) : []), [dragged]);

  /** A drop is the same move as the matching button, so it carries that button's status and label. */
  async function drop(to: TenderStage) {
    const t = dragged;
    setDragId(null);
    setOverCol(null);
    if (!t || t.stage === to) return;
    if (t.pendingStage) {
      flash(`This tender's move to ${STAGE_META[t.pendingStage].label} is waiting for approval.`);
      return;
    }
    const move = transitionsFor(t.stage).find((x) => x.to === to);
    if (!move) {
      const next = transitionsFor(t.stage).map((x) => STAGE_META[x.to].label);
      flash(
        `${STAGE_META[t.stage].label} can't go straight to ${STAGE_META[to].label}` +
          (next.length ? ` — next step is ${next.join(" or ")}.` : "."),
      );
      return;
    }
    if (to === "LOST") {
      setLossPrompt({ tender: t, to, status: move.status, label: move.label });
      return;
    }
    const message = move.status ? await setStatus(t.id, move.status) : await setStage(t.id, to);
    flash(message ?? `Moved to ${STAGE_META[to].label}.`);
  }

  async function createProject(t: Tender, handoff: HandoffOptions | null) {
    setBusyId(t.id);
    try {
      const { message } = await handoffTenderToProject(t, handoff);
      flash(message);
    } finally {
      setBusyId(null);
      setProjectPrompt(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-800">Pipeline</h1>
          <p className="text-sm text-gray-500">Every tender by stage. Drag a card to move it along — Lost asks why, Won hands over to a project.</p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          <Plus size={15} /> New tender
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-[240px] flex-1 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 focus-within:border-cyan-500">
          <Search size={15} className="text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name of work, department or tender ID…"
            className="w-full bg-transparent text-sm outline-none"
          />
        </div>
        <Select
          value={source}
          onChange={(v) => setSource(v as "ALL" | TenderSource)}
          size="sm"
          className="w-40"
          options={[{ value: "ALL", label: "All sources" }, ...Object.entries(SOURCE_META).map(([k, m]) => ({ value: k, label: m.label }))]}
        />
        <Select
          value={dept}
          onChange={setDept}
          size="sm"
          className="w-56"
          options={[{ value: "ALL", label: "All departments" }, ...departments.map((d) => ({ value: d, label: d }))]}
        />
      </div>

      <div className="flex gap-2.5 overflow-x-auto pb-2">
        {COLUMNS.map((stage) => {
          const cards = byStage[stage];
          const shown = expanded.has(stage) ? cards : cards.slice(0, PAGE);
          const value = cards.reduce((s, t) => s + (t.contractValue ?? t.estimatedCost ?? 0), 0);
          const canDrop = !!dragged && allowed.has(stage);
          const dimmed = !!dragged && dragged.stage !== stage && !canDrop;
          return (
            <section
              key={stage}
              onDragOver={(e) => {
                if (!dragged) return;
                e.preventDefault();
                if (overCol !== stage) setOverCol(stage);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOverCol((c) => (c === stage ? null : c));
              }}
              onDrop={(e) => {
                e.preventDefault();
                void drop(stage);
              }}
              className={`flex min-w-[200px] flex-1 basis-0 flex-col rounded-xl border transition-colors ${
                overCol === stage && canDrop
                  ? "border-brand-accent bg-cyan-50/50"
                  : canDrop
                    ? "border-dashed border-brand-accent/60 bg-gray-50"
                    : "border-gray-200 bg-gray-50"
              } ${dimmed ? "opacity-50" : ""}`}
            >
              <header className="flex items-center gap-2 border-b border-gray-200/70 px-3 py-2.5" title={stateOf(stage)?.description}>
                <span className={`h-2 w-2 rounded-full ${STAGE_META[stage].dot}`} />
                <h2 className="text-sm font-semibold text-gray-700">{STAGE_META[stage].label}</h2>
                <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-gray-500 ring-1 ring-gray-200">{cards.length}</span>
                <Link
                  href={LIST_HREF[stage]}
                  title="Open as a table (bulk moves, columns, export)"
                  className="ml-auto flex items-center gap-1 text-[11px] font-medium text-gray-400 hover:text-brand-accent"
                >
                  <List size={12} /> List
                </Link>
              </header>
              <div className="px-3 pt-1.5 text-[11px] text-gray-400">{tmoney(value)}</div>

              <div className="flex max-h-[calc(100vh-290px)] min-h-[160px] flex-col gap-2 overflow-y-auto p-2">
                {shown.map((t) => (
                  <BoardCard
                    key={t.id}
                    t={t}
                    dragging={dragId === t.id}
                    busy={busyId === t.id}
                    onDragStart={() => setDragId(t.id)}
                    onDragEnd={() => {
                      setDragId(null);
                      setOverCol(null);
                    }}
                    onOpen={() => setSelectedId(t.id)}
                    onCreateProject={() => setProjectPrompt(t)}
                    onOpenProject={(id) => router.push(`/project/${id}`)}
                  />
                ))}
                {cards.length > shown.length && (
                  <button
                    onClick={() => setExpanded((s) => new Set(s).add(stage))}
                    className="rounded-lg border border-dashed border-gray-300 py-2 text-xs font-medium text-gray-500 hover:border-brand-accent hover:text-brand-accent"
                  >
                    Show all {cards.length}
                  </button>
                )}
                {cards.length === 0 && <p className="py-8 text-center text-xs text-gray-400">No tenders here.</p>}
              </div>
            </section>
          );
        })}
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm text-white shadow-lg">{toast}</div>
      )}

      {selected && (
        <TenderDetailDrawer
          tender={selected}
          onClose={closeDrawer}
          onEdit={(t) => {
            closeDrawer();
            setEditing(t);
          }}
          onRequestLoss={(t, to, status, label) => {
            closeDrawer();
            setLossPrompt({ tender: t, to, status, label });
          }}
          onRequestProject={(t) => {
            closeDrawer();
            setProjectPrompt(t);
          }}
        />
      )}
      {creating && <TenderForm initialStage="SORTING" onClose={() => setCreating(false)} />}
      {editing && <TenderForm tender={editing} onClose={() => setEditing(null)} />}

      {lossPrompt && (
        <LossReasonModal
          tender={lossPrompt.tender}
          actionLabel={lossPrompt.label}
          onCancel={() => setLossPrompt(null)}
          onConfirm={async (patch) => {
            const message = lossPrompt.status
              ? await setStatus(lossPrompt.tender.id, lossPrompt.status, patch)
              : await setStage(lossPrompt.tender.id, lossPrompt.to, null, patch);
            setLossPrompt(null);
            flash(message ?? "Outcome recorded.");
          }}
        />
      )}

      {projectPrompt && (
        <HandoffDialog
          tender={projectPrompt}
          busy={busyId === projectPrompt.id}
          onCancel={() => setProjectPrompt(null)}
          onConfirm={(opts) => void createProject(projectPrompt, opts)}
        />
      )}
    </div>
  );
}

function BoardCard({
  t,
  dragging,
  busy,
  onDragStart,
  onDragEnd,
  onOpen,
  onCreateProject,
  onOpenProject,
}: {
  t: Tender;
  dragging: boolean;
  busy: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onOpen: () => void;
  onCreateProject: () => void;
  onOpenProject: (id: number) => void;
}) {
  const bidding = t.stage === "SORTING" || t.stage === "RESEARCH";
  const value = t.contractValue ?? t.estimatedCost ?? null;
  const tone = followUpTone(t.nextFollowUp);
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", t.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      className={`group cursor-pointer rounded-lg border border-gray-200 bg-white p-2.5 shadow-sm transition-all hover:border-gray-300 hover:shadow ${
        dragging ? "opacity-40" : ""
      }`}
    >
      <div className="flex items-start gap-1.5">
        <p className="line-clamp-3 min-w-0 flex-1 text-[13px] leading-snug text-gray-800" title={t.nameOfWork ?? ""}>
          {t.nameOfWork || `Tender ${t.tenderId}`}
        </p>
        <GripVertical size={14} className="mt-0.5 hidden shrink-0 text-gray-300 group-hover:block" />
      </div>
      <p className="mt-1 truncate text-[11px] text-gray-500">
        {[t.department, t.tenderId].filter(Boolean).join(" · ") || "—"}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
        {value != null && <span className="font-semibold text-gray-700">{tmoney(value)}</span>}
        {t.priority && (
          <span className={`rounded-full px-1.5 py-0.5 font-medium ring-1 ring-inset ${PRIORITY_META[t.priority].chip}`}>
            {PRIORITY_META[t.priority].label}
          </span>
        )}
        {t.stage === "APPLIED" && t.status && (
          <span className={`rounded-full px-1.5 py-0.5 font-medium ring-1 ring-inset ${STATUS_META[t.status].chip}`}>
            {STATUS_META[t.status].label}
          </span>
        )}
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-gray-500">
        {bidding ? <span>Due {tdate(t.deadline)}</span> : <span>Submitted {tdate(t.submissionDate)}</span>}
        {bidding && t.nextFollowUp && (
          <span className={`rounded-full px-1.5 py-0.5 font-medium ring-1 ring-inset ${FOLLOWUP_TONE_CLASS[tone]}`}>
            {followUpLabel(t.nextFollowUp)}
          </span>
        )}
        {(t.stage === "RESEARCH" || t.stage === "APPLIED") && <TenderHealthChip tender={t} showBid={false} />}
      </div>

      {/* A move parked for approval still sits in its old column — say so on the card. */}
      {t.pendingStage && (
        <div
          className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${
            t.canActNow ? "bg-rose-50 text-rose-700 ring-rose-600/20" : "bg-amber-50 text-amber-700 ring-amber-600/20"
          }`}
          title={t.approval?.awaitingRoleNames ? `Waiting on ${t.approval.awaitingRoleNames}` : "Awaiting approval"}
        >
          <Hourglass size={10} /> {t.canActNow ? "Your approval" : "Pending"} → {STAGE_META[t.pendingStage].label}
        </div>
      )}

      {t.stage === "WON" && (
        <div className="mt-2" onClick={(e) => e.stopPropagation()}>
          {t.projectId != null && t.projectId > 0 ? (
            <button onClick={() => onOpenProject(t.projectId!)} className="flex items-center gap-1 text-[11px] font-medium text-emerald-700 hover:underline">
              <Building2 size={12} /> Project #{t.projectId}
            </button>
          ) : (
            <button
              onClick={onCreateProject}
              disabled={busy}
              className="flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              <FolderPlus size={12} /> {busy ? "Creating…" : "Create project"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
