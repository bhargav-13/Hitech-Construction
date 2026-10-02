"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, ImageUp, Loader2, X } from "lucide-react";

/** Longest side of the stored photo — enough to read a site board, small enough for a TEXT column. */
const MAX_SIDE = 640;

function toJpeg(source: CanvasImageSource, w: number, h: number): string {
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext("2d")?.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.7);
}

interface Props {
  title: string;
  subtitle: string;
  actionLabel: string;
  onCapture: (photo: string) => void;
  onCancel: () => void;
}

/**
 * Back-camera photo for a site punch — the face selfie proves who, this proves where. Opens the
 * rear camera live; if the browser can't (no permission, desktop without one), it falls back to the
 * phone's own camera through a file picker so the punch is never blocked by the preview.
 */
export function BackPhotoCapture({ title, subtitle, actionLabel, onCapture, onCancel }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<"init" | "ready" | "fallback">("init");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
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
        setPhase("ready");
      } catch {
        if (!cancelled) setPhase("fallback");
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  function capture() {
    const video = videoRef.current;
    if (!video || phase !== "ready") return;
    const photo = toJpeg(video, video.videoWidth || 640, video.videoHeight || 480);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    onCapture(photo);
  }

  function onFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please take or choose a photo.");
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const photo = toJpeg(img, img.naturalWidth, img.naturalHeight);
      URL.revokeObjectURL(url);
      onCapture(photo);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setError("Couldn't read that photo — please try again.");
    };
    img.src = url;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onCancel}>
      <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-gray-100 px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
            <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>
          </div>
          <button onClick={onCancel} className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X size={16} />
          </button>
        </div>

        <div className="relative aspect-[4/3] bg-gray-900">
          <video ref={videoRef} playsInline muted className={`h-full w-full object-cover ${phase === "ready" ? "" : "hidden"}`} />
          {phase === "init" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-white">
              <Loader2 size={22} className="animate-spin" />
              <span>Starting back camera…</span>
            </div>
          )}
          {phase === "fallback" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center text-sm text-white">
              <ImageUp size={26} className="text-white/80" />
              <span>Live camera isn&apos;t available here. Use your phone camera to take the site photo.</span>
            </div>
          )}
        </div>

        {error && <div className="bg-rose-50 px-4 py-2 text-xs text-rose-600">{error}</div>}

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => onFile(e.target.files?.[0])}
        />

        <div className="flex items-center gap-2 px-4 py-3">
          <button
            onClick={onCancel}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={phase === "ready" ? capture : () => fileRef.current?.click()}
            disabled={phase === "init"}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-brand-accent px-4 py-2 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95 disabled:opacity-50"
          >
            {phase === "fallback" ? <ImageUp size={16} /> : <Camera size={16} />}
            {phase === "fallback" ? "Take site photo" : actionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
