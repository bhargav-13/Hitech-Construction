"use client";

import { useState } from "react";
import { Copy, Eye, EyeOff } from "lucide-react";
import * as api from "@/lib/api";

/**
 * A member's current password, hidden until Super Admin asks for it. Fetched on demand (never with
 * the member list) so it isn't sitting in the page for anyone to find.
 *
 * Accounts that existed before passwords were kept readable show "not available" until the member
 * next signs in or gets a new password set — sign-in is the only moment the plain text is known.
 */
export function StoredPassword({ userId }: { userId: number }) {
  const [state, setState] = useState<{ status: "hidden" | "loading" | "shown" | "error"; value: string | null; msg?: string }>({
    status: "hidden",
    value: null,
  });
  const [copied, setCopied] = useState(false);

  async function toggle() {
    if (state.status === "shown") return setState({ status: "hidden", value: null });
    setState({ status: "loading", value: null });
    try {
      const res = await api.getStoredPassword(userId);
      setState({ status: "shown", value: res.password });
    } catch (err) {
      setState({ status: "error", value: null, msg: err instanceof api.ApiError ? err.message : "Couldn't load it." });
    }
  }

  async function copy() {
    if (!state.value) return;
    try {
      await navigator.clipboard.writeText(state.value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — it's on screen to copy by hand */
    }
  }

  return (
    <div>
      <div className="flex items-center gap-1.5">
        <div className="input flex flex-1 items-center font-mono text-sm">
          {state.status === "shown" ? (
            state.value ?? <span className="font-sans text-xs text-gray-400">Not available yet</span>
          ) : state.status === "loading" ? (
            <span className="font-sans text-xs text-gray-400">Loading…</span>
          ) : (
            <span className="tracking-widest text-gray-400">••••••••</span>
          )}
        </div>
        <button
          type="button"
          onClick={toggle}
          title={state.status === "shown" ? "Hide password" : "Show password"}
          className="shrink-0 rounded-lg border border-gray-200 px-2.5 py-2 text-gray-500 hover:bg-gray-50"
        >
          {state.status === "shown" ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
        <button
          type="button"
          onClick={copy}
          disabled={state.status !== "shown" || !state.value}
          title="Copy"
          className="shrink-0 rounded-lg border border-gray-200 px-2.5 py-2 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40"
        >
          {copied ? "Copied" : <Copy size={13} />}
        </button>
      </div>
      {state.status === "shown" && !state.value && (
        <p className="mt-1 text-[11px] text-gray-400">
          Captured the next time they sign in — or set a new password below and it shows here straight away.
        </p>
      )}
      {state.status === "error" && <p className="mt-1 text-[11px] text-rose-600">{state.msg}</p>}
    </div>
  );
}
