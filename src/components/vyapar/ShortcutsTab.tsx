"use client";

import { useEffect, useState } from "react";
import { Keyboard, RotateCcw, X } from "lucide-react";
import { DOC_CONFIGS } from "@/lib/vyaparConfig";
import {
  BROWSER_RESERVED,
  DEFAULT_SHORTCUTS,
  MENU_SHORTCUT,
  comboOf,
  isBindable,
  useVyaparShortcuts,
} from "@/lib/vyaparShortcuts";

/**
 * Settings → Shortcuts: Vyapar's Alt+<key> list, each one re-assignable. Click a key, press the new
 * combination; Backspace clears it, Esc cancels. Changes save straight away for this user.
 */
export function ShortcutsTab() {
  const { map, save } = useVyaparShortcuts();
  const [recording, setRecording] = useState<string | null>(null);
  const [warning, setWarning] = useState("");

  useEffect(() => {
    if (!recording) return;
    // Tells the shell's shortcut handler to stand aside, so pressing Alt+S here records it rather
    // than opening a sale.
    document.body.dataset.shortcutRecording = "1";
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.key === "Escape") { setRecording(null); setWarning(""); return; }
      if (e.key === "Backspace" || e.key === "Delete") {
        save({ ...map, [recording]: "" });
        setRecording(null);
        setWarning("");
        return;
      }
      const combo = comboOf(e);
      if (!combo) return;
      if (!isBindable(combo)) { setWarning(`${combo} would fire while typing — hold Alt or Ctrl with it.`); return; }
      if (BROWSER_RESERVED.has(combo)) { setWarning(`${combo} belongs to the browser — pick another.`); return; }
      // A key can do one thing: take it off whatever had it before.
      const next = { ...map };
      const taken = Object.entries(next).find(([id, c]) => id !== recording && c === combo)?.[0];
      if (taken) next[taken] = "";
      next[recording] = combo;
      save(next);
      setWarning(taken ? `${combo} was on ${labelOf(taken)} — that one has no shortcut now.` : "");
      setRecording(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      delete document.body.dataset.shortcutRecording;
    };
  }, [recording, map, save]);

  const groups = [
    { title: "Sale", items: DOC_CONFIGS.filter((d) => d.group === "SALE") },
    { title: "Purchase", items: DOC_CONFIGS.filter((d) => d.group === "PURCHASE") },
    { title: "Others", items: DOC_CONFIGS.filter((d) => d.group === "OTHERS") },
  ];
  const changed = Object.keys(DEFAULT_SHORTCUTS).some((id) => (map[id] ?? "") !== DEFAULT_SHORTCUTS[id]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-800">
            <Keyboard size={15} /> Keyboard shortcuts
          </h3>
          <p className="mt-1 max-w-xl text-xs text-gray-400">
            Press a shortcut anywhere in Vyapar to open a new entry. Click a key to change it, then press the new
            combination (Backspace removes it, Esc cancels). Saved for you on this browser straight away.
          </p>
        </div>
        <button
          onClick={() => { save({ ...DEFAULT_SHORTCUTS }); setWarning(""); }}
          disabled={!changed}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40"
        >
          <RotateCcw size={12} /> Reset to Vyapar defaults
        </button>
      </div>

      {warning && <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{warning}</div>}

      <div className="grid gap-5 md:grid-cols-3">
        {groups.map((g) => (
          <div key={g.title}>
            <div className="mb-2 text-[11px] font-semibold tracking-wide text-gray-400 uppercase">{g.title}</div>
            <div className="space-y-1">
              {g.items.map((d) => (
                <Row
                  key={d.type}
                  label={d.label}
                  combo={map[d.type] ?? ""}
                  isDefault={(map[d.type] ?? "") === (DEFAULT_SHORTCUTS[d.type] ?? "")}
                  recording={recording === d.type}
                  onRecord={() => { setRecording(d.type); setWarning(""); }}
                  onClear={() => save({ ...map, [d.type]: "" })}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="max-w-sm rounded-lg bg-amber-50 p-3">
        <Row
          label="Open the Add More menu"
          combo={map[MENU_SHORTCUT] ?? ""}
          isDefault={(map[MENU_SHORTCUT] ?? "") === DEFAULT_SHORTCUTS[MENU_SHORTCUT]}
          recording={recording === MENU_SHORTCUT}
          onRecord={() => { setRecording(MENU_SHORTCUT); setWarning(""); }}
          onClear={() => save({ ...map, [MENU_SHORTCUT]: "" })}
        />
      </div>

      <p className="text-[11px] text-gray-400">
        Some browsers keep a few Alt keys for themselves (Chrome: Alt+D jumps to the address bar, Alt+F / Alt+E open
        its menu). If one of those doesn&apos;t work for you, change it here — e.g. Alt+Shift+D.
      </p>
    </div>
  );
}

function labelOf(id: string) {
  if (id === MENU_SHORTCUT) return "the Add More menu";
  return DOC_CONFIGS.find((d) => d.type === id)?.label ?? id;
}

function Row({
  label,
  combo,
  isDefault,
  recording,
  onRecord,
  onClear,
}: {
  label: string;
  combo: string;
  isDefault: boolean;
  recording: boolean;
  onRecord: () => void;
  onClear: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-50">
      <span className="min-w-0 flex-1 text-sm leading-tight text-gray-700">{label}</span>
      <button
        onClick={onRecord}
        title="Click, then press the new shortcut"
        className={`min-w-[84px] rounded-md border px-2 py-1 text-center text-xs font-medium transition-colors ${
          recording
            ? "animate-pulse border-brand-accent bg-cyan-50 text-brand-accent"
            : combo
              ? `border-gray-200 bg-white ${isDefault ? "text-gray-600" : "text-brand-accent"} hover:border-brand-accent`
              : "border-dashed border-gray-300 text-gray-400 hover:border-brand-accent"
        }`}
      >
        {recording ? "Press keys…" : combo ? combo.replace(/\+/g, " + ") : "Set"}
      </button>
      {combo && !recording ? (
        <button onClick={onClear} title="Remove this shortcut" className="rounded p-0.5 text-gray-300 hover:text-rose-500">
          <X size={12} />
        </button>
      ) : (
        <span className="w-4" />
      )}
    </div>
  );
}
