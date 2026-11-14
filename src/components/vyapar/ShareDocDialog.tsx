"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Download, Mail, MessageCircle, Share2, X } from "lucide-react";
import { API_BASE_URL, apiRequest } from "@/lib/api";
import { uploadFile } from "@/lib/filesApi";
import { inr } from "@/lib/format";
import { invoicePrintModel } from "@/lib/vyaparExport";
import type { Invoice, Party } from "@/lib/vyaparApi";
import { Spinner } from "@/components/Spinner";

export type ShareChannel = "whatsapp" | "email";

/**
 * Send a document's PDF to its party on WhatsApp or by email.
 *
 * Neither wa.me nor mailto: can carry an attachment, so the PDF is filed against the document
 * (Files → Vyapar) and sent as a link that opens it without a login — the server signs it and
 * exchanges it for a fresh storage URL each time it is opened. On a phone, "Share PDF" hands the
 * file itself to the share sheet, which WhatsApp accepts as an attachment.
 *
 * WhatsApp opens with the number and message filled in; email opens the person's own mail app
 * with the address, subject and message filled in. Nothing is sent until they press send there.
 */
export function ShareDocDialog({
  invoice,
  party,
  items,
  channel: initialChannel,
  noun,
  onClose,
}: {
  invoice: Invoice;
  party?: Party | null;
  items?: { id: number; hsn: string | null }[];
  channel: ShareChannel;
  /** "Purchase Order", "Sale Invoice" … for the message. */
  noun: string;
  onClose: () => void;
}) {
  const [channel, setChannel] = useState<ShareChannel>(initialChannel);
  const [phone, setPhone] = useState(cleanPhone(party?.phone ?? ""));
  const [email, setEmail] = useState(party?.email ?? "");
  const [link, setLink] = useState<string | null>(null);
  const [pdf, setPdf] = useState<File | null>(null);
  const [preparing, setPreparing] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const no = invoice.invoiceNo || `#${invoice.id}`;
  const partyName = party?.name ?? invoice.partyName ?? "";
  const [message, setMessage] = useState("");
  const touched = useRef(false);

  // Build the PDF, file it against the document and mint the link — once, when the dialog opens.
  useEffect(() => {
    let off = false;
    (async () => {
      try {
        const [{ renderDocPdf }, model] = await Promise.all([import("@/lib/docPdf"), invoicePrintModel(invoice, party, items)]);
        const doc = await renderDocPdf(model, { save: false });
        const blob = (doc as unknown as { output: (t: "blob") => Blob }).output("blob");
        const file = new File([blob], `${safeName(no)}.pdf`, { type: "application/pdf" });
        if (off) return;
        setPdf(file);
        const node = await uploadFile(file, {
          projectId: invoice.projectId ?? null,
          source: { module: "VYAPAR", type: "SHARED_PDF", id: invoice.id, label: `${noun} ${no}`, party: partyName || undefined },
        });
        const fileId = node.fileId;
        if (fileId == null) throw new Error("The PDF didn't upload. Try again.");
        const r = await apiRequest<{ path: string }>(`/api/v1/files/${fileId}/share-link`, { method: "POST" });
        if (!off) setLink(absolute(r.path));
      } catch (e) {
        if (!off) setError(e instanceof Error ? e.message : "Couldn't prepare the PDF link.");
      } finally {
        if (!off) setPreparing(false);
      }
    })();
    return () => {
      off = true;
    };
    // Built once per opened dialog; the document doesn't change underneath it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The default message, until the person edits it.
  useEffect(() => {
    if (touched.current) return;
    const lines = [
      `Dear ${partyName || "Sir/Madam"},`,
      "",
      `Please find our ${noun} ${no} dated ${invoice.invoiceDate ?? ""} for ${inr(invoice.total)}.`,
      link ? `PDF: ${link}` : "",
      "",
      "Regards",
    ];
    setMessage(lines.filter((l, i) => l !== "" || i !== 3).join("\n"));
  }, [link, partyName, noun, no, invoice.invoiceDate, invoice.total]);

  const subject = `${noun} ${no}${partyName ? ` — ${partyName}` : ""}`;
  const waNumber = phone.length === 10 ? `91${phone}` : phone;
  const canShareFile =
    typeof navigator !== "undefined" &&
    !!pdf &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [pdf] });

  function openWhatsApp() {
    const url = `https://wa.me/${waNumber}?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function openEmail() {
    const url = `mailto:${encodeURIComponent(email.trim())}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
    window.location.href = url;
  }

  async function shareFile() {
    if (!pdf) return;
    try {
      await navigator.share({ files: [pdf], title: subject, text: message });
    } catch {
      // Cancelled from the share sheet — nothing to do.
    }
  }

  function downloadFile() {
    if (!pdf) return;
    const url = URL.createObjectURL(pdf);
    const a = document.createElement("a");
    a.href = url;
    a.download = pdf.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the link is visible to copy by hand */
    }
  }

  const ready = !preparing && !!link;
  const phoneOk = /^\d{10,15}$/.test(waNumber);
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/30" onClick={onClose} />
      <div className="animate-fade-in fixed top-1/2 left-1/2 z-50 w-[min(520px,94vw)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-gray-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-800">
            <Share2 size={15} className="text-brand-accent" /> Share {noun} {no}
          </h3>
          <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-gray-400 hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-1">
            {(["whatsapp", "email"] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setChannel(c)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  channel === c ? "bg-white text-gray-800 shadow-sm" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {c === "whatsapp" ? <MessageCircle size={13} className="text-emerald-600" /> : <Mail size={13} className="text-sky-600" />}
                {c === "whatsapp" ? "WhatsApp" : "Email"}
              </button>
            ))}
          </div>

          {channel === "whatsapp" ? (
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium tracking-wide text-gray-400 uppercase">WhatsApp number</span>
              <input
                value={phone}
                onChange={(e) => setPhone(cleanPhone(e.target.value))}
                placeholder="10-digit mobile number"
                inputMode="tel"
                className="input"
              />
              {!party?.phone && <span className="mt-1 block text-[11px] text-gray-400">No number on this party — type one, or save it on the party.</span>}
            </label>
          ) : (
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium tracking-wide text-gray-400 uppercase">Email</span>
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" inputMode="email" className="input" />
              {!party?.email && <span className="mt-1 block text-[11px] text-gray-400">No email on this party — type one, or save it on the party.</span>}
            </label>
          )}

          <label className="block">
            <span className="mb-1 block text-[11px] font-medium tracking-wide text-gray-400 uppercase">Message</span>
            <textarea
              value={message}
              onChange={(e) => {
                touched.current = true;
                setMessage(e.target.value);
              }}
              rows={6}
              className="input resize-none font-[inherit] text-sm"
            />
          </label>

          <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs">
            {preparing ? (
              <span className="flex items-center gap-2 text-gray-500">
                <Spinner size={12} className="text-brand-accent" /> Preparing the PDF link…
              </span>
            ) : link ? (
              <span className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-gray-600" title={link}>
                  {link}
                </span>
                <button type="button" onClick={copy} className="flex shrink-0 items-center gap-1 font-medium text-brand-accent hover:underline">
                  {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "Copied" : "Copy link"}
                </button>
              </span>
            ) : (
              <span className="text-rose-600">{error || "Couldn't prepare the PDF link."}</span>
            )}
          </div>
          {link && <p className="text-[11px] text-gray-400">Anyone with the link can open this PDF for 60 days.</p>}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-100 px-5 py-3">
          {pdf && (
            <button
              type="button"
              onClick={downloadFile}
              className="mr-auto flex items-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium text-gray-500 hover:bg-gray-100"
            >
              <Download size={13} /> PDF
            </button>
          )}
          {canShareFile && (
            <button
              type="button"
              onClick={shareFile}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <Share2 size={14} /> Share PDF
            </button>
          )}
          {channel === "whatsapp" ? (
            <button
              type="button"
              disabled={!ready || !phoneOk}
              onClick={openWhatsApp}
              title={!phoneOk ? "Enter a WhatsApp number" : undefined}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <MessageCircle size={14} /> Open WhatsApp
            </button>
          ) : (
            <button
              type="button"
              disabled={!ready || !emailOk}
              onClick={openEmail}
              title={!emailOk ? "Enter an email address" : undefined}
              className="flex items-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Mail size={14} /> Open Email
            </button>
          )}
        </div>
      </div>
    </>
  );
}

function cleanPhone(v: string) {
  return v.replace(/\D/g, "").replace(/^0+/, "").slice(0, 15);
}

function safeName(v: string) {
  return v.replace(/[^\w.-]+/g, "_").slice(0, 80) || "document";
}

/** The share path is on the API server; a relative API base (same-origin proxy) resolves against this page. */
function absolute(path: string) {
  try {
    return new URL(path, API_BASE_URL.startsWith("http") ? API_BASE_URL : window.location.origin).toString();
  } catch {
    return path;
  }
}
