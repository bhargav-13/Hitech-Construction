"use client";

import { useMemo, useState } from "react";
import { TenderShell, TenderEmpty } from "@/components/tender/TenderShell";
import { TenderDetailDrawer } from "@/components/tender/TenderDetailDrawer";
import { ApprovalProgressPill } from "@/components/approval/ApprovalTrail";
import { useTenderStore } from "@/lib/tenderStore";
import { STAGE_META, type Tender } from "@/lib/tenderTypes";
import { tmoney, tval } from "@/lib/tenderHelpers";
import { formatDateTimeIST } from "@/lib/datetime";
import { ArrowRight, BadgeCheck, Check, Hourglass, Search, Undo2, X } from "lucide-react";

type Tab = "MINE" | "ALL";

/**
 * Tender approvals inbox.
 *
 * A stage move on a tenant with a published approval chain doesn't land — it parks as
 * `pendingStage` and climbs the ladder. Until now the only place that showed was inside each
 * tender's drawer, so an approver had to already know which tender to open. This lists every
 * parked move, puts the ones waiting on the signed-in user first, and lets them decide in place.
 */
export default function TenderApprovalsPage() {
  const tenders = useTenderStore((s) => s.tenders);
  const backend = useTenderStore((s) => s.backend);
  const [tab, setTab] = useState<Tab>("MINE");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const pending = useMemo(() => tenders.filter((t) => t.pendingStage), [tenders]);
  const mineCount = useMemo(() => pending.filter((t) => t.canActNow).length, [pending]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return pending
      .filter((t) => (tab === "MINE" ? t.canActNow : true))
      .filter(
        (t) =>
          !q ||
          (t.nameOfWork ?? "").toLowerCase().includes(q) ||
          (t.department ?? "").toLowerCase().includes(q) ||
          (t.tenderId ?? "").toLowerCase().includes(q),
      )
      // Oldest request first — it has been waiting longest.
      .sort((a, b) => raisedAt(a).localeCompare(raisedAt(b)));
  }, [pending, tab, search]);

  const open = openId ? tenders.find((t) => t.id === openId) : undefined;

  return (
    <TenderShell>
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-gray-800">Approvals</h1>
            <p className="text-sm text-gray-500">
              Stage changes waiting on the approval ladder. A tender stays where it is until every level signs off.
            </p>
          </div>
          <div className="text-sm text-gray-500">
            <span className="font-semibold text-rose-600">{mineCount}</span> waiting on you ·{" "}
            <span className="font-semibold text-gray-700">{pending.length}</span> pending in total
          </div>
        </div>

        {!backend && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Working offline — stage moves apply straight away without approval. Requests appear here once the tender
            server is reachable.
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-gray-200 bg-white p-1">
            {(
              [
                ["MINE", `Awaiting me (${mineCount})`],
                ["ALL", `All pending (${pending.length})`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  tab === key ? "bg-cyan-50 text-brand-accent" : "text-gray-500 hover:bg-gray-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="relative min-w-[240px] flex-1">
            <Search size={14} className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name of work, department or tender ID"
              className="input pl-8"
            />
          </div>
        </div>

        {rows.length === 0 ? (
          <TenderEmpty
            icon={BadgeCheck}
            title={tab === "MINE" ? "Nothing waiting on you" : "No pending stage changes"}
            hint={
              tab === "MINE" && pending.length > 0
                ? `${pending.length} request${pending.length === 1 ? " is" : "s are"} with other approvers — see All pending.`
                : "Moves that need sign-off show up here as soon as they are raised."
            }
          />
        ) : (
          <div className="space-y-3">
            {rows.map((t) => (
              <ApprovalCard key={t.id} tender={t} onOpen={() => setOpenId(t.id)} />
            ))}
          </div>
        )}
      </div>

      {open && <TenderDetailDrawer tender={open} onClose={() => setOpenId(null)} />}
    </TenderShell>
  );
}

function raisedBy(t: Tender) {
  return t.approval?.trail.find((a) => a.action === "SUBMITTED") ?? null;
}
function raisedAt(t: Tender) {
  return raisedBy(t)?.at ?? "";
}

function ApprovalCard({ tender: t, onOpen }: { tender: Tender; onOpen: () => void }) {
  const decideStage = useTenderStore((s) => s.decideStage);
  const cancelStageChange = useTenderStore((s) => s.cancelStageChange);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submitted = raisedBy(t);
  const to = t.pendingStage!;

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That could not be recorded.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={`rounded-xl border bg-white p-4 transition-shadow hover:shadow-sm ${
        t.canActNow ? "border-rose-200" : "border-gray-200"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
            <span className="font-mono">{tval(t.tenderId)}</span>
            {t.department && <span>· {t.department}</span>}
            {t.estimatedCost != null && <span>· {tmoney(t.estimatedCost)}</span>}
          </div>
          <div className="mt-1 line-clamp-2 text-sm font-medium text-gray-800 hover:text-brand-accent">
            {tval(t.nameOfWork)}
          </div>
        </button>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STAGE_META[t.stage].chip}`}>
            {STAGE_META[t.stage].label}
          </span>
          <ArrowRight size={14} className="text-gray-400" />
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STAGE_META[to].chip}`}>
            {STAGE_META[to].label}
          </span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <Hourglass size={12} className="text-amber-500" />
          Requested by <span className="font-medium text-gray-700">{submitted?.actorName ?? "—"}</span>
          {submitted?.at && <span className="text-gray-400">· {formatDateTimeIST(submitted.at)}</span>}
        </span>
        <ApprovalProgressPill approval={t.approval ?? null} />
      </div>

      {t.canActNow ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (optional)"
            className="input min-w-[200px] flex-1"
            disabled={busy}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => run(() => decideStage(t.id, "APPROVE", note.trim() || undefined))}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
          >
            <Check size={15} /> Approve
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => run(() => decideStage(t.id, "REJECT", note.trim() || undefined))}
            className="flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
          >
            <X size={15} /> Reject
          </button>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-gray-400">
            {t.approval?.awaitingRoleNames ? `With ${t.approval.awaitingRoleNames}` : "Waiting on the next approver"}
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={() => run(() => cancelStageChange(t.id))}
            className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-50"
          >
            <Undo2 size={13} /> Withdraw
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
    </div>
  );
}
