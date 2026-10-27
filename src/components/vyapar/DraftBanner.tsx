"use client";

/** "You have an unsaved … — Restore / Discard", shown when a form opens with a draft behind it. */
export function DraftBanner({
  what,
  savedAt,
  onRestore,
  onDiscard,
}: {
  what: string;
  savedAt: number;
  onRestore: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
      <span className="flex-1">
        You have an unsaved {what} from{" "}
        {new Date(savedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}.
      </span>
      <button
        type="button"
        onClick={onRestore}
        className="rounded-lg bg-amber-500 px-3 py-1 text-xs font-semibold text-white transition-opacity duration-150 hover:opacity-90"
      >
        Restore
      </button>
      <button
        type="button"
        onClick={onDiscard}
        className="rounded-lg px-2 py-1 text-xs font-medium text-amber-700 transition-colors duration-150 hover:bg-amber-100"
      >
        Discard
      </button>
    </div>
  );
}
