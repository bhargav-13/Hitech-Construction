"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, Loader2, X } from "lucide-react";

/** Longest side of a stored site photo, and of its list thumbnail. */
const PHOTO_SIDE = 1280;
const THUMB_SIDE = 220;
export const MAX_SITE_PHOTOS = 5;

export interface SitePhoto {
  photo: string;
  thumb: string;
}

function draw(source: CanvasImageSource, w: number, h: number, side: number, quality: number): string {
  const scale = Math.min(1, side / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  canvas.getContext("2d")?.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

function encode(source: CanvasImageSource, w: number, h: number): SitePhoto {
  return { photo: draw(source, w, h, PHOTO_SIDE, 0.75), thumb: draw(source, w, h, THUMB_SIDE, 0.6) };
}

/** Read a picked / captured image file into a downscaled photo + thumbnail. */
function fromFile(file: File): Promise<SitePhoto> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        resolve(encode(img, img.naturalWidth, img.naturalHeight));
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Couldn't read that photo."));
    };
    img.src = url;
  });
}

/**
 * Site photos at a punch — "where I am and what's here", after the face check proved who. Shoot as
 * many as needed with the back camera (live preview where the browser allows), or pick from the
 * gallery; up to five, each removable before saving. `required` makes at least one compulsory.
 */
export function SitePhotosCapture({
  direction,
  required,
  onDone,
  onCancel,
}: {
  direction: "in" | "out";
  required: boolean;
  onDone: (photos: SitePhoto[]) => void | Promise<void>;
  onCancel: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const [live, setLive] = useState<"init" | "ready" | "off">("init");
  const [photos, setPhotos] = useState<SitePhoto[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const full = photos.length >= MAX_SITE_PHOTOS;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("no camera api");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setLive("ready");
      } catch {
        if (!cancelled) setLive("off");
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  function shoot() {
    const v = videoRef.current;
    if (!v || live !== "ready" || full) return;
    setPhotos((p) => [...p, encode(v, v.videoWidth || 1280, v.videoHeight || 720)]);
    setError("");
  }

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    const room = MAX_SITE_PHOTOS - photos.length;
    const picked = [...files].filter((f) => f.type.startsWith("image/"));
    if (picked.length === 0) {
      setError("Please choose a photo.");
      return;
    }
    if (picked.length > room) setError(`Only ${MAX_SITE_PHOTOS} photos per punch — added the first ${room}.`);
    else setError("");
    const encoded: SitePhoto[] = [];
    for (const f of picked.slice(0, room)) {
      try {
        encoded.push(await fromFile(f));
      } catch {
        setError("One photo couldn't be read and was skipped.");
      }
    }
    setPhotos((p) => [...p, ...encoded].slice(0, MAX_SITE_PHOTOS));
  }

  async function finish(list: SitePhoto[]) {
    if (required && list.length === 0) {
      setError("Add at least one site photo.");
      return;
    }
    setBusy(true);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    try {
      await onDone(list);
    } finally {
      setBusy(false);
    }
  }

  const verb = direction === "in" ? "Punch In" : "Punch Out";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={busy ? undefined : onCancel}>
      <div className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-gray-100 px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">Site photos · {verb}</h3>
            <p className="mt-0.5 text-xs text-gray-500">
              Face verified. Now photograph the site — {required ? "at least one is required" : "optional"}, up to {MAX_SITE_PHOTOS}.
            </p>
          </div>
          <button onClick={onCancel} disabled={busy} className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X size={16} />
          </button>
        </div>

        <div className="relative aspect-[4/3] shrink-0 bg-gray-900">
          <video ref={videoRef} playsInline muted className={`h-full w-full object-cover ${live === "ready" ? "" : "hidden"}`} />
          {live === "init" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-white">
              <Loader2 size={22} className="animate-spin" /> Starting back camera…
            </div>
          )}
          {live === "off" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center text-sm text-white/90">
              <Camera size={26} />
              Live camera isn&apos;t available here — use “Take photo” or pick from your gallery.
            </div>
          )}
          {live === "ready" && (
            <button
              type="button"
              onClick={shoot}
              disabled={full}
              aria-label="Capture site photo"
              className="absolute bottom-3 left-1/2 flex h-14 w-14 -translate-x-1/2 items-center justify-center rounded-full border-4 border-white bg-white/30 backdrop-blur transition active:scale-90 disabled:opacity-40"
            >
              <Camera size={20} className="text-white" />
            </button>
          )}
          <span className="absolute right-2 top-2 rounded-full bg-black/50 px-2 py-0.5 text-[11px] font-semibold text-white">
            {photos.length}/{MAX_SITE_PHOTOS}
          </span>
        </div>

        <div className="space-y-3 overflow-y-auto px-4 py-3">
          {photos.length > 0 ? (
            <div className="grid grid-cols-5 gap-2">
              {photos.map((p, i) => (
                <div key={i} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.thumb} alt={`Site photo ${i + 1}`} className="aspect-square w-full rounded-lg object-cover ring-1 ring-gray-200" />
                  <button
                    type="button"
                    onClick={() => setPhotos((all) => all.filter((_, j) => j !== i))}
                    aria-label="Remove photo"
                    className="absolute -right-1.5 -top-1.5 rounded-full bg-rose-600 p-0.5 text-white shadow"
                  >
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-xs text-gray-400">No site photos yet.</p>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => cameraInput.current?.click()}
              disabled={full || busy}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <Camera size={15} /> Take photo
            </button>
            <button
              type="button"
              onClick={() => galleryInput.current?.click()}
              disabled={full || busy}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <ImagePlus size={15} /> From gallery
            </button>
          </div>
          <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { void addFiles(e.target.files); e.target.value = ""; }} />
          <input ref={galleryInput} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { void addFiles(e.target.files); e.target.value = ""; }} />

          {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-600">{error}</div>}
        </div>

        <div className="flex items-center gap-2 border-t border-gray-100 px-4 py-3">
          {!required && (
            <button
              type="button"
              onClick={() => finish([])}
              disabled={busy}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              Skip
            </button>
          )}
          <button
            type="button"
            onClick={() => finish(photos)}
            disabled={busy || (required && photos.length === 0)}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-brand-accent px-4 py-2 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95 disabled:opacity-50"
          >
            {busy && <Loader2 size={15} className="animate-spin" />}
            {verb}{photos.length ? ` · ${photos.length} photo${photos.length === 1 ? "" : "s"}` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
