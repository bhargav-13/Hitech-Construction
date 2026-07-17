"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

/**
 * Themed, animated replacement for a native <select>. The native option list can't be styled or
 * transitioned, so this renders a custom listbox: rounded panel, cyan hover/selected states, a
 * rotating chevron and a fade/scale drop-in. Keyboard accessible (↑/↓, Enter, Esc, type-ahead).
 */
export function Select({
  value,
  onChange,
  options,
  placeholder = "Select…",
  className = "",
  buttonClassName = "",
  size = "md",
  align = "left",
  disabled = false,
  title,
  icon,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  buttonClassName?: string;
  size?: "sm" | "md";
  align?: "left" | "right";
  disabled?: boolean;
  title?: string;
  icon?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const typed = useRef<{ str: string; at: number }>({ str: "", at: 0 });

  const selected = useMemo(() => options.find((o) => o.value === value), [options, value]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  useEffect(() => {
    if (open) {
      const i = options.findIndex((o) => o.value === value);
      setActive(i >= 0 ? i : 0);
    }
  }, [open, options, value]);

  useEffect(() => {
    if (open) listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const pick = (opt: SelectOption) => {
    if (opt.disabled) return;
    onChange(opt.value);
    setOpen(false);
  };

  const moveActive = (dir: 1 | -1) => {
    setActive((cur) => {
      let next = cur;
      for (let step = 0; step < options.length; step++) {
        next = (next + dir + options.length) % options.length;
        if (!options[next]?.disabled) return next;
      }
      return cur;
    });
  };

  function onKeyDown(e: React.KeyboardEvent) {
    if (disabled) return;
    if (!open && (e.key === "Enter" || e.key === " " || e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      setOpen(true);
      return;
    }
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveActive(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveActive(-1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (options[active]) pick(options[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "Tab") {
      setOpen(false);
    } else if (e.key.length === 1) {
      // type-ahead
      const now = Date.now();
      typed.current = { str: now - typed.current.at < 800 ? typed.current.str + e.key : e.key, at: now };
      const q = typed.current.str.toLowerCase();
      const i = options.findIndex((o) => o.label.toLowerCase().startsWith(q));
      if (i >= 0) setActive(i);
    }
  }

  const pad = size === "sm" ? "px-2 py-1 text-xs" : "px-3 py-2 text-sm";

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        title={title}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex w-full items-center justify-between gap-2 rounded-lg border bg-white text-left text-gray-700 outline-none transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60 ${pad} ${
          open ? "border-cyan-500 ring-2 ring-cyan-500/15" : "border-gray-200 hover:border-gray-300"
        } ${buttonClassName}`}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          {icon}
          <span className={`truncate ${selected ? "" : "text-gray-400"}`}>{selected?.label ?? placeholder}</span>
        </span>
        <ChevronDown
          size={size === "sm" ? 13 : 15}
          className={`shrink-0 text-gray-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          ref={listRef}
          role="listbox"
          className={`animate-fade-in-scale absolute z-50 mt-1 max-h-64 min-w-full overflow-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg ${
            align === "right" ? "right-0 origin-top-right" : "left-0 origin-top-left"
          }`}
        >
          {options.length === 0 ? (
            <div className="px-3 py-2 text-xs text-gray-400">No options</div>
          ) : (
            options.map((opt, i) => {
              const isSelected = opt.value === value;
              const isActive = i === active;
              return (
                <button
                  key={opt.value}
                  type="button"
                  data-idx={i}
                  role="option"
                  aria-selected={isSelected}
                  disabled={opt.disabled}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(opt)}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors duration-100 disabled:cursor-not-allowed disabled:opacity-40 ${
                    isActive ? "bg-cyan-50" : ""
                  } ${isSelected ? "font-medium text-brand-accent" : "text-gray-700"}`}
                >
                  <span className="truncate">{opt.label}</span>
                  {isSelected && <Check size={14} className="shrink-0 text-brand-accent" />}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
