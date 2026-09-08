"use client";

/**
 * The units of measure offered by the buying screens — RFQ, work orders and material issues.
 *
 * These used to be three separate hardcoded arrays that had drifted apart (the RFQ knew "Tonne",
 * the work order knew "Brass", neither knew what the other did), so a unit the site actually buys
 * in could only be added by editing code. The list is now one user-extendable master — see
 * `useOptionMaster`, which holds the general machinery; this file is only its vocabulary.
 */

/** Shipped with the app. Order matters — it's the order they appear in every dropdown. */
export const BUILT_IN_UOMS = [
  "Nos",
  "Bag",
  "Kg",
  "MT",
  "Tonne",
  "Quintal",
  "Mtr",
  "Rmt",
  "Sqm",
  "Sqft",
  "Cum",
  "Brass",
  "Litre",
  "Set",
  "Box",
  "Bundle",
  "Pair",
  "Roll",
  "Day",
  "Trip",
  "Lump sum",
];
