"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowDownUp,
  CalendarRange,
  Check,
  ChevronDown,
  Download,
  Filter as FilterIcon,
  GripVertical,
  MoreVertical,
  Recycle,
  Repeat,
  Search,
  Settings2,
  ShieldCheck,
  Star,
  Trash2,
  Upload,
  X,
  MessageSquareText,
  FilePlus2,
  PencilLine,
} from "lucide-react";
import { DatePicker } from "@/components/DatePicker";
import { Select } from "@/components/Select";
import type { StatusRow } from "@/lib/useTaskStatuses";
import {
  ALL_COLUMNS,
  DATE_FIELDS,
  PERCENT_BANDS,
  RULE_FIELDS,
  VARIANCE_LABEL,
  VIEWS,
  dateFilterActive,
  ruleIsEmpty,
} from "./taskFilters";
import type { ColumnKey, ColumnPref, DateTypeFilter, FilterRule, RuleField, Variance, ViewKey } from "./taskFilters";
import { isInFloatingPanel } from "@/lib/floatingPanel";

// ---- A small anchored popover (closes on outside click / Escape) ----------------------------------

function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !isInFloatingPanel(e.target)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return { open, setOpen, ref };
}

const btn = (active: boolean) =>
  `flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-all duration-150 active:scale-95 ${
    active ? "border-brand-accent bg-cyan-50 text-brand-accent" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
  }`;

const panel =
  "animate-menu-pop absolute top-11 z-30 origin-top rounded-xl border border-gray-100 bg-white shadow-xl ring-1 ring-black/[0.03]";

// ---- Multi-pick list with search (used by Status and the Filter's pick rules) ---------------------

export function CheckList({
  options,
  values,
  onChange,
  searchable = true,
  maxHeight = "max-h-56",
}: {
  options: { value: string; label: React.ReactNode; text: string }[];
  values: string[];
  onChange: (next: string[]) => void;
  searchable?: boolean;
  maxHeight?: string;
}) {
  const [q, setQ] = useState("");
  const shown = q ? options.filter((o) => o.text.toLowerCase().includes(q.toLowerCase())) : options;
  const all = shown.length > 0 && shown.every((o) => values.includes(o.value));
  return (
    <div>
      <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2">
        <input
          type="checkbox"
          checked={all}
          onChange={() =>
            onChange(all ? values.filter((v) => !shown.some((o) => o.value === v)) : [...new Set([...values, ...shown.map((o) => o.value)])])
          }
          className="h-3.5 w-3.5 accent-cyan-600"
          title="Select all"
        />
        {searchable ? (
          <div className="flex flex-1 items-center gap-1.5">
            <Search size={13} className="text-gray-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search…"
              className="w-full bg-transparent text-xs outline-none"
            />
          </div>
        ) : (
          <span className="text-xs text-gray-500">Select all</span>
        )}
      </div>
      <div className={`${maxHeight} overflow-y-auto py-1`}>
        {shown.map((o) => {
          const on = values.includes(o.value);
          return (
            <label key={o.value} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50">
              <input
                type="checkbox"
                checked={on}
                onChange={() => onChange(on ? values.filter((v) => v !== o.value) : [...values, o.value])}
                className="h-3.5 w-3.5 accent-cyan-600"
              />
              <span className="flex min-w-0 items-center gap-1.5">{o.label}</span>
            </label>
          );
        })}
        {shown.length === 0 && <div className="px-3 py-3 text-center text-xs text-gray-400">Nothing matches.</div>}
      </div>
    </div>
  );
}

// ---- Filter: rule builder ------------------------------------------------------------------------

export interface PickSources {
  people: { id: string; name: string }[];
  projects: { id: string; name: string }[];
  departments: { id: string; name: string }[];
}

let ruleSeq = 0;
const newRule = (field: RuleField = "task"): FilterRule => ({ id: `r${++ruleSeq}`, field });

function pickOptions(field: RuleField, src: PickSources): { value: string; label: string; text: string }[] {
  switch (field) {
    case "assignee":
    case "followers":
    case "owner":
      return src.people.map((p) => ({ value: p.id, label: p.name, text: p.name }));
    case "project":
      return [{ value: "none", label: "No project", text: "No project" }, ...src.projects.map((p) => ({ value: p.id, label: p.name, text: p.name }))];
    case "department":
      return [{ value: "none", label: "No department", text: "No department" }, ...src.departments.map((d) => ({ value: d.id, label: d.name, text: d.name }))];
    case "priority":
      return ["High", "Medium", "Low"].map((p) => ({ value: p, label: p, text: p }));
    case "percentage":
      return PERCENT_BANDS.map((b) => ({ value: b.value, label: b.label, text: b.label }));
    default:
      return [];
  }
}

function RuleEditor({
  rule,
  onChange,
  onRemove,
  sources,
  canRemove,
}: {
  rule: FilterRule;
  onChange: (r: FilterRule) => void;
  onRemove: () => void;
  sources: PickSources;
  canRemove: boolean;
}) {
  const kind = RULE_FIELDS.find((f) => f.value === rule.field)?.kind ?? "text";
  return (
    <div className="space-y-2 rounded-lg border border-gray-100 bg-gray-50/60 p-2.5">
      <div className="flex items-center gap-2">
        <Select
          value={rule.field}
          onChange={(v) => onChange({ id: rule.id, field: v as RuleField })}
          size="sm"
          className="flex-1"
          options={RULE_FIELDS.map((f) => ({ value: f.value, label: f.label }))}
        />
        {canRemove && (
          <button onClick={onRemove} title="Remove this filter" className="rounded-md p-1.5 text-gray-400 hover:bg-rose-50 hover:text-rose-500">
            <X size={13} />
          </button>
        )}
      </div>
      {kind === "text" && (
        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5">
          <Search size={13} className="text-gray-400" />
          <input
            autoFocus
            value={rule.text ?? ""}
            onChange={(e) => onChange({ ...rule, text: e.target.value })}
            placeholder="Contains…"
            className="w-full bg-transparent text-xs outline-none"
          />
        </div>
      )}
      {(kind === "people" || kind === "pick") && (
        <div className="rounded-lg border border-gray-200 bg-white">
          <CheckList
            options={pickOptions(rule.field, sources)}
            values={rule.values ?? []}
            onChange={(values) => onChange({ ...rule, values })}
            searchable={kind === "people" || rule.field === "project" || rule.field === "department"}
            maxHeight="max-h-40"
          />
        </div>
      )}
      {kind === "variance" && (
        <div className="space-y-2">
          <div className="flex overflow-hidden rounded-lg border border-gray-200 bg-white text-xs">
            {(["delayed", "ontrack", "before"] as Variance[]).map((v) => {
              const on = rule.variance?.includes(v) ?? false;
              return (
                <button
                  key={v}
                  onClick={() => {
                    const cur = rule.variance ?? [];
                    onChange({ ...rule, variance: on ? cur.filter((x) => x !== v) : [...cur, v] });
                  }}
                  className={`flex-1 border-r border-gray-100 px-2 py-1.5 last:border-r-0 ${on ? "bg-cyan-50 font-medium text-brand-accent" : "text-gray-600 hover:bg-gray-50"}`}
                >
                  {VARIANCE_LABEL[v]}
                </button>
              );
            })}
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-600">
            End delay at least
            <input
              type="number"
              min={0}
              value={rule.minDelay ?? ""}
              onChange={(e) => onChange({ ...rule, minDelay: e.target.value === "" ? null : Math.max(0, Number(e.target.value)) })}
              className="w-16 rounded-md border border-gray-200 px-2 py-1 text-xs outline-none focus:border-cyan-500"
            />
            days
          </label>
        </div>
      )}
    </div>
  );
}

export function FilterButton({
  rules,
  onApply,
  sources,
}: {
  rules: FilterRule[];
  onApply: (rules: FilterRule[]) => void;
  sources: PickSources;
}) {
  const { open, setOpen, ref } = usePopover();
  const [draft, setDraft] = useState<FilterRule[]>([]);
  const active = rules.filter((r) => !ruleIsEmpty(r)).length;


  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => {
          if (!open) setDraft(rules.length ? rules : [newRule()]);
          setOpen(!open);
        }}
        className={btn(active > 0 || open)}
      >
        <FilterIcon size={14} /> Filter
        {active > 0 && <span className="rounded-full bg-brand-accent px-1.5 text-[10px] font-semibold text-white">{active}</span>}
      </button>
      {open && (
        <div className={`${panel} right-0 w-80 p-3`}>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-800">Filters</span>
            <button onClick={() => setOpen(false)} className="rounded-md p-1 text-gray-400 hover:bg-gray-100">
              <X size={14} />
            </button>
          </div>
          <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-0.5">
            {draft.map((r) => (
              <RuleEditor
                key={r.id}
                rule={r}
                sources={sources}
                canRemove={draft.length > 1}
                onChange={(next) => setDraft((list) => list.map((x) => (x.id === r.id ? next : x)))}
                onRemove={() => setDraft((list) => list.filter((x) => x.id !== r.id))}
              />
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3">
            <div className="flex items-center gap-3">
              <button onClick={() => setDraft((l) => [...l, newRule("assignee")])} className="text-xs font-medium text-brand-accent hover:underline">
                + Add Filter
              </button>
              {active > 0 && (
                <button
                  onClick={() => {
                    onApply([]);
                    setOpen(false);
                  }}
                  className="text-xs font-medium text-gray-400 hover:text-rose-600"
                >
                  Clear
                </button>
              )}
            </div>
            <button
              onClick={() => {
                onApply(draft.filter((r) => !ruleIsEmpty(r)));
                setOpen(false);
              }}
              className="rounded-lg bg-brand-accent px-4 py-1.5 text-xs font-medium text-white hover:opacity-90 active:scale-95"
            >
              Search
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Status multi-select -------------------------------------------------------------------------

export function StatusFilterButton({
  rows,
  values,
  onApply,
}: {
  rows: StatusRow[];
  values: string[];
  onApply: (ids: string[]) => void;
}) {
  const { open, setOpen, ref } = usePopover();
  const [draft, setDraft] = useState<string[]>(values);
  const label =
    values.length === 0 ? "Status" : values.length === 1 ? rows.find((r) => r.id === values[0])?.name ?? "Status" : `Status · ${values.length}`;
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => {
          if (!open) setDraft(values);
          setOpen(!open);
        }}
        className={btn(values.length > 0 || open)}
      >
        {label} <ChevronDown size={13} />
      </button>
      {open && (
        <div className={`${panel} right-0 w-60 overflow-hidden`}>
          <CheckList
            options={rows.map((r) => ({
              value: r.id,
              text: r.name,
              label: (
                <>
                  <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: r.color }} />
                  {r.name}
                </>
              ),
            }))}
            values={draft}
            onChange={setDraft}
          />
          <div className="flex justify-between border-t border-gray-100 px-3 py-2">
            <button onClick={() => setDraft([])} className="text-xs text-gray-400 hover:text-rose-600">
              Clear
            </button>
            <button
              onClick={() => {
                onApply(draft);
                setOpen(false);
              }}
              className="rounded-lg bg-brand-accent px-3 py-1 text-xs font-medium text-white hover:opacity-90"
            >
              Search
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Saved views ("Default") with a favourite star -----------------------------------------------

export function ViewMenuButton({
  view,
  favourite,
  onSelect,
  onFavourite,
}: {
  view: ViewKey;
  favourite: ViewKey;
  onSelect: (v: ViewKey) => void;
  onFavourite: (v: ViewKey) => void;
}) {
  const { open, setOpen, ref } = usePopover();
  const [q, setQ] = useState("");
  const shown = VIEWS.filter((v) => v.label.toLowerCase().includes(q.toLowerCase()));
  const current = VIEWS.find((v) => v.key === view)?.label ?? "Default";
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className={btn(view !== "default" || open)} title="Views">
        <ArrowDownUp size={14} /> {current}
      </button>
      {open && (
        <div className={`${panel} right-0 w-64 overflow-hidden`}>
          <div className="flex items-center gap-1.5 border-b border-gray-100 px-3 py-2">
            <Search size={13} className="text-gray-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="w-full bg-transparent text-xs outline-none" autoFocus />
          </div>
          <div className="max-h-80 overflow-y-auto py-1">
            {shown.map((v) => (
              <div
                key={v.key}
                className={`flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-50 ${v.key === view ? "font-medium text-brand-accent" : "text-gray-700"}`}
              >
                <button
                  onClick={() => onFavourite(v.key)}
                  title={favourite === v.key ? "Your default view" : "Open this view by default"}
                  className="shrink-0"
                >
                  <Star size={13} className={favourite === v.key ? "fill-amber-400 text-amber-400" : "text-gray-300 hover:text-amber-400"} />
                </button>
                <button
                  className="flex flex-1 items-center justify-between text-left"
                  onClick={() => {
                    onSelect(v.key);
                    setOpen(false);
                  }}
                >
                  {v.label}
                  {v.key === view && <Check size={13} />}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Date Type -----------------------------------------------------------------------------------

export function DateTypeButton({ value, onApply }: { value: DateTypeFilter; onApply: (d: DateTypeFilter) => void }) {
  const { open, setOpen, ref } = usePopover();
  const [draft, setDraft] = useState<DateTypeFilter>(value);
  const active = dateFilterActive(value);
  const allFields = draft.fields.length === DATE_FIELDS.length;
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => {
          if (!open) setDraft(value.fields.length ? value : { ...value, fields: ["due"] });
          setOpen(!open);
        }}
        className={btn(active || open)}
      >
        <CalendarRange size={14} />
        {active ? (value.mode === "on" ? value.from : `${value.from} → ${value.to || value.from}`) : "Date Type"}
      </button>
      {open && (
        <div className={`${panel} right-0 w-80 p-3`}>
          <div className="mb-2 flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-800">
              <input
                type="checkbox"
                checked={allFields}
                onChange={() => setDraft({ ...draft, fields: allFields ? [] : DATE_FIELDS.map((f) => f.value) })}
                className="h-3.5 w-3.5 accent-cyan-600"
              />
              Date Type
            </label>
            <button onClick={() => setOpen(false)} className="rounded-md p-1 text-gray-400 hover:bg-gray-100">
              <X size={14} />
            </button>
          </div>
          <div className="mb-3 grid grid-cols-2 gap-1.5">
            {DATE_FIELDS.map((f) => {
              const on = draft.fields.includes(f.value);
              return (
                <label key={f.value} className="flex items-center gap-2 text-xs text-gray-700">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => setDraft({ ...draft, fields: on ? draft.fields.filter((x) => x !== f.value) : [...draft.fields, f.value] })}
                    className="h-3.5 w-3.5 accent-cyan-600"
                  />
                  {f.label}
                </label>
              );
            })}
          </div>
          <div className="mb-2 text-xs font-medium text-gray-500">Range Type</div>
          <div className="mb-3 flex gap-4 text-xs text-gray-700">
            {(["range", "on"] as const).map((m) => (
              <label key={m} className="flex items-center gap-1.5">
                <input type="radio" checked={draft.mode === m} onChange={() => setDraft({ ...draft, mode: m })} className="accent-cyan-600" />
                {m === "range" ? "Range" : "On"}
              </label>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <DatePicker value={draft.from} onChange={(v) => setDraft({ ...draft, from: v })} placeholder={draft.mode === "on" ? "Date" : "From"} className="py-1.5" />
            {draft.mode === "range" && (
              <DatePicker value={draft.to} onChange={(v) => setDraft({ ...draft, to: v })} min={draft.from || undefined} placeholder="To" className="py-1.5" />
            )}
          </div>
          <div className="mt-3 flex justify-between border-t border-gray-100 pt-3">
            <button
              onClick={() => {
                onApply({ fields: [], mode: "range", from: "", to: "" });
                setOpen(false);
              }}
              className="text-xs font-medium uppercase tracking-wide text-gray-400 hover:text-rose-600"
            >
              Clear all
            </button>
            <button
              disabled={!draft.from || draft.fields.length === 0}
              onClick={() => {
                onApply(draft);
                setOpen(false);
              }}
              className="rounded-lg bg-brand-accent px-4 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-40"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Customize: columns, drag to reorder ---------------------------------------------------------

export function CustomizeDrawer({
  pref,
  onChange,
  onClose,
}: {
  pref: ColumnPref;
  onChange: (p: ColumnPref) => void;
  onClose: () => void;
}) {
  const [dragKey, setDragKey] = useState<ColumnKey | null>(null);
  const label = (k: ColumnKey) => ALL_COLUMNS.find((c) => c.key === k)?.label ?? k;

  function moveBefore(target: ColumnKey) {
    if (!dragKey || dragKey === target) return;
    const order = pref.order.filter((k) => k !== dragKey);
    order.splice(order.indexOf(target), 0, dragKey);
    onChange({ ...pref, order });
  }

  return (
    <div className="animate-overlay-in fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div className="animate-slide-in-right flex h-full w-full max-w-sm flex-col bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h3 className="text-base font-semibold text-gray-800">Customize Field</h3>
          <button onClick={onClose} className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>
        <p className="px-5 pt-3 text-xs text-gray-400">Switch columns on or off, and drag to change their order.</p>
        <div className="flex-1 space-y-2 overflow-y-auto px-5 py-3">
          {pref.order.map((k) => {
            const on = pref.on.includes(k);
            return (
              <div
                key={k}
                draggable
                onDragStart={() => setDragKey(k)}
                onDragOver={(e) => {
                  e.preventDefault();
                  moveBefore(k);
                }}
                onDragEnd={() => setDragKey(null)}
                className={`flex cursor-grab items-center gap-3 rounded-xl border px-3 py-3 transition-colors ${
                  dragKey === k ? "border-brand-accent bg-cyan-50/50" : "border-gray-200 bg-white"
                }`}
              >
                <GripVertical size={15} className="text-gray-300" />
                <span className={`flex-1 text-sm ${on ? "text-gray-800" : "text-gray-400"}`}>{label(k)}</span>
                <button
                  onClick={() => onChange({ ...pref, on: on ? pref.on.filter((x) => x !== k) : [...pref.on, k] })}
                  className={`relative h-5 w-9 rounded-full transition-colors duration-200 ${on ? "bg-brand-accent" : "bg-gray-200"}`}
                  aria-label={on ? `Hide ${label(k)}` : `Show ${label(k)}`}
                >
                  <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all duration-200 ${on ? "left-[18px]" : "left-0.5"}`} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---- More menu -----------------------------------------------------------------------------------

export function MoreMenu({
  onBulkEdit,
  onBulkDelete,
  onBulkExport,
  onBulkImport,
  onImportDrafts,
  canCreate,
  canSettings,
}: {
  onBulkEdit: () => void;
  onBulkDelete: () => void;
  onBulkExport: () => void;
  onBulkImport: () => void;
  onImportDrafts: () => void;
  canCreate: boolean;
  canSettings: boolean;
}) {
  const { open, setOpen, ref } = usePopover();
  const item = "flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50";
  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className={btn(open)}>
        <MoreVertical size={14} /> More
      </button>
      {open && (
        <div className={`${panel} right-0 w-64 overflow-hidden py-1.5`}>
          <button className={item} onClick={run(onBulkEdit)}>
            <PencilLine size={15} className="text-gray-400" /> Bulk Edit
          </button>
          <button className={item} onClick={run(onBulkDelete)}>
            <Trash2 size={15} className="text-gray-400" /> Bulk Delete
          </button>
          <button className={item} onClick={run(onBulkExport)}>
            <Download size={15} className="text-gray-400" /> Bulk Export
          </button>
          {canCreate && (
            <>
              <button className={item} onClick={run(onBulkImport)}>
                <Upload size={15} className="text-gray-400" /> Bulk Import
              </button>
              <button className={item} onClick={run(onImportDrafts)}>
                <FilePlus2 size={15} className="text-gray-400" /> Import Draft Tasks
              </button>
            </>
          )}
          <div className="my-1 border-t border-gray-100" />
          <Link href="/taskopad/tasks/recurring" className={item}>
            <Repeat size={15} className="text-gray-400" /> Primary Recurring Tasks
          </Link>
          <Link href="/taskopad/tasks/recycle-bin" className={item}>
            <Recycle size={15} className="text-gray-400" /> Recycle Bin
          </Link>
          <Link href="/taskopad/settings?tab=quick-replies" className={item}>
            <MessageSquareText size={15} className="text-gray-400" /> Quick Reply
          </Link>
          <Link href="/taskopad/approvals" className={item}>
            <ShieldCheck size={15} className="text-gray-400" /> Workflow (Approvals)
          </Link>
          {canSettings && (
            <Link href="/taskopad/settings" className={item}>
              <Settings2 size={15} className="text-gray-400" /> Task Statuses
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
