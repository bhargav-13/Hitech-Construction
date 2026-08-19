/**
 * Seed a few realistic enquiries so Procurement has something to look at.
 *
 *   node scripts/seed-procurement.mjs                 # add
 *   node scripts/seed-procurement.mjs --reset         # delete seeded ones first
 *
 * Posts through the REST API rather than into Postgres, so everything goes through the same
 * validation, numbering and status derivation the app uses — a seed that bypasses the service is a
 * seed that can create states the app never could.
 *
 * Vendors are picked from the real Vyapar parties on the target database, and lines from the real
 * item catalogue where the names match, so the data reads like the client's own rather than like
 * placeholder text.
 *
 * One enquiry is deliberately quoted through the **supplier's own link** — unauthenticated, exactly
 * as a vendor would from WhatsApp — so that path is exercised on every seed rather than only when
 * somebody remembers to test it by hand.
 *
 * Config: API_BASE (default http://localhost:8080), APP_BASE (for printed links), SEED_EMAIL,
 * SEED_PASS, PROJECT_ID.
 */

const API = process.env.API_BASE ?? "http://localhost:8080";
const APP = process.env.APP_BASE ?? "http://localhost:3000";
const EMAIL = process.env.SEED_EMAIL ?? "admin@hitech.local";
const PASS = process.env.SEED_PASS ?? "Admin@123";
const RESET = process.argv.includes("--reset");

let token = "";

async function api(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      // `auth: false` is how the supplier-facing calls are made — no bearer, just the link token.
      ...(token && options.auth !== false ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) throw new Error(`${options.method ?? "GET"} ${path} → ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

const iso = (daysFromNow) => new Date(Date.now() + daysFromNow * 86_400_000).toISOString().slice(0, 10);

/** The enquiries. Each is shaped to exercise one thing the comparison has to handle. */
const PLAN = [
  {
    title: "Valves — Pedak Road chambers",
    biddingEnd: iso(7),
    delivery: iso(21),
    terms: "Rates to be inclusive of freight to site. Payment 30 days from receipt of material.",
    notes: "Deliver to site store. Contact Ketan Bhai on site.",
    ship: { name: "Pedak Road Site Store", address: "Pedak Road, Rajkot, Gujarat" },
    lines: [
      { itemName: "450MM Sluice Valve", specification: "Kirloskar / IVI / GM", hsnCode: "8481", unit: "Nos", quantity: 1, budgetRate: 140000 },
      { itemName: "150MM Air Valve", specification: "Double acting", hsnCode: "8481", unit: "Nos", quantity: 3, budgetRate: 18000 },
    ],
    // Three suppliers, and the third skips a line — the "No quote" case.
    quotes: [
      { deliveryDays: 12, taxPercent: 18, rates: [155051, 21200], note: "Ex-works Coimbatore" },
      { deliveryDays: 7, taxPercent: 18, rates: [106290, 19460] },
      { deliveryDays: 5, taxPercent: 18, discount: 2000, rates: [108400, null], note: "Kirloskar make" },
    ],
  },
  {
    title: "Cement & steel — slab casting",
    biddingEnd: iso(5),
    delivery: iso(12),
    terms: "Material to be unloaded at site. Test certificates to accompany each lot.",
    lines: [
      { itemName: "Cement OPC 53", specification: "Ambuja / UltraTech", hsnCode: "2523", unit: "Bag", quantity: 100, budgetRate: 375 },
      { itemName: "TMT Bar 12mm", specification: "Fe 500D", hsnCode: "7214", unit: "Kg", quantity: 500, budgetRate: 61 },
    ],
    // Two specialists: each quotes only their own line. Neither can win the whole enquiry, which is
    // exactly the case a one-winner-per-RFQ model could not express.
    quotes: [
      { deliveryDays: 2, taxPercent: 18, rates: [380, null] },
      { deliveryDays: 4, taxPercent: 18, rates: [372, null] },
      { deliveryDays: 5, taxPercent: 18, rates: [null, 62] },
      { deliveryDays: 9, taxPercent: 18, rates: [null, 60.8], note: "Lowest, but longest lead time" },
    ],
  },
  {
    title: "SFRC pipe — RMC Phase 2",
    biddingEnd: iso(9),
    lines: [{ itemName: "SFRC Rectangular Pipe", specification: "NP3 class", hsnCode: "6810", unit: "Nos", quantity: 60, budgetRate: 3050 }],
    // Two quotes barely apart — the tolerance band should read them as level, not rank them.
    quotes: [
      { deliveryDays: 6, taxPercent: 18, rates: [3100] },
      { deliveryDays: 8, taxPercent: 18, rates: [3140] },
    ],
    awardAll: 1, // award to the second: dearer by a hair, better supplier
    awardReason: "Level on price, better track record",
  },
  {
    title: "Diesel — Ishwariya site",
    biddingEnd: iso(4),
    lines: [{ itemName: "Diesel", hsnCode: "2710", unit: "Litre", quantity: 200 }],
    quotes: [], // sent, nothing back yet — the "Sent" state
  },
  {
    title: "Scaffolding hire — Ishwariya tower",
    biddingEnd: iso(10),
    delivery: iso(18),
    terms: "Monthly hire. Erection and dismantling in the supplier's scope.",
    lines: [
      { itemName: "Cuplock Vertical 3m", hsnCode: "7308", unit: "Nos", quantity: 400, budgetRate: 210 },
      { itemName: "Cuplock Ledger 1.5m", hsnCode: "7308", unit: "Nos", quantity: 600, budgetRate: 95 },
      { itemName: "Base Jack", hsnCode: "7308", unit: "Nos", quantity: 200, budgetRate: 145 },
    ],
    // Nobody quotes here through the app: the suppliers fill it in themselves from their links.
    quotes: [],
    vendorQuotes: [
      { deliveryDays: 6, taxPercent: 18, rates: [205, 98, 150], note: "Rates hold for 15 days." },
      { deliveryDays: 10, taxPercent: 18, charges: 4500, rates: [198, 92, 139], note: "Transport charged separately." },
    ],
  },
];

async function main() {
  const auth = await api("/api/v1/auth/login", { method: "POST", body: { email: EMAIL, password: PASS } });
  token = auth.accessToken;
  console.log(`Authenticated as ${EMAIL}`);

  const parties = await api("/api/v1/vyapar/parties");
  // Their books type almost every trade account as CUSTOMER — supplier, subcontractor and client
  // all land in one list — so picking on partyType alone would put "RMC NAVAGAM", who they build
  // for, in a demo as a valve supplier. Suppliers first where they are marked, then the newest
  // accounts, which in practice are the trade ones; the RMC entries are the municipal client.
  const pool = parties
    .filter((p) => !/^RMC[ .]/i.test(p.name))
    .sort(
      (a, b) =>
        (a.partyType === "SUPPLIER" ? 0 : 1) - (b.partyType === "SUPPLIER" ? 0 : 1) || b.id - a.id,
    )
    .slice(0, 8);
  if (pool.length < 2) throw new Error("Need at least two parties on this database to quote with.");
  console.log(`Using ${pool.length} parties as vendors: ${pool.map((p) => p.name).join(", ")}`);

  const projects = await api("/api/v1/projects");
  const list = Array.isArray(projects) ? projects : (projects.content ?? []);
  const projectId =
    process.env.PROJECT_ID ??
    list.find((p) => p.name === "HITECHRAJKOT")?.id ??
    list[0]?.id ??
    null;
  console.log(`Project: ${projectId ?? "none"}`);

  let firm = {};
  try {
    firm = await api("/api/v1/vyapar/firm-profile");
  } catch {
    /* no firm profile on this database — Bill To simply stays blank */
  }

  if (RESET) {
    const existing = await api("/api/v1/procurement/rfqs");
    const titles = new Set(PLAN.map((p) => p.title));
    for (const r of existing.filter((r) => titles.has(r.title))) {
      await api(`/api/v1/procurement/rfqs/${r.id}`, { method: "DELETE" });
      console.log(`  removed ${r.rfqNo}`);
    }
  }

  const links = [];

  for (const spec of PLAN) {
    const invited = spec.quotes.length + (spec.vendorQuotes?.length ?? 0);
    // Everyone who will quote, plus one who never replies — "5 asked, 3 replied" is a real state
    // and the list has to be able to show it.
    const supplierPartyIds = pool.slice(0, Math.min(pool.length, Math.max(2, invited + 1))).map((p) => p.id);

    const rfq = await api("/api/v1/procurement/rfqs", {
      method: "POST",
      body: {
        title: spec.title,
        projectId,
        status: "Sent",
        taxType: "ITEM",
        rfqDate: iso(0),
        biddingStartDate: iso(0),
        biddingEndDate: spec.biddingEnd ?? null,
        deliveryDate: spec.delivery ?? null,
        terms: spec.terms ?? null,
        notes: spec.notes ?? null,
        billToName: firm.businessName ?? "Hi-Tech Construction",
        billToAddress: firm.address ?? null,
        billToGstin: firm.gstin ?? null,
        shipToName: spec.ship?.name ?? null,
        shipToAddress: spec.ship?.address ?? null,
        shipSameAsBill: !spec.ship,
        lines: spec.lines,
        supplierPartyIds,
      },
    });

    // Sending is what mints the quote links. Without it the suppliers have no way in.
    let current = await api(`/api/v1/procurement/rfqs/${rfq.id}/send`, { method: "PUT", body: {} });

    // Quotes keyed in on our side, as a buyer does off a WhatsApp photo of a letterhead.
    for (const [i, q] of spec.quotes.entries()) {
      const vendor = pool[i % pool.length];
      current = await api(`/api/v1/procurement/rfqs/${rfq.id}/quotes`, {
        method: "PUT",
        body: {
          vendorPartyId: vendor.id,
          receivedOn: iso(0),
          deliveryDays: q.deliveryDays ?? null,
          discount: q.discount ?? 0,
          charges: q.charges ?? 0,
          taxPercent: q.taxPercent ?? 18,
          note: q.note ?? null,
          // Index-aligned with the enquiry's lines; null means this vendor skipped it.
          lines: rfq.lines.map((l, li) => ({ rfqLineId: l.id, rate: q.rates[li] ?? null })),
        },
      });
    }

    // Quotes submitted by the supplier themselves, through the token in their link. No bearer.
    for (const [i, q] of (spec.vendorQuotes ?? []).entries()) {
      const supplier = current.suppliers[i];
      if (!supplier?.shareToken) continue;
      await api(`/api/v1/public/rfq/${supplier.shareToken}/quote`, {
        method: "POST",
        auth: false,
        body: {
          deliveryDays: q.deliveryDays ?? null,
          discount: q.discount ?? 0,
          charges: q.charges ?? 0,
          taxPercent: q.taxPercent ?? 18,
          note: q.note ?? null,
          lines: rfq.lines.map((l, li) => ({ rfqLineId: l.id, rate: q.rates[li] ?? null })),
        },
      });
      current = await api(`/api/v1/procurement/rfqs/${rfq.id}`);
    }

    if (spec.awardAll != null && current.quotes[spec.awardAll]) {
      const winner = current.quotes[spec.awardAll];
      for (const line of current.lines) {
        current = await api(`/api/v1/procurement/rfqs/${rfq.id}/lines/${line.id}/award`, {
          method: "PUT",
          body: { vendorPartyId: winner.vendorPartyId, reason: spec.awardReason ?? null },
        });
      }
    }

    const open = current.suppliers.find((s) => s.shareToken && !s.responded);
    if (open) links.push(`  ${current.rfqNo}  ${open.vendorName} → ${APP}/quote/${open.shareToken}`);

    console.log(
      `  ${current.rfqNo}  ${current.status.padEnd(14)} ${current.lines.length} lines, ` +
        `${current.quotes.length}/${current.suppliers.length} replied  ${current.title}`,
    );
  }

  const all = await api("/api/v1/procurement/rfqs");
  console.log(`\nDone. ${all.length} enquiries on this database.`);
  if (links.length) {
    console.log("\nOpen one of these as a supplier would — no login needed:");
    links.forEach((l) => console.log(l));
  }
}

main().catch((err) => {
  console.error("\nFailed:", err.message);
  process.exit(1);
});
