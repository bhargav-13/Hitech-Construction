"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import { Select } from "@/components/Select";
import { optionsFor, useOptionMaster } from "@/lib/useOptionMaster";

/**
 * A dropdown whose list the user can extend — **⊕ Add …** sits at the foot of the options.
 *
 * Choosing it turns the field into a text box *in place*, so a value nobody anticipated ("Trip",
 * "AA Class", "Billing Engineer") is added where the form is being filled in, rather than in a
 * settings screen somebody has to go and find first. The new value is selected immediately and
 * joins the master for every other field reading the same list.
 *
 * The master is keyed, so several fields can share one vocabulary (every unit picker in
 * procurement) or keep their own (tender class vs designation).
 */
export function CreatableSelect({
  value,
  onChange,
  masterKey,
  builtIns,
  createLabel,
  placeholder,
  size = "md",
  className = "",
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Storage key for the shared list — the same key means the same vocabulary. */
  masterKey: string;
  /** Shipped defaults, in the order they should appear. */
  builtIns: readonly string[];
  /** Foot-of-list label, e.g. "Add unit". */
  createLabel: string;
  /** Shown when nothing is chosen; also adds a blank "clear" row when given. */
  placeholder?: string;
  size?: "sm" | "md";
  className?: string;
  disabled?: boolean;
}) {
  const { options, add } = useOptionMaster(masterKey, builtIns);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  function commit() {
    const saved = add(draft);
    if (saved) onChange(saved);
    setDraft("");
    setAdding(false);
  }

  function cancel() {
    setDraft("");
    setAdding(false);
  }

  if (adding) {
    return (
      <div className={`flex items-center gap-1 ${className}`}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              // Stop here: the drawer this sits in also listens for Escape, and one key press
              // should cancel the little text box, not throw away the whole form.
              e.preventDefault();
              e.stopPropagation();
              cancel();
            }
          }}
          autoFocus
          placeholder={createLabel.replace(/^Add\s+/i, "")}
          aria-label={createLabel}
          className={`w-full min-w-0 rounded-md border border-cyan-500 outline-none ${
            size === "sm" ? "px-1.5 py-1 text-xs" : "px-3 py-2 text-sm"
          }`}
        />
        <button
          type="button"
          onClick={commit}
          disabled={!draft.trim()}
          aria-label={`Save — ${createLabel}`}
          className="shrink-0 rounded p-1 text-emerald-600 transition-colors duration-150 hover:bg-emerald-50 disabled:opacity-40"
        >
          <Check size={14} />
        </button>
        <button
          type="button"
          onClick={cancel}
          aria-label="Cancel"
          className="shrink-0 rounded p-1 text-gray-400 transition-colors duration-150 hover:bg-gray-100"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <Select
      value={value}
      onChange={onChange}
      size={size}
      className={className}
      disabled={disabled}
      placeholder={placeholder}
      options={optionsFor(options, value, placeholder)}
      onCreate={disabled ? undefined : () => setAdding(true)}
      createLabel={createLabel}
    />
  );
}
