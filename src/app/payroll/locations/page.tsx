"use client";

import { useEffect, useMemo, useState } from "react";
import { PayrollShell, PayrollEmpty } from "@/components/payroll/PayrollShell";
import { Spinner } from "@/components/Spinner";
import { Drawer } from "@/components/Drawer";
import { Select } from "@/components/Select";
import { RowMenu, RowMenuDivider, RowMenuItem } from "@/components/RowMenu";
import { MapPolygonPicker } from "@/components/payroll/MapPolygonPicker";
import { MapPolygonPreview } from "@/components/payroll/MapPolygonPreview";
import { useLocations } from "@/lib/usePayrollLive";
import { getTeam, getProjects, ApiError } from "@/lib/api";
import type { GeoPointApi, LocationApi, ProjectResponse, TeamMemberResponse } from "@/lib/api";
import { Building2, LayoutGrid, Map as MapIcon, MapPin, Navigation, Pencil, Plus, Search, Trash2, UserCheck, Users } from "lucide-react";

function center(points: GeoPointApi[]): { lat: number; lng: number } {
  if (!points.length) return { lat: 0, lng: 0 };
  const s = points.reduce((a, p) => ({ lat: a.lat + p.lat, lng: a.lng + p.lng }), { lat: 0, lng: 0 });
  return { lat: s.lat / points.length, lng: s.lng / points.length };
}

/** Area inside a boundary in square metres (shoelace over a local flat projection — fine at site scale). */
function areaSqM(points: GeoPointApi[]): number {
  if (points.length < 3) return 0;
  const R = 6371000;
  const lat0 = (center(points).lat * Math.PI) / 180;
  const xy = points.map((p) => [((p.lng * Math.PI) / 180) * R * Math.cos(lat0), ((p.lat * Math.PI) / 180) * R]);
  let a = 0;
  for (let i = 0, j = xy.length - 1; i < xy.length; j = i++) a += xy[j][0] * xy[i][1] - xy[i][0] * xy[j][1];
  return Math.abs(a / 2);
}

function areaLabel(points: GeoPointApi[]): string {
  const m2 = areaSqM(points);
  if (!m2) return "—";
  if (m2 >= 10000) return `${(m2 / 10000).toFixed(2)} ha`;
  return `${Math.round(m2).toLocaleString("en-IN")} m² · ${Math.round(m2 * 10.7639).toLocaleString("en-IN")} sq ft`;
}

/** Payroll Locations — geofenced sites (drawn as free-form polygons) that staff can punch from. Real backend. */
export default function LocationsPage() {
  const { locations, loading, error, create, update, remove } = useLocations();
  const [editing, setEditing] = useState<LocationApi | null | "new">(null);
  const [assigning, setAssigning] = useState<LocationApi | null>(null);
  const [actionError, setActionError] = useState("");
  const [view, setView] = useState<"cards" | "map">("cards");
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? locations.filter((l) => l.name.toLowerCase().includes(t) || (l.projectName ?? "").toLowerCase().includes(t)) : locations;
  }, [locations, q]);

  const mapShapes = useMemo(
    () => shown.map((l) => ({ id: l.id, name: l.name, points: l.points, tone: (l.approvalRequired ? "amber" : "cyan") as "amber" | "cyan" })),
    [shown],
  );

  async function del(loc: LocationApi) {
    if (!confirm(`Delete "${loc.name}"? Staff assigned to it will be unassigned.`)) return;
    try { await remove(loc.id); } catch (err) { setActionError(err instanceof ApiError ? err.message : "Unable to delete."); }
  }

  return (
    <PayrollShell requireAdmin>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Work Locations</h2>
            <p className="mt-0.5 text-sm text-gray-500">Draw each site&apos;s boundary on the map, then assign staff who can punch in there. Punch works only inside an assigned site.</p>
          </div>
          <button onClick={() => setEditing("new")} className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-3.5 py-2 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95">
            <Plus size={15} /> Add Location
          </button>
        </div>

        {actionError && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{actionError}</div>}
        {error && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}

        {locations.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex overflow-hidden rounded-lg border border-gray-200 bg-white">
              <button onClick={() => setView("cards")} className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium ${view === "cards" ? "bg-brand-accent text-white" : "text-gray-600 hover:bg-gray-50"}`}>
                <LayoutGrid size={14} /> Sites
              </button>
              <button onClick={() => setView("map")} className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium ${view === "map" ? "bg-brand-accent text-white" : "text-gray-600 hover:bg-gray-50"}`}>
                <MapIcon size={14} /> All on map
              </button>
            </div>
            <div className="relative w-64">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search site or project" className="input w-full pl-8" />
            </div>
            <span className="text-xs text-gray-500">{shown.length} of {locations.length} sites</span>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white py-16 text-sm text-gray-400">
            <Spinner size={16} className="text-brand-accent" /> Loading…
          </div>
        ) : locations.length === 0 ? (
          <PayrollEmpty
            icon={MapPin}
            title="No work locations yet"
            hint="Add a site and draw its boundary on the map. Staff can then punch in/out only when they're inside it."
            action={<button onClick={() => setEditing("new")} className="rounded-lg bg-brand-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90">+ Add Location</button>}
          />
        ) : (
          view === "map" ? (
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
              <MapPolygonPreview
                interactive
                className="h-[520px]"
                shapes={mapShapes}
                onSelect={(id) => { const l = locations.find((x) => x.id === id); if (l) setEditing(l); }}
              />
              <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-gray-100 px-4 py-2 text-xs text-gray-500">
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-cyan-600" /> Punch inside only</span>
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-amber-600" /> Punch outside goes for approval</span>
                <span>Click a site to edit it.</span>
              </div>
            </div>
          ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((loc) => {
              const c = center(loc.points);
              return (
                <div key={loc.id} className="flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white transition-shadow hover:shadow-md">
                  <button onClick={() => setEditing(loc)} title="Edit boundary" className="relative block border-b border-gray-100">
                    <MapPolygonPreview
                      className="pointer-events-none h-44"
                      shapes={[{ id: loc.id, name: loc.name, points: loc.points, tone: loc.approvalRequired ? "amber" : "cyan" }]}
                    />
                    {loc.approvalRequired && (
                      <span className="absolute left-2 top-2 z-[400] rounded-md bg-amber-500/95 px-2 py-0.5 text-[11px] font-semibold text-white shadow">Punch outside → approval</span>
                    )}
                  </button>
                  <div className="flex flex-1 flex-col p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-semibold text-gray-800">{loc.name}</h3>
                        <a
                          href={`https://www.google.com/maps?q=${c.lat},${c.lng}`}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-gray-400 hover:text-brand-accent"
                        >
                          <Navigation size={11} /> {c.lat.toFixed(5)}, {c.lng.toFixed(5)}
                        </a>
                      </div>
                      <RowMenu align="right" buttonLabel={`Actions for ${loc.name}`}>
                        {(close) => (
                          <>
                            <RowMenuItem icon={UserCheck} label="Assign staff" onClick={() => { close(); setAssigning(loc); }} />
                            <RowMenuItem icon={Pencil} label="Edit boundary" onClick={() => { close(); setEditing(loc); }} />
                            <RowMenuDivider />
                            <RowMenuItem icon={Trash2} label="Delete" tone="danger" onClick={() => { close(); del(loc); }} />
                          </>
                        )}
                      </RowMenu>
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-lg bg-gray-50 px-2.5 py-1.5">
                        <dt className="text-gray-400">Area</dt>
                        <dd className="font-medium text-gray-700">{areaLabel(loc.points)}</dd>
                      </div>
                      <div className="rounded-lg bg-gray-50 px-2.5 py-1.5">
                        <dt className="text-gray-400">Corners</dt>
                        <dd className="font-medium text-gray-700">{loc.points.length}</dd>
                      </div>
                    </dl>
                    {loc.projectName && (
                      <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-cyan-50/70 px-3 py-2 text-xs font-medium text-brand-accent">
                        <Building2 size={13} /> <span className="truncate">Project · {loc.projectName}</span>
                      </div>
                    )}
                    <button onClick={() => setAssigning(loc)} className="mt-auto flex w-full items-center justify-between rounded-lg border border-gray-100 px-3 py-2 pt-2 text-sm transition-colors hover:bg-cyan-50/60">
                      <span className="flex items-center gap-1.5 text-gray-600"><Users size={14} /> Assigned staff</span>
                      <span className="font-semibold text-gray-800">{loc.memberIds.length}{loc.projectName ? " + project team" : ""}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          )
        )}
      </div>

      {editing !== null && (
        <LocationDialog
          location={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSave={async (body) => {
            try {
              if (editing === "new") await create(body);
              else await update((editing as LocationApi).id, body);
              setEditing(null);
            } catch (err) {
              setActionError(err instanceof ApiError ? err.message : "Unable to save this location.");
            }
          }}
        />
      )}
      {assigning && (
        <AssignStaffDialog
          location={assigning}
          onClose={() => setAssigning(null)}
          onSave={async (memberIds) => {
            try {
              await update(assigning.id, { name: assigning.name, points: assigning.points, memberIds, projectId: assigning.projectId, approvalRequired: assigning.approvalRequired });
              setAssigning(null);
            } catch (err) {
              setActionError(err instanceof ApiError ? err.message : "Unable to save assignment.");
            }
          }}
        />
      )}
    </PayrollShell>
  );
}

function LocationDialog({
  location,
  onClose,
  onSave,
}: {
  location: LocationApi | null;
  onClose: () => void;
  onSave: (body: { name: string; points: GeoPointApi[]; memberIds: number[]; projectId: number | null; approvalRequired: boolean }) => Promise<void>;
}) {
  const [name, setName] = useState(location?.name ?? "");
  const [approvalRequired, setApprovalRequired] = useState(location?.approvalRequired ?? false);
  const [points, setPoints] = useState<GeoPointApi[]>(location?.points ?? []);
  const [projectId, setProjectId] = useState<string>(location?.projectId != null ? String(location.projectId) : "");
  const [projects, setProjects] = useState<ProjectResponse[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getProjects({ size: 200 })
      .then((r) => { if (!cancelled) setProjects(r.content); })
      .catch(() => { if (!cancelled) setProjects([]); });
    return () => { cancelled = true; };
  }, []);

  async function save() {
    if (!name.trim()) return setError("Location name is required.");
    if (points.length < 3) return setError("Tap at least 3 points on the map to enclose the site.");
    setSaving(true);
    setError("");
    // Preserve existing member assignment when editing the boundary.
    await onSave({
      name: name.trim(),
      points,
      memberIds: location?.memberIds ?? [],
      projectId: projectId ? Number(projectId) : null,
      approvalRequired,
    });
    setSaving(false);
  }

  return (
    <Drawer title={location ? "Edit Location" : "Add Location"} onClose={onClose} onSave={save} saveLabel={saving ? "Saving…" : "Save Location"} width="max-w-2xl">
      <div className="space-y-4">
        {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium tracking-wide text-gray-400 uppercase">Location Name *</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="e.g. Satellite Site, Head Office" autoFocus />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium tracking-wide text-gray-400 uppercase">Link to Project (optional)</span>
          <Select
            value={projectId}
            onChange={setProjectId}
            options={[{ value: "", label: "Not linked — assign staff manually" }, ...projects.map((p) => ({ value: String(p.id), label: p.name }))]}
          />
          <span className="mt-1 block text-[11px] text-gray-400">When linked, everyone on that project can punch here — no need to tick each person.</span>
        </label>
        <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-gray-200 px-3 py-2.5">
          <input type="checkbox" checked={approvalRequired} onChange={(e) => setApprovalRequired(e.target.checked)} className="mt-0.5 h-4 w-4 accent-brand-accent" />
          <span>
            <span className="text-sm font-medium text-gray-800">Allow punch outside, with approval</span>
            <span className="block text-xs text-gray-500">
              Off: punches outside the boundary are refused. On: they are saved as pending and an admin approves or rejects them on the Attendance page.
            </span>
          </span>
        </label>
        <div>
          <span className="mb-1 block text-[11px] font-medium tracking-wide text-gray-400 uppercase">Site Boundary</span>
          <MapPolygonPicker value={points} onChange={setPoints} />
        </div>
      </div>
    </Drawer>
  );
}

function AssignStaffDialog({
  location,
  onClose,
  onSave,
}: {
  location: LocationApi;
  onClose: () => void;
  onSave: (memberIds: number[]) => Promise<void>;
}) {
  const [team, setTeam] = useState<TeamMemberResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<Set<number>>(() => new Set(location.memberIds));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getTeam();
        if (!cancelled) setTeam(res.filter((u) => u.active));
      } catch {
        if (!cancelled) setTeam([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return team.filter((u) => !q || u.fullName.toLowerCase().includes(q) || (u.roleName ?? "").toLowerCase().includes(q));
  }, [team, search]);

  function toggle(id: number) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    await onSave(Array.from(picked));
    setSaving(false);
  }

  return (
    <Drawer title={`Assign staff · ${location.name}`} onClose={onClose} onSave={save} saveLabel={saving ? "Saving…" : `Save (${picked.size})`} width="max-w-md">
      <div className="space-y-4">
        <p className="text-sm text-gray-500">Tick the staff who can punch in/out at this location.</p>
        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 focus-within:border-cyan-500">
          <Search size={15} className="text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search staff…" className="w-full bg-transparent text-sm outline-none" autoFocus />
        </div>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-400"><Spinner size={16} className="text-brand-accent" /> Loading…</div>
        ) : (
          <div className="max-h-[440px] space-y-1.5 overflow-y-auto">
            {rows.map((u) => {
              const on = picked.has(u.id);
              return (
                <button key={u.id} onClick={() => toggle(u.id)} className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-all ${on ? "border-brand-accent bg-cyan-50/40" : "border-gray-200 bg-white hover:border-gray-300"}`}>
                  <input type="checkbox" checked={on} onChange={() => toggle(u.id)} onClick={(ev) => ev.stopPropagation()} className="accent-cyan-600" />
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cyan-50 text-xs font-semibold text-brand-accent">
                    {u.fullName.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-gray-800">{u.fullName}</div>
                    <div className="truncate text-xs text-gray-400">{u.roleName}{u.departmentName ? ` · ${u.departmentName}` : ""}</div>
                  </div>
                </button>
              );
            })}
            {rows.length === 0 && <div className="py-10 text-center text-sm text-gray-400">No staff match.</div>}
          </div>
        )}
      </div>
    </Drawer>
  );
}
