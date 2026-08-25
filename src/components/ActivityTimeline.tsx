"use client";

import { CheckCircle2, ClipboardCheck, Image as ImageIcon, MessageSquare } from "lucide-react";
import { formatTaskDateTime } from "@/lib/taskTypes";

/**
 * The activity feed used across the app.
 *
 * <p>Lifted out of the Taskopad task drawer, where it started, so Tender (and anything else that
 * grows a history) shows the same thing rather than a second, slightly different timeline. One row
 * per entry — icon, what happened, who did it, when — joined by a dotted rail down the left.
 */
export type ActivityItem = { id: number | string; text: string; at: string; userId?: string; actorName?: string };

/** Pick an icon from the wording, so the feed reads at a glance without every caller tagging types. */
export function activityIcon(text: string) {
  const t = text.toLowerCase();
  if (t.includes("attach") || t.includes("upload")) return ImageIcon;
  if (t.includes("comment") || t.includes("note")) return MessageSquare;
  if (t.includes("creat") || t.includes("added")) return ClipboardCheck;
  return CheckCircle2;
}

export function ActivityTimeline({
  items,
  userName,
  empty = "No activity yet.",
}: {
  items: ActivityItem[];
  userName?: (id: string) => string;
  empty?: string;
}) {
  if (items.length === 0) {
    return <p className="py-10 text-center text-xs text-gray-400">{empty}</p>;
  }
  return (
    <ol className="relative pl-6">
      <span
        aria-hidden
        className="absolute left-[11px] top-3 bottom-3 w-px border-l border-dashed border-cyan-200"
      />
      {items.map((a) => {
        const Icon = activityIcon(a.text);
        const actor = a.actorName ?? (a.userId && userName ? userName(a.userId) : null);
        return (
          <li key={a.id} className="relative py-2.5">
            <span className="absolute -left-6 top-2.5 flex h-6 w-6 items-center justify-center rounded-full border border-cyan-200 bg-white text-brand-accent shadow-sm">
              <Icon size={12} />
            </span>
            <div className="text-sm leading-snug text-gray-700">{a.text}</div>
            <div className="mt-0.5 text-[10px] text-gray-400">
              {actor && <span className="mr-1 font-medium text-gray-500">{actor}</span>}
              {formatTaskDateTime(a.at)}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
