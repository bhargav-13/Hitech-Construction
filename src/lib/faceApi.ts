// Client-side face recognition for punch verification. Wraps @vladmandic/face-api so the heavy
// model bundle (~7 MB) is imported lazily — only when the punch page actually needs it — and never
// on the server. Models are served from /public/models (bundled, no external calls at runtime).
//
// Flow: enrol once (store a 128-float descriptor + a small selfie on the staff record), then on
// every punch capture a fresh selfie, compute its descriptor and compare Euclidean distance to the
// enrolled one. A distance at or below FACE_MATCH_THRESHOLD is the same person.

// face-api is dynamically imported; keep the type loose to avoid pulling it into the server bundle.
type FaceApi = typeof import("@vladmandic/face-api");

/** Same person if the descriptor distance is at or below this. 0.6 is the library default; we use a
 *  slightly stricter 0.55 so a look-alike is less likely to pass, while real re-captures still match. */
export const FACE_MATCH_THRESHOLD = 0.55;

const MODEL_URL = "/models";

let faceapiPromise: Promise<FaceApi> | null = null;
let modelsPromise: Promise<void> | null = null;

async function getFaceApi(): Promise<FaceApi> {
  // Import the browser ESM build explicitly — the package "main" is the Node build (needs
  // @tensorflow/tfjs-node), which must never be pulled into the client bundle.
  if (!faceapiPromise) {
    faceapiPromise = import("@vladmandic/face-api/dist/face-api.esm.js") as unknown as Promise<FaceApi>;
  }
  return faceapiPromise;
}

/** Pick a TensorFlow backend. Prefer WebGL (fast), but fall back to CPU when WebGL is unavailable or
 *  unhealthy — this keeps face verification working on low-end site phones with flaky GPU drivers.
 *  A global `__faceBackend` override lets tests / support force a specific backend. */
async function initBackend(faceapi: FaceApi): Promise<void> {
  const tf = faceapi.tf as unknown as {
    setBackend: (b: string) => Promise<boolean>;
    ready: () => Promise<void>;
    getBackend: () => string;
  };
  const forced = typeof window !== "undefined" ? (window as unknown as { __faceBackend?: string }).__faceBackend : undefined;
  const order = forced ? [forced] : ["webgl", "cpu"];
  for (const b of order) {
    try {
      const ok = await tf.setBackend(b);
      if (ok) {
        await tf.ready();
        return;
      }
    } catch {
      // try the next backend
    }
  }
  await tf.ready();
}

/** Load the detection + landmark + recognition models once (idempotent). */
export async function loadFaceModels(): Promise<void> {
  if (!modelsPromise) {
    modelsPromise = (async () => {
      const faceapi = await getFaceApi();
      await initBackend(faceapi);
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ]);
    })().catch((e) => {
      // Let a later call retry rather than caching a rejected promise forever.
      modelsPromise = null;
      throw e;
    });
  }
  return modelsPromise;
}

export interface FaceResult {
  /** 128-dimension face descriptor (the "faceprint"), stored as a plain array for JSON/localStorage. */
  descriptor: number[];
}

/**
 * Detect the single most prominent face in an image/video/canvas and return its descriptor.
 * Returns null when no face is found (caller shows "no face detected, center your face").
 */
export async function getFaceDescriptor(
  input: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
): Promise<FaceResult | null> {
  const faceapi = await getFaceApi();
  await loadFaceModels();
  const detection = await faceapi
    .detectSingleFace(input, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
    .withFaceLandmarks()
    .withFaceDescriptor();
  if (!detection) return null;
  return { descriptor: Array.from(detection.descriptor) };
}

/** Euclidean distance between two descriptors — smaller means more similar (0 = identical). */
export function descriptorDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) return Number.POSITIVE_INFINITY;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

/** Do two faceprints belong to the same person? */
export function isSameFace(a: number[], b: number[]): { match: boolean; distance: number } {
  const distance = descriptorDistance(a, b);
  return { match: distance <= FACE_MATCH_THRESHOLD, distance };
}
