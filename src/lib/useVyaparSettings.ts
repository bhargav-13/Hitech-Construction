"use client";

import { useCallback, useEffect, useState } from "react";
import { getVyaparSettings, updateVyaparSettings, type VyaparSettings } from "./vyaparApi";
import { setAmountDecimals, setQuantityDecimals } from "./format";

/**
 * The Vyapar module's settings, fetched once and shared.
 *
 * In the real app almost every form behaviour is a switch here — decimals, round-off, whether Due
 * Date exists, which document types are available. Screens read this rather than hardcoding.
 *
 * Cached at module level: a Vyapar page renders many components that all need the same answer, and
 * settings change about once a year, so re-fetching per component would be pure waste.
 */
const DEFAULTS: VyaparSettings = {
  amountDecimals: 3,
  quantityDecimals: 3,
  roundOffEnabled: true,
  roundOffMode: "NEAREST",
  roundOffTo: 1,
  dueDatesEnabled: false,
  linkPaymentsEnabled: true,
  itemWiseTax: true,
  itemWiseDiscount: true,
  displayPurchasePrice: true,
  transactionWiseTax: false,
  transactionWiseDiscount: true,
  estimateEnabled: true,
  proformaEnabled: true,
  ordersEnabled: true,
  deliveryChallanEnabled: true,
  prefixes: null,
};

let cache: VyaparSettings | null = null;
let inFlight: Promise<VyaparSettings> | null = null;
const listeners = new Set<(s: VyaparSettings) => void>();

/** Push the decimal settings into the formatters, which aren't React and can't subscribe. */
function publish(next: VyaparSettings) {
  cache = next;
  setAmountDecimals(next.amountDecimals);
  setQuantityDecimals(next.quantityDecimals);
  listeners.forEach((l) => l(next));
}

function load(): Promise<VyaparSettings> {
  if (cache) return Promise.resolve(cache);
  // De-duplicate concurrent mounts so ten components on one page make one request, not ten.
  if (!inFlight) {
    inFlight = getVyaparSettings()
      .then((s) => {
        publish(s);
        return s;
      })
      .catch(() => {
        // An older backend without /settings shouldn't blank the module out.
        publish(DEFAULTS);
        return DEFAULTS;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

export function useVyaparSettings() {
  const [settings, setSettings] = useState<VyaparSettings>(cache ?? DEFAULTS);
  const [loading, setLoading] = useState(cache == null);

  useEffect(() => {
    let alive = true;
    listeners.add(setSettings);
    load().then((s) => {
      if (alive) {
        setSettings(s);
        setLoading(false);
      }
    });
    return () => {
      alive = false;
      listeners.delete(setSettings);
    };
  }, []);

  const save = useCallback(async (next: VyaparSettings) => {
    const saved = await updateVyaparSettings(next);
    publish(saved);
    return saved;
  }, []);

  return { settings, loading, save };
}
