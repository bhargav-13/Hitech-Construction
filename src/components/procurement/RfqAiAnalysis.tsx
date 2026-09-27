"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileText,
  HelpCircle,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Wand2,
} from "lucide-react";
import { inr } from "@/lib/format";
import { formatDateTimeIST } from "@/lib/datetime";
import { attachmentsFor, fileUrl } from "@/lib/filesApi";
import { fileToPages, pdfText } from "@/lib/docScan";
import * as procurement from "@/lib/procurementApi";
import type { AnalysisVendor, AnalysisVerdict, QuoteDocumentInput, Rag, Rfq, RfqAnalysis } from "@/lib/procurementApi";

/**
 * AI analysis on the comparison — what the buyer used to get by pasting every supplier's quotation
 * into a chat window: which supplier is best, financially and technically, as a red/amber/green
 * table with pros and cons, what differs, what contradicts itself, and who the web says each
 * supplier is.
 *
 * The browser reads each quote's attached document (text layer, or page images for a scan) and
 * hands it to the server, which researches the suppliers and writes the verdict. A run takes a
 * minute or two, so it runs in the background and this panel polls.
 *
 * Advice only. The line hints can be applied as awards, but only on a click, with a confirmation,
 * and each stays changeable on the comparison like any other award.
 */

const RAG_CELL: Record<Rag, string> = {
  GREEN: "bg-emerald-50 text-emerald-900 ring-emerald-200",
  YELLOW: "bg-amber-50 text-amber-900 ring-amber-200",
  RED: "bg-rose-50 text-rose-900 ring-rose-200",
};
const RAG_DOT: Record<Rag, string> = { GREEN: "bg-emerald-500", YELLOW: "bg-amber-400", RED: "bg-rose-500" };
const RAG_LABEL: Record<Rag, string> = { GREEN: "Good", YELLOW: "Watch", RED: "Problem" };

const same = (a?: string | null, b?: string | null) =>
  (a ?? "").toLowerCase().replace(/^m\/?s\.?\s+/, "").replace(/[^a-z0-9]/g, "") ===
  (b ?? "").toLowerCase().replace(/^m\/?s\.?\s+/, "").replace(/[^a-z0-9]/g, "");

const arr = <T,>(x: T[] | null | undefined): T[] => (Array.isArray(x) ? x : []);

/**
 * A verdict with every list present. A model in plain JSON mode sometimes leaves a section out, and
 * reports saved before the server started filling them in can be missing lists too.
 */
function normalize(v: Partial<AnalysisVerdict> | null | undefined): AnalysisVerdict {
  const src = v ?? {};
  return {
    summary: src.summary ?? null,
    recommendation: src.recommendation ?? null,
    criteria: arr(src.criteria).map((c) => ({ name: c?.name ?? null, cells: arr(c?.cells) })),
    vendors: arr(src.vendors).map((x) => ({ ...x, pros: arr(x?.pros), cons: arr(x?.cons) })),
    differences: arr(src.differences),
    contradictions: arr(src.contradictions).map((c) => ({ ...c, vendors: arr(c?.vendors) })),
    lineHints: arr(src.lineHints),
    questionsToAsk: arr(src.questionsToAsk),
    caveats: arr(src.caveats),
  };
}

/** Read every quote's attached document the way the analysis wants it. */
async function readQuoteDocuments(rfq: Rfq, onProgress: (s: string) => void): Promise<QuoteDocumentInput[]> {
  const docs: QuoteDocumentInput[] = [];
  let i = 0;
  for (const q of rfq.quotes) {
    i++;
    onProgress(`Reading ${q.vendorName}'s documents (${i} of ${rfq.quotes.length})…`);
    let files;
    try {
      files = await attachmentsFor("PROCUREMENT", q.id, "QUOTE");
    } catch {
      continue;
    }
    const texts: string[] = [];
    const pages: string[] = [];
    const names: string[] = [];
    for (const f of files) {
      if (f.fileId == null) continue;
      const type = f.contentType ?? "";
      const isPdf = type === "application/pdf" || /\.pdf$/i.test(f.name);
      const isImage = /^image\/(jpeg|png|webp)$/.test(type);
      if (!isPdf && !isImage) continue;
      try {
        const blob = await (await fetch(await fileUrl(f.fileId, true))).blob();
        names.push(f.name);
        if (isPdf) {
          const { text } = await pdfText(blob);
          if (text.replace(/\s|--- page \d+ ---/g, "").length >= 200) {
            texts.push(`[${f.name}]\n${text}`);
            continue;
          }
          // A scanned PDF: no text layer, so send its first pages as images.
        }
        if (pages.length < 3) {
          const file = new File([blob], f.name, { type: isPdf ? "application/pdf" : type });
          pages.push(...(await fileToPages(file)).slice(0, 3 - pages.length));
        }
      } catch {
        // An unreadable file is skipped; the verdict says the document is missing.
      }
    }
    if (texts.length || pages.length) {
      docs.push({ quoteId: q.id, fileName: names.join(", "), text: texts.join("\n\n"), pages });
    }
  }
  return docs;
}

export function RfqAiAnalysis({
  rfq,
  onAward,
}: {
  rfq: Rfq;
  onAward: (rfqId: number, lineId: number, vendorPartyId: number | null, reason?: string) => void;
}) {
  const [analysis, setAnalysis] = useState<RfqAnalysis | null>(null);
  const [open, setOpen] = useState(false);
  const [preparing, setPreparing] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setAnalysis(await procurement.getRfqAnalysis(rfq.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load the AI analysis.");
    }
  }, [rfq.id]);

  useEffect(() => {
    let live = true;
    procurement
      .getRfqAnalysis(rfq.id)
      .then((a) => live && setAnalysis(a))
      .catch((e) => live && setError(e instanceof Error ? e.message : "Couldn't load the AI analysis."));
    return () => {
      live = false;
    };
  }, [rfq.id]);

  // While a run is in progress, check back every few seconds.
  useEffect(() => {
    if (analysis?.status !== "RUNNING") return;
    const t = setTimeout(() => void load(), 3000);
    return () => clearTimeout(t);
  }, [analysis, load]);

  async function run() {
    setError("");
    setOpen(true);
    try {
      const docs = await readQuoteDocuments(rfq, setPreparing);
      setPreparing("Starting the analysis…");
      setAnalysis(await procurement.startRfqAnalysis(rfq.id, docs));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start the analysis.");
    } finally {
      setPreparing("");
    }
  }

  const running = !!preparing || analysis?.status === "RUNNING";
  const result = analysis?.status === "DONE" ? analysis.result : analysis?.result ?? null;
  const verdict = result?.analysis;
  const withDocs = rfq.quotes.length;

  return (
    <section className="mb-4 overflow-hidden rounded-xl border border-violet-200 bg-gradient-to-r from-violet-50/70 to-white">
      {/* Header strip: status, the recommendation in one line, and the run button */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 text-sm font-semibold text-violet-800"
          aria-expanded={open}
        >
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <Sparkles size={16} /> AI analysis
        </button>

        <div className="min-w-0 flex-1 text-sm text-gray-600">
          {running ? (
            <span className="flex items-center gap-2 text-violet-700">
              <Loader2 size={14} className="animate-spin" /> {preparing || analysis?.progress || "Working…"}
            </span>
          ) : analysis?.status === "DONE" && verdict?.recommendation?.vendor ? (
            <span className="truncate">
              Recommends <b className="text-gray-900">{verdict.recommendation.vendor}</b>
              {verdict.recommendation.confidence && (
                <span className="ml-1 text-xs text-gray-400">({verdict.recommendation.confidence.toLowerCase()} confidence)</span>
              )}
              {analysis.finishedAt && (
                <span className="ml-2 text-xs text-gray-400">
                  · {formatDateTimeIST(analysis.finishedAt)}
                  {analysis.requestedByName ? ` · ${analysis.requestedByName}` : ""}
                </span>
              )}
            </span>
          ) : analysis?.status === "FAILED" ? (
            <span className="text-rose-600">Last run failed: {analysis.error}</span>
          ) : analysis && !analysis.aiAvailable ? (
            <span className="text-gray-400">AI isn&apos;t set up on the server yet (GROQ_API_KEY).</span>
          ) : (
            <span className="text-gray-500">
              Reads each supplier&apos;s quotation, researches the companies on the web, and rates them financially and
              technically.
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => void run()}
          disabled={running || (analysis != null && !analysis.aiAvailable)}
          className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white transition-all duration-150 hover:bg-violet-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {running ? <Loader2 size={14} className="animate-spin" /> : analysis?.status === "DONE" ? <RefreshCw size={14} /> : <Sparkles size={14} />}
          {analysis?.status === "DONE" ? "Run again" : "Run AI analysis"}
        </button>
      </div>

      {error && <div className="mx-4 mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}

      {open && !result && !running && (
        <div className="border-t border-violet-100 bg-white px-4 py-4 text-sm text-gray-500">
          <p>
            Attach each supplier&apos;s quotation PDF on their quote (Enter quote → Quotation document) so the analysis
            can compare makes, specs, warranty and terms — not just the prices. {withDocs} quote{withDocs === 1 ? "" : "s"}{" "}
            on this enquiry.
          </p>
          {analysis && !analysis.researchAvailable && (
            <p className="mt-2 text-xs text-amber-700">
              Web research is off on this server (TAVILY_API_KEY), so suppliers won&apos;t be looked up.
            </p>
          )}
        </div>
      )}

      {open && result && verdict && <Report rfq={rfq} result={result} onAward={onAward} />}
    </section>
  );
}

// =====================================================================================

function Report({
  rfq,
  result,
  onAward,
}: {
  rfq: Rfq;
  result: NonNullable<RfqAnalysis["result"]>;
  onAward: (rfqId: number, lineId: number, vendorPartyId: number | null, reason?: string) => void;
}) {
  const v = useMemo(() => normalize(result.analysis), [result.analysis]);
  const vendors = arr(result.vendors);
  const byName = (name?: string | null) => vendors.find((x) => same(x.name, name));

  // Criteria columns follow the supplier order of the comparison.
  const overallFor = (name: string) => v.vendors.find((x) => same(x.vendor, name));

  const hints = useMemo(
    () =>
      v.lineHints
        .map((h) => {
          const line = rfq.lines.find((l) => l.id === h.lineId) ?? rfq.lines.find((l) => same(l.itemName, h.item));
          const vendor = byName(h.vendor);
          return line ? { line, vendor, hint: h } : null;
        })
        .filter((x): x is NonNullable<typeof x> => x != null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [v.lineHints, rfq.lines, vendors],
  );

  function applyHints() {
    const usable = hints.filter((h) => h.vendor);
    if (usable.length === 0) return;
    const lines = usable.map((h) => `• ${h.line.itemName} → ${h.vendor!.name}`).join("\n");
    if (!confirm(`Award these lines as the AI suggests?\n\n${lines}\n\nEach stays changeable on the comparison.`)) return;
    for (const h of usable) onAward(rfq.id, h.line.id, h.vendor!.partyId, `AI: ${h.hint.reason ?? "suggested"}`.slice(0, 250));
  }

  return (
    <div className="space-y-5 border-t border-violet-100 bg-white px-4 py-5">
      {/* Verdict */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-violet-700 uppercase">
            <BadgeCheck size={14} /> Recommendation
          </div>
          <div className="mt-1 text-lg font-semibold text-gray-900">{v.recommendation?.vendor ?? "No clear pick"}</div>
          {v.recommendation?.reason && <p className="mt-1 text-sm text-gray-700">{v.recommendation.reason}</p>}
          {v.summary && <p className="mt-3 text-sm text-gray-600">{v.summary}</p>}
        </div>
        <div className="space-y-2 rounded-xl border border-gray-200 p-4 text-sm">
          <Pick label="Financially" value={v.recommendation?.financialPick} />
          <Pick label="Technically" value={v.recommendation?.technicalPick} />
          <Pick label="Confidence" value={v.recommendation?.confidence?.toLowerCase()} />
        </div>
      </div>

      {/* Red / amber / green table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left">
              <th className="w-44 px-3 py-2 text-[11px] font-medium tracking-wide text-gray-500 uppercase">Criteria</th>
              {vendors.map((x) => {
                const o = overallFor(x.name);
                return (
                  <th key={x.quoteId} className="px-3 py-2 align-top">
                    <div className="flex items-center gap-1.5 font-semibold text-gray-800">
                      {o && <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${RAG_DOT[o.overall]}`} />}
                      {x.name}
                    </div>
                    <div className="mt-0.5 text-xs font-normal text-gray-500 tabular-nums">
                      {inr(x.totals.total)}
                      {o?.score != null && <> · score {o.score}/10</>}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {v.criteria.map((c, ci) => (
              <tr key={ci} className="border-b border-gray-100 align-top last:border-b-0">
                <td className="px-3 py-2 font-medium text-gray-700">{c.name}</td>
                {vendors.map((x) => {
                  const cell = c.cells.find((k) => same(k.vendor, x.name));
                  return (
                    <td key={x.quoteId} className="px-2 py-1.5">
                      {cell ? (
                        <div className={`rounded-lg px-2 py-1.5 ring-1 ring-inset ${RAG_CELL[cell.rating]}`}>
                          <div className="flex items-center gap-1 text-[11px] font-semibold uppercase">
                            <span className={`h-2 w-2 rounded-full ${RAG_DOT[cell.rating]}`} /> {RAG_LABEL[cell.rating]}
                          </div>
                          {cell.note && <div className="mt-0.5 text-xs leading-snug">{cell.note}</div>}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Per supplier: pros, cons, the web research, our history, the quotation's terms */}
      <div className="grid gap-4 xl:grid-cols-2">
        {vendors.map((x) => (
          <VendorCard key={x.quoteId} vendor={x} verdict={overallFor(x.name)} />
        ))}
      </div>

      {(v.differences.length > 0 || v.contradictions.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {v.differences.length > 0 && (
            <ListCard title="Key differences" icon={FileText}>
              {v.differences.map((d, i) => (
                <li key={i}>
                  <b className="text-gray-800">{d.topic}:</b> {d.detail}
                </li>
              ))}
            </ListCard>
          )}
          {v.contradictions.length > 0 && (
            <ListCard title="Contradictions" icon={AlertTriangle} tone="amber">
              {v.contradictions.map((d, i) => (
                <li key={i}>
                  <b className="text-gray-800">{d.topic}</b>
                  {d.vendors.length > 0 && <span className="text-gray-400"> ({d.vendors.join(", ")})</span>}: {d.detail}
                </li>
              ))}
            </ListCard>
          )}
        </div>
      )}

      {/* Per line */}
      {hints.length > 0 && (
        <div className="rounded-xl border border-gray-200">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-2.5">
            <h4 className="text-sm font-semibold text-gray-800">Suggested award, line by line</h4>
            <button
              type="button"
              onClick={applyHints}
              className="flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-700 transition-colors hover:bg-violet-100"
            >
              <Wand2 size={13} /> Award as suggested
            </button>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {hints.map(({ line, vendor, hint }) => (
                <tr key={line.id} className="border-b border-gray-50 last:border-b-0">
                  <td className="w-1/3 px-4 py-2 font-medium text-gray-700">{line.itemName}</td>
                  <td className="px-4 py-2">
                    <span className="font-medium text-gray-900">{vendor?.name ?? hint.vendor}</span>
                    {hint.reason && <span className="text-gray-500"> — {hint.reason}</span>}
                    {line.awardedVendorPartyId != null && vendor && line.awardedVendorPartyId !== vendor.partyId && (
                      <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-700">currently awarded elsewhere</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(v.questionsToAsk.length > 0 || v.caveats.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {v.questionsToAsk.length > 0 && (
            <ListCard title="Ask the suppliers before awarding" icon={HelpCircle}>
              {v.questionsToAsk.map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ListCard>
          )}
          {v.caveats.length > 0 && (
            <ListCard title="Caveats" icon={ShieldAlert} tone="amber">
              {v.caveats.map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ListCard>
          )}
        </div>
      )}

      <p className="text-[11px] text-gray-400">
        AI advice from {result.model}, {formatDateTimeIST(result.generatedAt)}. It reads documents and the web and can be
        wrong — check the quotation and the sources before awarding.
        {!result.researchAvailable && " Web research was off for this run."}
      </p>
    </div>
  );
}

function Pick({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-gray-500">{label}</span>
      <span className="text-right font-medium text-gray-800">{value || "—"}</span>
    </div>
  );
}

function ListCard({
  title,
  icon: Icon,
  tone = "gray",
  children,
}: {
  title: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  tone?: "gray" | "amber";
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl border p-4 ${tone === "amber" ? "border-amber-200 bg-amber-50/40" : "border-gray-200"}`}>
      <h4 className="flex items-center gap-1.5 text-sm font-semibold text-gray-800">
        <Icon size={14} className={tone === "amber" ? "text-amber-600" : "text-gray-400"} /> {title}
      </h4>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-600">{children}</ul>
    </div>
  );
}

const MATCH_LABEL: Record<string, { label: string; cls: string }> = {
  CONFIRMED: { label: "Identity confirmed", cls: "bg-emerald-50 text-emerald-700" },
  LIKELY: { label: "Likely match", cls: "bg-cyan-50 text-cyan-700" },
  UNCERTAIN: { label: "Uncertain match", cls: "bg-amber-50 text-amber-700" },
  NOT_FOUND: { label: "Not found online", cls: "bg-gray-100 text-gray-500" },
};

function VendorCard({
  vendor: x,
  verdict,
}: {
  vendor: AnalysisVendor;
  verdict?: { overall: Rag; score: number | null; pros: string[]; cons: string[] };
}) {
  const [sources, setSources] = useState(false);
  const [terms, setTerms] = useState(false);
  const r = x.research;
  const t = x.terms;
  const h = x.history ?? {};
  const match = r?.identityMatch ? MATCH_LABEL[r.identityMatch] : null;

  return (
    <div className="rounded-xl border border-gray-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 font-semibold text-gray-900">
            {verdict && <span className={`h-2.5 w-2.5 rounded-full ${RAG_DOT[verdict.overall]}`} />}
            {x.name}
          </div>
          <div className="mt-0.5 text-xs text-gray-500">
            {inr(x.totals.total)} · {x.totals.linesQuoted}/{x.totals.linesAsked} lines
            {x.deliveryDays != null && <> · {x.deliveryDays} days</>}
            {x.gstin && <> · {x.gstin}</>}
          </div>
        </div>
        {match && <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${match.cls}`}>{match.label}</span>}
      </div>

      {verdict && (verdict.pros.length > 0 || verdict.cons.length > 0) && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <ul className="space-y-1 text-sm">
            {verdict.pros.map((p, i) => (
              <li key={i} className="flex gap-1.5 text-gray-700">
                <ThumbsUp size={13} className="mt-0.5 shrink-0 text-emerald-600" /> {p}
              </li>
            ))}
          </ul>
          <ul className="space-y-1 text-sm">
            {verdict.cons.map((p, i) => (
              <li key={i} className="flex gap-1.5 text-gray-700">
                <ThumbsDown size={13} className="mt-0.5 shrink-0 text-rose-500" /> {p}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Company research */}
      <div className="mt-3 rounded-lg bg-gray-50 p-3 text-sm">
        <div className="text-[11px] font-semibold tracking-wide text-gray-500 uppercase">Company research</div>
        {r?.unavailable ? (
          <p className="mt-1 text-xs text-gray-500">{r.summary}</p>
        ) : r ? (
          <>
            {r.summary && <p className="mt-1 text-gray-700">{r.summary}</p>}
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
              {r.legalName && <Row k="Legal name" v={r.legalName} />}
              {r.businessType && <Row k="Type" v={r.businessType} />}
              {r.established && <Row k="Established" v={r.established} />}
              {r.gstStatus && <Row k="GST" v={r.gstStatus} />}
              {r.scale && <Row k="Scale" v={r.scale} />}
              {r.reputation && <Row k="Reputation" v={r.reputation} />}
              {r.website && (
                <Row
                  k="Website"
                  v={
                    <a href={r.website.startsWith("http") ? r.website : `https://${r.website}`} target="_blank" rel="noreferrer" className="text-brand-accent hover:underline">
                      {r.website}
                    </a>
                  }
                />
              )}
            </dl>
            {arr(r.redFlags).length > 0 && (
              <ul className="mt-2 space-y-0.5 text-xs text-rose-700">
                {r.redFlags!.map((f, i) => (
                  <li key={i} className="flex gap-1">
                    <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {f}
                  </li>
                ))}
              </ul>
            )}
            {(r.sources?.length ?? 0) > 0 && (
              <div className="mt-2">
                <button type="button" onClick={() => setSources((s) => !s)} className="text-xs font-medium text-brand-accent hover:underline">
                  {sources ? "Hide" : "Show"} {r.sources!.length} source{r.sources!.length === 1 ? "" : "s"}
                </button>
                {sources && (
                  <ul className="mt-1 space-y-1 text-xs">
                    {r.sources!.map((s, i) => (
                      <li key={i}>
                        {s.url ? (
                          <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-accent hover:underline">
                            {s.title || s.url} <ExternalLink size={10} />
                          </a>
                        ) : (
                          s.title
                        )}
                        {s.finding && <span className="text-gray-500"> — {s.finding}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {r.researchedAt && (
              <div className="mt-1 text-[11px] text-gray-400">
                Researched {formatDateTimeIST(r.researchedAt)}
                {r.fromCache && " (reused)"}
              </div>
            )}
          </>
        ) : (
          <p className="mt-1 text-xs text-gray-500">Not researched.</p>
        )}
      </div>

      {/* Our own history with them */}
      <div className="mt-2 text-xs text-gray-500">
        {h.purchaseBills || h.purchaseOrders ? (
          <>
            With us: {h.purchaseBills ?? 0} bill{h.purchaseBills === 1 ? "" : "s"}
            {h.totalBilled ? <> · {inr(h.totalBilled)} billed</> : null}
            {h.purchaseOrders ? <> · {h.purchaseOrders} PO{h.purchaseOrders === 1 ? "" : "s"}</> : null}
            {h.purchaseReturns ? <> · {h.purchaseReturns} return{h.purchaseReturns === 1 ? "" : "s"}</> : null}
            {h.lastDealing && <> · last {h.lastDealing}</>}
          </>
        ) : (
          "No past purchases from this supplier."
        )}
      </div>

      {/* The quotation's own terms */}
      <div className="mt-2">
        {t && !t.unreadable ? (
          <>
            <button type="button" onClick={() => setTerms((s) => !s)} className="flex items-center gap-1 text-xs font-medium text-brand-accent hover:underline">
              <FileText size={12} /> {terms ? "Hide" : "Show"} quotation terms{x.document ? ` (${x.document})` : ""}
            </button>
            {terms && (
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                {t.offerSummary && <Row k="Offer" v={t.offerSummary} />}
                {(t.brandsAndMakes?.length ?? 0) > 0 && <Row k="Makes" v={t.brandsAndMakes!.join(", ")} />}
                {t.technicalSpecs?.map((s, i) => <Row key={i} k={s.item ?? "Spec"} v={s.spec ?? ""} />)}
                {t.warranty && <Row k="Warranty" v={t.warranty} />}
                {t.paymentTerms && <Row k="Payment" v={t.paymentTerms} />}
                {t.deliveryTerms && <Row k="Delivery" v={t.deliveryTerms} />}
                {t.validity && <Row k="Validity" v={t.validity} />}
                {t.priceBasis && <Row k="Price basis" v={t.priceBasis} />}
                {(t.inclusions?.length ?? 0) > 0 && <Row k="Includes" v={t.inclusions!.join("; ")} />}
                {(t.exclusions?.length ?? 0) > 0 && <Row k="Excludes" v={t.exclusions!.join("; ")} />}
                {(t.notableConditions?.length ?? 0) > 0 && <Row k="Conditions" v={t.notableConditions!.join("; ")} />}
              </dl>
            )}
          </>
        ) : t?.unreadable ? (
          <p className="text-xs text-amber-700">Couldn&apos;t read the quotation document: {t.reason}</p>
        ) : (
          <p className="text-xs text-gray-400">No quotation document attached — compared on keyed-in prices only.</p>
        )}
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <>
      <dt className="text-gray-400">{k}</dt>
      <dd className="text-gray-700">{v}</dd>
    </>
  );
}
