"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { notFound } from "next/navigation";
import { Check, Copy, Database, KeyRound, LineChart, Loader2, Trash2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { WHITE_LABEL } from "@/lib/brand";
import { getAccessSelf } from "@/lib/api";
import { getAuditLogs, type AuditLog } from "@/lib/auditApi";
import { formatDateIST, formatDateTimeIST, msIST } from "@/lib/datetime";
import {
  DEMO_LOGINS,
  DEMO_PASSWORD,
  clearSampleData,
  getDemoManifest,
  loadSampleData,
  type DemoManifest,
} from "@/lib/demoSeed";

/**
 * Presenter console for white-label demo installs (Super Admin only): load / clear sample data,
 * the role logins to show off access control, and what the prospect has been doing on the trial.
 * Not linked from the menu on purpose — the prospect never needs it. Hi-Tech's build 404s here.
 */
export default function DemoConsolePage() {
  if (!WHITE_LABEL) notFound();

  const [allowed, setAllowed] = useState<boolean | null>(null);
  useEffect(() => {
    getAccessSelf()
      .then((a) => setAllowed(a.superAdmin))
      .catch(() => setAllowed(false));
  }, []);

  return (
    <AppShell title="Demo console">
      <div className="mx-auto max-w-5xl space-y-5 p-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Demo console</h1>
          <p className="mt-1 text-sm text-gray-500">
            Only for you as the presenter — not in the menu, and only Super Admins can open it.
          </p>
        </div>
        {allowed === null ? (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 size={16} className="animate-spin" /> Checking access…
          </div>
        ) : !allowed ? (
          <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-600">Only a Super Admin can use the demo console.</div>
        ) : (
          <>
            <SampleDataCard />
            <LoginsCard />
            <ActivityCard />
          </>
        )}
      </div>
    </AppShell>
  );
}

function Card({ icon: Icon, title, subtitle, children }: { icon: typeof Database; title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white">
      <div className="flex items-start gap-3 border-b border-gray-100 px-5 py-4">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-cyan-50 text-brand-accent">
          <Icon size={18} />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
          <p className="text-xs text-gray-500">{subtitle}</p>
        </div>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function SampleDataCard() {
  const [manifest, setManifest] = useState<DemoManifest | null | undefined>(undefined);
  const [busy, setBusy] = useState<"load" | "clear" | null>(null);
  const [step, setStep] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const refresh = useCallback(() => getDemoManifest().then(setManifest), []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  const load = async () => {
    setBusy("load");
    setError(null);
    setNote(null);
    try {
      await loadSampleData(setStep);
      setNote("Sample data loaded. Open the Dashboard to see it.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
      setStep("");
      refresh();
    }
  };

  const clear = async () => {
    if (!window.confirm("Remove all sample data? Anything the prospect added themselves stays.")) return;
    setBusy("clear");
    setError(null);
    setNote(null);
    try {
      const { failed } = await clearSampleData(setStep);
      setNote(failed.length ? `Cleared, except ${failed.length} record(s) now linked to their own data: ${failed.join(", ")}` : "Sample data removed.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
      setStep("");
      refresh();
    }
  };

  const counts = manifest
    ? [
        [manifest.projects.length, "projects"],
        [manifest.users.length, "staff"],
        [manifest.parties.length, "parties"],
        [manifest.invoices.length, "bills"],
        [manifest.payments.length, "payments"],
        [manifest.tenders.length, "tenders"],
        [manifest.tasks.length, "tasks"],
        [manifest.rfqs.length, "quotation request"],
      ]
    : [];

  return (
    <Card
      icon={Database}
      title="Sample data"
      subtitle="A ready-made company so every screen has something to show. Clear removes only what was loaded here."
    >
      {manifest === undefined ? (
        <div className="text-sm text-gray-400">Loading…</div>
      ) : manifest ? (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-gray-800">Loaded {new Date(manifest.loadedAt).toLocaleString("en-IN")}</div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {counts.map(([n, label]) => (
                <span key={label as string} className="rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] text-gray-600">
                  {n} {label}
                </span>
              ))}
            </div>
          </div>
          <button
            onClick={clear}
            disabled={!!busy}
            className="inline-flex items-center gap-2 rounded-lg border border-rose-200 px-4 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
          >
            {busy === "clear" ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />} Clear sample data
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="max-w-xl text-sm text-gray-600">
            Adds 4 projects, 11 staff with two months of attendance and a payroll run, customers and suppliers,
            bills and payments, a quotation comparison, tenders, tasks and 3 role logins. Takes about a minute.
          </p>
          <button
            onClick={load}
            disabled={!!busy}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-accent px-4 py-2 text-sm font-medium text-white hover:bg-brand-accent-strong disabled:opacity-50"
          >
            {busy === "load" ? <Loader2 size={15} className="animate-spin" /> : <Database size={15} />} Load sample data
          </button>
        </div>
      )}
      {busy && step && <div className="mt-3 text-xs text-gray-500">{step}…</div>}
      {note && <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{note}</div>}
      {error && <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>}
    </Card>
  );
}

function LoginsCard() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(text);
      window.setTimeout(() => setCopied(null), 1500);
    });
  };
  return (
    <Card
      icon={KeyRound}
      title="Role logins"
      subtitle="Created with the sample data. Sign in as each to show what a site engineer sees versus the office."
    >
      <div className="grid gap-3 md:grid-cols-3">
        {DEMO_LOGINS.map((l) => (
          <div key={l.email} className="rounded-lg border border-gray-200 p-3.5">
            <div className="text-xs font-semibold uppercase tracking-wide text-brand-accent">{l.role}</div>
            <div className="mt-1 text-sm font-medium text-gray-800">{l.name}</div>
            <button onClick={() => copy(l.email)} className="mt-2 flex w-full items-center justify-between rounded-md bg-gray-50 px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-100">
              {l.email} {copied === l.email ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} className="text-gray-400" />}
            </button>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
        Password for all three:
        <button onClick={() => copy(DEMO_PASSWORD)} className="inline-flex items-center gap-1.5 rounded-md bg-gray-50 px-2 py-1 font-mono text-gray-700 hover:bg-gray-100">
          {DEMO_PASSWORD} {copied === DEMO_PASSWORD ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} className="text-gray-400" />}
        </button>
      </div>
    </Card>
  );
}

/** Area of the product an audit row belongs to, read from its API path. */
function areaOf(log: AuditLog): string {
  const p = log.path ?? "";
  const map: [RegExp, string][] = [
    [/\/vyapar\//, "Billing & accounts"],
    [/\/procurement\//, "Procurement"],
    [/\/tenders?\b/, "Tenders"],
    [/\/payroll\/attendance/, "Attendance"],
    [/\/payroll\//, "Payroll"],
    [/\/tasks|\/checklist/, "Tasks"],
    [/\/projects/, "Projects"],
    [/\/warehouse|\/stores/, "Inventory"],
    [/\/scan/, "Scan with AI"],
    [/\/files/, "Documents"],
    [/\/users|\/roles/, "Users & roles"],
    [/\/auth\//, "Sign-ins"],
  ];
  return map.find(([re]) => re.test(p))?.[1] ?? "Other";
}

function ActivityCard() {
  const [logs, setLogs] = useState<AuditLog[] | null>(null);
  useEffect(() => {
    getAuditLogs({ size: 500 })
      .then((r) => setLogs(r.content))
      .catch(() => setLogs([]));
  }, []);

  const { byArea, byPerson, logins, last } = useMemo(() => {
    const rows = logs ?? [];
    const areas = new Map<string, number>();
    const people = new Map<string, { n: number; last: string }>();
    let loginCount = 0;
    for (const l of rows) {
      if (l.action === "LOGIN") loginCount++;
      else areas.set(areaOf(l), (areas.get(areaOf(l)) ?? 0) + 1);
      const who = l.actorName ?? l.actorEmail ?? "Unknown";
      const prev = people.get(who);
      people.set(who, { n: (prev?.n ?? 0) + 1, last: prev && msIST(prev.last) > msIST(l.createdAt) ? prev.last : l.createdAt });
    }
    return {
      byArea: [...areas.entries()].sort((a, b) => b[1] - a[1]),
      byPerson: [...people.entries()].sort((a, b) => b[1].n - a[1].n),
      logins: loginCount,
      last: rows[0]?.createdAt ?? null,
    };
  }, [logs]);

  const max = byArea[0]?.[1] ?? 1;

  return (
    <Card icon={LineChart} title="Trial activity" subtitle="What they have been doing — sign-ins and every record they created or changed, by area.">
      {logs === null ? (
        <div className="text-sm text-gray-400">Loading…</div>
      ) : logs.length === 0 ? (
        <div className="text-sm text-gray-500">No activity yet.</div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <div className="mb-2 flex gap-4 text-xs text-gray-500">
              <span><b className="text-gray-800">{logins}</b> sign-ins</span>
              {last && <span>Last activity <b className="text-gray-800">{formatDateTimeIST(last)}</b></span>}
            </div>
            <div className="space-y-1.5">
              {byArea.map(([area, n]) => (
                <div key={area} className="flex items-center gap-3 text-xs">
                  <span className="w-32 flex-shrink-0 text-gray-600">{area}</span>
                  <div className="h-2 flex-1 rounded-full bg-gray-100">
                    <div className="h-2 rounded-full bg-brand-accent" style={{ width: `${(n / max) * 100}%` }} />
                  </div>
                  <span className="w-8 text-right tabular-nums text-gray-700">{n}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">By person</div>
            <div className="divide-y divide-gray-100 rounded-lg border border-gray-100">
              {byPerson.slice(0, 8).map(([who, v]) => (
                <div key={who} className="flex items-center justify-between px-3 py-2 text-xs">
                  <span className="font-medium text-gray-700">{who}</span>
                  <span className="text-gray-500">
                    {v.n} actions · {formatDateIST(v.last)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
