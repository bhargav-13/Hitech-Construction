"use client";

import { Suspense, useState } from "react";
import { InvoiceWorkspace } from "@/components/vyapar/InvoiceWorkspace";
import { PaymentWorkspace } from "@/components/vyapar/PaymentWorkspace";
import type { DocType } from "@/lib/vyaparApi";

/**
 * Project → Transaction tab.
 *
 * <p>This renders the *same* Vyapar surfaces as `/vyapar/sale`, `/vyapar/purchase` and
 * `/vyapar/payments`, pinned to one project. Nothing is reimplemented: a project doesn't own money,
 * it's a lens onto the books. Creating a document from here files it against this project, so it
 * can never be orphaned from the site it was entered under.
 *
 * <p>Replaces the previous version, which listed transactions from a local demo store that had no
 * connection to the backend at all.
 */

type Section = { key: string; label: string; kind: "doc"; docType: DocType } | { key: string; label: string; kind: "pay"; direction: "IN" | "OUT" };

const SECTIONS: Section[] = [
  { key: "sale", label: "Sales", kind: "doc", docType: "SALE" },
  { key: "purchase", label: "Purchases", kind: "doc", docType: "PURCHASE" },
  { key: "in", label: "Payment In", kind: "pay", direction: "IN" },
  { key: "out", label: "Payment Out", kind: "pay", direction: "OUT" },
  { key: "estimate", label: "Estimates", kind: "doc", docType: "ESTIMATE" },
  { key: "po", label: "Purchase Orders", kind: "doc", docType: "PURCHASE_ORDER" },
];

export function ProjectTransactions({ projectId }: { projectId: number }) {
  const [active, setActive] = useState(SECTIONS[0].key);
  const section = SECTIONS.find((s) => s.key === active) ?? SECTIONS[0];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            onClick={() => setActive(s.key)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              active === s.key
                ? "bg-brand-accent text-white shadow-sm"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Both workspaces read query params, which needs a boundary for the production build. */}
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-white" />}>
        {section.kind === "doc" ? (
          <InvoiceWorkspace
            key={section.key}
            docType={section.docType}
            title={section.label}
            accent={section.docType === "PURCHASE" ? "rose" : "brand"}
            projectId={projectId}
          />
        ) : (
          <PaymentWorkspace
            key={section.key}
            direction={section.direction}
            title={section.label}
            projectId={projectId}
          />
        )}
      </Suspense>
    </div>
  );
}
