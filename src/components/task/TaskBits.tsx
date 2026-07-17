"use client";

import { ChevronDown, UserRound } from "lucide-react";
import { projectAvatarColor } from "@/lib/projectHelpers";
import { PRIORITY_STYLE, STATUS_STYLE, TASK_PRIORITIES, TASK_STATUSES } from "@/lib/taskTypes";
import type { TaskPriority, TaskStatus } from "@/lib/taskTypes";

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
    <span
      className={`relative inline-flex shrink-0 items-center gap-1.5 rounded-md py-0.5 pl-2 pr-5 text-xs font-medium ${s.chip} ${
        disabled ? "opacity-60" : "cursor-pointer hover:brightness-95"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {status}
      <ChevronDown size={11} className="pointer-events-none absolute right-1.5 opacity-70" />
      <select
        aria-label="Change status"
        value={status}
        disabled={disabled}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onChange(e.target.value as TaskStatus)}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {TASK_STATUSES.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </span>
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
    <span
      className={`relative inline-flex shrink-0 items-center gap-1 rounded-md py-0.5 pl-2 pr-5 text-xs font-medium ${p.chip} ${
        disabled ? "opacity-60" : "cursor-pointer hover:brightness-95"
      }`}
    >
      <FlagIcon />
      {priority}
      <ChevronDown size={11} className="pointer-events-none absolute right-1.5 opacity-70" />
      <select
        aria-label="Change priority"
        value={priority}
        disabled={disabled}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onChange(e.target.value as TaskPriority)}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {TASK_PRIORITIES.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </span>
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
