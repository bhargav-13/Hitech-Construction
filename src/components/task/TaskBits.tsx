"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, UserRound } from "lucide-react";
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
