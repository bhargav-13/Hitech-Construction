"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, UserRound, X } from "lucide-react";
import { projectAvatarColor } from "@/lib/projectHelpers";
import { PRIORITY_STYLE, STATUS_STYLE, TASK_PRIORITIES, TASK_STATUSES } from "@/lib/taskTypes";
import type { TaskPriority, TaskStatus } from "@/lib/taskTypes";

/**
 * Inline pill picker: the coloured chip is the trigger, and choosing opens a themed, animated menu
 * (replacing the un-styleable native <select> dropdown). Closes on outside click / Escape.
 */
function ChipMenu({
  value,
  options,
  onChange,
  disabled,
  chipClassName,
  trigger,
}: {
  value: string;
  options: { value: string; node: React.ReactNode }[];
  onChange: (value: string) => void;
  disabled?: boolean;
  chipClassName: string;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span ref={ref} className="relative inline-flex">
      <button
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          if (!disabled) setOpen((o) => !o);
        }}
        className={chipClassName}
      >
        {trigger}
        <ChevronDown size={11} className={`opacity-70 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="animate-fade-in-scale absolute left-0 top-full z-50 mt-1 min-w-[150px] origin-top-left overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
        >
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange(o.value);
                setOpen(false);
              }}
              className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs transition-colors duration-100 hover:bg-cyan-50 ${
                o.value === value ? "font-medium text-brand-accent" : "text-gray-700"
              }`}
            >
              <span className="flex items-center gap-1.5">{o.node}</span>
              {o.value === value && <Check size={13} className="shrink-0 text-brand-accent" />}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

export function StatusChip({ status }: { status: TaskStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ${s.chip}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {status}
    </span>
  );
}

export function PriorityChip({ priority }: { priority: TaskPriority }) {
  const p = PRIORITY_STYLE[priority];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${p.chip}`}>
      <FlagIcon />
      {priority}
    </span>
  );
}

/**
 * Chip that doubles as an inline picker — lets users change status straight from the list/main view
 * without opening the task. A transparent native <select> overlays the chip for accessible keyboard
 * + click behaviour; the chip underneath provides the styling.
 */
export function StatusSelect({
  status,
  onChange,
  disabled,
}: {
  status: TaskStatus;
  onChange: (s: TaskStatus) => void;
  disabled?: boolean;
}) {
  const s = STATUS_STYLE[status];
  return (
    <ChipMenu
      value={status}
      disabled={disabled}
      onChange={(v) => onChange(v as TaskStatus)}
      chipClassName={`inline-flex shrink-0 items-center gap-1.5 rounded-md py-0.5 pl-2 pr-1.5 text-xs font-medium ${s.chip} ${
        disabled ? "opacity-60" : "cursor-pointer hover:brightness-95"
      }`}
      trigger={
        <>
          <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
          {status}
        </>
      }
      options={TASK_STATUSES.map((o) => ({
        value: o,
        node: (
          <>
            <span className={`h-1.5 w-1.5 rounded-full ${STATUS_STYLE[o].dot}`} />
            {o}
          </>
        ),
      }))}
    />
  );
}

export function PrioritySelect({
  priority,
  onChange,
  disabled,
}: {
  priority: TaskPriority;
  onChange: (p: TaskPriority) => void;
  disabled?: boolean;
}) {
  const p = PRIORITY_STYLE[priority];
  return (
    <ChipMenu
      value={priority}
      disabled={disabled}
      onChange={(v) => onChange(v as TaskPriority)}
      chipClassName={`inline-flex shrink-0 items-center gap-1 rounded-md py-0.5 pl-2 pr-1.5 text-xs font-medium ${p.chip} ${
        disabled ? "opacity-60" : "cursor-pointer hover:brightness-95"
      }`}
      trigger={
        <>
          <FlagIcon />
          {priority}
        </>
      }
      options={TASK_PRIORITIES.map((o) => ({
        value: o,
        node: (
          <>
            <FlagIcon />
            {o}
          </>
        ),
      }))}
    />
  );
}

function FlagIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  );
}

export function UserAvatar({ id, name, size = 28 }: { id: string; name: string; size?: number }) {
  return (
    <div
      title={name}
      className={`flex shrink-0 items-center justify-center rounded-full text-white ${projectAvatarColor(id)}`}
      style={{ width: size, height: size }}
    >
      <UserRound size={Math.round(size * 0.55)} />
    </div>
  );
}

export function ProgressBar({ value, className = "" }: { value: number; className?: string }) {
  return (
    <div className={`h-1.5 w-full rounded-full bg-gray-100 ${className}`}>
      <div
        className="h-1.5 rounded-full bg-brand-accent transition-all duration-500"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

export interface Person {
  id: string;
  name: string;
  role?: string;
}

/** Shared behaviour for the searchable people dropdowns: outside-click / Escape closes the panel. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return ref;
}

function matchPeople(people: Person[], q: string): Person[] {
  const ql = q.trim().toLowerCase();
  if (!ql) return people;
  return people.filter((p) => p.name.toLowerCase().includes(ql) || (p.role ?? "").toLowerCase().includes(ql));
}

/** A searchable single-select for people, rendered with avatars. */
export function PeopleSelect({
  people,
  value,
  onChange,
  placeholder = "Select person",
}: {
  people: Person[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useDismiss(open, () => setOpen(false));
  const selected = useMemo(() => people.find((p) => p.id === value), [people, value]);
  const filtered = useMemo(() => matchPeople(people, q), [people, q]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center justify-between gap-2 rounded-lg border bg-white px-3 py-2 text-left text-sm outline-none transition-colors duration-150 ${
          open ? "border-cyan-500 ring-2 ring-cyan-500/15" : "border-gray-200 hover:border-gray-300"
        }`}
      >
        {selected ? (
          <span className="flex min-w-0 items-center gap-2">
            <UserAvatar id={selected.id} name={selected.name} size={20} />
            <span className="truncate text-gray-700">{selected.name}{selected.role ? ` · ${selected.role}` : ""}</span>
          </span>
        ) : (
          <span className="text-gray-400">{placeholder}</span>
        )}
        <ChevronDown size={15} className={`shrink-0 text-gray-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="animate-fade-in-scale absolute z-50 mt-1 w-full origin-top overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
          <div className="flex items-center gap-1.5 border-b border-gray-100 px-2.5 py-1.5">
            <Search size={13} className="text-gray-400" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people…" className="w-full bg-transparent text-sm outline-none" />
          </div>
          <div className="max-h-56 overflow-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-xs text-gray-400">No people found</div>
            ) : (
              filtered.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => { onChange(p.id); setOpen(false); setQ(""); }}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm transition-colors duration-100 hover:bg-cyan-50 ${
                    p.id === value ? "font-medium text-brand-accent" : "text-gray-700"
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <UserAvatar id={p.id} name={p.name} size={20} />
                    <span className="truncate">{p.name}{p.role ? ` · ${p.role}` : ""}</span>
                  </span>
                  {p.id === value && <Check size={14} className="shrink-0 text-brand-accent" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** A searchable multi-select for people — selected people show as removable chips. */
export function PeopleMultiSelect({
  people,
  values,
  onChange,
  placeholder = "Add people",
}: {
  people: Person[];
  values: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useDismiss(open, () => setOpen(false));
  const selected = useMemo(() => people.filter((p) => values.includes(p.id)), [people, values]);
  const filtered = useMemo(() => matchPeople(people, q), [people, q]);
  const toggle = (id: string) => onChange(values.includes(id) ? values.filter((x) => x !== id) : [...values, id]);

  return (
    <div ref={ref} className="relative">
      <div
        onClick={() => setOpen(true)}
        className={`flex min-h-[38px] w-full cursor-text flex-wrap items-center gap-1.5 rounded-lg border bg-white px-2 py-1.5 text-sm transition-colors duration-150 ${
          open ? "border-cyan-500 ring-2 ring-cyan-500/15" : "border-gray-200 hover:border-gray-300"
        }`}
      >
        {selected.length === 0 && <span className="px-1 text-gray-400">{placeholder}</span>}
        {selected.map((p) => (
          <span key={p.id} className="flex items-center gap-1 rounded-full bg-cyan-50 py-0.5 pl-1 pr-1 text-xs font-medium text-brand-accent">
            <UserAvatar id={p.id} name={p.name} size={16} />
            {p.name.split(" ")[0]}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); toggle(p.id); }}
              className="rounded-full p-0.5 text-brand-accent/70 transition-colors hover:bg-cyan-100 hover:text-brand-accent"
              title="Remove"
            >
              <X size={11} />
            </button>
          </span>
        ))}
        <ChevronDown size={14} className={`ml-auto shrink-0 text-gray-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </div>

      {open && (
        <div className="animate-fade-in-scale absolute z-50 mt-1 w-full origin-top overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
          <div className="flex items-center gap-1.5 border-b border-gray-100 px-2.5 py-1.5">
            <Search size={13} className="text-gray-400" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people…" className="w-full bg-transparent text-sm outline-none" />
          </div>
          <div className="max-h-56 overflow-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-xs text-gray-400">No people found</div>
            ) : (
              filtered.map((p) => {
                const on = values.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggle(p.id)}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors duration-100 hover:bg-cyan-50 ${on ? "text-brand-accent" : "text-gray-700"}`}
                  >
                    <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${on ? "border-brand-accent bg-brand-accent text-white" : "border-gray-300"}`}>
                      {on && <Check size={11} />}
                    </span>
                    <UserAvatar id={p.id} name={p.name} size={20} />
                    <span className="truncate">{p.name}{p.role ? ` · ${p.role}` : ""}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
