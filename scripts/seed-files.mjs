/**
 * Upload sample PDFs into project Files so the Files tab (and its PDF preview) has something to show.
 *
 *   node scripts/seed-files.mjs        (run from the Hitech-Construction folder)
 *
 * PDFs are generated on the fly with jsPDF (already a frontend dependency) and uploaded through the
 * same init → PUT → complete handshake the browser uses. Re-runnable: folders are reused and a file
 * already present in its folder is skipped.
 *
 * Config: API_BASE (default http://localhost:8080), SEED_EMAIL, SEED_PASS.
 */
import { jsPDF } from "jspdf";
import { createHash } from "node:crypto";

const API = process.env.API_BASE ?? "http://localhost:8080";
const EMAIL = process.env.SEED_EMAIL ?? "admin@hitech.local";
const PASS = process.env.SEED_PASS ?? "Admin@123";
let token = "";

async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : undefined;
}
const list = (d) => (Array.isArray(d) ? d : d?.content ?? d?.nodes ?? d?.items ?? []);
const day = (n) => new Date(Date.now() + n * 86_400_000).toLocaleDateString("en-IN");
const inr = (n) => "Rs. " + n.toLocaleString("en-IN", { minimumFractionDigits: 2 });

// ---------------------------------------------------------------------------------------------
// PDF builders
// ---------------------------------------------------------------------------------------------
function header(doc, title, project, ref) {
  doc.setFillColor(14, 116, 144);
  doc.rect(0, 0, 210, 28, "F");
  doc.setTextColor(255);
  doc.setFont("helvetica", "bold").setFontSize(16).text("HI-TECH CONSTRUCTION", 14, 12);
  doc.setFont("helvetica", "normal").setFontSize(9).text("150 Feet Ring Road, Rajkot, Gujarat - 360005  |  GSTIN 24AAAFH1234K1Z5", 14, 20);
  doc.setTextColor(20);
  doc.setFont("helvetica", "bold").setFontSize(14).text(title, 14, 42);
  doc.setFont("helvetica", "normal").setFontSize(10);
  doc.text(`Project: ${project}`, 14, 50);
  doc.text(`Ref: ${ref}`, 14, 56);
  doc.text(`Date: ${day(-3)}`, 160, 50);
  doc.setDrawColor(200).line(14, 60, 196, 60);
}

function table(doc, y, cols, widths, rows) {
  doc.setFillColor(240, 244, 248).rect(14, y - 5, 182, 8, "F");
  doc.setFont("helvetica", "bold").setFontSize(9);
  let x = 14;
  cols.forEach((c, i) => { doc.text(c, x + 2, y); x += widths[i]; });
  doc.setFont("helvetica", "normal");
  for (const r of rows) {
    y += 8;
    x = 14;
    r.forEach((c, i) => { doc.text(String(c), x + 2, y, { maxWidth: widths[i] - 3 }); x += widths[i]; });
    doc.setDrawColor(225).line(14, y + 3, 196, y + 3);
  }
  return y + 10;
}

function signature(doc, y, left = "Prepared by", right = "Authorised Signatory") {
  doc.setFontSize(9).text(left, 14, y + 20).text(right, 150, y + 20);
  doc.line(14, y + 15, 70, y + 15).line(150, y + 15, 196, y + 15);
}

function workOrder(project, { no, contractor, scope, items }) {
  const doc = new jsPDF();
  header(doc, "WORK ORDER", project, no);
  doc.text(`To: ${contractor}`, 14, 68);
  doc.text(`Subject: ${scope}`, 14, 74, { maxWidth: 180 });
  const total = items.reduce((s, [, , q, r]) => s + q * r, 0);
  let y = table(doc, 88, ["#", "Description", "Unit", "Qty", "Rate", "Amount"], [10, 82, 18, 20, 24, 28],
    items.map(([d, u, q, r], i) => [i + 1, d, u, q, inr(r), inr(q * r)]));
  doc.setFont("helvetica", "bold").text(`Sub-total: ${inr(total)}`, 130, y);
  doc.text(`GST @ 18%: ${inr(total * 0.18)}`, 130, y + 6);
  doc.text(`Total: ${inr(total * 1.18)}`, 130, y + 12);
  doc.setFont("helvetica", "normal").setFontSize(9);
  const terms = ["1. Work to be completed within 45 days of this order.", "2. 5% retention will be held until the defect liability period ends.", "3. Measurements will be certified by the site engineer before billing.", "4. Safety gear (helmet, shoes, jacket) is compulsory on site."];
  doc.text("Terms & Conditions", 14, y + 24);
  terms.forEach((t, i) => doc.text(t, 14, y + 31 + i * 6));
  signature(doc, y + 50);
  return doc;
}

function raBill(project, { no, client, items }) {
  const doc = new jsPDF();
  header(doc, `RUNNING ACCOUNT BILL - ${no}`, project, `RA/${no}/2026-27`);
  doc.text(`Client: ${client}`, 14, 68);
  const rows = items.map(([d, u, q, prev, r], i) => [i + 1, d, u, q, prev, q + prev, inr(r), inr(q * r)]);
  const total = items.reduce((s, [, , q, , r]) => s + q * r, 0);
  let y = table(doc, 82, ["#", "Item", "Unit", "This", "Prev", "Upto", "Rate", "Amount"], [8, 58, 14, 16, 16, 18, 24, 28], rows);
  doc.setFont("helvetica", "bold");
  [["Gross amount this bill", total], ["Less: Retention 5%", -total * 0.05], ["Less: TDS 2%", -total * 0.02], ["Net payable", total * 0.93]]
    .forEach(([l, v], i) => { doc.text(l, 110, y + i * 6); doc.text(inr(v), 160, y + i * 6); });
  doc.setFont("helvetica", "normal");
  signature(doc, y + 26, "Contractor", "Executive Engineer");
  return doc;
}

function testReport(project, { no, test, rows, result }) {
  const doc = new jsPDF();
  header(doc, test, project, no);
  doc.text(`Tested at: Site laboratory  |  Witnessed by: Client engineer`, 14, 68);
  let y = table(doc, 82, ["Sample", "Location / Chainage", "Required", "Observed", "Result"], [24, 66, 30, 30, 32], rows);
  doc.setFont("helvetica", "bold").text(`Conclusion: ${result}`, 14, y + 4, { maxWidth: 180 });
  doc.setFont("helvetica", "normal");
  signature(doc, y + 14, "Lab Technician", "Site Engineer");
  return doc;
}

function drawing(project, { no, title, notes }) {
  const doc = new jsPDF({ orientation: "landscape" });
  doc.setDrawColor(30).setLineWidth(0.8).rect(8, 8, 281, 194);
  // Simple plan: a pipeline alignment with chambers.
  doc.setLineWidth(1.2).setDrawColor(14, 116, 144).line(30, 110, 250, 110);
  doc.setLineWidth(0.4).setDrawColor(30);
  for (let i = 0; i <= 5; i++) {
    const x = 30 + i * 44;
    doc.circle(x, 110, 4);
    doc.setFontSize(8).text(`MH-${i + 1}`, x - 5, 102);
    doc.text(`Ch ${(i * 0.3).toFixed(1)} km`, x - 7, 122);
  }
  doc.setFontSize(9).text("Road edge", 30, 80).line(30, 84, 250, 84).line(30, 136, 250, 136).text("Road edge", 30, 142);
  doc.setFontSize(10).text("PLAN - NOT TO SCALE", 120, 40);
  // Title block.
  doc.rect(190, 160, 99, 42);
  doc.setFont("helvetica", "bold").setFontSize(10).text("HI-TECH CONSTRUCTION", 194, 168);
  doc.setFont("helvetica", "normal").setFontSize(8);
  doc.text(`Project: ${project}`, 194, 175, { maxWidth: 92 });
  doc.text(`Drawing: ${title}`, 194, 182, { maxWidth: 92 });
  doc.text(`Dwg No: ${no}   Rev: R1   Date: ${day(-30)}`, 194, 195);
  doc.setFontSize(8).text("Notes:", 14, 165);
  notes.forEach((n, i) => doc.text(`${i + 1}. ${n}`, 14, 171 + i * 6, { maxWidth: 170 }));
  return doc;
}

function dpr(project, { date, work, labour, material }) {
  const doc = new jsPDF();
  header(doc, "DAILY PROGRESS REPORT", project, `DPR-${date.replace(/\//g, "")}`);
  doc.text(`Report date: ${date}   Weather: Clear   Working hours: 08:00 - 18:00`, 14, 68);
  let y = table(doc, 82, ["Activity", "Unit", "Today", "Cumulative", "Remarks"], [70, 20, 24, 30, 38], work);
  y = table(doc, y + 6, ["Labour", "Count"], [120, 62], labour);
  y = table(doc, y + 6, ["Material received", "Qty"], [120, 62], material);
  signature(doc, y, "Site Supervisor", "Project Manager");
  return doc;
}

// ---------------------------------------------------------------------------------------------
// What goes where
// ---------------------------------------------------------------------------------------------
const PLAN = {
  "RMC D.I. Pipeline - Phase 1": {
    "Work Orders": [
      ["Work Order (Pipe Laying - Zone 4).pdf", (p) => workOrder(p, { no: "WO/RMC1/014", contractor: "Metro Contractors", scope: "Laying, jointing and testing of DI K7 pipes 200-300mm dia, including excavation and backfilling.",
        items: [["Excavation in soft murrum up to 1.5 m depth", "Cum", 1850, 165], ["Laying & jointing DI K7 200mm", "Rmt", 1200, 210], ["Laying & jointing DI K7 300mm", "Rmt", 640, 285], ["Sand bedding 150mm thick", "Cum", 320, 980], ["Backfilling with excavated soil", "Cum", 1500, 75]] })],
      ["Work Order (Valve Chambers).pdf", (p) => workOrder(p, { no: "WO/RMC1/015", contractor: "Reliable Builders Pvt Ltd", scope: "Construction of RCC valve chambers 1.2 x 1.2 m with CI cover.",
        items: [["RCC M25 chamber walls & base", "Cum", 38, 6800], ["Brick masonry 230mm", "Cum", 22, 5200], ["CI cover with frame (heavy duty)", "Nos", 24, 4850], ["Internal plaster 12mm", "Sqm", 260, 210]] })],
    ],
    "Bills": [
      ["RA Bill 03.pdf", (p) => raBill(p, { no: "03", client: "Rajkot Municipal Corporation - Water Works",
        items: [["DI K7 200mm laying", "Rmt", 420, 780, 1450], ["DI K7 300mm laying", "Rmt", 180, 460, 2150], ["Valve chamber complete", "Nos", 6, 12, 38500], ["Road restoration (CC)", "Sqm", 540, 900, 720]] })],
    ],
    "Test Reports": [
      ["Hydro Test Report - Ch 1+200 to 2+100.pdf", (p) => testReport(p, { no: "HT/RMC1/007", test: "HYDROSTATIC PRESSURE TEST REPORT",
        rows: [["HT-1", "Ch 1+200 to 1+500", "10 kg/cm2", "10.2 kg/cm2", "Pass"], ["HT-2", "Ch 1+500 to 1+800", "10 kg/cm2", "10.0 kg/cm2", "Pass"], ["HT-3", "Ch 1+800 to 2+100", "10 kg/cm2", "9.6 kg/cm2", "Re-test"]],
        result: "Sections HT-1 and HT-2 passed. HT-3 showed a pressure drop at joint J-112; joint to be re-done and re-tested." })],
    ],
  },
  "RMC D.I. Pipeline - Phase 2": {
    "Drawings": [
      ["Pipeline Alignment Plan - Zone 8.pdf", (p) => drawing(p, { no: "DWG-RMC2-101", title: "Pipeline alignment plan, Zone 8", notes: ["All dimensions in mm unless noted otherwise.", "Pipe to be laid at min 1.0 m cover below finished road level.", "Manholes at max 30 m c/c or at every change of direction."] })],
      ["Valve Chamber Detail.pdf", (p) => drawing(p, { no: "DWG-RMC2-114", title: "Valve chamber typical detail", notes: ["Concrete M25 with 20mm aggregate.", "Reinforcement Fe500D, 50mm clear cover.", "CI cover heavy duty to IS 1726."] })],
    ],
    "Reports": [
      ["Daily Progress Report.pdf", (p) => dpr(p, { date: day(-1), work: [["Excavation", "Cum", 145, 3920, "JCB + 6 labour"], ["DI 300mm laying", "Rmt", 72, 1480, ""], ["Hydro test", "Rmt", 0, 900, "Awaiting water tanker"]], labour: [["Skilled (fitter, mason)", 8], ["Unskilled", 14]], material: [["DI K7 300mm pipes", "36 Nos"], ["Rubber gaskets", "40 Nos"]] })],
    ],
  },
  "HI-TECH OFFICE": {
    "Drawings": [
      ["Ground Floor Plan.pdf", (p) => drawing(p, { no: "DWG-HTO-A01", title: "Ground floor layout", notes: ["Slab level +3.150 m from plinth.", "Column sizes as per structural drawing S-02.", "Door/window schedule on sheet A-05."] })],
    ],
    "Work Orders": [
      ["Work Order (Fabrication Work).pdf", (p) => workOrder(p, { no: "WO/HTO/006", contractor: "Kumar Electricals", scope: "Fabrication and erection of MS staircase railing and main gate.",
        items: [["MS railing with 40mm pipe", "Rmt", 46, 1850], ["MS main gate 4.5 x 2.1 m", "Nos", 1, 68000], ["Primer + 2 coats enamel paint", "Sqm", 120, 145]] })],
      ["Work Order (Light Fitting).pdf", (p) => workOrder(p, { no: "WO/HTO/007", contractor: "Kumar Electricals", scope: "Supply and installation of LED light fittings in office floors.",
        items: [["LED panel 2x2 ft 36W", "Nos", 48, 1650], ["LED downlight 12W", "Nos", 36, 520], ["Wiring point (1.5 sqmm FRLS)", "Pts", 120, 650]] })],
    ],
  },
  "Ishwariya (Gram Panchayat) Amreli": {
    "Test Reports": [
      ["Cube Test Report - CC Road.pdf", (p) => testReport(p, { no: "CT/ISH/003", test: "CONCRETE CUBE COMPRESSIVE STRENGTH (28 DAYS)",
        rows: [["C-1", "Ward 3, Ch 0+050", "30 N/mm2", "33.4 N/mm2", "Pass"], ["C-2", "Ward 3, Ch 0+120", "30 N/mm2", "31.8 N/mm2", "Pass"], ["C-3", "Ward 3, Ch 0+180", "30 N/mm2", "34.1 N/mm2", "Pass"]],
        result: "All samples exceed the characteristic strength of M30. Concrete accepted." })],
    ],
    "Reports": [
      ["Daily Progress Report.pdf", (p) => dpr(p, { date: day(-2), work: [["CC road PQC M30", "Sqm", 210, 1640, ""], ["Kerb stone fixing", "Rmt", 80, 420, ""]], labour: [["Skilled", 5], ["Unskilled", 11]], material: [["Cement OPC 53", "120 Bags"], ["20mm aggregate", "18 Cum"]] })],
    ],
  },
};

// ---------------------------------------------------------------------------------------------
async function folderId(projectId, parentId, name) {
  const q = parentId == null ? "" : `?parent=${parentId}`;
  const found = list(await api(`/api/v1/projects/${projectId}/files${q}`)).find((n) => n.name === name && (n.kind ?? n.type ?? "").toString().toUpperCase().includes("FOLDER"));
  if (found) return found.id;
  return (await api(`/api/v1/projects/${projectId}/files/folders`, { method: "POST", body: { name, parentId } })).id;
}

async function upload(projectId, parentId, name, bytes) {
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const init = await api("/api/v1/files/init", { method: "POST", body: { projectId, parentId, name, size: bytes.length, contentType: "application/pdf", sha256 } });
  if (init.mode !== "DEDUPED") {
    const url = /^https?:/.test(init.uploadUrl) ? init.uploadUrl : API + init.uploadUrl;
    const put = await fetch(url, { method: "PUT", headers: { "Content-Type": "application/pdf" }, body: bytes });
    if (!put.ok) throw new Error(`PUT blob → ${put.status} ${await put.text()}`);
  }
  return api(`/api/v1/files/${init.fileId}/complete?parent=${parentId}`, { method: "POST", body: { uploadId: null, etags: null } });
}

async function main() {
  const auth = await api("/api/v1/auth/login", { method: "POST", body: { email: EMAIL, password: PASS } });
  token = auth.accessToken;
  const projects = list(await api("/api/v1/projects?size=200"));
  let added = 0;
  for (const [projectName, folders] of Object.entries(PLAN)) {
    const project = projects.find((p) => p.name === projectName);
    if (!project) { console.log(`- skip ${projectName} (not on this database)`); continue; }
    console.log(`\n${projectName}`);
    for (const [folder, files] of Object.entries(folders)) {
      const fid = await folderId(project.id, null, folder);
      const existing = list(await api(`/api/v1/projects/${project.id}/files?parent=${fid}`)).map((n) => n.name);
      for (const [name, build] of files) {
        if (existing.includes(name)) { console.log(`  = ${folder}/${name} (already there)`); continue; }
        const bytes = Buffer.from(build(project.name).output("arraybuffer"));
        await upload(project.id, fid, name, bytes);
        console.log(`  + ${folder}/${name} (${Math.round(bytes.length / 1024)} KB)`);
        added++;
      }
    }
  }
  console.log(`\n✓ Done — ${added} PDF(s) added.`);
}

main().catch((e) => { console.error(`\n✗ ${e.message}`); process.exit(1); });
