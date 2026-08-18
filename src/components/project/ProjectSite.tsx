"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Layers3, MapPin, Radar, Users } from "lucide-react";
import { LocationStructure } from "@/components/LocationStructure";
import { Spinner } from "@/components/Spinner";
import { getLocations, ApiError } from "@/lib/api";
import type { LocationApi, ProjectResponse } from "@/lib/api";

/**
 * Project → Site tab (the old "Design" placeholder).
 *
 * <p>Three things about a physical site already existed in the database and had no route into the
 * project workspace: its location breakdown (`project_locations` — tower/floor/unit), the punch
 * geofence drawn around it (`payroll_locations.project_id`, V31), and the fallback punch radius on
 * the project itself. They're all one subject, so they're one tab.
 */
export function ProjectSite({ project }: { project: ProjectResponse }) {
  const [fences, setFences] = useState<LocationApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    getLocations()
      .then((all) => {
        if (!cancelled) setFences(all.filter((l) => l.projectId === project.id));
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof ApiError ? e.message : "Couldn't load site geofences.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [project.id]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <MapPin size={15} className="text-slate-400" />
            Address
          </div>
          <div className="mt-2 text-sm text-slate-600">
            {[project.address, project.city].filter(Boolean).join(", ") || "No address set"}
          </div>
          {project.companyBranch && (
            <div className="mt-1 text-xs text-slate-400">Branch: {project.companyBranch}</div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Radar size={15} className="text-slate-400" />
            Punch radius
          </div>
          <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
            {project.attendanceRadius}
            <span className="ml-1 text-sm font-normal text-slate-400">m</span>
          </div>
          <div className="mt-1 text-xs text-slate-400">
            How far from the site a member may punch when no geofence is drawn.
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Layers3 size={15} className="text-slate-400" />
            Site details
          </div>
          <dl className="mt-2 space-y-1 text-sm">
            <Row label="Orientation" value={project.orientation} />
            <Row label="Dimension" value={project.dimension} />
            <Row label="Stage" value={project.stage} />
          </dl>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">Work-site geofences</h3>
          <Link href="/payroll/locations" className="text-xs text-brand-accent hover:underline">
            Manage in Payroll
          </Link>
        </div>
        <p className="mb-3 text-xs text-slate-400">
          A boundary linked to this project lets every project member punch inside it, without ticking
          each person individually.
        </p>
        {loading ? (
          <div className="flex justify-center py-6"><Spinner /></div>
        ) : error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50/60 px-3 py-4 text-center text-sm text-rose-700">
            {error}
          </div>
        ) : fences.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 px-3 py-6 text-center text-sm text-slate-400">
            No geofence is linked to this project. Members fall back to the {project.attendanceRadius} m radius above.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {fences.map((f) => (
              <li key={f.id} className="flex items-center justify-between py-2.5">
                <div>
                  <div className="text-sm font-medium text-slate-800">{f.name}</div>
                  <div className="text-xs text-slate-400">{f.points.length} boundary points</div>
                </div>
                <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                  <Users size={13} className="text-slate-400" />
                  {f.memberIds.length} directly assigned
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">Location structure</h3>
        <LocationStructure projectId={project.id} />
      </div>

      {project.scopeOfWork && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-2 text-sm font-semibold text-slate-700">Scope of work</h3>
          <p className="whitespace-pre-wrap text-sm text-slate-600">{project.scopeOfWork}</p>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-slate-400">{label}</dt>
      <dd className="font-medium text-slate-700">{value || "—"}</dd>
    </div>
  );
}
