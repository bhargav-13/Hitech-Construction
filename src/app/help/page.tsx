"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, CirclePlay, LifeBuoy, Search } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { HELP_TOPICS, type HelpTopic } from "@/lib/helpContent";

/**
 * KAN-98: Help — every module of the ERP explained, with how-to steps and a video for each (as
 * Onsite's help screen). Content lives in lib/helpContent.ts.
 */
export default function HelpPage() {
  const [q, setQ] = useState("");
  const [openKey, setOpenKey] = useState<string>(HELP_TOPICS[0].key);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return HELP_TOPICS;
    return HELP_TOPICS.filter((t) =>
      [t.module, t.summary, ...t.concepts, ...t.howTo.flatMap((h) => [h.q, ...h.steps])].some((x) => x.toLowerCase().includes(s)),
    );
  }, [q]);
  const topic = shown.find((t) => t.key === openKey) ?? shown[0];

  return (
    <AppShell title="Help">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-lg font-semibold text-gray-800">
              <LifeBuoy size={18} className="text-brand-accent" /> Help
            </h1>
            <p className="text-sm text-gray-500">How each part of the ERP works, with step-by-step guides and videos.</p>
          </div>
          <div className="flex w-full max-w-sm items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 focus-within:border-cyan-500">
            <Search size={15} className="text-gray-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search help — e.g. leave, PO, BOQ" className="w-full bg-transparent text-sm outline-none" />
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
          <nav className="h-fit rounded-xl border border-gray-200 bg-white p-2">
            {shown.map((t) => (
              <button
                key={t.key}
                onClick={() => setOpenKey(t.key)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${
                  topic?.key === t.key ? "bg-cyan-50 font-medium text-brand-accent" : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                {t.module}
                {t.video && <CirclePlay size={13} className="opacity-60" />}
              </button>
            ))}
            {shown.length === 0 && <p className="px-3 py-4 text-sm text-gray-400">Nothing matches.</p>}
          </nav>

          {topic && <TopicView topic={topic} />}
        </div>
      </div>
    </AppShell>
  );
}

function TopicView({ topic }: { topic: HelpTopic }) {
  return (
    <article className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-800">{topic.module}</h2>
          <p className="mt-1 max-w-2xl text-sm text-gray-600">{topic.summary}</p>
        </div>
        <Link href={topic.href} className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-brand-accent hover:text-brand-accent">
          Open module <ArrowRight size={12} />
        </Link>
      </header>

      <Video url={topic.video} title={topic.module} />

      <section>
        <h3 className="mb-2 text-[11px] font-semibold tracking-wide text-gray-400 uppercase">Concept</h3>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-gray-700">
          {topic.concepts.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="mb-2 text-[11px] font-semibold tracking-wide text-gray-400 uppercase">How to</h3>
        <div className="space-y-3">
          {topic.howTo.map((h) => (
            <div key={h.q} className="rounded-lg bg-gray-50 px-4 py-3">
              <div className="text-sm font-medium text-gray-800">{h.q}</div>
              <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-sm text-gray-600">
                {h.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </section>
    </article>
  );
}

/** YouTube / Vimeo links embed; any other link plays as a video file. */
function Video({ url, title }: { url?: string | null; title: string }) {
  if (!url) {
    return (
      <div className="flex aspect-video max-h-[320px] w-full flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 text-gray-400">
        <CirclePlay size={28} />
        <span className="mt-2 text-sm">Video coming soon</span>
      </div>
    );
  }
  const yt = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{6,})/);
  const vimeo = url.match(/vimeo\.com\/(\d+)/);
  const embed = yt ? `https://www.youtube.com/embed/${yt[1]}` : vimeo ? `https://player.vimeo.com/video/${vimeo[1]}` : null;
  return embed ? (
    <iframe src={embed} title={title} className="aspect-video w-full max-w-3xl rounded-lg" allowFullScreen />
  ) : (
    <video src={url} controls className="aspect-video w-full max-w-3xl rounded-lg bg-black" />
  );
}
