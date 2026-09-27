"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Sparkles, X } from "lucide-react";
import {
  SCAN_ACCEPT,
  SCAN_NOT_READY,
  scanAvailable,
  scanDocument,
  type ScanKind,
  type ScanResultMap,
} from "@/lib/docScan";

export type ScanNoteTone = "info" | "good" | "warn" | "bad";
export type ScanNoteValue = { tone: ScanNoteTone; text: string };

const NOTE_CLASS: Record<ScanNoteTone, string> = {
  info: "bg-cyan-50 text-brand-accent ring-cyan-600/20",
  good: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  warn: "bg-amber-50 text-amber-800 ring-amber-600/20",
  bad: "bg-rose-50 text-rose-700 ring-rose-600/20",
};

export function ScanNoteBanner({ note, onDismiss }: { note: ScanNoteValue; onDismiss?: () => void }) {
  return (
    <div className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs leading-relaxed ring-1 ring-inset ${NOTE_CLASS[note.tone]}`}>
      <Sparkles size={13} className="mt-0.5 shrink-0" />
      <span className="flex-1">{note.text}</span>
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="Dismiss" className="shrink-0 opacity-60 hover:opacity-100">
          <X size={12} />
        </button>
      )}
    </div>
  );
}

/**
 * "Scan with AI": pick a photo or PDF, and the form fills itself from it.
 *
 * `onResult` puts the values on the form and returns the note to show — what was filled, what
 * looked doubtful. It must only set form state: saving stays with the form's own Save button, after
 * the user has checked the values against the document.
 *
 * On a server without a scanning key the button still shows, disabled, and says why — a button
 * that silently isn't there reads as "the feature doesn't exist".
 */
export function ScanButton<K extends ScanKind>({
  kind,
  hints,
  onResult,
  onFile,
  label = "Scan with AI",
  hint,
  className = "",
  showNote = true,
  compact = false,
}: {
  kind: K;
  /** Context for the reader, e.g. our own GSTIN. A function so it is read at click time. */
  hints?: Record<string, string | null | undefined> | (() => Promise<Record<string, string | null | undefined>> | Record<string, string | null | undefined>);
  onResult: (result: ScanResultMap[K], file: File) => ScanNoteValue | void;
  /** Called with the picked file before reading — to attach it or show it beside the form. */
  onFile?: (file: File) => void | Promise<void>;
  label?: string;
  /** Short helper text shown beside the button. */
  hint?: string;
  className?: string;
  /** Render the result note under the button. Off when the form shows it somewhere else. */
  showNote?: boolean;
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [note, setNote] = useState<ScanNoteValue | null>(null);

  useEffect(() => {
    let live = true;
    scanAvailable().then((ok) => live && setAvailable(ok));
    return () => {
      live = false;
    };
  }, []);

  async function run(file: File) {
    setBusy(true);
    setNote(null);
    setStatus("Reading…");
    try {
      await onFile?.(file);
      const h = typeof hints === "function" ? await hints() : hints;
      const result = await scanDocument(kind, file, { hints: h, onProgress: setStatus });
      const n = onResult(result, file);
      setNote(n ?? { tone: "good", text: "Filled from the scan. Check everything against the document, then Save." });
    } catch (err) {
      setNote({ tone: "bad", text: err instanceof Error ? err.message : "Couldn't read that document." });
    } finally {
      setBusy(false);
      setStatus("");
    }
  }

  const ready = available === true;

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy || !ready}
          title={available === false ? SCAN_NOT_READY : undefined}
          className={`flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 font-medium text-violet-700 transition-all duration-150 hover:border-violet-400 hover:bg-violet-100 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 ${
            compact ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm"
          }`}
        >
          {busy ? <Loader2 size={compact ? 12 : 14} className="animate-spin" /> : <Sparkles size={compact ? 12 : 14} />}
          {busy ? status || "Reading…" : label}
        </button>
        {available === false ? (
          <span className="text-xs text-gray-400">Not set up on the server yet</span>
        ) : (
          hint && !busy && <span className="text-xs text-gray-400">{hint}</span>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={SCAN_ACCEPT}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void run(file);
          }}
        />
      </div>
      {showNote && note && <ScanNoteBanner note={note} onDismiss={() => setNote(null)} />}
    </div>
  );
}
