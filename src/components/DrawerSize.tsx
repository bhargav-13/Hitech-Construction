"use client";

import { useCallback, useEffect, useState } from "react";
import { Maximize2, Minimize2, Minus, X } from "lucide-react";

const STORAGE_PREFIX = "hlt.drawer.max.";

/** Narrow dialogs (a few fields) that would only look stretched at full width. */
const SMALL_WIDTHS = new Set(["max-w-sm", "max-w-md", "max-w-lg", "max-w-xl"]);

/**
 * Vyapar opens its entry forms full-screen, so the Vyapar module does too — until the user picks a
 * size themselves, which is then remembered. Small dialogs keep their panel size.
 */
function defaultMaximized(sizeKey: string) {
  return currentModule() === "vyapar" && !SMALL_WIDTHS.has(sizeKey);
}

/** First path segment — the size is remembered per module, so Tender's choice doesn't leak into Vyapar. */
function currentModule() {
  return window.location.pathname.split("/")[1] || "home";
}

/**
 * Size state for a right-side drawer: maximized to the full window, or minimized to a chip so the
 * page behind can be read without losing a half-filled form. Maximized is remembered per module and
 * drawer width — the big document forms share one setting, the small dialogs another — so someone who
 * likes the Sale form full-screen gets it that way every time.
 */
export function useDrawerSize(sizeKey: string) {
  const [maximized, setMaximized] = useState(false);
  const [minimized, setMinimized] = useState(false);

  // Read after mount: a drawer opened from a deep link renders on the server first.
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(`${STORAGE_PREFIX}${currentModule()}.${sizeKey}`);
    } catch {}
    setMaximized(saved === null ? defaultMaximized(sizeKey) : saved === "1");
  }, [sizeKey]);

  const toggleMaximized = useCallback(() => {
    setMaximized((m) => {
      try {
        localStorage.setItem(`${STORAGE_PREFIX}${currentModule()}.${sizeKey}`, m ? "0" : "1");
      } catch {}
      return !m;
    });
  }, [sizeKey]);

  return { maximized, toggleMaximized, minimized, setMinimized };
}

/** Minimize + maximize/restore buttons for a drawer header, placed beside the close button. */
export function DrawerSizeButtons({
  maximized,
  onToggleMaximized,
  onMinimize,
}: {
  maximized: boolean;
  onToggleMaximized: () => void;
  onMinimize: () => void;
}) {
  const btn =
    "rounded-full p-1 text-gray-400 transition-all duration-150 hover:bg-gray-100 hover:text-gray-600 active:scale-90";
  return (
    <>
      <button
        type="button"
        onClick={onMinimize}
        title="Minimize"
        aria-label="Minimize"
        className={btn}
      >
        <Minus size={16} />
      </button>
      <button
        type="button"
        onClick={onToggleMaximized}
        title={maximized ? "Restore size" : "Maximize"}
        aria-label={maximized ? "Restore size" : "Maximize"}
        className={btn}
      >
        {maximized ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
      </button>
    </>
  );
}

/**
 * What a minimized drawer leaves on screen: a chip in the bottom-right corner. The drawer itself
 * stays mounted (only hidden), so everything typed into it survives until it is restored.
 */
export function MinimizedDrawerChip({
  title,
  onRestore,
  onClose,
}: {
  title: string;
  onRestore: () => void;
  onClose: () => void;
}) {
  return (
    <div className="animate-fade-in fixed right-6 bottom-6 z-50 flex max-w-xs items-center gap-1 rounded-xl border border-gray-200 bg-white py-1.5 pr-1.5 pl-3 shadow-2xl">
      <div className="h-6 w-1 shrink-0 rounded-full bg-gradient-to-b from-brand-accent to-cyan-400" />
      <button
        type="button"
        onClick={onRestore}
        title="Restore"
        className="min-w-0 truncate px-2 text-left text-xs font-bold tracking-wide text-gray-700 uppercase hover:text-brand-accent"
      >
        {title}
      </button>
      <button
        type="button"
        onClick={onRestore}
        title="Restore"
        aria-label="Restore"
        className="rounded-full p-1 text-gray-400 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-600"
      >
        <Maximize2 size={14} />
      </button>
      <button
        type="button"
        onClick={onClose}
        title="Close"
        aria-label="Close"
        className="rounded-full p-1 text-gray-400 transition-colors duration-150 hover:bg-rose-50 hover:text-rose-600"
      >
        <X size={15} />
      </button>
    </div>
  );
}
