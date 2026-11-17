"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Lock, Trash2 } from "lucide-react";
import { Modal } from "@/components/Modal";
import { Spinner } from "@/components/Spinner";
import { inr } from "@/lib/format";
import { useCan } from "@/lib/permissions";
import * as vyapar from "@/lib/vyaparApi";
import type { Party, PartyDeletePreview } from "@/lib/vyaparApi";

/**
 * Delete a party — with or without everything linked to it.
 *
 * Opens on what is linked (counts per kind, and other parties whose balance moves because a
 * transfer with this one goes too), so nobody deletes blind:
 *  - nothing linked → a plain delete;
 *  - linked data, box NOT ticked → it can't be deleted (the data would be orphaned); Deactivate is
 *    offered instead, which hides it and keeps the history;
 *  - box ticked → the party and all of it, in one transaction. Needs its own access switch
 *    ("Parties — Delete with all linked data") and the party's name typed to confirm.
 */
export function DeletePartyDialog({
  party,
  onClose,
  onDone,
}: {
  party: Party;
  onClose: () => void;
  /** Called after a delete or a deactivate, so the list reloads. */
  onDone: (deleted: boolean) => void;
}) {
  const can = useCan();
  const canPurge = can("VYAPAR_PARTY_PURGE:DELETE");
  const [preview, setPreview] = useState<PartyDeletePreview | null>(null);
  const [loadError, setLoadError] = useState("");
  const [withLinked, setWithLinked] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ total: number } | null>(null);

  useEffect(() => {
    let off = false;
    vyapar
      .getPartyDeletePreview(party.id)
      .then((p) => !off && setPreview(p))
      .catch((e) => !off && setLoadError(e instanceof Error ? e.message : "Couldn't check what is linked to this party."));
    return () => {
      off = true;
    };
  }, [party.id]);

  const hasLinked = (preview?.total ?? 0) > 0;
  const nameOk = typed.trim().toLowerCase() === party.name.trim().toLowerCase();

  async function run(kind: "delete" | "purge" | "deactivate") {
    setBusy(true);
    setError("");
    try {
      if (kind === "purge") {
        const r = await vyapar.deletePartyWithLinkedData(party.id);
        setResult({ total: r.total });
        return;
      }
      if (kind === "delete") await vyapar.deleteParty(party.id);
      else await vyapar.updateParty(party.id, { ...party, isActive: false });
      onDone(kind === "delete");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't go through.");
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <Modal onClose={() => { onDone(true); onClose(); }} guardOnClose={false}>
        <div className="flex flex-col items-center p-8 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <CheckCircle2 size={24} />
          </div>
          <h2 className="text-base font-semibold text-gray-800">{party.name} deleted</h2>
          <p className="mt-1 text-sm text-gray-500">Along with {result.total} linked record{result.total === 1 ? "" : "s"}.</p>
          <button
            onClick={() => { onDone(true); onClose(); }}
            className="mt-5 rounded-lg bg-brand-accent px-5 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Done
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal onClose={onClose} guardOnClose={false} wide={hasLinked}>
      <div className="p-6 sm:p-8">
        <h2 className="pr-8 text-lg font-semibold text-gray-800">Delete &ldquo;{party.name}&rdquo;?</h2>

        {!preview && !loadError && (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        )}
        {loadError && <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{loadError}</p>}

        {preview && (
          <>
            <p className="mt-1 text-sm text-gray-500">
              Balance <strong className="text-gray-700">{inr(preview.balance ?? 0)}</strong>
            </p>

            {preview.staffLedger ? (
              <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                This is a staff member&apos;s ledger — payroll posts onto it, so it can&apos;t be deleted here. Remove the
                staff member from payroll instead.
              </p>
            ) : !hasLinked ? (
              <p className="mt-4 text-sm text-gray-600">Nothing is linked to this party. It will be deleted permanently.</p>
            ) : (
              <>
                <div className="mt-5">
                  <div className="mb-2 text-xs font-semibold tracking-wide text-gray-500 uppercase">
                    Linked to this party · {preview.total} record{preview.total === 1 ? "" : "s"}
                  </div>
                  <div className="overflow-hidden rounded-xl border border-gray-200">
                    <table className="w-full text-sm">
                      <tbody>
                        {preview.linked.map((l) => (
                          <tr key={l.key} className="border-b border-gray-100 last:border-b-0">
                            <td className="px-3 py-2 text-gray-700">{l.label}</td>
                            <td className="px-3 py-2 text-right font-medium text-gray-800 tabular-nums">{l.count}</td>
                            <td className="w-36 px-3 py-2 text-right text-gray-500 tabular-nums">
                              {l.amount != null ? inr(l.amount) : ""}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {preview.affectedParties.length > 0 && (
                  <div className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    <div className="flex items-center gap-2 font-medium">
                      <AlertTriangle size={15} /> These parties&apos; balances will change
                    </div>
                    <p className="mt-0.5 text-xs text-amber-700">
                      Their transfers with {party.name} are deleted too.
                    </p>
                    <ul className="mt-2 space-y-0.5 text-xs">
                      {preview.affectedParties.slice(0, 8).map((a) => (
                        <li key={a.id} className="flex justify-between gap-3">
                          <span className="truncate">{a.name}</span>
                          <span className="shrink-0 tabular-nums">
                            {a.transfers} transfer{a.transfers === 1 ? "" : "s"} · {inr(a.amount)}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {preview.affectedParties.length > 8 && (
                      <p className="mt-1 text-xs">…and {preview.affectedParties.length - 8} more.</p>
                    )}
                  </div>
                )}

                <label
                  className={`mt-5 flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm ${
                    canPurge ? "cursor-pointer border-rose-200 bg-rose-50/40" : "cursor-not-allowed border-gray-200 bg-gray-50 opacity-70"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={withLinked}
                    disabled={!canPurge}
                    onChange={(e) => setWithLinked(e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-rose-600"
                  />
                  <span>
                    <span className="font-medium text-gray-800">Also delete all data linked to this party</span>
                    <span className="block text-xs text-gray-500">
                      Everything listed above is deleted permanently. This can&apos;t be undone.
                    </span>
                    {!canPurge && (
                      <span className="mt-1 flex items-center gap-1 text-xs text-gray-500">
                        <Lock size={11} /> You don&apos;t have access to delete linked data. Ask an admin.
                      </span>
                    )}
                  </span>
                </label>

                {withLinked ? (
                  <label className="mt-4 block">
                    <span className="mb-1 block text-xs font-medium text-gray-500">
                      Type <strong className="text-gray-700">{party.name}</strong> to confirm
                    </span>
                    <input value={typed} onChange={(e) => setTyped(e.target.value)} className="input" autoFocus />
                  </label>
                ) : (
                  <p className="mt-3 text-xs text-gray-500">
                    Without this, a party with linked data can&apos;t be deleted — deactivate it instead to hide it and keep
                    its history.
                  </p>
                )}
              </>
            )}

            {error && <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">
                Cancel
              </button>
              {hasLinked && !withLinked && !preview.staffLedger && party.isActive !== false && (
                <button
                  onClick={() => run("deactivate")}
                  disabled={busy}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Deactivate instead
                </button>
              )}
              {!preview.staffLedger && (
                <button
                  onClick={() => run(hasLinked ? "purge" : "delete")}
                  disabled={busy || (hasLinked && (!withLinked || !nameOk))}
                  className="flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Trash2 size={14} />
                  {busy ? "Deleting…" : hasLinked ? "Delete party and all linked data" : "Delete party"}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
