"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Building2, Phone, Plus, Search, Users, X } from "lucide-react";
import { Spinner } from "@/components/Spinner";
import { Modal } from "@/components/Modal";
import { Select } from "@/components/Select";
import { addPartyToProject, getParties, getProjectPartyMembers, removePartyFromProject } from "@/lib/vyaparApi";
import type { Party, PartyType } from "@/lib/vyaparApi";
import { inr } from "@/lib/format";
import { useAuthStore } from "@/lib/authStore";

/**
 * Project → Party tab.
 *
 * <p>Parties themselves are global master data — the same supplier serves several sites — so what's
 * project-specific is the *balance*: what this party owes, or is owed, on the documents booked
 * against THIS project. The backend derives that from project-scoped invoices and payments, so a
 * supplier used on three sites shows a different position on each.
 *
 * <p>Parties with no dealings on this project are hidden by default; the toggle brings the rest of
 * the directory back for someone who needs to look one up. Parties added to the project's directory
 * (Onsite's project party members) always show, at ₹0 until something is booked here.
 */

const FILTERS: { key: "ALL" | PartyType; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "CUSTOMER", label: "Customers" },
  { key: "SUPPLIER", label: "Suppliers" },
];

export function ProjectParties({ projectId }: { projectId: number }) {
  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"ALL" | PartyType>("ALL");
  const [showInactive, setShowInactive] = useState(false);
  const [members, setMembers] = useState<Set<number>>(new Set());
  const [adding, setAdding] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const canEdit = (useAuthStore((s) => s.user?.permissions) ?? []).includes("VYAPAR_PARTY:EDIT");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    Promise.all([
      getParties(undefined, projectId, true),
      // The directory is an add-on: if it can't be read, the money view still works.
      getProjectPartyMembers(projectId).catch(() => [] as number[]),
    ])
      .then(([rows, ids]) => {
        if (cancelled) return;
        setParties(rows);
        setMembers(new Set(ids));
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Couldn't load parties.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, reloadKey]);

  const remove = async (p: Party) => {
    if (!window.confirm(`Take ${p.name} off this project's party list? Their entries and balance are not touched.`)) return;
    try {
      await removePartyFromProject(projectId, p.id);
      setReloadKey((k) => k + 1);
    } catch (e: unknown) {
      window.alert(e instanceof Error ? e.message : "Couldn't remove the party.");
    }
  };

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return parties
      .filter((p) => (filter === "ALL" ? true : p.partyType === filter))
      // A zero balance means no money is moving on this project; a party added to the project's
      // list still shows, as Onsite's project party list does.
      .filter((p) => (showInactive ? true : members.has(p.id) || Math.abs(p.balance) > 0.005))
      .filter((p) => (q ? p.name.toLowerCase().includes(q) || (p.phone ?? "").includes(q) : true))
      .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
  }, [parties, filter, query, showInactive, members]);

  const totals = useMemo(() => {
    let receivable = 0;
    let payable = 0;
    for (const p of parties) {
      if (p.balance > 0) receivable += p.balance;
      else payable += Math.abs(p.balance);
    }
    return { receivable, payable };
  }, [parties]);

  if (loading) return <div className="flex justify-center py-16"><Spinner /></div>;
  if (error) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50/60 px-4 py-8 text-center text-sm text-rose-700">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Tile
          icon={<ArrowDownRight size={16} />}
          tint="bg-emerald-50 text-emerald-600"
          label="To collect on this project"
          value={inr(totals.receivable)}
        />
        <Tile
          icon={<ArrowUpRight size={16} />}
          tint="bg-rose-50 text-rose-600"
          label="To pay on this project"
          value={inr(totals.payable)}
        />
        <Tile
          icon={<Users size={16} />}
          tint="bg-cyan-50 text-cyan-600"
          label="Parties active here"
          value={String(parties.filter((p) => Math.abs(p.balance) > 0.005).length)}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              filter === f.key
                ? "bg-brand-accent text-white"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {f.label}
          </button>
        ))}
        <label className="ml-1 flex items-center gap-1.5 text-sm text-slate-500">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="rounded border-slate-300"
          />
          Show parties with no activity here
        </label>
        {canEdit && (
          <button
            onClick={() => setAdding(true)}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Plus size={14} /> Add party
          </button>
        )}
        <div className={`relative ${canEdit ? "" : "ml-auto"}`}>
          <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search parties"
            className="w-56 rounded-lg border border-slate-200 py-1.5 pl-8 pr-3 text-sm outline-none focus:border-brand-accent"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {rows.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">
            No party has money moving on this project yet.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2.5 font-medium">Party</th>
                <th className="px-4 py-2.5 font-medium">Type</th>
                <th className="px-4 py-2.5 font-medium">Contact</th>
                <th className="px-4 py-2.5 text-right font-medium">Balance on this project</th>
                {canEdit && <th className="w-10 px-2 py-2.5" />}
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                  <td className="px-4 py-2.5">
                    <Link
                      // The Parties page opens the party named by ?open= (as reports and payroll link
                      // it); ?party= was ignored, so it showed the first party in the list instead.
                      href={`/vyapar/parties?open=${p.id}`}
                      className="font-medium text-slate-800 hover:text-brand-accent"
                    >
                      {p.name}
                    </Link>
                    {p.city && <div className="text-xs text-slate-400">{p.city}</div>}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                      <Building2 size={13} className="text-slate-400" />
                      {p.partyType === "CUSTOMER" ? "Customer" : "Supplier"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">
                    {p.phone ? (
                      <span className="inline-flex items-center gap-1">
                        <Phone size={13} className="text-slate-400" />
                        {p.phone}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td
                    className={`px-4 py-2.5 text-right font-semibold ${
                      p.balance > 0 ? "text-emerald-600" : p.balance < 0 ? "text-rose-600" : "text-slate-400"
                    }`}
                  >
                    {inr(Math.abs(p.balance))}
                    <span className="ml-1 text-xs font-normal text-slate-400">
                      {p.balance > 0 ? "to collect" : p.balance < 0 ? "to pay" : ""}
                    </span>
                  </td>
                  {canEdit && (
                    <td className="px-2 py-2.5 text-right">
                      {members.has(p.id) && (
                        <button
                          onClick={() => remove(p)}
                          title="Take off this project's party list"
                          aria-label={`Take ${p.name} off this project's party list`}
                          className="rounded p-1 text-slate-300 hover:bg-slate-100 hover:text-rose-600"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {adding && (
        <AddPartyDialog
          projectId={projectId}
          listed={new Set(parties.filter((p) => members.has(p.id) || Math.abs(p.balance) > 0.005).map((p) => p.id))}
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            setReloadKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}

/** Pick any party in the books and add it to this project's party list. */
function AddPartyDialog({
  projectId,
  listed,
  onClose,
  onAdded,
}: {
  projectId: number;
  listed: Set<number>;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [all, setAll] = useState<Party[] | null>(null);
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getParties()
      .then(setAll)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Couldn't load parties."));
  }, []);

  const save = async () => {
    if (!pick) return;
    setBusy(true);
    setError("");
    try {
      await addPartyToProject(projectId, Number(pick));
      onAdded();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Couldn't add the party.");
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} guardOnClose={false}>
      <div className="w-[26rem] max-w-full space-y-4 p-5">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Add party to this project</h3>
          <p className="mt-0.5 text-sm text-slate-500">It shows on this project&apos;s party list, at ₹0 until something is booked here.</p>
        </div>
        {all == null && !error ? (
          <div className="flex justify-center py-6"><Spinner /></div>
        ) : (
          <Select
            value={pick}
            onChange={setPick}
            placeholder="Choose a party…"
            options={(all ?? [])
              .filter((p) => !listed.has(p.id))
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((p) => ({ value: String(p.id), label: p.partyGroup ? `${p.name} · ${p.partyGroup}` : p.name }))}
          />
        )}
        {error && <div className="text-sm text-rose-600">{error}</div>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!pick || busy}
            className="rounded-lg bg-brand-accent px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? "Adding…" : "Add"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Tile({ icon, tint, label, value }: { icon: React.ReactNode; tint: string; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${tint}`}>{icon}</span>
      <div className="mt-3 text-xl font-semibold tracking-tight text-slate-900">{value}</div>
      <div className="mt-0.5 text-xs text-slate-500">{label}</div>
    </div>
  );
}
