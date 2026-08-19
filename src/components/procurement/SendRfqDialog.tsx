"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Link2, Mail, MessageCircle, Send, TriangleAlert, X } from "lucide-react";
import * as procurement from "@/lib/procurementApi";
import type { Rfq } from "@/lib/procurementApi";

/**
 * What opens the moment an enquiry is saved and sent.
 *
 * Two ways out, and only one of them works today:
 *
 *  - **Share link** — the server mints a separate link per supplier and we hand it over on
 *    WhatsApp. This is the real path. It is also how these enquiries already travel: a yard in
 *    Rajkot is never going to open an email client, but they will reply to a WhatsApp message in
 *    ten minutes.
 *  - **Email** — composed here, not yet delivered. No mail service is connected, so the button
 *    says so plainly instead of pretending the message went out. The screen is built now because
 *    the content and the placeholders are what will be wired when it is.
 *
 * The links are per supplier, not per enquiry: the link identifies who is quoting, so nobody can
 * see or overwrite a rival's prices, and a forwarded link exposes one supplier's own quote rather
 * than the whole comparison.
 */
export function SendRfqDialog({
  rfq,
  onClose,
  onSent,
}: {
  rfq: Rfq;
  onClose: () => void;
  /** Fires with the RFQ as the server left it, so the caller's copy stays in step. */
  onSent?: (rfq: Rfq) => void;
}) {
  const [tab, setTab] = useState<"link" | "email">("link");
  const [current, setCurrent] = useState<Rfq>(rfq);
  const [minting, setMinting] = useState(!rfq.suppliers.some((s) => s.shareToken));
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<string>("");

  // Sending is what mints the links, so do it as the dialog opens rather than behind another
  // button — by the time this is on screen the buyer has already pressed "Save and Send".
  useEffect(() => {
    if (rfq.suppliers.some((s) => s.shareToken)) return;
    let alive = true;
    procurement
      .sendRfq(rfq.id)
      .then((next) => {
        if (!alive) return;
        setCurrent(next);
        onSent?.(next);
      })
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : "Couldn't create the quote links."))
      .finally(() => alive && setMinting(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rfq.id]);

  const suppliers = current.suppliers;
  const missingEmail = suppliers.filter((s) => !s.email?.trim()).length;

  function copy(text: string, key: string) {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? "" : c)), 1800);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-start justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Send Enquiry</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              {current.rfqNo} · {suppliers.length} supplier{suppliers.length === 1 ? "" : "s"}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1 text-gray-400 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-600"
          >
            <X size={18} />
          </button>
        </header>

        <div className="flex gap-1 border-b border-gray-100 px-6 pt-3">
          {(
            [
              ["link", "Share link", Link2],
              ["email", "Email", Mail],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 border-b-2 px-3 pb-2.5 text-sm font-medium transition-colors duration-150 ${
                tab === key
                  ? "border-brand-accent text-brand-accent"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {error && (
            <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
          )}
          {tab === "link" ? (
            <ShareLinkTab
              suppliers={suppliers}
              rfq={current}
              minting={minting}
              copied={copied}
              onCopy={copy}
            />
          ) : (
            <EmailTab rfq={current} missingEmail={missingEmail} />
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-gray-100 bg-gray-50 px-6 py-3">
          <p className="text-xs text-gray-500">
            {tab === "link"
              ? "Each supplier gets their own link. They only ever see their own prices."
              : "Email delivery isn't connected yet — share the link instead."}
          </p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors duration-150 hover:border-gray-400"
            >
              {tab === "link" ? "Done" : "Cancel"}
            </button>
            {tab === "email" && (
              <button
                disabled
                title="No mail service is connected yet. Use the Share link tab."
                className="flex cursor-not-allowed items-center gap-1.5 rounded-lg bg-gray-300 px-4 py-2 text-sm font-medium text-white"
              >
                <Send size={14} /> Send
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- share link

function ShareLinkTab({
  suppliers,
  rfq,
  minting,
  copied,
  onCopy,
}: {
  suppliers: Rfq["suppliers"];
  rfq: Rfq;
  minting: boolean;
  copied: string;
  onCopy: (text: string, key: string) => void;
}) {
  const message = (name: string, link: string) =>
    `Hello ${name},\n\n${rfq.billToName || "We"} would like your rate for enquiry ${rfq.rfqNo} — ${rfq.title}.` +
    (rfq.biddingEndDate ? `\nPlease reply by ${rfq.biddingEndDate}.` : "") +
    `\n\nYou can fill in your rates here:\n${link}\n\nThank you.`;

  if (minting) {
    return <p className="py-10 text-center text-sm text-gray-400">Creating the quote links…</p>;
  }
  if (suppliers.length === 0) {
    return <p className="py-10 text-center text-sm text-gray-400">No suppliers on this enquiry yet.</p>;
  }

  const all = suppliers
    .filter((s) => s.shareToken)
    .map((s) => `${s.vendorName}: ${procurement.quoteLink(s.shareToken!)}`)
    .join("\n");

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold tracking-wide text-gray-500 uppercase">Quote links</h3>
        <button
          onClick={() => onCopy(all, "all")}
          className="flex items-center gap-1.5 text-xs font-medium text-brand-accent transition-opacity duration-150 hover:opacity-80"
        >
          {copied === "all" ? <Check size={13} /> : <Copy size={13} />}
          {copied === "all" ? "Copied" : "Copy all"}
        </button>
      </div>

      {suppliers.map((s) => {
        const link = s.shareToken ? procurement.quoteLink(s.shareToken) : "";
        const wa = s.phone?.replace(/\D/g, "");
        return (
          <div
            key={s.id}
            className="rounded-xl border border-gray-200 p-3 transition-colors duration-150 hover:border-cyan-300"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cyan-100 text-xs font-semibold text-cyan-700">
                {s.vendorName.slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-800">{s.vendorName}</p>
                <p className="truncate text-xs text-gray-500">
                  {s.phone || "No phone"}
                  {s.email ? ` · ${s.email}` : ""}
                </p>
              </div>
              {s.responded ? (
                <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                  Quoted
                </span>
              ) : s.openedAt ? (
                <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                  Opened
                </span>
              ) : null}
            </div>

            {link && (
              <div className="mt-2.5 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-lg bg-gray-50 px-2.5 py-1.5 text-[11px] text-gray-600">
                  {link}
                </code>
                <button
                  onClick={() => onCopy(link, String(s.id))}
                  className="flex shrink-0 items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 transition-colors duration-150 hover:border-brand-accent hover:text-brand-accent"
                >
                  {copied === String(s.id) ? <Check size={12} /> : <Copy size={12} />}
                  {copied === String(s.id) ? "Copied" : "Copy"}
                </button>
                {wa && (
                  <a
                    href={`https://wa.me/${wa.length === 10 ? "91" + wa : wa}?text=${encodeURIComponent(
                      message(s.vendorName, link),
                    )}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex shrink-0 items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white transition-opacity duration-150 hover:opacity-90"
                  >
                    <MessageCircle size={12} /> WhatsApp
                  </a>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// -------------------------------------------------------------------- email

const PLACEHOLDERS = [
  "{{vendor_name}}",
  "{{company_name}}",
  "{{rfq_number}}",
  "{{rfq_link}}",
  "{{bidding_start_date}}",
  "{{bidding_end_date}}",
];

function EmailTab({ rfq, missingEmail }: { rfq: Rfq; missingEmail: number }) {
  const [senderName, setSenderName] = useState(rfq.billToName ?? "");
  const [senderEmail, setSenderEmail] = useState("");
  const [subject, setSubject] = useState(`Request for Quotation — {{rfq_number}}`);
  const [body, setBody] = useState(
    `Dear {{vendor_name}},\n\n{{company_name}} invites your quotation against enquiry {{rfq_number}}.\n\n` +
      `Please submit your rates here: {{rfq_link}}\n\n` +
      `Bidding is open from {{bidding_start_date}} to {{bidding_end_date}}.\n\nRegards,\n{{company_name}}`,
  );

  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-3 text-xs font-semibold tracking-wide text-gray-500 uppercase">Sender details</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[11px] text-gray-500">Sender name</span>
            <input value={senderName} onChange={(e) => setSenderName(e.target.value)} className="input" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] text-gray-500">Sender email</span>
            <input
              value={senderEmail}
              onChange={(e) => setSenderEmail(e.target.value)}
              placeholder="purchase@yourfirm.com"
              className="input"
            />
          </label>
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-xs font-semibold tracking-wide text-gray-500 uppercase">Target suppliers</h3>
        {missingEmail > 0 && (
          <p className="mb-2 flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <TriangleAlert size={13} className="shrink-0" />
            {missingEmail} supplier{missingEmail === 1 ? " has" : "s have"} no email on file. Add it on the party,
            or send them the link instead.
          </p>
        )}
        <div className="divide-y divide-gray-100 rounded-xl border border-gray-200">
          {rfq.suppliers.map((s) => (
            <div key={s.id} className="flex items-center gap-3 px-3 py-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[11px] font-semibold text-gray-600">
                {s.vendorName.slice(0, 2).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-gray-800">{s.vendorName}</span>
              {s.email ? (
                <span className="truncate text-xs text-gray-500">{s.email}</span>
              ) : (
                <span className="text-xs text-amber-600">No email on file</span>
              )}
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-xs font-semibold tracking-wide text-gray-500 uppercase">Email content</h3>
        <label className="mb-3 block">
          <span className="mb-1 block text-[11px] text-gray-500">Subject</span>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} className="input" />
        </label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={9}
          className="input resize-none font-mono text-[13px] leading-relaxed"
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {PLACEHOLDERS.map((p) => (
            <button
              key={p}
              onClick={() => setBody((b) => b + p)}
              className="rounded-full bg-gray-100 px-2.5 py-1 font-mono text-[11px] text-gray-600 transition-colors duration-150 hover:bg-cyan-100 hover:text-cyan-700"
            >
              {p}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
