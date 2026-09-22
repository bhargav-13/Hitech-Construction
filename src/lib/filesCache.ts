import { listFolder, listModuleFiles, type FolderListing, type SourceModule } from "./filesApi";

/**
 * The reason the Files tab feels faster than the ERP it replaces.
 *
 * Onsite navigates folders with a full page load and no cache, so every click costs a round trip
 * and a re-render of the whole shell. Three things fix that, and all three live here:
 *
 *  1. **Stale-while-revalidate.** A folder visited before renders from memory on the next visit,
 *     immediately, while a fresh copy is fetched behind it. Walking back up a tree is free.
 *  2. **Prefetch on hover.** The listing for a folder is usually already in hand by the time the
 *     click lands — a pointer sits on a card for ~300 ms before the button goes down, which is
 *     longer than the request takes. This is the single biggest win for the least code.
 *  3. **In-flight de-duplication.** Hover, click and a background refresh all asking for the same
 *     folder share one request rather than racing.
 *
 * The cache is per-tab module state, not a store: it holds no truth, only a copy of what the server
 * last said, and every entry is re-fetched the moment it is read. `invalidate` is called after each
 * mutation so a rename or a move cannot leave a stale card on screen.
 */

type Key = string;

interface Entry {
  data: FolderListing;
  /** When this was fetched, so a long-idle tab doesn't render yesterday's folder. */
  at: number;
}

/** Past this, a cached listing is shown but always treated as needing a refresh. */
const MAX_AGE_MS = 5 * 60 * 1000;

const cache = new Map<Key, Entry>();
const inFlight = new Map<Key, Promise<FolderListing>>();

function key(projectId: number, folderId: number | null, module?: SourceModule | null): Key {
  return module ? `${projectId}:m:${module}` : `${projectId}:f:${folderId ?? "root"}`;
}

function fetcher(projectId: number, folderId: number | null, module?: SourceModule | null) {
  return module ? listModuleFiles(projectId, module) : listFolder(projectId, folderId);
}

/**
 * What we already know, if anything — for the first paint, before the network is asked.
 *
 * <p>A stale entry is still returned: showing last minute's folder for the 80 ms it takes the
 * refresh to land beats showing a spinner. Past {@link MAX_AGE_MS} it isn't, because a tab left
 * open overnight should not open on yesterday's contents.
 */
export function peek(
  projectId: number,
  folderId: number | null,
  module?: SourceModule | null
): FolderListing | null {
  const hit = cache.get(key(projectId, folderId, module));
  if (!hit) return null;
  return Date.now() - hit.at > MAX_AGE_MS ? null : hit.data;
}

/** Fetch, sharing one request between every caller that wants the same folder right now. */
export function load(
  projectId: number,
  folderId: number | null,
  module?: SourceModule | null
): Promise<FolderListing> {
  const k = key(projectId, folderId, module);
  const running = inFlight.get(k);
  if (running) return running;

  const request = fetcher(projectId, folderId, module)
    .then((data) => {
      cache.set(k, { data, at: Date.now() });
      return data;
    })
    .finally(() => {
      inFlight.delete(k);
    });

  inFlight.set(k, request);
  return request;
}

/**
 * Warm a folder we think the user is about to open. Errors are swallowed on purpose — a prefetch
 * that fails must never surface as a message about a folder nobody has opened yet.
 */
export function prefetch(projectId: number, folderId: number | null): void {
  const k = key(projectId, folderId);
  if (cache.has(k) || inFlight.has(k)) return;
  void load(projectId, folderId).catch(() => {});
}

/** After a mutation. No argument clears the whole project, which is right after a move. */
export function invalidate(projectId: number, folderId?: number | null): void {
  if (folderId === undefined) {
    for (const k of Array.from(cache.keys())) {
      if (k.startsWith(`${projectId}:`)) cache.delete(k);
    }
    return;
  }
  cache.delete(key(projectId, folderId));
}

/** Swap in a listing we just computed locally, so an optimistic update survives a re-render. */
export function put(
  projectId: number,
  folderId: number | null,
  data: FolderListing,
  module?: SourceModule | null
): void {
  cache.set(key(projectId, folderId, module), { data, at: Date.now() });
}
