"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * A 0–5 star rating per party, used in the Party Library to mark who's reliable to work with.
 * Neither the member record nor the Vyapar party has a rating column yet, so these live
 * client-side — same pattern as useItemMasters / usePartySettings, and they move to the backend
 * when a rating field ships.
 *
 * Keyed by the library party key ("member:12", "vyapar:5"), which is stable across reloads.
 */
const KEY = "library.partyRatings.v1";

type Ratings = Record<string, number>;

export function usePartyRatings() {
  const [ratings, setRatings] = useState<Ratings>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setRatings(JSON.parse(raw) as Ratings);
    } catch {
      /* ignore a malformed blob — start from empty */
    }
    setReady(true);
  }, []);

  /** Set a party's rating; passing the value it already has clears it back to unrated. */
  const setRating = useCallback((partyKey: string, stars: number) => {
    setRatings((prev) => {
      const next = { ...prev };
      if (stars <= 0 || prev[partyKey] === stars) delete next[partyKey];
      else next[partyKey] = stars;
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* storage unavailable — keep the in-memory value */
      }
      return next;
    });
  }, []);

  const ratingOf = useCallback((partyKey: string) => ratings[partyKey] ?? 0, [ratings]);

  return { ratings, ratingOf, setRating, ready };
}
