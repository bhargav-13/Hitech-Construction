"use client";

import { UserRound } from "lucide-react";
import { projectAvatarColor } from "@/lib/projectHelpers";
import { PRIORITY_STYLE, STATUS_STYLE } from "@/lib/taskTypes";
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
