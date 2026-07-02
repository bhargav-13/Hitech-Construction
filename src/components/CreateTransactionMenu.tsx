"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import type { TxnType } from "@/lib/types";
import { EXPENSE_TYPES, PAYMENT_TYPES, SALES_TYPES } from "@/lib/txnDisplay";

const FLOW_CLS: Record<string, string> = {
  "Payment In": "text-green-700 bg-green-50 hover:bg-green-100",
  "Payment Out": "text-rose-700 bg-rose-50 hover:bg-rose-100",
};

export function CreateTransactionMenu({ onPick }: { onPick: (type: TxnType) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-4 py-2.5 text-sm font-medium text-white hover:opacity-90"
      >
        <Plus size={16} />
        Create Transaction
        <ChevronDown size={14} />
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-[420px] rounded-xl border border-gray-100 bg-white p-4 shadow-xl">
          <Section title="Payment">
            {PAYMENT_TYPES.map((t) => (
              <Item key={t} type={t} onPick={pick} />
            ))}
          </Section>
          <Section title="Sales">
            {SALES_TYPES.map((t) => (
              <Item key={t} type={t} onPick={pick} />
            ))}
          </Section>
          <Section title="Expense">
            {EXPENSE_TYPES.map((t) => (
              <Item key={t} type={t} onPick={pick} />
            ))}
          </Section>
        </div>
      )}
    </div>
  );

  function pick(t: TxnType) {
    setOpen(false);
    onPick(t);
  }
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-3 last:mb-0">
      <div className="mb-2 text-xs font-semibold tracking-wide text-gray-400 uppercase">{title}</div>
      <div className="grid grid-cols-2 gap-2">{children}</div>
    </div>
  );
}

function Item({ type, onPick }: { type: TxnType; onPick: (t: TxnType) => void }) {
  const cls = FLOW_CLS[type] ?? "text-gray-700 bg-gray-50 hover:bg-gray-100";
  return (
    <button
      onClick={() => onPick(type)}
      className={`rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${cls}`}
    >
      + {type}
    </button>
  );
}
