"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { getSitePhoto } from "@/lib/api";
import type { AttendanceApiResponse } from "@/lib/api";
import { formatDateIST } from "@/lib/datetime";
import { Camera, ChevronLeft, ChevronRight, Loader2, MapPin, ScanFace, X } from "lucide-react";

/** The fields of an attendance row the photo views read. */
export type PunchRow = Pick<
  AttendanceApiResponse,
  "date" | "inTime" | "outTime" | "punchInPhoto" | "punchOutPhoto" | "punchInBackPhoto" | "punchInLat" | "punchInLng"
  | "punchOutLat" | "punchOutLng" | "faceScoreIn" | "faceScoreOut" | "sitePhotos"
>;

export interface Shot {
  key: string;
  label: string;
  kind: "face" | "site";
  direction: "IN" | "OUT";
  /** What to draw in lists: the selfie itself, or a site photo's thumbnail. */
  src: string | null;
  /** Site photos only: fetch the full image by this id. */
  photoId?: number;
  time: string | null;
  lat?: number | null;
  lng?: number | null;
  score?: number | null;
}

/**
 * Every photo on a day's punches, in order: punch-in selfie, punch-in site photos, punch-out selfie,
 * punch-out site photos. Selfies may be missing on wide-range lists (the server leaves them out);
 * site photos always come as thumbnails.
 */
export function punchShots(a: PunchRow | null | undefined): Shot[] {
  if (!a) return [];
  const out: Shot[] = [];
  const site = (dir: "IN" | "OUT") =>
    (a.sitePhotos ?? [])
      .filter((p) => p.direction === dir)
      .map((p, i): Shot => ({
        key: `site-${p.id}`,
        label: `Site photo ${i + 1}`,
        kind: "site",
        direction: dir,
        src: p.thumb,
        photoId: p.id,
        time: p.takenAt && p.takenAt.length >= 16 ? p.takenAt.slice(11, 16) : dir === "IN" ? a.inTime : a.outTime,
        lat: dir === "IN" ? a.punchInLat : a.punchOutLat,
        lng: dir === "IN" ? a.punchInLng : a.punchOutLng,
      }));
  if (a.punchInPhoto) out.push({ key: "in-face", label: "Selfie", kind: "face", direction: "IN", src: a.punchInPhoto, time: a.inTime, lat: a.punchInLat, lng: a.punchInLng, score: a.faceScoreIn });
  if (a.punchInBackPhoto) out.push({ key: "in-back", label: "Site photo", kind: "site", direction: "IN", src: a.punchInBackPhoto, time: a.inTime, lat: a.punchInLat, lng: a.punchInLng });
  out.push(...site("IN"));
  if (a.punchOutPhoto) out.push({ key: "out-face", label: "Selfie", kind: "face", direction: "OUT", src: a.punchOutPhoto, time: a.outTime, lat: a.punchOutLat, lng: a.punchOutLng, score: a.faceScoreOut });
  out.push(...site("OUT"));
  return out;
}

/**
 * A row of small thumbnails for a day's punch photos (first few, then "+N"); clicking opens the
 * full-screen viewer. Renders nothing on a day without photos.
 */
export function PunchPhotoThumbs({ row, name, size = 28, max = 4 }: { row: PunchRow | null | undefined; name: string; size?: number; max?: number }) {
  const shots = punchShots(row);
  const [openAt, setOpenAt] = useState<number | null>(null);
  if (shots.length === 0) return null;
  const shown = shots.slice(0, max);
  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpenAt(0); }}
        title={`View ${shots.length} punch photo${shots.length === 1 ? "" : "s"}`}
        className="flex shrink-0 items-center -space-x-2"
      >
        {shown.map((s) => (
          <Thumb key={s.key} shot={s} size={size} />
        ))}
        {shots.length > shown.length && (
          <span
            style={{ width: size, height: size }}
            className="flex items-center justify-center rounded-full bg-gray-800 text-[10px] font-semibold text-white ring-2 ring-white"
          >
            +{shots.length - shown.length}
          </span>
        )}
      </button>
      {openAt != null && (
        <PhotoViewer shots={shots} index={openAt} title={`${name}${row?.date ? ` · ${formatDateIST(row.date)}` : ""}`} onClose={() => setOpenAt(null)} />
      )}
    </>
  );
}

function Thumb({ shot, size }: { shot: Shot; size: number }) {
  return shot.src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={shot.src}
      alt={shot.label}
      style={{ width: size, height: size }}
      className={`rounded-full object-cover ring-2 transition-transform hover:z-10 hover:scale-110 ${shot.kind === "site" ? "ring-amber-200" : "ring-white"}`}
    />
  ) : (
    <span style={{ width: size, height: size }} className="flex items-center justify-center rounded-full bg-gray-100 text-gray-400 ring-2 ring-white">
      <Camera size={Math.max(10, size / 2.5)} />
    </span>
  );
}

/** Large grid of a day's punch photos, grouped Punch in / Punch out; click one for the viewer. */
export function PunchPhotoGrid({ shots, title = "" }: { shots: Shot[]; title?: string }) {
  const [openAt, setOpenAt] = useState<number | null>(null);
  const groups: { dir: "IN" | "OUT"; label: string }[] = [
    { dir: "IN", label: "Punch in" },
    { dir: "OUT", label: "Punch out" },
  ];
  return (
    <div className="space-y-3">
      {groups.map((g) => {
        const list = shots.map((s, i) => ({ s, i })).filter(({ s }) => s.direction === g.dir);
        if (list.length === 0) return null;
        return (
          <div key={g.dir}>
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{g.label}</div>
            <div className="grid grid-cols-3 gap-2">
              {list.map(({ s, i }) => (
                <button key={s.key} type="button" onClick={() => setOpenAt(i)} className="group overflow-hidden rounded-lg border border-gray-200 bg-gray-50 text-left">
                  {s.src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.src} alt={s.label} className="aspect-square w-full object-cover transition-transform group-hover:scale-105" />
                  ) : (
                    <span className="flex aspect-square w-full items-center justify-center text-gray-300"><Camera size={20} /></span>
                  )}
                  <span className="flex items-center justify-between gap-1 px-1.5 py-1 text-[10px] font-medium text-gray-600">
                    <span className="flex items-center gap-1 truncate">{s.kind === "face" ? <ScanFace size={10} /> : <Camera size={10} />}{s.label}</span>
                    {s.time && <span className="shrink-0 text-gray-400">{s.time}</span>}
                  </span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
      {openAt != null && <PhotoViewer shots={shots} index={openAt} title={title} onClose={() => setOpenAt(null)} />}
    </div>
  );
}

/** Full-screen viewer with previous / next; site photos load at full size on demand. */
function PhotoViewer({ shots, index, title, onClose }: { shots: Shot[]; index: number; title: string; onClose: () => void }) {
  const [at, setAt] = useState(index);
  const [full, setFull] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const shot = shots[at];

  useEffect(() => {
    if (!shot?.photoId || full[shot.key] || failed[shot.key]) return;
    let cancelled = false;
    getSitePhoto(shot.photoId)
      .then((r) => { if (!cancelled) setFull((f) => ({ ...f, [shot.key]: r.photo })); })
      .catch(() => { if (!cancelled) setFailed((f) => ({ ...f, [shot.key]: true })); });
    return () => { cancelled = true; };
  }, [shot, full, failed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setAt((a) => Math.min(shots.length - 1, a + 1));
      if (e.key === "ArrowLeft") setAt((a) => Math.max(0, a - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shots.length, onClose]);

  if (!shot || typeof document === "undefined") return null;
  const src = shot.photoId ? full[shot.key] ?? shot.src : shot.src;
  const loading = !!shot.photoId && !full[shot.key] && !failed[shot.key];

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex flex-col bg-black/90" onClick={onClose}>
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-white" onClick={(e) => e.stopPropagation()}>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{title}</div>
          <div className="text-xs text-white/70">
            {shot.direction === "IN" ? "Punch in" : "Punch out"} · {shot.label}{shot.time ? ` · ${shot.time}` : ""} · {at + 1} of {shots.length}
          </div>
        </div>
        <button onClick={onClose} aria-label="Close" className="rounded-full p-1.5 hover:bg-white/10"><X size={20} /></button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-12" onClick={(e) => e.stopPropagation()}>
        {at > 0 && (
          <button onClick={() => setAt(at - 1)} aria-label="Previous" className="absolute left-2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"><ChevronLeft size={22} /></button>
        )}
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={shot.label} className="max-h-full max-w-full rounded-lg object-contain" />
        ) : (
          <div className="text-sm text-white/70">Photo not available.</div>
        )}
        {loading && <Loader2 size={26} className="absolute animate-spin text-white" />}
        {at < shots.length - 1 && (
          <button onClick={() => setAt(at + 1)} aria-label="Next" className="absolute right-2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"><ChevronRight size={22} /></button>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 px-4 py-3 text-xs text-white/80" onClick={(e) => e.stopPropagation()}>
        {/* Stored as the face-descriptor distance at punch time — lower is a closer match. */}
        {shot.score != null && <span className="text-emerald-300">Face verified · distance {Number(shot.score).toFixed(2)}</span>}
        {shot.lat != null && shot.lng != null && (
          <a href={`https://www.google.com/maps?q=${shot.lat},${shot.lng}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-cyan-300 hover:underline">
            <MapPin size={12} /> {Number(shot.lat).toFixed(5)}, {Number(shot.lng).toFixed(5)}
          </a>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** The selected day's punches: in / out times, hours, and the photos taken at each punch. */
export function DayPunchDetails({ row, name = "" }: { row: AttendanceApiResponse | null | undefined; name?: string }) {
  if (!row || (!row.inTime && !row.outTime)) {
    return <p className="mb-3 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">No punches on this day.</p>;
  }
  const shots = punchShots(row);
  return (
    <div className="mb-3 space-y-2">
      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded-lg bg-gray-50 px-2 py-1.5"><div className="text-gray-400">In</div><div className="font-semibold text-gray-800">{row.inTime ?? "—"}</div></div>
        <div className="rounded-lg bg-gray-50 px-2 py-1.5"><div className="text-gray-400">Out</div><div className="font-semibold text-gray-800">{row.outTime ?? "—"}</div></div>
        <div className="rounded-lg bg-gray-50 px-2 py-1.5"><div className="text-gray-400">Hours</div><div className="font-semibold text-gray-800">{row.workedHours != null ? Number(row.workedHours).toFixed(2) : "—"}</div></div>
      </div>
      {shots.length > 0
        ? <PunchPhotoGrid shots={shots} title={`${name}${name ? " · " : ""}${formatDateIST(row.date)}`} />
        : <p className="text-[11px] text-gray-400">Marked without a photo (entered by an admin).</p>}
    </div>
  );
}
