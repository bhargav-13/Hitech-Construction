"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, Delete, X } from "lucide-react";

/**
 * Vyapar's calculator, rebuilt for the browser.
 *
 * The desktop app's calculator button shells out to the Windows Calculator. A web app can't launch
 * a native program, so this is our own — same purpose (add up a bill while you're keying it in),
 * and it works on a phone and on site laptops that don't have the desktop app at all.
 *
 * Deliberately kept to the same keys the Windows one offers on its standard tab, plus a Copy so
 * the answer can go straight into an amount field.
 */

/** Evaluate a two-operand step. Kept separate so both `=` and a chained operator can use it. */
function apply(a: number, b: number, op: Op): number {
  switch (op) {
    case "+":
      return a + b;
    case "−":
      return a - b;
    case "×":
      return a * b;
    case "÷":
      // Dividing by zero yields Infinity in JS; the UI turns that into "Cannot divide by zero".
      return a / b;
    case "%":
      // Windows Calculator reads "a + b %" as a percentage *of a*, not a plain modulo.
      return (a * b) / 100;
  }
}

type Op = "+" | "−" | "×" | "÷" | "%";

export function CalculatorPanel({ onClose }: { onClose: () => void }) {
  /** What's on the display right now, as typed — kept as a string so "1.50" doesn't lose its zero. */
  const [entry, setEntry] = useState("0");
  /** The left-hand operand and the pending operator, once one has been chosen. */
  const [pending, setPending] = useState<{ value: number; op: Op } | null>(null);
  /** True right after an operator or `=`, so the next digit starts a fresh number. */
  const [fresh, setFresh] = useState(true);
  const [copied, setCopied] = useState(false);

  const digit = useCallback(
    (d: string) => {
      setEntry((cur) => {
        if (fresh) return d === "." ? "0." : d;
        if (d === "." && cur.includes(".")) return cur;
        if (cur === "0" && d !== ".") return d;
        return cur + d;
      });
      setFresh(false);
    },
    [fresh],
  );

  const operator = useCallback(
    (op: Op) => {
      setPending((prev) => {
        const current = Number(entry) || 0;
        // Chaining (2 + 3 + …) resolves the previous step before starting the next.
        if (prev && !fresh) {
          const result = apply(prev.value, current, prev.op);
          setEntry(String(result));
          return { value: result, op };
        }
        return { value: current, op };
      });
      setFresh(true);
    },
    [entry, fresh],
  );

  const equals = useCallback(() => {
    setPending((prev) => {
      if (!prev) return null;
      setEntry(String(apply(prev.value, Number(entry) || 0, prev.op)));
      return null;
    });
    setFresh(true);
  }, [entry]);

  const clear = useCallback(() => {
    setEntry("0");
    setPending(null);
    setFresh(true);
  }, []);

  const backspace = useCallback(() => {
    setEntry((cur) => (cur.length <= 1 || (cur.length === 2 && cur.startsWith("-")) ? "0" : cur.slice(0, -1)));
  }, []);

  // A calculator you have to click is barely a calculator — the number row must work.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key;
      if (/^[0-9]$/.test(k)) digit(k);
      else if (k === "." || k === ",") digit(".");
      else if (k === "+") operator("+");
      else if (k === "-") operator("−");
      else if (k === "*") operator("×");
      else if (k === "/") {
        e.preventDefault(); // Firefox opens quick-find on "/"
        operator("÷");
      } else if (k === "%") operator("%");
      else if (k === "Enter" || k === "=") {
        e.preventDefault();
        equals();
      } else if (k === "Backspace") backspace();
      else if (k === "Escape") onClose();
      else if (k.toLowerCase() === "c") clear();
      else return;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [digit, operator, equals, backspace, clear, onClose]);

  const display = !Number.isFinite(Number(entry)) ? "Cannot divide by zero" : entry;

  async function copy() {
    try {
      await navigator.clipboard.writeText(entry);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard blocked (insecure origin / denied) — the figure is still on screen to read */
    }
  }

  const KEYS: { label: string; onPress: () => void; tone?: "op" | "muted" }[] = [
    { label: "C", onPress: clear, tone: "muted" },
    { label: "%", onPress: () => operator("%"), tone: "muted" },
    { label: "÷", onPress: () => operator("÷"), tone: "op" },
    { label: "×", onPress: () => operator("×"), tone: "op" },
    { label: "7", onPress: () => digit("7") },
    { label: "8", onPress: () => digit("8") },
    { label: "9", onPress: () => digit("9") },
    { label: "−", onPress: () => operator("−"), tone: "op" },
    { label: "4", onPress: () => digit("4") },
    { label: "5", onPress: () => digit("5") },
    { label: "6", onPress: () => digit("6") },
    { label: "+", onPress: () => operator("+"), tone: "op" },
    { label: "1", onPress: () => digit("1") },
    { label: "2", onPress: () => digit("2") },
    { label: "3", onPress: () => digit("3") },
    { label: "=", onPress: equals, tone: "op" },
    { label: "0", onPress: () => digit("0") },
    { label: ".", onPress: () => digit(".") },
  ];

  return (
    <div className="animate-fade-in-scale absolute right-0 top-11 z-50 w-64 origin-top-right rounded-xl border border-gray-200 bg-white p-3 shadow-2xl ring-1 ring-black/[0.04]">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold tracking-wide text-gray-400 uppercase">Calculator</span>
        <button
          onClick={onClose}
          aria-label="Close calculator"
          className="rounded p-1 text-gray-400 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-600"
        >
          <X size={14} />
        </button>
      </div>

      <div className="rounded-lg bg-gray-50 px-3 py-2 text-right">
        <div className="h-4 text-[11px] text-gray-400">
          {pending ? `${pending.value} ${pending.op}` : ""}
        </div>
        <div className="truncate text-2xl font-semibold tabular-nums text-gray-900">{display}</div>
      </div>

      <div className="mt-2 flex gap-1">
        <button
          onClick={copy}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-200 py-1.5 text-xs font-medium text-gray-600 transition-colors duration-150 hover:border-brand-accent hover:text-brand-accent"
        >
          <Copy size={12} /> {copied ? "Copied" : "Copy"}
        </button>
        <button
          onClick={backspace}
          aria-label="Backspace"
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-gray-600 transition-colors duration-150 hover:border-brand-accent hover:text-brand-accent"
        >
          <Delete size={13} />
        </button>
      </div>

      <div className="mt-2 grid grid-cols-4 gap-1">
        {KEYS.map((k) => (
          <button
            key={k.label}
            onClick={k.onPress}
            // "0" takes the width of two cells, as it does on every calculator.
            className={`rounded-lg py-2 text-sm font-medium transition-colors duration-150 active:scale-95 ${
              k.label === "0" ? "col-span-2" : ""
            } ${
              k.tone === "op"
                ? "bg-cyan-50 text-brand-accent hover:bg-cyan-100"
                : k.tone === "muted"
                  ? "bg-gray-100 text-gray-500 hover:bg-gray-200"
                  : "bg-gray-50 text-gray-800 hover:bg-gray-100"
            }`}
          >
            {k.label}
          </button>
        ))}
      </div>

      <p className="mt-2 text-center text-[10px] text-gray-400">Number keys, Enter and Esc work too.</p>
    </div>
  );
}
