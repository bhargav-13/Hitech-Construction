"use client";

import { Plus, X } from "lucide-react";
import type { TrackerStep } from "@/lib/tenderTypes";

/**
 * Inline editor for a tracker's columns (milestone steps / document types). The "+" pills insert a
 * step at that exact position — before the first, between any two, or after the last — so the client
 * can grow the sequence anywhere. Clicking a name renames it; × removes it. Uses window.prompt to
 * match the rest of the tender module (e.g. "Save view").
 */
export function StepEditor({
  title,
  steps,
  onAdd,
  onRemove,
  onRename,
}: {
  title: string;
  steps: TrackerStep[];
  onAdd: (label: string, atIndex: number) => void;
  onRemove: (key: string) => void;
  onRename: (key: string, label: string) => void;
}) {
  function addAt(index: number) {
    const label = window.prompt(`New ${title} name`);
    if (label && label.trim()) onAdd(label.trim(), index);
  }
  function rename(step: TrackerStep) {
    const label = window.prompt(`Rename "${step.label}"`, step.label);
    if (label && label.trim()) onRename(step.key, label.trim());
  }
  return (
    <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/60 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-1">
        <span className="text-[11px] font-semibold tracking-wide text-gray-500 uppercase">Edit {title}s</span>
        <span className="text-[11px] text-gray-400">Click + to insert · click a name to rename · × to remove</span>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <InsertButton onClick={() => addAt(0)} />
        {steps.map((step, i) => (
          <div key={step.key} className="flex items-center gap-1">
            <span className="flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs text-gray-700 ring-1 ring-inset ring-gray-200">
              <button onClick={() => rename(step)} className="hover:text-brand-accent">
                {step.label}
              </button>
              <button
                onClick={() => onRemove(step.key)}
                aria-label={`Remove ${step.label}`}
                className="rounded-full p-0.5 text-gray-300 transition-colors hover:bg-rose-50 hover:text-rose-500"
              >
                <X size={11} />
              </button>
            </span>
            <InsertButton onClick={() => addAt(i + 1)} />
          </div>
        ))}
      </div>
    </div>
  );
}

function InsertButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title="Insert here"
      className="flex h-5 w-5 items-center justify-center rounded-full border border-dashed border-gray-300 text-gray-400 transition-colors hover:border-brand-accent hover:text-brand-accent"
    >
      <Plus size={11} />
    </button>
  );
}
