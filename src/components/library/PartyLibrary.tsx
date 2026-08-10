"use client";

import { useEffect, useMemo, useState } from "react";
import { LayoutGrid, Mail, MapPin, Phone, Rows3, Search } from "lucide-react";
import { Spinner } from "@/components/Spinner";
import { Select } from "@/components/Select";
import { PartyDrawer } from "@/components/library/PartyDrawer";
import { StarRating } from "@/components/library/StarRating";
import { projectAvatarColor } from "@/lib/projectHelpers";
import { useLibraryParties } from "@/lib/useLibraryParties";
import { usePartyRatings } from "@/lib/usePartyRatings";
import {
  PARTY_TYPES,
  PARTY_TYPE_GROUPS,
  PARTY_TYPE_STYLE,
  type LibraryParty,
  type LibraryPartyType,
} from "@/lib/libraryTypes";
import * as api from "@/lib/api";
import type { RoleResponse } from "@/lib/api";

/**
 * One directory over every party the business deals with. The records stay in their own systems —
 * staff and workers in user-management, clients and vendors in Vyapar — and this reads across both
 * so there's no third copy to keep in sync. Editing writes back to whichever system owns the row.
 */
export function PartyLibrary() {
  const { parties, loading, error, refresh } = useLibraryParties();
  const { ratingOf, setRating } = usePartyRatings();
  const [roles, setRoles] = useState<RoleResponse[]>([]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | LibraryPartyType>("all");
  const [statusFilter, setStatusFilter] = useState<"active" | "inactive" | "all">("active");
  const [view, setView] = useState<"table" | "grid">("table");
  const [drawer, setDrawer] = useState<{ mode: "create" } | { mode: "edit"; party: LibraryParty } | null>(null);

  useEffect(() => {
    api.getRoles().then(setRoles).catch(() => setRoles([]));
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return parties.filter((p) => {
      if (typeFilter !== "all" && p.type !== typeFilter) return false;
      if (statusFilter === "active" && !p.isActive) return false;
      if (statusFilter === "inactive" && p.isActive) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.phone ?? "").toLowerCase().includes(q) ||
        (p.email ?? "").toLowerCase().includes(q)
      );
    });
  }, [parties, search, typeFilter, statusFilter]);

  // Counts drive the chips, so you can see where the records are before filtering.
  const countByType = useMemo(() => {
    const map = new Map<LibraryPartyType, number>();
    for (const p of parties) map.set(p.type, (map.get(p.type) ?? 0) + 1);
    return map;
  }, [parties]);

  return (
    <div className="animate-fade-in space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-xl text-sm text-gray-500">
          Everyone the business deals with — staff and workers from Members, clients and vendors from Vyapar.
        </p>
        <button
          onClick={() => setDrawer({ mode: "create" })}
          className="shrink-0 rounded-lg bg-brand-accent px-4 py-2 text-sm font-medium text-white transition-all duration-150 hover:opacity-90 active:scale-95"
        >
          + Add Party
        </button>
      </div>

      {error && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}

      <div className="flex flex-wrap gap-1.5">
        <TypeChip label="All" count={parties.length} active={typeFilter === "all"} onClick={() => setTypeFilter("all")} />
        {PARTY_TYPE_GROUPS.flatMap((group) =>
          group.types
            .filter((t) => (countByType.get(t) ?? 0) > 0)
            .map((t) => (
              <TypeChip
                key={t}
                label={t}
                count={countByType.get(t) ?? 0}
                active={typeFilter === t}
                onClick={() => setTypeFilter(t)}
              />
            ))
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-gray-400">
          {filtered.length} of {parties.length} {parties.length === 1 ? "party" : "parties"}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-1.5 transition-colors duration-150 focus-within:border-cyan-400">
            <Search size={14} className="text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, phone, email…"
              className="w-52 bg-transparent text-sm outline-none"
            />
          </div>
          <Select
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as typeof statusFilter)}
            size="sm"
            className="min-w-[120px]"
            options={[
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
              { value: "all", label: "All status" },
            ]}
          />
          <Select
            value={typeFilter}
            onChange={(v) => setTypeFilter(v as typeof typeFilter)}
            size="sm"
            className="min-w-[165px]"
            options={[
              { value: "all", label: `All types (${parties.length})` },
              ...PARTY_TYPES.map((t) => ({ value: t, label: `${t} (${countByType.get(t) ?? 0})` })),
            ]}
          />
          <div className="flex items-center gap-0.5 rounded-lg border border-gray-200 bg-gray-50 p-0.5">
            {([["table", Rows3], ["grid", LayoutGrid]] as const).map(([v, Icon]) => (
              <button
                key={v}
                onClick={() => setView(v)}
                title={v === "table" ? "Table" : "Grid"}
                className={`rounded-md px-2.5 py-1.5 transition-all duration-150 ${
                  view === v ? "bg-white text-brand-accent shadow-sm" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <Icon size={14} />
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white py-16 text-sm text-gray-400">
          <Spinner size={16} className="text-brand-accent" />
          Loading…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white py-12 text-center text-sm text-gray-400">
          No parties match.
        </div>
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((p) => (
            <button
              key={p.key}
              onClick={() => setDrawer({ mode: "edit", party: p })}
              className="group rounded-xl border border-gray-200 bg-white p-4 text-left transition-all duration-150 hover:-translate-y-0.5 hover:border-brand-accent hover:shadow-md active:scale-[0.99]"
            >
              <div className="flex items-center gap-3">
                <PartyAvatar party={p} size={44} />
                <div className="min-w-0">
                  <div className="truncate font-medium text-gray-800 group-hover:text-brand-accent">{p.name}</div>
                  <div className="truncate text-xs text-gray-400">{p.subtitle ?? p.email ?? "—"}</div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <TypePill type={p.type} />
                {!p.isActive && (
                  <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">Inactive</span>
                )}
              </div>
              <div className="mt-2.5 flex items-center justify-between gap-3 text-xs text-gray-500">
                {p.phone ? (
                  <span className="flex items-center gap-1">
                    <Phone size={11} /> {p.phone}
                  </span>
                ) : (
                  <span />
                )}
                <StarRating value={ratingOf(p.key)} onChange={(n) => setRating(p.key, n)} size={13} />
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="w-full min-w-0 overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium text-gray-500">
                <th className="px-4 py-3">Party</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Mobile</th>
                <th className="px-4 py-3">Details</th>
                <th className="px-4 py-3">Rating</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr
                  key={p.key}
                  onClick={() => setDrawer({ mode: "edit", party: p })}
                  className="cursor-pointer border-b border-gray-50 transition-colors duration-150 last:border-b-0 even:bg-gray-50/50 hover:bg-cyan-50/40"
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <PartyAvatar party={p} size={32} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 font-medium text-gray-800">
                          {p.name}
                          {!p.isActive && (
                            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                              Inactive
                            </span>
                          )}
                        </div>
                        {p.email && (
                          <div className="flex items-center gap-1 truncate text-xs text-gray-400">
                            <Mail size={10} className="shrink-0" /> {p.email}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <TypePill type={p.type} />
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">{p.phone ?? "—"}</td>
                  <td className="px-4 py-2.5 text-gray-500">
                    {p.subtitle ? (
                      <span className="flex items-center gap-1 text-xs">
                        <MapPin size={11} className="shrink-0 text-gray-300" />
                        {p.subtitle}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <StarRating value={ratingOf(p.key)} onChange={(n) => setRating(p.key, n)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {drawer && (
        <PartyDrawer
          roles={roles}
          existing={drawer.mode === "edit" ? drawer.party : undefined}
          onClose={() => setDrawer(null)}
          onSaved={() => {
            setDrawer(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function TypeChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-medium transition-all duration-150 active:scale-95 ${
        active ? "bg-brand-accent text-white shadow-sm" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
      }`}
    >
      {label} <span className={active ? "opacity-75" : "text-gray-400"}>{count}</span>
    </button>
  );
}

function TypePill({ type }: { type: LibraryPartyType }) {
  return <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-medium ${PARTY_TYPE_STYLE[type]}`}>{type}</span>;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function PartyAvatar({ party, size }: { party: LibraryParty; size: number }) {
  if (party.photoUrl) {
    return (
      // Data-URL avatars — a plain img is correct here (next/image can't optimize data URLs).
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={party.photoUrl}
        alt={party.name}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${projectAvatarColor(party.key)}`}
      style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.36)) }}
    >
      {initialsOf(party.name)}
    </div>
  );
}
