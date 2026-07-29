"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, RefreshCw, X } from "lucide-react";
import { getFaceDescriptor, loadFaceModels } from "@/lib/faceApi";

export interface FaceCaptureResult {
  /** Small JPEG data URL of the captured selfie (for the audit trail / admin view). */
  photo: string;
  /** 128-float faceprint of the captured face. */
  descriptor: number[];
}

type Phase = "init" | "ready" | "working" | "error";

interface Props {
  title: string;
  subtitle: string;
  /** Button label once the camera is live, e.g. "Capture & Enrol" or "Capture & Punch In". */
  actionLabel: string;
  onCapture: (result: FaceCaptureResult) => void;
  onCancel: () => void;
}

/**
 * A camera modal that captures a selfie and computes its faceprint. Used both to enrol a staff's
 * reference face and to verify identity on each punch. Handles model loading, camera permission,
 * and the "no face detected" case; never resolves without a real face in frame.
 */
export function FaceCapture({ title, subtitle, actionLabel, onCapture, onCancel }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [phase, setPhase] = useState<Phase>("init");
  const [status, setStatus] = useState("Loading face models…");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        setStatus("Loading face models…");
        await loadFaceModels();
        if (cancelled) return;

        setStatus("Starting camera…");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => {});
        }
        setPhase("ready");
        setStatus("");
      } catch (err) {
        if (cancelled) return;
        setPhase("error");
        setError(
          err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "SecurityError")
            ? "Camera permission denied. Please allow camera access and try again."
            : err instanceof DOMException && err.name === "NotFoundError"
              ? "No camera found on this device."
              : err instanceof Error
                ? err.message
                : "Could not start the camera.",
        );
      }
    }

    start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  async function capture() {
    const video = videoRef.current;
    if (!video || phase !== "ready") return;
    setPhase("working");
    setError("");
    setStatus("Checking your face…");
    try {
      // Snapshot the current frame to a canvas at native resolution for detection.
      const w = video.videoWidth || 640;
      const h = video.videoHeight || 480;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas not supported.");
      ctx.drawImage(video, 0, 0, w, h);

      const result = await getFaceDescriptor(canvas);
      if (!result) {
        setPhase("ready");
        setStatus("");
        setError("No face detected. Center your face in the frame and try again.");
        return;
      }

      // Downscale to a small JPEG for storage (keeps localStorage tiny).
      const scale = Math.min(1, 320 / w);
      const thumb = document.createElement("canvas");
      thumb.width = Math.round(w * scale);
      thumb.height = Math.round(h * scale);
      thumb.getContext("2d")?.drawImage(canvas, 0, 0, thumb.width, thumb.height);
      const photo = thumb.toDataURL("image/jpeg", 0.7);

      streamRef.current?.getTracks().forEach((t) => t.stop());
      onCapture({ photo, descriptor: result.descriptor });
    } catch (err) {
      setPhase("ready");
      setStatus("");
      setError(err instanceof Error ? err.message : "Face check failed. Please try again.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onCancel}>
      <div
        className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
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
          {/* Mirror the preview so it feels like a mirror to the user. */}
          <video
            ref={videoRef}
            playsInline
            muted
            className="h-full w-full object-cover"
            style={{ transform: "scaleX(-1)" }}
          />
          {phase !== "ready" && phase !== "working" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gray-900/80 text-center text-sm text-white">
              {phase === "error" ? (
                <span className="px-6 text-rose-200">{error}</span>
              ) : (
                <>
                  <Loader2 size={22} className="animate-spin" />
                  <span>{status}</span>
                </>
              )}
            </div>
          )}
          {phase === "working" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gray-900/50 text-center text-sm text-white">
              <Loader2 size={22} className="animate-spin" />
              <span>{status}</span>
            </div>
          )}
          {/* Framing guide */}
          {phase === "ready" && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-40 w-32 rounded-[50%] border-2 border-white/70" />
            </div>
          )}
        </div>

        {error && phase === "ready" && (
          <div className="bg-rose-50 px-4 py-2 text-xs text-rose-600">{error}</div>
        )}

        <div className="flex items-center gap-2 px-4 py-3">
          <button
            onClick={onCancel}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={capture}
            disabled={phase !== "ready"}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-brand-accent px-4 py-2 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95 disabled:opacity-50"
          >
            {phase === "working" ? <Loader2 size={16} className="animate-spin" /> : phase === "error" ? <RefreshCw size={16} /> : <Camera size={16} />}
            {actionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
