"use client";

import { RefreshCw } from "lucide-react";
import { refreshNow, useLastRefreshedAgo } from "@/lib/autoRefresh";

/** "Updated 2 min ago ↻" — click to refresh the screen now. */
export function AutoRefreshBadge() {
  const ago = useLastRefreshedAgo();
  return (
    <button
      type="button"
      onClick={refreshNow}
      title="This screen refreshes itself every 3 minutes (never while you are editing). Click to refresh now."
      className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-gray-400 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-600"
    >
      <RefreshCw size={12} />
      Updated {ago}
    </button>
  );
}
