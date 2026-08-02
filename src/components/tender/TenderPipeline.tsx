"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { SortTh } from "@/components/vyapar/SortTh";
import { RowMenu, RowMenuItem, RowMenuDivider } from "@/components/RowMenu";
import { Select } from "@/components/Select";
import { useTableSort } from "@/lib/useTableSort";
import { useTenderStore } from "@/lib/tenderStore";
import { useTenderPrefs, DENSITY_CLASS } from "@/lib/tenderPrefs";
import { useCompanyProfile, bidFlags, worstFlag, FLAG_TONE_CLASS } from "@/lib/tenderProfile";
import * as api from "@/lib/api";
import {
  STAGE_META,
  STATUS_META,
  SOURCE_META,
  PRIORITY_META,
  type Tender,
  type TenderStage,
  type TenderStatus,
  type TenderSource,
} from "@/lib/tenderTypes";
import {
  DEADLINE_TONE_CLASS,
  deadlineLabel,
  deadlineTone,
  tdate,
  tmoney,
  tval,
} from "@/lib/tenderHelpers";
import { exposure } from "@/lib/tenderMetrics";
import { exportTenders } from "@/lib/tenderExcel";
import { transitionsFor } from "@/lib/tenderStateMachine";
import { TenderDetailDrawer } from "@/components/tender/TenderDetailDrawer";
import { TenderForm } from "@/components/tender/TenderForm";
import { ImportDrawer } from "@/components/tender/ImportDrawer";
import { LossReasonModal } from "@/components/tender/LossReasonModal";
import { ConfirmDialog } from "@/components/tender/ConfirmDialog";
import { TenderEmpty } from "@/components/tender/TenderShell";
import {
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  Building2,
  CheckCircle2,
  Check,
  Download,
  ExternalLink,
  FolderPlus,
  Pencil,
  Plus,
  Rows3,
  Search,
  Send,
  SlidersHorizontal,
  Undo2,
  Upload,
  X,
  XCircle,
} from "lucide-react";

export type PipelineVariant = "research" | "sorting" | "applied";

type Col = {
  key: string;
  label: string;
  align?: "right";
  sort: (t: Tender) => string | number | null | undefined;
  cell: (t: Tender) => React.ReactNode;
};

const nameCell = (t: Tender) => (
  <span className="block max-w-[420px] truncate" title={t.nameOfWork ?? ""}>
    {tval(t.nameOfWork)}
  </span>
);

/** Deadline with a days-remaining badge — a tender desk works to dates, not to values. */
const deadlineCell = (value?: string | null) => {
  const tone = deadlineTone(value);
  return (
    <div className="flex items-center gap-1.5 whitespace-nowrap">
      <span>{tdate(value)}</span>
      {tone !== "none" && tone !== "ok" && (
        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${DEADLINE_TONE_CLASS[tone]}`}>
          {deadlineLabel(value)}
        </span>
      )}
    </div>
  );
};

const COLS: Record<PipelineVariant, Col[]> = {
  research: [
    { key: "department", label: "Department", sort: (t) => t.department, cell: (t) => tval(t.department) },
    { key: "tenderId", label: "Tender ID", sort: (t) => t.tenderId, cell: (t) => tval(t.tenderId) },
    { key: "nameOfWork", label: "Name of Work", sort: (t) => t.nameOfWork, cell: nameCell },
    { key: "estimatedCost", label: "Est. Cost", align: "right", sort: (t) => t.estimatedCost, cell: (t) => tmoney(t.estimatedCost) },
    { key: "deadline", label: "Deadline", sort: (t) => t.deadline, cell: (t) => deadlineCell(t.deadline) },
    { key: "hardcopyDue", label: "Hardcopy Due", sort: (t) => t.hardcopyDue, cell: (t) => deadlineCell(t.hardcopyDue) },
    { key: "fee", label: "Fee", align: "right", sort: (t) => t.fee, cell: (t) => tmoney(t.fee) },
    { key: "emd", label: "EMD", align: "right", sort: (t) => t.emd, cell: (t) => tmoney(t.emd) },
    { key: "classReq", label: "Class", sort: (t) => t.classReq, cell: (t) => tval(t.classReq) },
  ],
  sorting: [
    { key: "department", label: "Department", sort: (t) => t.department, cell: (t) => tval(t.department) },
    { key: "tenderId", label: "Tender ID", sort: (t) => t.tenderId, cell: (t) => tval(t.tenderId) },
    { key: "nameOfWork", label: "Name of Work", sort: (t) => t.nameOfWork, cell: nameCell },
    { key: "estimatedCost", label: "Est. Cost", align: "right", sort: (t) => t.estimatedCost, cell: (t) => tmoney(t.estimatedCost) },
    { key: "deadline", label: "Deadline", sort: (t) => t.deadline, cell: (t) => deadlineCell(t.deadline) },
    { key: "emd", label: "EMD", align: "right", sort: (t) => t.emd, cell: (t) => tmoney(t.emd) },
    {
      key: "priority",
      label: "Priority",
      sort: (t) => t.priority,
      cell: (t) =>
        t.priority ? (
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${PRIORITY_META[t.priority].chip}`}>
            {PRIORITY_META[t.priority].label}
          </span>
        ) : (
          "—"
        ),
    },
    {
      key: "pqCriteria",
      label: "PQ Criteria",
      sort: (t) => t.pqCriteria,
      cell: (t) => (
        <span className="block max-w-[200px] truncate" title={t.pqCriteria ?? ""}>
          {tval(t.pqCriteria)}
        </span>
      ),
    },
    { key: "classReq", label: "Class", sort: (t) => t.classReq, cell: (t) => tval(t.classReq) },
  ],
  applied: [
    { key: "department", label: "Department", sort: (t) => t.department, cell: (t) => tval(t.department) },
    { key: "tenderId", label: "Tender ID", sort: (t) => t.tenderId, cell: (t) => tval(t.tenderId) },
    { key: "nameOfWork", label: "Name of Work", sort: (t) => t.nameOfWork, cell: nameCell },
    { key: "estimatedCost", label: "Est. Cost", align: "right", sort: (t) => t.estimatedCost, cell: (t) => tmoney(t.estimatedCost) },
    { key: "contractValue", label: "Contract Value", align: "right", sort: (t) => t.contractValue, cell: (t) => tmoney(t.contractValue) },
    { key: "variancePct", label: "Var %", align: "right", sort: (t) => t.variancePct, cell: (t) => (t.variancePct == null ? "—" : `${t.variancePct}%`) },
    { key: "submissionDate", label: "Submitted", sort: (t) => t.submissionDate, cell: (t) => tdate(t.submissionDate) },
    { key: "emdState", label: "EMD", sort: (t) => t.emdState, cell: (t) => <EmdCell t={t} /> },
    {
      key: "status",
      label: "Status",
      sort: (t) => t.status,
      cell: (t) =>
        t.status ? (
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_META[t.status].chip}`}>
            {STATUS_META[t.status].label}
          </span>
        ) : (
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STAGE_META[t.stage].chip}`}>
            {STAGE_META[t.stage].label}
          </span>
        ),
    },
  ],
};

const VARIANT_STAGES: Record<PipelineVariant, TenderStage[]> = {
  sorting: ["SORTING"],
  research: ["RESEARCH"],
  applied: ["APPLIED", "WON", "LOST"],
};

/** New tenders created from a pipeline page start at that page's stage. */
const VARIANT_STAGE: Record<PipelineVariant, TenderStage> = {
  sorting: "SORTING",
  research: "RESEARCH",
  applied: "APPLIED",
};

const HEADING: Record<PipelineVariant, { title: string; sub: string; empty: string }> = {
  sorting: { title: "Sorting", sub: "First pass — every incoming tender is analysed and sorted here. Move promising ones to Research.", empty: "No tenders in sorting." },
  research: { title: "Research", sub: "Deep-dive on shortlisted tenders. Apply to bid, or close as lost.", empty: "No tenders in research." },
  applied: { title: "Applied", sub: "Submitted bids and their outcomes. Won tenders become projects.", empty: "No applied tenders yet." },
};

/** Sorting and Research are deadline-driven; Applied is a historical record, so it sorts by date. */
const DEFAULT_SORT: Record<PipelineVariant, { key: string; dir: "asc" | "desc" }> = {
  sorting: { key: "deadline", dir: "asc" },
  research: { key: "deadline", dir: "asc" },
  applied: { key: "submissionDate", dir: "desc" },
};

export function TenderPipeline({ variant }: { variant: PipelineVariant }) {
  const params = useSearchParams();
  const tenders = useTenderStore((s) => s.tenders);
  const setStage = useTenderStore((s) => s.setStage);
  const setStatus = useTenderStore((s) => s.setStatus);
  const setStageBulk = useTenderStore((s) => s.setStageBulk);
  const linkProject = useTenderStore((s) => s.linkProject);
  const handoffPayloadFor = useTenderStore((s) => s.handoffPayloadFor);
  const lastUndo = useTenderStore((s) => s.lastUndo);
  const undo = useTenderStore((s) => s.undo);
  const clearUndo = useTenderStore((s) => s.clearUndo);

  const profile = useCompanyProfile();
  const density = useTenderPrefs((s) => s.density);
  const setDensity = useTenderPrefs((s) => s.setDensity);
  const views = useTenderPrefs((s) => s.views);
  const saveView = useTenderPrefs((s) => s.saveView);
  const removeView = useTenderPrefs((s) => s.removeView);
  const pad = DENSITY_CLASS[density];

  const [source, setSource] = useState<"ALL" | TenderSource>("ALL");
  const [search, setSearch] = useState("");
  const [dept, setDept] = useState("ALL");
  const [cls, setCls] = useState("ALL");
  // Applied-only outcome filter — this is where Won and Lost tenders are isolated.
  const [outcome, setOutcome] = useState<"ALL" | TenderStage>(
    (params?.get("outcome") as TenderStage | null) ?? "ALL",
  );
  // The open drawer is tracked by id and resolved against the live store, so a transition made
  // inside the drawer is reflected immediately. `deepLinkDismissed` lets ?open=<id> be closed
  // without the URL re-opening it on the next render.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deepLinkDismissed, setDeepLinkDismissed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Tender | null>(null);
  const [importing, setImporting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // Set after a conversion so the toast can offer a jump straight into the new project.
  const [createdProjectId, setCreatedProjectId] = useState<number | null>(null);

  // Bulk selection. `anchor` is the last row clicked, so shift-click can select a range.
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<number | null>(null);

  // Prompts that must resolve before a mutation lands.
  const [lossPrompt, setLossPrompt] = useState<{ tender: Tender; to: TenderStage; status?: TenderStatus; label: string } | null>(null);
  const [projectPrompt, setProjectPrompt] = useState<Tender | null>(null);
  const [bulkPrompt, setBulkPrompt] = useState<{ stage: TenderStage; status?: TenderStatus; label: string } | null>(null);

  // Keyboard focus row (j/k). Kept separate from the drawer so arrowing never opens anything.
  const [focus, setFocus] = useState(-1);

  // Select the whole (stable) map, then derive — returning `?? []` straight from the selector would
  // hand back a new array each render and trip React's "getSnapshot should be cached" loop.
  const hiddenMap = useTenderPrefs((s) => s.hiddenCols);
  const hidden = useMemo(() => hiddenMap[variant] ?? [], [hiddenMap, variant]);

  const openId = params?.get("open");
  const highlightRef = useRef<HTMLTableRowElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const cols = COLS[variant];
  const stages = VARIANT_STAGES[variant];
  // Name of Work is the anchor column and can't be hidden; everything else is customisable.
  const visibleCols = useMemo(() => cols.filter((c) => c.key === "nameOfWork" || !hidden.includes(c.key)), [cols, hidden]);

  const inScope = useMemo(
    () => tenders.filter((t) => stages.includes(t.stage) && (source === "ALL" || t.source === source)),
    [tenders, stages, source],
  );
  const departments = useMemo(
    () => [...new Set(inScope.map((t) => t.department).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b)),
    [inScope],
  );
  const classes = useMemo(
    () => [...new Set(inScope.map((t) => t.classReq).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b)),
    [inScope],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return inScope.filter((t) => {
      if (variant === "applied" && outcome !== "ALL" && t.stage !== outcome) return false;
      if (dept !== "ALL" && t.department !== dept) return false;
      if (cls !== "ALL" && t.classReq !== cls) return false;
      if (!q) return true;
      return (
        (t.nameOfWork ?? "").toLowerCase().includes(q) ||
        (t.department ?? "").toLowerCase().includes(q) ||
        (t.tenderId ?? "").toLowerCase().includes(q)
      );
    });
  }, [inScope, variant, outcome, dept, cls, search]);

  const filtersActive = source !== "ALL" || dept !== "ALL" || cls !== "ALL" || outcome !== "ALL" || search.trim() !== "";
  const clearFilters = useCallback(() => {
    setSource("ALL");
    setDept("ALL");
    setCls("ALL");
    setOutcome("ALL");
    setSearch("");
  }, []);

  const accessors = useMemo(() => Object.fromEntries(cols.map((c) => [c.key, c.sort])), [cols]);
  const { sorted, sortKey, sortDir, toggle } = useTableSort<Tender>(filtered, accessors, DEFAULT_SORT[variant]);

  // Eligibility flags are only actionable while we can still decide to bid.
  const showFlags = variant === "sorting" || variant === "research";
  const blockedNow = useMemo(() => (showFlags ? exposure(tenders).emdBlocked : 0), [tenders, showFlags]);
  const flagsById = useMemo(() => {
    if (!showFlags) return new Map<string, ReturnType<typeof bidFlags>>();
    return new Map(sorted.map((t) => [t.id, bidFlags(t, profile, blockedNow)]));
  }, [sorted, profile, blockedNow, showFlags]);

  // Deep-link: ?open=<id> opens the detail drawer. Resolved rather than copied into state, so the
  // drawer always shows the live record.
  const openDrawerId = selectedId ?? (deepLinkDismissed ? null : openId ?? null);
  const selected = useMemo(
    () => (openDrawerId ? tenders.find((t) => t.id === openDrawerId) ?? null : null),
    [tenders, openDrawerId],
  );
  const closeDrawer = useCallback(() => {
    setSelectedId(null);
    setDeepLinkDismissed(true);
  }, []);

  useEffect(() => {
    if (openId) highlightRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [openId, sorted]);

  // A selection that no longer matches the filters would act invisibly on bulk apply, so bulk
  // actions work off the intersection with what is actually on screen.
  const visibleChecked = useMemo(
    () => sorted.filter((t) => checked.has(t.id)).map((t) => t.id),
    [sorted, checked],
  );

  const flash = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  /* ---------- keyboard ---------- */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement;
      const typing = el instanceof HTMLElement && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (e.key === "/" && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (typing || selected || creating || editing || importing || lossPrompt || projectPrompt || bulkPrompt) return;
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setFocus((f) => Math.min(f + 1, sorted.length - 1));
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setFocus((f) => Math.max(f - 1, 0));
      } else if (e.key === "Enter" && focus >= 0 && sorted[focus]) {
        e.preventDefault();
        setSelectedId(sorted[focus].id);
      } else if (e.key === "x" && focus >= 0 && sorted[focus]) {
        e.preventDefault();
        toggleChecked(sorted[focus].id, focus, false);
      } else if (e.key === "Escape") {
        setChecked(new Set());
        setFocus(-1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sorted, focus, selected, creating, editing, importing, lossPrompt, projectPrompt, bulkPrompt]);

  /* ---------- selection ---------- */
  function toggleChecked(id: string, index: number, shift: boolean) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (shift && anchor != null) {
        const [from, to] = anchor < index ? [anchor, index] : [index, anchor];
        const select = !prev.has(id);
        for (let i = from; i <= to; i += 1) {
          if (select) next.add(sorted[i].id);
          else next.delete(sorted[i].id);
        }
      } else if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setAnchor(index);
  }

  const allChecked = sorted.length > 0 && visibleChecked.length === sorted.length;
  function toggleAll() {
    setChecked(allChecked ? new Set() : new Set(sorted.map((t) => t.id)));
  }

  /* ---------- mutations ---------- */

  /** Any move into LOST asks why first — that answer is the whole point of tender analysis. */
  function requestTransition(t: Tender, to: TenderStage, status: TenderStatus | undefined, label: string) {
    if (to === "LOST") {
      setLossPrompt({ tender: t, to, status, label });
      return;
    }
    if (status) setStatus(t.id, status);
    else setStage(t.id, to);
  }

  function applyBulk(stage: TenderStage, status?: TenderStatus, patch?: Partial<Tender>) {
    const ids = visibleChecked;
    setStageBulk(ids, stage, status ?? null, patch);
    setChecked(new Set());
    flash(`${ids.length} tender${ids.length === 1 ? "" : "s"} moved to ${STAGE_META[stage].label}.`);
  }

  /**
   * Hand a won tender over to the **Project module** — this module does not keep its own project
   * list. `createProject` only accepts name/address/city, so the commercial detail the client
   * actually tracks (contract value, work order date, completion date, customer) goes across in a
   * follow-up update. If that second call fails the handoff is marked unsynced rather than lost.
   */
  async function createProject(t: Tender) {
    setBusyId(t.id);
    const payload = handoffPayloadFor(t.id);
    try {
      const res = await api.createProject({
        name: t.nameOfWork || `Tender ${t.tenderId}`,
        address: t.officeAddress ?? undefined,
        city: t.location ?? undefined,
      });
      let synced = false;
      try {
        await api.updateProject(res.id, {
          customerName: t.department ?? null,
          projectValue: payload?.contractValue ?? 0,
          startDate: payload?.workOrderDate ?? null,
          endDate: payload?.completionDate ?? null,
          scopeOfWork: t.nameOfWork ?? null,
          status: "ONGOING",
        });
        synced = true;
      } catch {
        // The project exists; only the commercial fields did not land. Keep it flagged.
      }
      linkProject(t.id, res.id, { synced });
      setCreatedProjectId(res.id);
      flash(
        synced
          ? `Project #${res.id} created in the Project module.`
          : `Project #${res.id} created, but its contract details did not save — open it to finish.`,
      );
    } catch {
      // No project backend reachable — keep the handoff locally so the conversion is not lost, and
      // say so plainly rather than reporting a success that did not happen.
      const localId = -Math.floor(Date.now() / 1000);
      linkProject(t.id, localId, { synced: false });
      flash("Project module unreachable — the handoff is saved locally and can be pushed later.");
    } finally {
      setBusyId(null);
      setProjectPrompt(null);
    }
  }

  const totalValue = useMemo(
    () => filtered.reduce((s, t) => s + (t.contractValue ?? t.estimatedCost ?? 0), 0),
    [filtered],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-800">{HEADING[variant].title}</h1>
          <p className="text-sm text-gray-500">{HEADING[variant].sub}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-right text-sm text-gray-500">
            {filtered.length} tenders · <span className="font-medium text-gray-700">{tmoney(totalValue)}</span>
          </div>
          <IconButton label="Import from Excel" onClick={() => setImporting(true)} icon={Upload} />
          <IconButton
            label="Export to Excel"
            onClick={() => {
              exportTenders(sorted, `tenders-${variant}.xlsx`, HEADING[variant].title);
              flash(`Exported ${sorted.length} tenders.`);
            }}
            icon={Download}
          />
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-3.5 py-2 text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95"
          >
            <Plus size={15} /> New Tender
          </button>
        </div>
      </div>

      {/* Saved views */}
      {views.filter((v) => v.variant === variant).length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold tracking-wide text-gray-400 uppercase">Views</span>
          {views
            .filter((v) => v.variant === variant)
            .map((v) => (
              <span key={v.id} className="group flex items-center gap-1 rounded-full bg-gray-100 py-0.5 pr-1 pl-2.5 text-xs text-gray-600">
                <button
                  onClick={() => {
                    setSource(v.source);
                    setDept(v.dept);
                    setCls(v.cls);
                    setOutcome(v.outcome);
                    setSearch(v.search);
                  }}
                  className="hover:text-brand-accent"
                >
                  {v.name}
                </button>
                <button onClick={() => removeView(v.id)} aria-label={`Delete view ${v.name}`} className="rounded-full p-0.5 text-gray-400 hover:bg-gray-200 hover:text-rose-500">
                  <X size={11} />
                </button>
              </span>
            ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-0.5">
          {(["ALL", "PORTAL", "GEM"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSource(s)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-150 ${
                source === s ? "bg-cyan-50 text-brand-accent" : "text-gray-500 hover:bg-gray-50"
              }`}
            >
              {s === "ALL" ? "All" : SOURCE_META[s].label}
            </button>
          ))}
        </div>

        {variant === "applied" && (
          <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-0.5">
            {([
              ["ALL", "All"],
              ["APPLIED", "Live"],
              ["WON", "Won"],
              ["LOST", "Lost"],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setOutcome(key)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-150 ${
                  outcome === key ? "bg-cyan-50 text-brand-accent" : "text-gray-500 hover:bg-gray-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        <div className="w-52">
          <Select
            value={dept}
            onChange={setDept}
            size="sm"
            options={[{ value: "ALL", label: "All departments" }, ...departments.map((d) => ({ value: d, label: d }))]}
          />
        </div>

        {classes.length > 0 && (
          <div className="w-40">
            <Select
              value={cls}
              onChange={setCls}
              size="sm"
              options={[{ value: "ALL", label: "All classes" }, ...classes.map((c) => ({ value: c, label: c }))]}
            />
          </div>
        )}

        <div className="flex min-w-[180px] flex-1 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 transition-colors duration-150 focus-within:border-cyan-500">
          <Search size={15} className="text-gray-400" />
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name of work, department or tender ID  ( / )"
            className="w-full bg-transparent text-sm outline-none"
          />
        </div>

        {filtersActive && (
          <>
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-500 transition-colors duration-150 hover:bg-gray-50"
            >
              <X size={13} /> Clear
            </button>
            <button
              onClick={() => {
                const name = window.prompt("Name this view", "My view");
                if (name) {
                  saveView({ name, variant, source, dept, cls, outcome, search, sortKey, sortDir });
                  flash(`View "${name}" saved.`);
                }
              }}
              className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-500 transition-colors duration-150 hover:bg-gray-50"
            >
              <Bookmark size={13} /> Save view
            </button>
          </>
        )}

        <button
          onClick={() => setDensity(density === "comfortable" ? "compact" : "comfortable")}
          title={density === "comfortable" ? "Switch to compact rows" : "Switch to comfortable rows"}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 transition-colors duration-150 hover:bg-gray-50"
        >
          <Rows3 size={13} /> {density === "comfortable" ? "Comfortable" : "Compact"}
        </button>

        <ColumnsMenu variant={variant} cols={cols} hidden={hidden} />
      </div>

      {toast && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-cyan-50 px-4 py-2 text-sm text-brand-accent ring-1 ring-inset ring-cyan-600/20">
          <span>{toast}</span>
          {createdProjectId != null && createdProjectId > 0 && (
            <Link href={`/project/${createdProjectId}`} className="flex items-center gap-1 font-semibold hover:underline">
              Open project <ArrowUpRight size={13} />
            </Link>
          )}
        </div>
      )}

      {/* Undo — one misclick on "Drop" used to be unrecoverable. */}
      {lastUndo && (
        <div className="flex items-center justify-between gap-3 rounded-lg bg-gray-800 px-4 py-2 text-sm text-white">
          <span>{lastUndo.label} applied.</span>
          <div className="flex items-center gap-3">
            <button onClick={undo} className="flex items-center gap-1 font-medium text-cyan-300 hover:underline">
              <Undo2 size={14} /> Undo
            </button>
            <button onClick={clearUndo} aria-label="Dismiss" className="text-gray-400 hover:text-white">
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Bulk selection bar */}
      {visibleChecked.length > 0 && (
        <div className="sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-2 shadow-sm">
          <span className="text-sm font-medium text-brand-accent">{visibleChecked.length} selected</span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {variant === "sorting" && (
              <BulkButton onClick={() => applyBulk("RESEARCH")} icon={ArrowRight} label="Move to Research" />
            )}
            {variant === "research" && (
              <>
                <BulkButton onClick={() => applyBulk("SORTING")} icon={ArrowRight} label="Back to Sorting" />
                <BulkButton onClick={() => applyBulk("APPLIED", "SUBMITTED")} icon={Send} label="Mark Applied" />
              </>
            )}
            {(variant === "sorting" || variant === "research") && (
              <BulkButton
                onClick={() => setBulkPrompt({ stage: "LOST", status: "LOST", label: "Drop selected tenders" })}
                icon={XCircle}
                label="Drop"
                tone="danger"
              />
            )}
            {variant === "applied" && (
              <>
                <BulkButton onClick={() => applyBulk("WON", "WON")} icon={CheckCircle2} label="Mark Won" />
                <BulkButton
                  onClick={() => setBulkPrompt({ stage: "LOST", status: "LOST", label: "Mark selected as lost" })}
                  icon={XCircle}
                  label="Mark Lost"
                  tone="danger"
                />
              </>
            )}
            <BulkButton
              onClick={() => {
                exportTenders(sorted.filter((t) => checked.has(t.id)), "tenders-selection.xlsx");
                flash(`Exported ${visibleChecked.length} tenders.`);
              }}
              icon={Download}
              label="Export"
            />
            <button onClick={() => setChecked(new Set())} className="text-xs font-medium text-gray-500 hover:text-gray-700">
              Clear
            </button>
          </div>
        </div>
      )}

      {sorted.length === 0 ? (
        filtersActive ? (
          <TenderEmpty icon={Search} title="No tenders match these filters" hint="Clear a filter or try a different search." />
        ) : (
          <TenderEmpty
            icon={Building2}
            title={HEADING[variant].empty}
            hint="Add one manually, or import the tender workbook."
          />
        )
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-xl border border-gray-200 bg-white lg:block">
            <table className="w-full min-w-[900px] border-collapse text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
                  <th className={`w-9 ${pad.head}`}>
                    <Checkbox checked={allChecked} onChange={toggleAll} label="Select all rows" />
                  </th>
                  <th className={`w-12 ${pad.head} font-medium text-gray-400`}>Src</th>
                  {showFlags && <th className={`w-8 ${pad.head}`} />}
                  {visibleCols.map((c) => (
                    <SortTh key={c.key} label={c.label} sortKey={c.key} activeKey={sortKey} dir={sortDir} onSort={toggle} align={c.align} />
                  ))}
                  <th className={`w-10 ${pad.head}`} />
                </tr>
              </thead>
              <tbody>
                {sorted.map((t, i) => {
                  const highlighted = t.id === openId;
                  const isChecked = checked.has(t.id);
                  const flags = flagsById.get(t.id) ?? [];
                  const flag = worstFlag(flags);
                  return (
                    <tr
                      key={t.id}
                      ref={highlighted ? highlightRef : undefined}
                      onClick={() => setSelectedId(t.id)}
                      className={`cursor-pointer border-b border-gray-50 transition-colors duration-150 last:border-b-0 even:bg-gray-50/40 hover:bg-cyan-50/40 ${
                        highlighted ? "bg-amber-50 ring-2 ring-inset ring-amber-300" : ""
                      } ${isChecked ? "bg-cyan-50/60" : ""} ${focus === i ? "ring-2 ring-inset ring-cyan-400" : ""}`}
                    >
                      <td className={pad.cell} onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={isChecked}
                          label={`Select ${t.nameOfWork ?? t.tenderId}`}
                          onChange={(shift) => toggleChecked(t.id, i, shift)}
                        />
                      </td>
                      <td className={pad.cell}>
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${SOURCE_META[t.source].chip}`}>
                          {SOURCE_META[t.source].label}
                        </span>
                      </td>
                      {showFlags && (
                        <td className={pad.cell}>
                          {flag && (
                            <span
                              title={flags.map((f) => `${f.label}: ${f.detail}`).join("\n")}
                              className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ring-1 ring-inset ${FLAG_TONE_CLASS[flag.tone]}`}
                            >
                              {flags.length}
                            </span>
                          )}
                        </td>
                      )}
                      {visibleCols.map((c) => (
                        <td
                          key={c.key}
                          className={`${pad.cell} ${c.align === "right" ? "text-right" : ""} ${c.key === "nameOfWork" ? "text-gray-700" : "text-gray-600"}`}
                        >
                          {c.cell(t)}
                        </td>
                      ))}
                      <td className={`${pad.cell} text-right`} onClick={(e) => e.stopPropagation()}>
                        <RowActions
                          t={t}
                          busy={busyId === t.id}
                          showStatusList={variant === "applied"}
                          onTransition={(to, status, label) => requestTransition(t, to, status, label)}
                          onSetStatus={(s) => (s === "LOST" || s === "CANCELLED" || s === "TECH_DISQUALIFIED"
                            ? setLossPrompt({ tender: t, to: "LOST", status: s, label: STATUS_META[s].label })
                            : setStatus(t.id, s))}
                          onCreateProject={() => setProjectPrompt(t)}
                          onView={() => setSelectedId(t.id)}
                          onEdit={() => setEditing(t)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards — site staff open this on a phone; a 900px table is unusable there. */}
          <div className="space-y-2 lg:hidden">
            {sorted.map((t, i) => (
              <TenderCard
                key={t.id}
                t={t}
                variant={variant}
                checked={checked.has(t.id)}
                onCheck={(shift) => toggleChecked(t.id, i, shift)}
                onOpen={() => setSelectedId(t.id)}
              />
            ))}
          </div>
        </>
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
      {creating && <TenderForm initialStage={VARIANT_STAGE[variant]} onClose={() => setCreating(false)} />}
      {editing && <TenderForm tender={editing} onClose={() => setEditing(null)} />}
      {importing && <ImportDrawer onClose={() => setImporting(false)} />}

      {lossPrompt && (
        <LossReasonModal
          tender={lossPrompt.tender}
          actionLabel={lossPrompt.label}
          onCancel={() => setLossPrompt(null)}
          onConfirm={(patch) => {
            if (lossPrompt.status) setStatus(lossPrompt.tender.id, lossPrompt.status, patch);
            else setStage(lossPrompt.tender.id, lossPrompt.to, null, patch);
            setLossPrompt(null);
            flash("Outcome recorded.");
          }}
        />
      )}

      {bulkPrompt && (
        <ConfirmDialog
          title={bulkPrompt.label}
          tone="danger"
          confirmLabel={`Move ${visibleChecked.length} tenders`}
          body={
            <>
              {visibleChecked.length} tenders will be moved to <strong>{STAGE_META[bulkPrompt.stage].label}</strong>. Loss reasons
              are not collected in bulk — open a tender individually if you need to record why.
            </>
          }
          onCancel={() => setBulkPrompt(null)}
          onConfirm={() => {
            applyBulk(bulkPrompt.stage, bulkPrompt.status);
            setBulkPrompt(null);
          }}
        />
      )}

      {projectPrompt && (
        <ConfirmDialog
          title="Hand over to the Project module"
          confirmLabel="Create project"
          busy={busyId === projectPrompt.id}
          body={
            <>
              <strong>{projectPrompt.nameOfWork ?? projectPrompt.tenderId}</strong> will be created in the Project
              module with a contract value of {tmoney(projectPrompt.contractValue ?? projectPrompt.estimatedCost)}
              {projectPrompt.duration ? `, a ${projectPrompt.duration} completion period` : ""} and{" "}
              {projectPrompt.department ?? "the department"} as the customer. Execution is tracked there from then on;
              the tender keeps a link to it.
            </>
          }
          onCancel={() => setProjectPrompt(null)}
          onConfirm={() => void createProject(projectPrompt)}
        />
      )}
    </div>
  );
}

/* ---------- small pieces ---------- */

function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (shift: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={(e) => onChange(e.shiftKey)}
      className={`flex h-4 w-4 items-center justify-center rounded border transition-colors duration-150 ${
        checked ? "border-brand-accent bg-brand-accent text-white" : "border-gray-300 text-transparent hover:border-cyan-400"
      }`}
    >
      <Check size={11} />
    </button>
  );
}

function IconButton({
  label,
  onClick,
  icon: Icon,
}: {
  label: string;
  onClick: () => void;
  icon: React.ComponentType<{ size?: number }>;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 transition-colors duration-150 hover:bg-gray-50"
    >
      <Icon size={14} />
    </button>
  );
}

function BulkButton({
  label,
  onClick,
  icon: Icon,
  tone,
}: {
  label: string;
  onClick: () => void;
  icon: React.ComponentType<{ size?: number }>;
  tone?: "danger";
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-150 active:scale-95 ${
        tone === "danger"
          ? "bg-white text-rose-600 ring-1 ring-inset ring-rose-200 hover:bg-rose-50"
          : "bg-white text-brand-accent ring-1 ring-inset ring-cyan-200 hover:bg-cyan-50"
      }`}
    >
      <Icon size={13} /> {label}
    </button>
  );
}

/** EMD state at a glance — the applied list is where blocked money becomes visible. */
function EmdCell({ t }: { t: Tender }) {
  if (t.emd == null) return <span className="text-gray-400">—</span>;
  const released = !!t.emdReleasedOn;
  return (
    <div className="flex items-center gap-1.5 whitespace-nowrap">
      <span>{tmoney(t.emd)}</span>
      {t.emdState === "PAID" && !released && (
        <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/20">
          blocked
        </span>
      )}
      {released && (
        <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
          released
        </span>
      )}
    </div>
  );
}

function TenderCard({
  t,
  variant,
  checked,
  onCheck,
  onOpen,
}: {
  t: Tender;
  variant: PipelineVariant;
  checked: boolean;
  onCheck: (shift: boolean) => void;
  onOpen: () => void;
}) {
  const tone = deadlineTone(t.deadline);
  return (
    <div className={`rounded-xl border bg-white p-3 ${checked ? "border-cyan-300 bg-cyan-50/40" : "border-gray-200"}`}>
      <div className="flex items-start gap-2">
        <div className="pt-0.5">
          <Checkbox checked={checked} onChange={onCheck} label={`Select ${t.nameOfWork ?? t.tenderId}`} />
        </div>
        <button onClick={onOpen} className="min-w-0 flex-1 text-left">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${SOURCE_META[t.source].chip}`}>
              {SOURCE_META[t.source].label}
            </span>
            {t.status && (
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${STATUS_META[t.status].chip}`}>
                {STATUS_META[t.status].label}
              </span>
            )}
            {tone !== "none" && tone !== "ok" && (
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${DEADLINE_TONE_CLASS[tone]}`}>
                {deadlineLabel(t.deadline)}
              </span>
            )}
          </div>
          <div className="mt-1 line-clamp-2 text-sm text-gray-700">{tval(t.nameOfWork)}</div>
          <div className="mt-1 text-[11px] text-gray-400">
            {tval(t.department)} · {t.tenderId || "no id"}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-600">
            <span>Est. {tmoney(t.estimatedCost)}</span>
            {variant === "applied" ? <span>Contract {tmoney(t.contractValue)}</span> : <span>EMD {tmoney(t.emd)}</span>}
            <span>{variant === "applied" ? `Submitted ${tdate(t.submissionDate)}` : `Due ${tdate(t.deadline)}`}</span>
          </div>
        </button>
      </div>
    </div>
  );
}

/** Column show/hide customiser. Choices persist per variant via useTenderPrefs. */
function ColumnsMenu({ variant, cols, hidden }: { variant: PipelineVariant; cols: Col[]; hidden: string[] }) {
  const [open, setOpen] = useState(false);
  const toggleCol = useTenderPrefs((s) => s.toggleCol);
  const showAll = useTenderPrefs((s) => s.showAll);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 transition-colors duration-150 hover:bg-gray-50"
      >
        <SlidersHorizontal size={13} /> Columns
        {hidden.length > 0 && (
          <span className="rounded-full bg-cyan-50 px-1.5 text-[10px] font-semibold text-brand-accent">{hidden.length} hidden</span>
        )}
      </button>
      {open && (
        <>
          <button aria-hidden tabIndex={-1} className="fixed inset-0 z-40 cursor-default" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-1 w-56 rounded-xl border border-gray-100 bg-white p-2 shadow-xl">
            <div className="flex items-center justify-between px-2 py-1">
              <span className="text-[11px] font-semibold tracking-wide text-gray-400 uppercase">Show columns</span>
              <button onClick={() => showAll(variant)} className="text-[11px] font-medium text-brand-accent hover:underline">
                Reset
              </button>
            </div>
            <div className="max-h-72 overflow-y-auto">
              {cols.map((c) => {
                const isName = c.key === "nameOfWork";
                const shown = isName || !hidden.includes(c.key);
                return (
                  <button
                    key={c.key}
                    disabled={isName}
                    onClick={() => toggleCol(variant, c.key)}
                    className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors duration-150 ${
                      isName ? "cursor-default text-gray-400" : "text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <span
                      className={`flex h-4 w-4 items-center justify-center rounded border ${
                        shown ? "border-brand-accent bg-brand-accent text-white" : "border-gray-300 text-transparent"
                      }`}
                    >
                      <Check size={11} />
                    </span>
                    {c.label}
                    {isName && <span className="ml-auto text-[10px] text-gray-300">fixed</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const APPLIED_STATUSES: TenderStatus[] = [
  "SUBMITTED",
  "TECH_OPENED",
  "TECH_QUALIFIED",
  "TECH_DISQUALIFIED",
  "WON",
  "LOST",
  "RETENDERED",
  "CANCELLED",
  "COMPLETED",
];

/**
 * Row action menu. The forward/lost moves come straight from the state machine
 * (`transitionsFor`), so this menu always matches the tender's current stage. The Applied variant
 * additionally exposes the granular status list (Tech Opened, Qualified, …) that stays within Applied.
 */
function RowActions({
  t,
  busy,
  showStatusList,
  onTransition,
  onSetStatus,
  onCreateProject,
  onView,
  onEdit,
}: {
  t: Tender;
  busy: boolean;
  showStatusList: boolean;
  onTransition: (to: TenderStage, status: TenderStatus | undefined, label: string) => void;
  onSetStatus: (s: TenderStatus) => void;
  onCreateProject: () => void;
  onView: () => void;
  onEdit: () => void;
}) {
  const transitions = transitionsFor(t.stage);
  return (
    <RowMenu align="right" buttonLabel="Tender actions">
      {(close) => (
        <>
          <RowMenuItem icon={ExternalLink} label="View details" onClick={() => { close(); onView(); }} />
          <RowMenuItem icon={Pencil} label="Edit" onClick={() => { close(); onEdit(); }} />
          <RowMenuDivider />
          {transitions.map((tr) => (
            <RowMenuItem
              key={`${tr.to}-${tr.label}`}
              icon={tr.tone === "danger" ? XCircle : tr.tone === "primary" ? Send : ArrowRight}
              label={tr.label}
              tone={tr.tone === "danger" ? "danger" : undefined}
              onClick={() => { close(); onTransition(tr.to, tr.status, tr.label); }}
            />
          ))}
          {t.stage === "WON" && t.projectId == null && (
            <RowMenuItem icon={FolderPlus} label={busy ? "Creating…" : "Create project"} onClick={() => { close(); onCreateProject(); }} />
          )}
          {showStatusList && (
            <>
              <RowMenuDivider />
              <div className="px-3 pt-1 pb-1 text-[10px] font-semibold tracking-wide text-gray-400 uppercase">Set status</div>
              {APPLIED_STATUSES.map((s) => (
                <RowMenuItem
                  key={s}
                  icon={s === "WON" || s === "COMPLETED" ? CheckCircle2 : s === "LOST" || s === "CANCELLED" || s === "TECH_DISQUALIFIED" ? XCircle : ArrowRight}
                  label={STATUS_META[s].label}
                  tone={s === "LOST" || s === "CANCELLED" || s === "TECH_DISQUALIFIED" ? "danger" : undefined}
                  onClick={() => { close(); onSetStatus(s); }}
                />
              ))}
            </>
          )}
        </>
      )}
    </RowMenu>
  );
}
