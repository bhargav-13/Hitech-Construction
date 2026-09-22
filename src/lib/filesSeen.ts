/**
 * "What's arrived since I last looked" for a project's files.
 *
 * <p>A construction project's folders are shared by ten people, and the question that actually
 * matters when you open them is not *what is here* but *what changed*. A site engineer uploads a
 * measurement sheet, the office needs to notice.
 *
 * <p>Held per browser in `localStorage` rather than on the server, deliberately: a "seen" marker is
 * a per-viewer convenience, not a fact about the project. Putting it in the database would mean a
 * row per user per project, written on every visit, to tell one person which cards to tint. If it
 * is missing — private window, cleared site data, a different machine — the fallback is simply
 * "nothing is new", which is quieter than crying wolf.
 *
 * <p>Every accessor is wrapped: `localStorage` throws outright in some privacy modes rather than
 * returning null, and a Files tab that cannot render because of a storage setting would be a poor
 * trade for a badge.
 */

const KEY = "hitech.files.seen.v1";

type SeenMap = Record<string, number>;

function read(): SeenMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SeenMap) : {};
  } catch {
    return {};
  }
}

function write(map: SeenMap) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    // Storage full or blocked. The badge is a nicety; losing it is not worth an error.
  }
}

/**
 * When this project's files were last looked at, as epoch millis. `0` means never — and on a first
 * visit nothing is marked new, because tinting a hundred cards on the day someone opens the tab
 * for the first time teaches them to ignore the colour.
 */
export function lastSeenAt(projectId: number): number {
  const at = read()[String(projectId)];
  return typeof at === "number" && Number.isFinite(at) ? at : 0;
}

/** Record that the user has now seen this project's files. */
export function markSeen(projectId: number, at: number = Date.now()) {
  const map = read();
  map[String(projectId)] = at;
  write(map);
}
