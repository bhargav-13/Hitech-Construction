/**
 * Seed subcontracts so Work Orders has something real to look at.
 *
 *   node scripts/seed-work-orders.mjs                 # add
 *   node scripts/seed-work-orders.mjs --reset         # delete seeded ones first
 *
 * Modelled on the client's own 22 live orders — plaster, fabrication, painting, pipe laying — so
 * the screen reads like their work rather than like placeholder text. Posted through the REST API,
 * not into Postgres, so numbering, the measured-quantity rule and every derived figure come out of
 * the same code the app uses.
 *
 * Each order is shaped to exercise one thing the screen has to handle:
 *   1. measured lines (N x L x W x H) and material issued against them
 *   2. part-billed with retention held back
 *   3. billed past the order value — the case that has to be visible, not hidden
 *   4. a draft with nothing against it
 *
 * Config: API_BASE (default http://localhost:8080), SEED_EMAIL, SEED_PASS, PROJECT_ID.
 */

const API = process.env.API_BASE ?? "http://localhost:8080";
const EMAIL = process.env.SEED_EMAIL ?? "admin@hitech.local";
const PASS = process.env.SEED_PASS ?? "Admin@123";
const RESET = process.argv.includes("--reset");

let token = "";

async function api(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) throw new Error(`${options.method ?? "GET"} ${path} → ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

const iso = (daysFromNow) => new Date(Date.now() + daysFromNow * 86_400_000).toISOString().slice(0, 10);

const PLAN = [
  {
    title: "Sewer line laying — Zone 8",
    status: "In Progress",
    start: iso(-30),
    end: iso(20),
    taxPercent: 18,
    terms: "10% retention on every running bill, released on completion certificate.",
    bank: { name: "Nathubhai Parmar", number: "50100234567890", ifsc: "HDFC0001234" },
    // Measured lines: the four dimensions are what a site clerk actually writes down.
    items: [
      { itemName: "HSC laying", description: "600mm dia, NP3", unit: "Rmt", dimN: 4, dimL: 1000, rate: 110, progress: 90 },
      { itemName: "IC construction", description: "1.2m x 1.2m chamber", unit: "Nos", dimN: 100, rate: 700, progress: 60 },
      { itemName: "Excavation", description: "Up to 2m depth", unit: "Cum", dimN: 4, dimL: 250, dimW: 0.9, dimH: 2, rate: 180, progress: 100 },
    ],
    bills: [
      { billNo: "RA-01", date: iso(-20), amount: 98080, retention: 9808, recovery: 0, note: "First running bill" },
      { billNo: "RA-02", date: iso(-6), amount: 145000, retention: 14500, recovery: 32000, note: "Second running bill" },
    ],
    materials: [
      { itemName: "Cement OPC 53", unit: "Bag", movement: "ISSUE", quantity: 200, rate: 380, on: iso(-25) },
      { itemName: "Cement OPC 53", unit: "Bag", movement: "CONSUMED", quantity: 160, on: iso(-7) },
      { itemName: "TMT Bar 12mm", unit: "Kg", movement: "ISSUE", quantity: 800, rate: 62, on: iso(-24) },
      { itemName: "TMT Bar 12mm", unit: "Kg", movement: "RETURN", quantity: 45, on: iso(-5) },
    ],
  },
  {
    title: "Boundary wall plaster",
    status: "In Progress",
    start: iso(-14),
    taxPercent: 0,
    terms: "Rate inclusive of scaffolding and curing. Payment on measurement.",
    bank: { name: "Bhojabhai Rathod", number: "38400011122233", ifsc: "SBIN0009876" },
    items: [
      { itemName: "External plaster 20mm", description: "CM 1:4", unit: "Sqm", dimN: 2, dimL: 62.5, dimH: 3, rate: 155, progress: 100 },
      { itemName: "Internal plaster 12mm", unit: "Sqm", dimN: 2, dimL: 60, dimH: 3, rate: 132, progress: 45 },
    ],
    bills: [{ billNo: "BILL-1", date: iso(-3), amount: 28999.92, retention: 0, recovery: 0 }],
    materials: [{ itemName: "Cement OPC 53", unit: "Bag", movement: "ISSUE", quantity: 60, rate: 380, on: iso(-12) }],
  },
  {
    title: "Fabrication work — cover slabs",
    status: "Completed",
    start: iso(-60),
    end: iso(-10),
    taxPercent: 18,
    // Deliberately billed past the order value. It happens on real sites, and a screen that
    // quietly clamps it to 100% is a screen that hides the one number worth catching.
    items: [{ itemName: "MS fabrication", description: "Angle and plate work", unit: "Kg", quantity: 342, rate: 24, progress: 100 }],
    bills: [
      { billNo: "F-01", date: iso(-30), amount: 8208, retention: 0, recovery: 0 },
      { billNo: "F-02", date: iso(-9), amount: 2400, retention: 0, recovery: 0, note: "Extra items beyond order" },
    ],
    materials: [],
  },
  {
    title: "Painter work — Zone 9 chambers",
    status: "Draft",
    taxPercent: 0,
    items: [{ itemName: "Enamel painting", unit: "Sqm", dimN: 24, dimL: 1.2, dimW: 1.2, rate: 104, progress: 0 }],
    bills: [],
    materials: [],
  },
];

async function main() {
  const auth = await api("/api/v1/auth/login", { method: "POST", body: { email: EMAIL, password: PASS } });
  token = auth.accessToken;
  console.log(`Authenticated as ${EMAIL}`);

  const parties = await api("/api/v1/vyapar/parties");
  const suppliers = parties.filter((p) => p.partyType === "SUPPLIER");
  const pool = (suppliers.length >= 3 ? suppliers : parties).slice(0, 8);
  if (pool.length === 0) throw new Error("Need at least one party on this database to act as a subcontractor.");
  console.log(`Using ${pool.length} parties as subcontractors`);

  const projects = await api("/api/v1/projects");
  const list = Array.isArray(projects) ? projects : (projects.content ?? []);
  const projectId =
    process.env.PROJECT_ID ?? list.find((p) => p.name === "HITECHRAJKOT")?.id ?? list[0]?.id ?? null;
  console.log(`Project: ${projectId ?? "none"}`);

  if (RESET) {
    const existing = await api("/api/v1/procurement/work-orders");
    const titles = new Set(PLAN.map((p) => p.title));
    for (const w of existing.filter((w) => titles.has(w.title))) {
      // Bills block deletion on purpose — money booked against nothing is worse than a stale seed.
      for (const b of w.bills) await api(`/api/v1/procurement/work-orders/${w.id}/bills/${b.id}`, { method: "DELETE" });
      await api(`/api/v1/procurement/work-orders/${w.id}`, { method: "DELETE" });
      console.log(`  removed ${w.woNo}`);
    }
  }

  for (const [i, spec] of PLAN.entries()) {
    const vendor = pool[i % pool.length];
    let w = await api("/api/v1/procurement/work-orders", {
      method: "POST",
      body: {
        title: spec.title,
        projectId,
        vendorPartyId: vendor.id,
        status: spec.status ?? "Draft",
        woDate: iso(-40 + i * 8),
        startDate: spec.start ?? null,
        endDate: spec.end ?? null,
        taxPercent: spec.taxPercent ?? 0,
        discount: 0,
        charges: 0,
        bankAccountName: spec.bank?.name ?? null,
        bankAccountNumber: spec.bank?.number ?? null,
        bankIfsc: spec.bank?.ifsc ?? null,
        terms: spec.terms ?? null,
        notes: null,
        // Dimensions go up, not their product — the server derives the quantity, so the figure the
        // order is signed on can never disagree with the measurement behind it.
        items: spec.items.map((it) => ({
          itemName: it.itemName,
          description: it.description ?? null,
          unit: it.unit,
          dimN: it.dimN ?? null,
          dimL: it.dimL ?? null,
          dimW: it.dimW ?? null,
          dimH: it.dimH ?? null,
          quantity: it.quantity ?? 1,
          rate: it.rate,
          progressPercent: it.progress ?? 0,
        })),
      },
    });

    for (const b of spec.bills) {
      w = await api(`/api/v1/procurement/work-orders/${w.id}/bills`, {
        method: "PUT",
        body: {
          billNo: b.billNo,
          billDate: b.date,
          amount: b.amount,
          retention: b.retention ?? 0,
          materialRecovery: b.recovery ?? 0,
          note: b.note ?? null,
        },
      });
    }

    for (const m of spec.materials) {
      w = await api(`/api/v1/procurement/work-orders/${w.id}/materials`, {
        method: "PUT",
        body: {
          itemName: m.itemName,
          unit: m.unit,
          movement: m.movement,
          quantity: m.quantity,
          rate: m.rate ?? 0,
          movedOn: m.on,
        },
      });
    }

    const over = w.outstanding < 0 ? `  OVER BY ${(-w.outstanding).toFixed(2)}` : "";
    console.log(
      `  ${w.woNo}  ${w.status.padEnd(12)} ${w.items.length} items  value ${w.orderValue}  ` +
        `${w.physicalProgress}% done  billed ${w.billedValue}${over}  ${w.title}`,
    );
  }

  const all = await api("/api/v1/procurement/work-orders");
  console.log(`\nDone. ${all.length} work orders on this database.`);
}

main().catch((err) => {
  console.error("\nFailed:", err.message);
  process.exit(1);
});
