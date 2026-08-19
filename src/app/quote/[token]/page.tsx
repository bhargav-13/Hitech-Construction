"use client";

import { use, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock, Lock, MapPin, Send, TriangleAlert } from "lucide-react";
import { Spinner } from "@/components/Spinner";
import * as procurement from "@/lib/procurementApi";
import type { PublicRfq } from "@/lib/procurementApi";

/**
 * The supplier's quotation form. No login, opened from a link.
 *
 * This page is the reason the module is worth having. Until now every price had to be re-typed by
 * the buyer from a WhatsApp photo of a letterhead — six suppliers on one enquiry meant six quotes
 * keyed by hand, and a typo in that keying is a purchase order for the wrong number.
 *
 * Built for a phone first. It arrives as a WhatsApp link and gets opened standing in a yard, so the
 * material list becomes cards below `sm`, the rate field is the only thing that has to be tapped,
 * and the running total is always in view.
 *
 * What the supplier is *not* shown: our budget rate, and anybody else's prices. The token resolves
 * to one supplier on one enquiry, so a forwarded link gives away that supplier's own quote and
 * nothing more.
 */
export default function PublicQuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);

  const [rfq, setRfq] = useState<PublicRfq | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [justSent, setJustSent] = useState(false);

  const [rates, setRates] = useState<Record<number, string>>({});
  const [deliveryDays, setDeliveryDays] = useState("");
  const [taxPercent, setTaxPercent] = useState("");
  const [charges, setCharges] = useState("");
  const [discount, setDiscount] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    procurement
      .getPublicRfq(token)
      .then((r) => {
        setRfq(r);
        setRates(Object.fromEntries(r.lines.map((l) => [l.id, l.rate == null ? "" : String(l.rate)])));
        setDeliveryDays(r.deliveryDays == null ? "" : String(r.deliveryDays));
        setTaxPercent(r.taxPercent == null ? "" : String(r.taxPercent));
        setCharges(r.charges == null ? "" : String(r.charges));
        setDiscount(r.discount == null ? "" : String(r.discount));
        setNote(r.note ?? "");
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "This quote link is not valid any more."),
      )
      .finally(() => setLoading(false));
  }, [token]);

  const num = (v: string) => (v.trim() === "" ? 0 : Number(v) || 0);

  const totals = useMemo(() => {
    if (!rfq) return { sub: 0, quoted: 0, grand: 0 };
    // A blank rate is "not quoting this line", not zero — it is left out of the subtotal rather
    // than counted as free.
    const sub = rfq.lines.reduce(
      (t, l) => (rates[l.id]?.trim() ? t + num(rates[l.id]) * l.quantity : t),
      0,
    );
    const quoted = rfq.lines.filter((l) => rates[l.id]?.trim()).length;
    const afterTerms = sub - num(discount) + num(charges);
    return { sub, quoted, grand: afterTerms + (afterTerms * num(taxPercent)) / 100 };
  }, [rfq, rates, discount, charges, taxPercent]);

  const money = (n: number) =>
    n.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });

  async function submit() {
    if (!rfq) return;
    if (totals.quoted === 0) return setError("Enter a rate on at least one item.");
    setSubmitting(true);
    setError("");
    try {
      const next = await procurement.submitPublicQuote(token, {
        deliveryDays: deliveryDays.trim() === "" ? null : Number(deliveryDays),
        discount: num(discount),
        charges: num(charges),
        taxPercent: num(taxPercent),
        note: note.trim() || null,
        lines: rfq.lines.map((l) => ({
          rfqLineId: l.id,
          rate: rates[l.id]?.trim() ? num(rates[l.id]) : null,
        })),
      });
      setRfq(next);
      setJustSent(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Couldn't submit your quotation.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center gap-2 text-sm text-gray-400">
        <Spinner size={16} className="text-cyan-600" /> Loading enquiry…
      </main>
    );
  }

  if (!rfq) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <div className="max-w-sm text-center">
          <TriangleAlert className="mx-auto mb-3 text-amber-500" size={32} />
          <h1 className="text-lg font-semibold text-gray-900">Link not valid</h1>
          <p className="mt-1 text-sm text-gray-500">{error || "Ask the buyer to send you a fresh link."}</p>
        </div>
      </main>
    );
  }

  const readOnly = !rfq.acceptingQuotes;

  return (
    <main className="min-h-screen bg-gray-50 pb-40">
      {/* ---- Header ---- */}
      <header className="bg-gradient-to-r from-cyan-700 to-teal-600 px-5 py-6 text-white sm:px-8">
        <div className="mx-auto max-w-4xl">
          <p className="text-[11px] font-semibold tracking-widest text-cyan-100 uppercase">
            Request for Quotation
          </p>
          <h1 className="mt-1 text-xl font-bold sm:text-2xl">{rfq.title}</h1>
          <p className="mt-1 text-sm text-cyan-50">
            {rfq.rfqNo}
            {rfq.buyerName ? ` · from ${rfq.buyerName}` : ""}
          </p>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-cyan-50">
            {rfq.vendorName && (
              <span>
                Quoting as <strong className="font-semibold text-white">{rfq.vendorName}</strong>
              </span>
            )}
            {rfq.biddingEndDate && (
              <span className="flex items-center gap-1">
                <Clock size={12} /> Reply by {rfq.biddingEndDate}
              </span>
            )}
            {rfq.deliveryDate && <span>Delivery wanted by {rfq.deliveryDate}</span>}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-8">
        {justSent && (
          <div className="mb-5 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-600" size={18} />
            <div>
              <p className="text-sm font-semibold text-emerald-900">Quotation submitted. Thank you.</p>
              <p className="mt-0.5 text-xs text-emerald-700">
                {rfq.buyerName || "The buyer"} can see your rates now. If you need to change anything, ask them to
                reopen your link.
              </p>
            </div>
          </div>
        )}

        {readOnly && !justSent && (
          <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <Lock className="mt-0.5 shrink-0 text-amber-600" size={16} />
            <p className="text-sm text-amber-900">{rfq.closedReason}</p>
          </div>
        )}

        {error && (
          <p className="mb-5 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>
        )}

        {(rfq.shipToName || rfq.shipToAddress) && (
          <div className="mb-5 flex items-start gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3">
            <MapPin size={15} className="mt-0.5 shrink-0 text-gray-400" />
            <div className="text-sm">
              <p className="font-medium text-gray-800">Deliver to {rfq.shipToName}</p>
              {rfq.shipToAddress && <p className="text-gray-500">{rfq.shipToAddress}</p>}
            </div>
          </div>
        )}

        {/* ---- Material list ---- */}
        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-800">Your rates</h2>
            <span className="text-xs text-gray-500">
              {totals.quoted} of {rfq.lines.length} quoted
            </span>
          </div>

          {/* Desktop table */}
          <table className="hidden w-full text-sm sm:table">
            <thead className="bg-gray-50 text-left text-[11px] tracking-wide text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-2 font-medium">Material</th>
                <th className="px-4 py-2 font-medium">HSN</th>
                <th className="px-4 py-2 text-right font-medium">Qty</th>
                <th className="px-4 py-2 text-right font-medium">Your rate (₹)</th>
                <th className="px-4 py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rfq.lines.map((l) => (
                <tr key={l.id} className={rates[l.id]?.trim() ? "" : "bg-gray-50/40"}>
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-gray-800">{l.itemName}</p>
                    {l.specification && <p className="text-xs text-gray-500">{l.specification}</p>}
                    {l.deliveryDate && <p className="text-xs text-amber-600">Wanted by {l.deliveryDate}</p>}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{l.hsnCode || "—"}</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap text-gray-700">
                    {l.quantity} {l.unit}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <input
                      inputMode="decimal"
                      value={rates[l.id] ?? ""}
                      disabled={readOnly}
                      onChange={(e) => setRates((p) => ({ ...p, [l.id]: e.target.value }))}
                      placeholder="—"
                      className="w-28 rounded-lg border border-gray-300 px-2 py-1.5 text-right text-sm outline-none transition-colors duration-150 focus:border-cyan-500 disabled:bg-gray-100"
                    />
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium whitespace-nowrap text-gray-800">
                    {rates[l.id]?.trim() ? `₹${money(num(rates[l.id]) * l.quantity)}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Phone cards — this arrives as a WhatsApp link and gets opened in a yard. */}
          <div className="divide-y divide-gray-100 sm:hidden">
            {rfq.lines.map((l) => (
              <div key={l.id} className="px-4 py-3">
                <p className="text-sm font-medium text-gray-800">{l.itemName}</p>
                {l.specification && <p className="text-xs text-gray-500">{l.specification}</p>}
                <div className="mt-2 flex items-center gap-3">
                  <span className="shrink-0 text-xs text-gray-500">
                    {l.quantity} {l.unit}
                    {l.hsnCode ? ` · HSN ${l.hsnCode}` : ""}
                  </span>
                  <input
                    inputMode="decimal"
                    value={rates[l.id] ?? ""}
                    disabled={readOnly}
                    onChange={(e) => setRates((p) => ({ ...p, [l.id]: e.target.value }))}
                    placeholder="Rate ₹"
                    className="ml-auto w-28 rounded-lg border border-gray-300 px-2 py-1.5 text-right text-sm outline-none focus:border-cyan-500 disabled:bg-gray-100"
                  />
                </div>
                {rates[l.id]?.trim() && (
                  <p className="mt-1 text-right text-xs text-gray-500">
                    = ₹{money(num(rates[l.id]) * l.quantity)}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* ---- Whole-quote terms ---- */}
        <section className="mt-5 rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-gray-800">Your terms</h2>
          <div className="grid gap-3 sm:grid-cols-4">
            <SmallField label="Delivery in (days)">
              <input
                inputMode="numeric"
                value={deliveryDays}
                disabled={readOnly}
                onChange={(e) => setDeliveryDays(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm outline-none focus:border-cyan-500 disabled:bg-gray-100"
              />
            </SmallField>
            <SmallField label="Discount (₹)">
              <input
                inputMode="decimal"
                value={discount}
                disabled={readOnly}
                onChange={(e) => setDiscount(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm outline-none focus:border-cyan-500 disabled:bg-gray-100"
              />
            </SmallField>
            <SmallField label="Freight / other (₹)">
              <input
                inputMode="decimal"
                value={charges}
                disabled={readOnly}
                onChange={(e) => setCharges(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm outline-none focus:border-cyan-500 disabled:bg-gray-100"
              />
            </SmallField>
            <SmallField label="GST (%)">
              <input
                inputMode="decimal"
                value={taxPercent}
                disabled={readOnly}
                onChange={(e) => setTaxPercent(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm outline-none focus:border-cyan-500 disabled:bg-gray-100"
              />
            </SmallField>
          </div>
          <label className="mt-3 block">
            <span className="mb-1 block text-[11px] text-gray-500">Note to the buyer</span>
            <textarea
              value={note}
              disabled={readOnly}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Payment terms, validity, anything you want on record"
              className="w-full resize-none rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm outline-none focus:border-cyan-500 disabled:bg-gray-100"
            />
          </label>
        </section>

        {rfq.terms && (
          <section className="mt-5 rounded-xl border border-gray-200 bg-white p-4">
            <h2 className="mb-2 text-sm font-semibold text-gray-800">Buyer&apos;s terms &amp; conditions</h2>
            <p className="text-sm whitespace-pre-wrap text-gray-600">{rfq.terms}</p>
          </section>
        )}
      </div>

      {/* ---- Running total, pinned: the number they are agreeing to stays in view ---- */}
      <div className="fixed inset-x-0 bottom-0 border-t border-gray-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-8">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] tracking-wide text-gray-500 uppercase">Quotation total</p>
            <p className="text-lg font-bold text-gray-900">₹{money(totals.grand)}</p>
            <p className="text-[11px] text-gray-400">
              Items ₹{money(totals.sub)}
              {num(discount) ? ` − ₹${money(num(discount))}` : ""}
              {num(charges) ? ` + ₹${money(num(charges))}` : ""}
              {num(taxPercent) ? ` + ${taxPercent}% GST` : ""}
            </p>
          </div>
          <button
            onClick={submit}
            disabled={readOnly || submitting}
            className="flex items-center gap-2 rounded-lg bg-cyan-700 px-6 py-2.5 text-sm font-semibold text-white transition-opacity duration-150 hover:opacity-90 disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            {submitting ? <Spinner size={14} /> : <Send size={15} />}
            {readOnly ? "Submitted" : submitting ? "Submitting…" : "Submit quotation"}
          </button>
        </div>
      </div>
    </main>
  );
}

function SmallField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] text-gray-500">{label}</span>
      {children}
    </label>
  );
}
