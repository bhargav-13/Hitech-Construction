"use client";

import Link from "next/link";
import { ArrowUpRight, Building2, Download, Paperclip, Pencil, Trash2, User, Wallet, X } from "lucide-react";
import { useDrawerDismiss } from "@/lib/useDrawerDismiss";
import { RowMenu, RowMenuItem } from "@/components/RowMenu";
import { inr } from "@/lib/format";
import { amountInWords } from "@/lib/vyaparExport";

export type TxnTone = "in" | "out";

export interface TxnParty {
  caption: string;
  name: string;
  /** Account (wallet) or counterparty (person/business) — only changes the icon. */
  kind: "account" | "party";
}

export interface TxnDetailRow {
  label: string;
  value: React.ReactNode;
}

export interface TxnLinkedDoc {
  key: string;
  label: string;
  sub?: string;
  amount: number;
  href?: string | null;
}

/**
 * Read-only receipt view for a money movement — Payment-In, Payment-Out or an Expense.
 *
 * Laid out the way the client's reference app (Onsite) shows a payment: the amount large with the
 * words under it, a status pill, a "paid by → paid to" card that makes the direction of money
 * obvious at a glance, then the facts as label/value rows. Clicking a row in the lists used to
 * throw you straight into an editor (or the link dialog), with no way to just look at an entry.
 */
export function TransactionDetailDrawer({
  title,
  subtitle,
  tone,
  number,
  amountLabel,
  amount,
  status,
  from,
  to,
  rows,
  linked,
  linkedTitle = "Settled against",
  attachment,
  approval,
  onClose,
  onEdit,
  editLabel = "Edit",
  onDownload,
  onDelete,
}: {
  title: string;
  subtitle?: string;
  tone: TxnTone;
  number?: string | null;
  amountLabel: string;
  amount: number;
  status?: { label: string; tone: "good" | "warn" | "muted" | "bad" } | null;
  from: TxnParty;
  to: TxnParty;
  rows: TxnDetailRow[];
  linked?: TxnLinkedDoc[];
  linkedTitle?: string;
  attachment?: { name: string; href: string } | null;
  /** The approval block (ladder, trail, approve/reject), when this entry went through a chain. */
  approval?: React.ReactNode;
  onClose: () => void;
  onEdit?: () => void;
  editLabel?: string;
  onDownload?: () => void;
  onDelete?: () => void;
}) {
  const { closing, requestClose } = useDrawerDismiss(onClose);
  const bar = tone === "in" ? "bg-emerald-500" : "bg-violet-600";
  const statusClass = {
    good: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
    warn: "bg-amber-50 text-amber-700 ring-amber-600/20",
    muted: "bg-gray-100 text-gray-600 ring-gray-500/20",
    bad: "bg-rose-50 text-rose-700 ring-rose-600/20",
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex justify-end bg-black/40 ${closing ? "animate-overlay-out" : "animate-overlay-in"}`}
      onClick={requestClose}
    >
      <div
        className={`flex h-full w-full max-w-lg flex-col bg-white shadow-2xl ${
          closing ? "animate-slide-out-right" : "animate-slide-in-right"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={requestClose}
              aria-label="Close"
              className="rounded-full p-1 text-gray-500 transition-all duration-150 hover:bg-gray-100 active:scale-90"
            >
              <X size={18} />
            </button>
            <div className="min-w-0">
              <h2 className="text-sm font-bold tracking-wide text-gray-900 uppercase">{title}</h2>
              {subtitle && <p className="truncate text-xs text-gray-500">{subtitle}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onEdit && (
              <IconButton label={editLabel} onClick={onEdit}>
                <Pencil size={16} />
              </IconButton>
            )}
            {onDownload && (
              <IconButton label="Download PDF" onClick={onDownload}>
                <Download size={16} />
              </IconButton>
            )}
            {onDelete && (
              <RowMenu buttonLabel="More actions">
                {(close) => (
                  <RowMenuItem
                    icon={Trash2}
                    label="Delete"
                    tone="danger"
                    onClick={() => {
                      close();
                      onDelete();
                    }}
                  />
                )}
              </RowMenu>
            )}
          </div>
        </div>
        <div className={`h-1.5 w-full ${bar}`} />

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {/* Amount card */}
          <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-4">
            <div className="flex items-center justify-between text-xs font-medium tracking-wide text-gray-500 uppercase">
              <span>{title}</span>
              {number && <span className="normal-case">No. {number}</span>}
            </div>
            <div className="mt-4 text-center">
              <div className="text-xs font-medium tracking-wide text-gray-500 uppercase">{amountLabel}</div>
              <div className="mt-1 text-3xl font-bold text-gray-900">{inr(amount)}</div>
              <div className="mt-1 text-sm text-gray-500">{wordsOf(amount)}</div>
              {status && (
                <span
                  className={`mt-3 inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${statusClass[status.tone]}`}
                >
                  {status.label}
                </span>
              )}
            </div>

            {/* Who paid whom */}
            <div className="mt-5 flex items-center gap-2">
              <PartyBox party={from} />
              <div className="flex shrink-0 items-center" aria-hidden>
                <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                <span className="w-8 border-t-2 border-dotted border-rose-300" />
                <span className="w-8 border-t-2 border-dotted border-sky-300" />
                <span className="h-0 w-0 border-y-4 border-l-[6px] border-y-transparent border-l-sky-400" />
              </div>
              <PartyBox party={to} />
            </div>
          </div>

          {approval && <div className="mt-4">{approval}</div>}

          {/* Facts */}
          <dl className="mt-4 divide-y divide-gray-100">
            {rows.map((r) => (
              <div key={r.label} className="flex items-start justify-between gap-6 py-3.5">
                <dt className="shrink-0 text-xs font-medium tracking-wide text-gray-500 uppercase">{r.label}</dt>
                <dd className="min-w-0 text-right text-sm font-medium break-words text-gray-800">{r.value}</dd>
              </div>
            ))}
          </dl>

          {attachment && (
            <a
              href={attachment.href}
              download={attachment.name}
              target="_blank"
              rel="noreferrer"
              className="mt-2 flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-700 transition-colors hover:border-brand-accent hover:text-brand-accent"
            >
              <Paperclip size={14} className="text-gray-400" />
              <span className="truncate">{attachment.name}</span>
              <Download size={14} className="ml-auto shrink-0 text-gray-400" />
            </a>
          )}

          {linked && linked.length > 0 && (
            <div className="mt-5">
              <h4 className="mb-2 text-xs font-semibold tracking-wide text-gray-500 uppercase">{linkedTitle}</h4>
              <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                {linked.map((d) => (
                  <li key={d.key} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                    <div className="min-w-0 flex-1">
                      {d.href ? (
                        <Link href={d.href} className="flex items-center gap-1 font-medium text-gray-800 hover:text-brand-accent">
                          {d.label} <ArrowUpRight size={12} className="text-gray-400" />
                        </Link>
                      ) : (
                        <span className="font-medium text-gray-800">{d.label}</span>
                      )}
                      {d.sub && <div className="text-xs text-gray-400">{d.sub}</div>}
                    </div>
                    <span className="font-medium whitespace-nowrap text-gray-700">{inr(d.amount)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** "Rupees Two Thousand Eighty Two Only" → "Two Thousand Eighty Two Only", as the reference shows it. */
function wordsOf(amount: number): string {
  return amountInWords(amount).replace(/^(Minus )?Rupees /, "$1");
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="rounded-lg border border-gray-200 p-2 text-gray-600 transition-all duration-150 hover:border-brand-accent hover:text-brand-accent active:scale-95"
    >
      {children}
    </button>
  );
}

function PartyBox({ party }: { party: TxnParty }) {
  const Icon = party.kind === "account" ? Wallet : party.name ? User : Building2;
  return (
    <div className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
      <div className="text-[10px] font-medium tracking-wide text-gray-500 uppercase">{party.caption}</div>
      <div className="mt-2 flex items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500">
          <Icon size={14} />
        </span>
        <span className="line-clamp-2 text-sm font-semibold text-gray-800">{party.name || "—"}</span>
      </div>
    </div>
  );
}
