"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, Check, Crown, FileDown, Scale, Unlock, UserCheck, Zap } from "lucide-react";
import { ProcurementShell, ProcurementEmpty, ProcurementHeader } from "@/components/procurement/ProcurementShell";
import { Spinner } from "@/components/Spinner";
import { Select } from "@/components/Select";
import { useRfqs } from "@/lib/useRfqs";
import { downloadPdf } from "@/lib/vyaparExport";
import { inr } from "@/lib/format";
import { gstCodeForPercent } from "@/lib/gstRates";
import { stashPoDraft, vyaparUnit, type PoDraft } from "@/lib/poHandoff";
import type { Rfq, Quote } from "@/lib/procurementApi";

/**
 * Comparative statement — the screen the whole module exists for.
 *
 * Shape: **items down, vendors across.** The left spine is what was asked for; each column is what
 * one supplier came back with. That is how a comparative statement is read on paper, and it is what
 * the client's own tool does.
 *
 * The decision it supports is per line, not per enquiry. A five-line RFQ routinely ends up split
 * across three suppliers — cheapest cement here, fastest steel there — so every row carries its own
 * winner. Awarding then produces one purchase order per winning vendor.
 *
 * Four judgements are deliberate:
 *
 *  - **Colour is graded, not binary.** A dozen numbers in one row is a wall; what the buyer needs
 *    to see without reading is *how much worse* each one is. Green through amber to rose, keyed to
 *    the gap from the cheapest, plus a bar whose length is that gap. The eye lands on the right
 *    cell before the brain reads a rupee figure.
 *  - **A tolerance band.** Marking only the single lowest cell is misleading: ₹40 on a ₹31,000 line
 *    is not a decision. Anything within `LEVEL_BAND` of the best reads as level pegging, and the
 *    buyer picks on lead time or track record instead.
 *  - **Never colour alone.** Every band also carries a rank and a percentage, because a comparative
 *    statement gets printed and signed, and roughly one man in twelve cannot separate red from green.
 *  - **A missing quote is "No quote", never zero.** A blank cell reads as free and has caused real
 *    mistakes.
 */

/** Within this much of the cheapest rate, two quotes are treated as level rather than ranked. */
const LEVEL_BAND = 0.02;

/**
 * How far above the cheapest a rate has to sit before it changes colour.
 *
 * The steps are wide on purpose. Banding every percent would paint the table in twelve shades and
 * say nothing; a buyer reacts to "a bit more", "meaningfully more", and "why did they bother".
 */
const BANDS = [
  { upto: LEVEL_BAND * 100, key: "best" },
  { upto: 7, key: "close" },
  { upto: 20, key: "high" },
  { upto: Infinity, key: "worst" },
] as const;

type ToneKey = "best" | "close" | "high" | "worst";

const TONES: Record<ToneKey, { cell: string; bar: string; rate: string; chip: string; label: string }> = {
  best: {
    cell: "bg-emerald-50",
    bar: "bg-emerald-500",
    rate: "text-emerald-900 font-semibold",
    chip: "bg-emerald-600 text-white",
    label: "Lowest",
  },
  close: {
    cell: "bg-lime-50",
    bar: "bg-lime-500",
    rate: "text-lime-900",
    chip: "bg-lime-200 text-lime-900",
    label: "Close",
  },
  high: {
    cell: "bg-amber-50",
    bar: "bg-amber-500",
    rate: "text-amber-900",
    chip: "bg-amber-200 text-amber-900",
    label: "Higher",
  },
  worst: {
    cell: "bg-rose-50",
    bar: "bg-rose-500",
    rate: "text-rose-900",
    chip: "bg-rose-200 text-rose-900",
    label: "Highest",
  },
};

/** One accent per vendor column, so a column can be followed down a wide table by colour. */
const COLUMN_ACCENTS = [
  "border-t-cyan-500",
  "border-t-violet-500",
  "border-t-orange-500",
  "border-t-teal-500",
  "border-t-pink-500",
  "border-t-indigo-500",
  "border-t-yellow-500",
  "border-t-fuchsia-500",
];

function toneFor(deltaPercent: number): ToneKey {
  return (BANDS.find((b) => deltaPercent <= b.upto)?.key ?? "worst") as ToneKey;
}

export default function ComparePage() {
  const { rfqs, loading, error, award, unlock } = useRfqs();

  const comparable = useMemo(() => rfqs.filter((r) => r.quotes.length > 0), [rfqs]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const rfq = comparable.find((r) => r.id === selectedId) ?? comparable[0];

  if (loading) {
    return (
      <ProcurementShell>
        <ProcurementHeader title="Comparison" subtitle="Compare what each supplier quoted, line by line." />
        <div className="flex min-h-[240px] items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white text-sm text-gray-400">
          <Spinner size={16} className="text-brand-accent" /> Loading quotes…
        </div>
      </ProcurementShell>
    );
  }

  if (!rfq) {
    return (
      <ProcurementShell>
        <ProcurementHeader title="Comparison" subtitle="Compare what each supplier quoted, line by line." />
        {error && <div className="mb-3 rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}
        <ProcurementEmpty icon={Scale} title="Nothing to compare yet" hint="Quotes received against an RFQ show here." />
      </ProcurementShell>
    );
  }

  return (
    <ProcurementShell>
      <ProcurementHeader
        title="Comparison"
        subtitle="What each supplier quoted, line by line. Award each line to whoever should get it."
        right={
          <div className="flex items-center gap-2">
            <Select
              value={String(rfq.id)}
              onChange={(v) => setSelectedId(Number(v))}
              className="min-w-[240px]"
              options={comparable.map((r) => ({ value: String(r.id), label: `${r.rfqNo} · ${r.title}` }))}
            />
          </div>
        }
      />
      <Matrix key={rfq.id} rfq={rfq} onAward={award} onUnlock={unlock} />
    </ProcurementShell>
  );
}

// =====================================================================================

/** One vendor's priced total for the whole enquiry, and per line. */
function quoteTotals(rfq: Rfq, q: Quote) {
  const lineTotals = rfq.lines.map((l) => {
    const cell = q.lines.find((c) => c.rfqLineId === l.id);
    if (cell?.rate == null) return null;
    return cell.rate * (cell.quantity ?? l.quantity);
  });
  const subtotal = lineTotals.reduce<number>((s, t) => s + (t ?? 0), 0);
  const afterDiscount = subtotal - (q.discount ?? 0) + (q.charges ?? 0);
  const tax = (afterDiscount * (q.taxPercent ?? 0)) / 100;
  return { lineTotals, subtotal, tax, total: afterDiscount + tax };
}

function Matrix({
  rfq,
  onAward,
  onUnlock,
}: {
  rfq: Rfq;
  onAward: (rfqId: number, lineId: number, vendorPartyId: number | null, reason?: string) => void;
  onUnlock: (rfqId: number, quoteId: number) => void;
}) {
  const router = useRouter();
  const totals = useMemo(() => rfq.quotes.map((q) => quoteTotals(rfq, q)), [rfq]);

  /** Focus one vendor's column. Twelve columns is a wall; one at a time is a comparison. */
  const [focus, setFocus] = useState<number | null>(null);

  /** Per line: the best rate offered, and which vendors are within the tolerance band of it. */
  const perLine = useMemo(
    () =>
      rfq.lines.map((line) => {
        const offers = rfq.quotes
          .map((q, qi) => ({
            qi,
            vendorPartyId: q.vendorPartyId,
            vendorName: q.vendorName,
            rate: q.lines.find((c) => c.rfqLineId === line.id)?.rate ?? null,
          }))
          .filter((o) => o.rate != null) as {
          qi: number;
          vendorPartyId: number;
          vendorName: string;
          rate: number;
        }[];
        const best = offers.length ? Math.min(...offers.map((o) => o.rate)) : null;
        const worst = offers.length ? Math.max(...offers.map((o) => o.rate)) : null;
        const level = new Set(
          best == null ? [] : offers.filter((o) => o.rate <= best * (1 + LEVEL_BAND)).map((o) => o.qi),
        );
        // Rank by rate, so a cell can say "2nd of 5" rather than only "not the cheapest".
        const rank = new Map<number, number>();
        [...offers].sort((a, b) => a.rate - b.rate).forEach((o, i) => rank.set(o.qi, i + 1));
        const cheapest = offers.find((o) => o.rate === best) ?? null;
        return { line, offers, best, worst, level, rank, cheapest };
      }),
    [rfq],
  );

  /** Ranked whole-quote standings, for the cards above the matrix. */
  const standings = useMemo(() => {
    const best = Math.min(...totals.map((t) => t.total));
    return rfq.quotes
      .map((q, qi) => ({
        qi,
        quote: q,
        total: totals[qi].total,
        delta: totals[qi].total - best,
        quoted: q.lines.filter((l) => l.rate != null).length,
        wonLines: rfq.lines.filter((l) => l.awardedVendorPartyId === q.vendorPartyId).length,
        cheapestOn: perLine.filter((p) => p.rank.get(qi) === 1).length,
      }))
      .sort((a, b) => a.total - b.total);
  }, [rfq, totals, perLine]);

  /** What the current selection costs, against the two yardsticks that matter. */
  const summary = useMemo(() => {
    let selected = 0;
    let cheapest = 0;
    let budget = 0;
    let decided = 0;
    for (let i = 0; i < rfq.lines.length; i++) {
      const line = rfq.lines[i];
      const { best, cheapest: cheapestOffer } = perLine[i];
      if (best != null) cheapest += best * line.quantity;
      if (line.budgetRate != null) budget += line.budgetRate * line.quantity;
      const chosen = line.awardedVendorPartyId;
      if (chosen != null) {
        decided += 1;
        const q = rfq.quotes.find((x) => x.vendorPartyId === chosen);
        const rate = q?.lines.find((c) => c.rfqLineId === line.id)?.rate ?? null;
        selected += (rate ?? 0) * line.quantity;
      } else if (cheapestOffer) {
        // Undecided lines are costed at the cheapest offer, so the running total means something
        // before every row has been settled.
        selected += cheapestOffer.rate * line.quantity;
      }
    }
    return { selected, cheapest, budget, decided, of: rfq.lines.length };
  }, [rfq, perLine]);

  /**
   * Awarding produces one purchase order per winning vendor.
   *
   * Keyed by party id rather than name, and carrying the quote and the won lines, because this is
   * what gets handed to Vyapar: the PO needs the vendor's id, their rate on each line and their
   * tax rate, not a label to print.
   */
  const byVendor = useMemo(() => {
    const map = new Map<
      number,
      { name: string; quote: Quote | undefined; won: { line: Rfq["lines"][number]; rate: number }[]; value: number }
    >();
    rfq.lines.forEach((line) => {
      const vendorId = line.awardedVendorPartyId;
      if (vendorId == null) return;
      const q = rfq.quotes.find((x) => x.vendorPartyId === vendorId);
      const rate = q?.lines.find((c) => c.rfqLineId === line.id)?.rate ?? 0;
      const cur = map.get(vendorId) ?? {
        name: line.awardedVendorName ?? q?.vendorName ?? "Vendor",
        quote: q,
        won: [],
        value: 0,
      };
      cur.won.push({ line, rate });
      cur.value += rate * line.quantity;
      map.set(vendorId, cur);
    });
    return [...map.entries()];
  }, [rfq]);

  /**
   * Hand one vendor's award to Vyapar's purchase-order form, filled in.
   *
   * Everything below is already known by the time a line is awarded, and re-keying it off the
   * screen you just left is where a rate gets typed wrong. The buyer still reviews and saves — this
   * fills the form, it does not raise the order.
   */
  function raisePo(vendorPartyId: number, v: (typeof byVendor)[number][1]) {
    const q = v.quote;
    // A whole-quote discount or freight figure was quoted against the whole order. If this vendor
    // only won part of it, applying those numbers unchanged would understate what we owe, so they
    // are carried only on a clean sweep and otherwise handed over as a note for the buyer to judge.
    const quotedLines = q?.lines.filter((l) => l.rate != null).length ?? 0;
    const sweep = quotedLines > 0 && v.won.length === quotedLines;
    const taxCode = gstCodeForPercent(q?.taxPercent);

    const lines: PoDraft["lines"] = v.won.map(({ line, rate }) => ({
      itemId: line.itemId,
      itemName: line.itemName,
      description: line.specification ?? "",
      unit: vyaparUnit(line.unit),
      quantity: line.quantity,
      rate,
      taxCode,
    }));
    if (sweep && q?.charges) {
      // Freight is real money on the order, so it goes in as a line rather than a footnote —
      // otherwise the PO total stops matching the quote that was accepted.
      lines.push({
        itemId: null,
        itemName: "Freight / other charges",
        description: `As quoted on ${rfq.rfqNo}`,
        unit: "NONE",
        quantity: 1,
        rate: q.charges,
        taxCode: "NONE",
      });
    }

    const notes = [
      `Awarded from ${rfq.rfqNo} — ${rfq.title}.`,
      q?.receivedOn ? `Quote v${q.version} received ${q.receivedOn}.` : null,
      ...v.won.filter((w) => w.line.awardReason).map((w) => `${w.line.itemName}: ${w.line.awardReason}`),
      !sweep && q?.discount ? `Vendor quoted a ${inr(q.discount)} discount on the full order.` : null,
      !sweep && q?.charges ? `Vendor quoted ${inr(q.charges)} freight on the full order.` : null,
      q?.note ? `Vendor note: ${q.note}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    stashPoDraft({
      rfqId: rfq.id,
      rfqNo: rfq.rfqNo,
      partyId: vendorPartyId,
      partyName: v.name,
      projectId: rfq.projectId,
      orderDate: new Date().toISOString().slice(0, 10),
      deliveryDate: rfq.deliveryDate,
      terms: rfq.terms,
      notes,
      discountAmount: sweep ? (q?.discount ?? 0) : 0,
      lines,
    });
    router.push("/vyapar/purchase-order?new=1&from=rfq");
  }

  function awardAllCheapest() {
    perLine.forEach((p, i) => {
      if (p.cheapest) onAward(rfq.id, rfq.lines[i].id, p.cheapest.vendorPartyId, "Lowest quote");
    });
  }

  function exportPdf() {
    const head = ["Item", "Qty", ...rfq.quotes.map((q) => q.vendorName)];
    const rows = rfq.lines.map((line) => [
      line.itemName,
      `${line.quantity} ${line.unit ?? ""}`.trim(),
      ...rfq.quotes.map((q) => {
        const r = q.lines.find((c) => c.rfqLineId === line.id)?.rate;
        return r == null ? "No quote" : inr(r);
      }),
    ]);
    rows.push(["Total", "", ...totals.map((t) => inr(t.total))]);
    rows.push(["Awarded to", "", ...rfq.quotes.map((q) =>
      rfq.lines.some((l) => l.awardedVendorPartyId === q.vendorPartyId) ? "Yes" : "—")]);
    downloadPdf(`Comparative Statement — ${rfq.rfqNo}`, head, rows, {
      subtitle: rfq.title,
      rightAlignFrom: 2,
    });
  }

  return (
    <div className="space-y-4">
      {/* ---- Standings: who is cheapest overall, before a single cell is read ---- */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {standings.map((s, place) => {
          const dimmed = focus != null && focus !== s.qi;
          return (
            <button
              key={s.quote.id}
              onClick={() => setFocus((f) => (f === s.qi ? null : s.qi))}
              className={`rounded-xl border p-3 text-left transition-all duration-150 ${
                place === 0 ? "border-emerald-300 bg-emerald-50/60" : "border-gray-200 bg-white"
              } ${dimmed ? "opacity-40" : ""} ${focus === s.qi ? "ring-2 ring-brand-accent/50" : "hover:border-brand-accent"}`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                    place === 0 ? "bg-emerald-600 text-white" : "bg-gray-200 text-gray-600"
                  }`}
                >
                  {place + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-800">
                  {s.quote.vendorName}
                </span>
                {place === 0 && <Crown size={14} className="shrink-0 text-emerald-600" />}
              </div>
              <p className={`mt-2 text-lg font-bold tabular-nums ${place === 0 ? "text-emerald-800" : "text-gray-900"}`}>
                {inr(s.total)}
              </p>
              <p className="text-[11px] tabular-nums text-gray-500">
                {s.delta > 0 ? `+${inr(s.delta)} vs lowest` : "Lowest total"}
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">
                  {s.quoted}/{rfq.lines.length} quoted
                </span>
                {s.cheapestOn > 0 && (
                  <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800">
                    Cheapest on {s.cheapestOn}
                  </span>
                )}
                {s.quote.deliveryDays != null && (
                  <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] text-sky-800">
                    {s.quote.deliveryDays}d
                  </span>
                )}
                {s.wonLines > 0 && (
                  <span className="rounded bg-brand-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-brand-accent">
                    Awarded {s.wonLines}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-500">
          {rfq.quotes.length} quotes · {summary.decided} of {summary.of} lines decided
          {rfq.dueBy && <> · replies due {rfq.dueBy}</>}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={awardAllCheapest}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition-colors duration-150 hover:border-brand-accent hover:text-brand-accent"
          >
            <Zap size={14} /> Award all to cheapest
          </button>
          <button
            onClick={exportPdf}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition-colors duration-150 hover:border-brand-accent hover:text-brand-accent"
          >
            <FileDown size={14} /> Export
          </button>
        </div>
      </div>

      {/* Legend — the colours mean something specific, so say what. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-gray-50 px-3 py-2 text-[11px] text-gray-600">
        <span className="font-medium text-gray-500">Rate vs cheapest on that line:</span>
        {(["best", "close", "high", "worst"] as ToneKey[]).map((k) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-sm ${TONES[k].bar}`} />
            {k === "best"
              ? "Lowest (or within 2%)"
              : k === "close"
                ? "Up to 7% more"
                : k === "high"
                  ? "7–20% more"
                  : "Over 20% more"}
          </span>
        ))}
      </div>

      {/* The matrix. The item spine is sticky so vendor columns can scroll under it. */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="sticky left-0 z-10 min-w-[260px] bg-gray-50 px-4 py-3 text-left text-[11px] font-semibold tracking-wide text-gray-500 uppercase">
                Item
              </th>
              {rfq.quotes.map((q, qi) => {
                const place = standings.findIndex((s) => s.qi === qi);
                const dimmed = focus != null && focus !== qi;
                return (
                  <th
                    key={q.id}
                    className={`min-w-[200px] border-l border-t-4 border-gray-200 px-4 py-3 text-left align-top transition-opacity duration-150 ${
                      COLUMN_ACCENTS[qi % COLUMN_ACCENTS.length]
                    } ${dimmed ? "opacity-30" : ""} ${place === 0 ? "bg-emerald-50/50" : ""}`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-gray-800">{q.vendorName}</span>
                      {place === 0 && <Crown size={12} className="shrink-0 text-emerald-600" />}
                    </div>
                    <div className="mt-0.5 text-[11px] font-normal text-gray-400">
                      Quote {q.version}
                      {q.receivedOn && <> · {q.receivedOn}</>}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] font-normal">
                      {q.source === "VENDOR" && (
                        <span
                          className="inline-flex items-center gap-1 rounded bg-violet-100 px-1.5 py-0.5 font-medium text-violet-800"
                          title="The supplier filled this in themselves from their quote link"
                        >
                          <UserCheck size={9} /> Vendor filled
                        </span>
                      )}
                      {q.deliveryDays != null && (
                        <span className="rounded bg-sky-100 px-1.5 py-0.5 text-sky-800">{q.deliveryDays}d delivery</span>
                      )}
                      {!!q.discount && (
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600">disc {inr(q.discount)}</span>
                      )}
                    </div>
                    <div className={`mt-1.5 text-xs font-semibold ${place === 0 ? "text-emerald-800" : "text-gray-700"}`}>
                      {inr(totals[qi].total)}
                    </div>
                    {q.locked && (
                      <button
                        onClick={() => onUnlock(rfq.id, q.id)}
                        title="Reopen this supplier's link so they can revise their quote"
                        className="mt-1 inline-flex items-center gap-1 text-[10px] font-medium text-gray-400 transition-colors duration-150 hover:text-brand-accent"
                      >
                        <Unlock size={9} /> Allow revision
                      </button>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {rfq.lines.map((line, i) => {
              const { offers, best, worst, level, rank } = perLine[i];
              return (
                <tr key={i} className="border-b border-gray-100 align-top last:border-b-0">
                  {/* Spine: what was asked for, and who is getting it */}
                  <td className="sticky left-0 z-10 bg-white px-4 py-3">
                    <div className="font-medium text-gray-800">{line.itemName}</div>
                    <div className="mt-0.5 text-xs text-gray-400">
                      {line.quantity} {line.unit ?? ""}
                      {line.budgetRate != null && <> · budget {inr(line.budgetRate)}</>}
                    </div>
                    <div className="mt-2">
                      <Select
                        value={line.awardedVendorPartyId != null ? String(line.awardedVendorPartyId) : ""}
                        onChange={(v) => onAward(rfq.id, line.id, v ? Number(v) : null)}
                        size="sm"
                        placeholder="Not decided"
                        className="w-full"
                        options={[
                          { value: "", label: "Not decided" },
                          ...offers.map((o) => ({ value: String(o.vendorPartyId), label: o.vendorName })),
                        ]}
                      />
                    </div>
                    {line.awardedVendorPartyId != null && (
                      <input
                        defaultValue={line.awardReason ?? ""}
                        onBlur={(e) => onAward(rfq.id, line.id, line.awardedVendorPartyId, e.target.value)}
                        placeholder="Reason (optional)"
                        className="mt-1.5 w-full rounded-md border border-gray-200 px-2 py-1 text-xs outline-none focus:border-cyan-500"
                      />
                    )}
                  </td>

                  {/* One cell per vendor */}
                  {rfq.quotes.map((q, qi) => {
                    const cell = q.lines.find((c) => c.rfqLineId === line.id);
                    const rate = cell?.rate ?? null;
                    const won = line.awardedVendorPartyId === q.vendorPartyId;
                    const dimmed = focus != null && focus !== qi;

                    if (rate == null) {
                      return (
                        <td
                          key={q.id}
                          className={`border-l border-gray-100 bg-gray-50/60 px-4 py-3 transition-opacity duration-150 ${
                            dimmed ? "opacity-30" : ""
                          }`}
                        >
                          <span className="text-xs text-gray-400 italic">No quote</span>
                          {cell?.note && <div className="mt-0.5 text-[11px] text-gray-400">{cell.note}</div>}
                        </td>
                      );
                    }

                    const delta = best != null && best > 0 ? ((rate - best) / best) * 100 : 0;
                    const isBest = best != null && rate === best;
                    const isLevel = level.has(qi) && !isBest;
                    const tone = TONES[toneFor(delta)];
                    const overBudget = line.budgetRate != null && rate > line.budgetRate;
                    // Bar length is the gap from cheapest to dearest on this line, so a row where
                    // everyone is within a rupee stays visibly flat instead of being dramatised.
                    const spread = best != null && worst != null && worst > best ? (rate - best) / (worst - best) : 0;

                    return (
                      <td
                        key={q.id}
                        className={`border-l border-gray-100 px-4 py-3 transition-all duration-150 ${tone.cell} ${
                          won ? "ring-2 ring-inset ring-emerald-500" : ""
                        } ${dimmed ? "opacity-30" : ""}`}
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <div className={`tabular-nums ${tone.rate}`}>
                            {inr(rate)}
                            {line.unit && <span className="text-xs font-normal text-gray-400">/{line.unit}</span>}
                          </div>
                          <span className="shrink-0 text-[10px] font-medium text-gray-400 tabular-nums">
                            #{rank.get(qi)}/{offers.length}
                          </span>
                        </div>
                        <div className="mt-0.5 text-xs text-gray-500 tabular-nums">{inr(rate * line.quantity)}</div>

                        {/* The gap, drawn. Length is position between cheapest and dearest. */}
                        <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/70">
                          <div
                            className={`h-full rounded-full ${tone.bar}`}
                            style={{ width: `${Math.max(6, spread * 100)}%` }}
                          />
                        </div>

                        {/* Signals: always a word and a number, never colour alone. */}
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {won && (
                            <span className="inline-flex items-center gap-1 rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                              <Check size={10} /> Awarded
                            </span>
                          )}
                          {isBest && !won && (
                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${tone.chip}`}>
                              Lowest
                            </span>
                          )}
                          {isLevel && (
                            <span
                              className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800"
                              title={`Within ${LEVEL_BAND * 100}% of the lowest — treat as level`}
                            >
                              Level
                            </span>
                          )}
                          {!isBest && !isLevel && (
                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${tone.chip}`}>
                              +{delta.toFixed(1)}%
                            </span>
                          )}
                          {overBudget && (
                            <span className="inline-flex items-center gap-1 rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
                              <AlertTriangle size={9} /> Over budget
                            </span>
                          )}
                        </div>
                        {cell?.note && <div className="mt-1 text-[11px] text-gray-500">{cell.note}</div>}
                      </td>
                    );
                  })}
                </tr>
              );
            })}

            {/* Whole-quote terms, below the lines they apply to */}
            <tr className="border-t border-gray-200 bg-gray-50/60 text-xs">
              <td className="sticky left-0 z-10 bg-gray-50/60 px-4 py-3 font-medium text-gray-500">
                Discount · Charges · Tax
              </td>
              {rfq.quotes.map((q, qi) => {
                const place = standings.findIndex((s) => s.qi === qi);
                const dimmed = focus != null && focus !== qi;
                return (
                  <td
                    key={q.id}
                    className={`border-l border-gray-100 px-4 py-3 text-gray-600 tabular-nums transition-opacity duration-150 ${
                      dimmed ? "opacity-30" : ""
                    } ${place === 0 ? "bg-emerald-50/60" : ""}`}
                  >
                    <div>Sub {inr(totals[qi].subtotal)}</div>
                    {!!q.discount && <div className="text-emerald-700">− {inr(q.discount)} discount</div>}
                    {!!q.charges && <div>+ {inr(q.charges)} charges</div>}
                    <div>+ {inr(totals[qi].tax)} tax</div>
                    <div className={`mt-1 font-semibold ${place === 0 ? "text-emerald-800" : "text-gray-800"}`}>
                      {inr(totals[qi].total)}
                    </div>
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Pinned decision bar — the number the choice actually turns on. */}
      <div className="sticky bottom-0 z-20 rounded-xl border border-gray-200 bg-white/95 p-4 shadow-lg backdrop-blur">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-wrap gap-6">
            <Figure label="Current selection" value={inr(summary.selected)} strong />
            <Figure
              label="All-cheapest"
              value={inr(summary.cheapest)}
              delta={summary.selected - summary.cheapest}
              hint="What it would cost taking the lowest quote on every line"
            />
            {summary.budget > 0 && (
              <Figure
                label="Budget"
                value={inr(summary.budget)}
                delta={summary.selected - summary.budget}
                hint="From the agreed rate cards"
              />
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {byVendor.length === 0 ? (
              <span className="text-sm text-gray-400">Decide at least one line to award.</span>
            ) : (
              <span className="text-sm text-gray-500">
                {byVendor.length} purchase order{byVendor.length > 1 ? "s" : ""} to raise
              </span>
            )}
          </div>
        </div>

        {/* One button per winning vendor — because that is one purchase order each, prefilled. */}
        {byVendor.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2 border-t border-gray-100 pt-3">
            {byVendor.map(([vendorPartyId, v]) => (
              <button
                key={vendorPartyId}
                onClick={() => raisePo(vendorPartyId, v)}
                title={`Open a purchase order for ${v.name}, filled in from this award`}
                className="flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-opacity duration-150 hover:opacity-90"
              >
                <span>
                  Raise PO · {v.name} · {v.won.length} line{v.won.length > 1 ? "s" : ""} · {inr(v.value)}
                </span>
                <ArrowRight size={13} />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Figure({
  label,
  value,
  delta,
  strong,
  hint,
}: {
  label: string;
  value: string;
  delta?: number;
  strong?: boolean;
  hint?: string;
}) {
  return (
    <div title={hint}>
      <div className="text-[11px] font-medium tracking-wide text-gray-400 uppercase">{label}</div>
      <div className={`tabular-nums ${strong ? "text-xl font-semibold text-gray-900" : "text-base text-gray-700"}`}>
        {value}
      </div>
      {delta != null && Math.round(delta) !== 0 && (
        <div className={`text-xs tabular-nums ${delta > 0 ? "text-amber-700" : "text-emerald-700"}`}>
          {delta > 0 ? "+" : "−"}
          {inr(Math.abs(delta))} {delta > 0 ? "more" : "less"}
        </div>
      )}
    </div>
  );
}
