"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Boxes,
  ClipboardList,
  CornerDownLeft,
  FileText,
  FolderKanban,
  Gavel,
  HardHat,
  LayoutGrid,
  ListChecks,
  Package,
  Search,
  Truck,
  UserRound,
  Users,
  X,
} from "lucide-react";
import * as api from "@/lib/api";
import { listTasks } from "@/lib/tasksApi";
import { usePayrollStore } from "@/lib/payrollApi";
import { listTenders } from "@/lib/tenderApi";
import * as vyapar from "@/lib/vyaparApi";
import { fullInvoiceNo, DOC_LABEL } from "@/lib/vyaparApi";
import { docTypeHref } from "@/lib/vyaparLinks";
import { getRfqs } from "@/lib/procurementApi";
import { getWorkOrders } from "@/lib/workOrderApi";
import { listAssets } from "@/lib/assetApi";
import { listEquipment } from "@/lib/equipmentApi";
import { NAV_ITEMS, NAV_MODULE } from "@/lib/nav";
import { VYAPAR_NAV, VYAPAR_REPORTS } from "@/lib/vyaparConfig";
import { PAYROLL_NAV, PAYROLL_SELF_NAV } from "@/lib/payrollConfig";
import { TENDER_NAV } from "@/lib/tenderConfig";
import { PROCUREMENT_NAV } from "@/lib/procurementConfig";
import { WAREHOUSE_NAV } from "@/lib/warehouseConfig";
import { useCan, type Need } from "@/lib/permissions";
import { bookDate, inr } from "@/lib/format";
import { projectAvatarColor, projectInitials } from "@/lib/projectHelpers";
import { Spinner } from "./Spinner";

/**
 * Search everything (⌘K) — one box over the whole ERP.
 *
 * The first draft knew four things: projects, tasks, staff and people. The ERP has since grown
 * Tender, Vyapar, Procurement, Warehouse, Assets and Equipment, and none of it could be found from
 * here. This version indexes
 *
 *   - every screen, read from each module's own menu, so a new menu entry is searchable the day it
 *     is added ("day book", "payslip", "low stock", "rfq") — including each Vyapar report;
 *   - the records people actually look for: projects, tasks, tenders, parties, items, every Vyapar
 *     document (invoices, bills, orders, notes), RFQs, work orders, staff, assets and equipment.
 *
 * Nothing a role cannot open is offered: screens follow the same feature switches as the menus, and
 * a module's records are only fetched when the role can view that module. Each source loads on its
 * own, so results appear as they arrive and one slow or failing module never blanks the rest.
 */

type ItemType =
  | "Page"
  | "Project"
  | "Task"
  | "Tender"
  | "Party"
  | "Item"
  | "Document"
  | "Procurement"
  | "Staff"
  | "Asset"
  | "People";

interface SearchItem {
  key: string;
  type: ItemType;
  title: string;
  subtitle: string;
  href: string;
  /** Lower-cased text the query is matched against. */
  keywords: string;
}

const ORDER: ItemType[] = ["Page", "Project", "Task", "Tender", "Party", "Item", "Document", "Procurement", "Staff", "Asset", "People"];
const GROUP_LABEL: Record<ItemType, string> = {
  Page: "Screens",
  Project: "Projects",
  Task: "Tasks",
  Tender: "Tenders",
  Party: "Parties",
  Item: "Items",
  Document: "Invoices, bills & orders",
  Procurement: "RFQs & work orders",
  Staff: "Staff",
  Asset: "Assets & equipment",
  People: "People",
};
const TAB_LABEL: Record<ItemType, string> = {
  Page: "Screens",
  Project: "Projects",
  Task: "Tasks",
  Tender: "Tenders",
  Party: "Parties",
  Item: "Items",
  Document: "Documents",
  Procurement: "Procurement",
  Staff: "Staff",
  Asset: "Assets",
  People: "People",
};

/** How long a module's records stay fresh before the palette fetches them again. */
const STALE_MS = 60_000;

interface NavNodeLike {
  label: string;
  href?: string;
  feature?: Need;
  hint?: string;
  children?: NavNodeLike[];
}

/** One module's menu as flat, searchable screens: "Vyapar › Sale › Sale Invoices". */
function screensOf(area: string, moduleCode: string, nodes: readonly NavNodeLike[], can: (need?: Need) => boolean, trail: string[] = []): SearchItem[] {
  if (!can(moduleCode)) return [];
  return nodes.flatMap((n) => {
    if (!can(n.feature)) return [];
    const path = [...trail, n.label];
    const own: SearchItem[] = n.href
      ? [
          {
            key: `pg-${n.href}`,
            type: "Page" as const,
            title: path.join(" › "),
            subtitle: area,
            href: n.href,
            keywords: `${area} ${path.join(" ")} ${n.hint ?? ""}`.toLowerCase(),
          },
        ]
      : [];
    return [...own, ...(n.children ? screensOf(area, moduleCode, n.children, can, path) : [])];
  });
}

const TASKOPAD_TABS: NavNodeLike[] = [
  { label: "Dashboard", href: "/taskopad" },
  { label: "Tasks", href: "/taskopad/tasks", feature: "TASKOPAD_TASKS" },
  { label: "Approvals", href: "/taskopad/approvals", feature: "TASKOPAD_APPROVALS" },
  { label: "Documents", href: "/taskopad/documents", feature: "TASKOPAD_DOCUMENTS" },
  { label: "Reports", href: "/taskopad/reports", feature: "TASKOPAD_REPORTS" },
  { label: "Checklist", href: "/taskopad/checklist", feature: "TASKOPAD_CHECKLIST" },
  { label: "Settings", href: "/taskopad/settings", feature: "TASKOPAD_SETTINGS" },
];

export function GlobalSearch() {
  const router = useRouter();
  const can = useCan();

  const [open, setOpen] = useState(false);
  // Records by source ("projects", "parties" …), so each module lands on its own.
  const [records, setRecords] = useState<Record<string, SearchItem[]>>({});
  const [pending, setPending] = useState(0);
  const loadedAt = useRef(0);
  const loading = useRef(false);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"All" | ItemType>("All");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  /** Every screen this role can open — built from the menus, no fetch needed. */
  const screens = useMemo<SearchItem[]>(() => {
    const modules: SearchItem[] = NAV_ITEMS.filter((n) => !NAV_MODULE[n.href] || can(NAV_MODULE[n.href])).map((n) => ({
      key: `pg-${n.href}`,
      type: "Page" as const,
      title: n.label,
      subtitle: "Module",
      href: n.href,
      keywords: n.label.toLowerCase(),
    }));
    const reports: SearchItem[] =
      can("VYAPAR") && can("VYAPAR_REPORTS")
        ? VYAPAR_REPORTS.map((r) => ({
            key: `rep-${r.id}`,
            type: "Page" as const,
            title: r.title,
            subtitle: `Vyapar › Reports › ${r.group}`,
            href: `/vyapar/reports?r=${r.id}`,
            keywords: `vyapar report ${r.title} ${r.group}`.toLowerCase(),
          }))
        : [];
    const all = [
      ...modules,
      ...screensOf("Tender", "TENDER", TENDER_NAV, can),
      ...screensOf("Taskopad", "TASKOPAD", TASKOPAD_TABS, can),
      ...screensOf("Vyapar", "VYAPAR", VYAPAR_NAV, can),
      ...reports,
      ...screensOf("Procurement", "PROCUREMENT", PROCUREMENT_NAV, can),
      ...screensOf("Payroll", "PAYROLL", [...PAYROLL_NAV, ...PAYROLL_SELF_NAV], can),
      ...screensOf("Warehouse", "WAREHOUSE", WAREHOUSE_NAV, can),
      { key: "pg-/punch", type: "Page" as const, title: "Punch in / out", subtitle: "Attendance", href: "/punch", keywords: "punch attendance check in out selfie" },
      { key: "pg-/todo", type: "Page" as const, title: "My To-Do", subtitle: "Personal", href: "/todo", keywords: "todo to-do reminders personal board calendar" },
    ];
    // A module's home appears both as the module and as its menu's first entry; keep the first.
    const seen = new Set<string>();
    return all.filter((s) => (seen.has(s.href) ? false : (seen.add(s.href), true)));
  }, [can]);

  const load = useCallback(() => {
    if (loading.current || (loadedAt.current && Date.now() - loadedAt.current < STALE_MS)) return;
    loading.current = true;
    const lc = (...parts: (string | number | null | undefined)[]) => parts.filter((p) => p != null && p !== "").join(" ").toLowerCase();
    const sub = (...parts: (string | number | null | undefined)[]) => parts.filter((p) => p != null && p !== "").join(" · ");

    // source → [needed module, loader]. A source the role cannot view is never requested.
    const sources: [string, Need | undefined, () => Promise<SearchItem[]>][] = [
      [
        "projects",
        "PROJECT",
        async () =>
          (await api.getProjects({ size: 500 })).content.map((p) => ({
            key: `p-${p.id}`,
            type: "Project" as const,
            title: p.name,
            subtitle: sub(p.projectCode, p.customerName),
            href: `/project/${p.id}`,
            keywords: lc(p.name, p.projectCode, p.customerName, p.city),
          })),
      ],
      [
        "tasks",
        "TASKOPAD",
        async () =>
          (await listTasks()).map((t) => ({
            key: `t-${t.id}`,
            type: "Task" as const,
            title: t.title,
            subtitle: sub(t.code, t.clientName),
            // ?task=<id> opens this task's drawer on arrival.
            href: `/taskopad/tasks?task=${t.id}`,
            keywords: lc(t.title, t.code, t.id, t.clientName),
          })),
      ],
      [
        "tenders",
        "TENDER",
        async () =>
          (await listTenders()).map((t) => ({
            key: `tn-${t.id}`,
            type: "Tender" as const,
            title: t.nameOfWork?.trim() || t.tenderId,
            subtitle: sub(t.tenderId, t.department, t.location, t.statusLabel ?? t.stage),
            href: `/tender/pipeline?open=${t.id}`,
            keywords: lc(t.nameOfWork, t.tenderId, t.department, t.location, t.statusLabel, t.stage),
          })),
      ],
      [
        "parties",
        "VYAPAR",
        async () =>
          (await vyapar.getParties(undefined, undefined, true)).map((p) => ({
            key: `pt-${p.id}`,
            type: "Party" as const,
            title: p.name,
            subtitle: sub(p.partyType === "SUPPLIER" ? "Supplier" : "Customer", p.phone, p.gstin, p.city),
            href: `/vyapar/parties?open=${p.id}`,
            keywords: lc(p.name, p.phone, p.gstin, p.city, p.partyGroup, p.email),
          })),
      ],
      [
        "items",
        "VYAPAR",
        async () =>
          (await vyapar.getItems()).map((i) => ({
            key: `it-${i.id}`,
            type: "Item" as const,
            title: i.name,
            subtitle: sub(i.itemCode, i.category, i.hsn ? `HSN ${i.hsn}` : null, i.unit),
            href: `/vyapar/items`,
            keywords: lc(i.name, i.itemCode, i.category, i.hsn, i.description),
          })),
      ],
      [
        "documents",
        "VYAPAR",
        async () =>
          (await vyapar.getInvoices()).flatMap((d) => {
            const href = docTypeHref(d.docType, d.id);
            if (!href) return [];
            const no = fullInvoiceNo(d);
            const label = DOC_LABEL[d.docType] ?? d.docType;
            return [
              {
                key: `d-${d.id}`,
                type: "Document" as const,
                title: `${label}${no ? ` ${no}` : ""}`,
                subtitle: sub(d.partyName ?? d.billingName, d.invoiceDate ? bookDate(d.invoiceDate) : null, inr(d.total), d.cancelled ? "Cancelled" : d.status),
                href,
                keywords: lc(label, no, d.invoiceNo, d.partyName, d.billingName, d.sourceRef, d.total),
              },
            ];
          }),
      ],
      [
        "rfqs",
        "PROCUREMENT",
        async () =>
          (await getRfqs()).map((r) => ({
            key: `rfq-${r.id}`,
            type: "Procurement" as const,
            title: `RFQ ${r.rfqNo}`,
            subtitle: sub(r.title, r.status, r.rfqDate ? bookDate(r.rfqDate) : null),
            href: `/procurement/rfq`,
            keywords: lc("rfq", r.rfqNo, r.title, r.status),
          })),
      ],
      [
        "workOrders",
        "PROCUREMENT",
        async () =>
          (await getWorkOrders()).map((w) => ({
            key: `wo-${w.id}`,
            type: "Procurement" as const,
            title: `Work Order ${w.woNo}`,
            subtitle: sub(w.title, w.vendorName, w.status),
            href: `/procurement/work-order/${w.id}`,
            keywords: lc("work order", w.woNo, w.title, w.vendorName, w.vendorPhone, w.status),
          })),
      ],
      [
        "staff",
        "PAYROLL",
        async () =>
          usePayrollStore.getState().employees.map((e) => ({
            key: `s-${e.id}`,
            type: "Staff" as const,
            title: e.name,
            subtitle: sub(e.staffId, e.designation, e.department),
            href: `/payroll/staff/${e.id}`,
            keywords: lc(e.name, e.staffId, e.designation, e.department, e.phone),
          })),
      ],
      [
        "assets",
        "ASSET",
        async () =>
          (await listAssets()).map((a) => ({
            key: `as-${a.id}`,
            type: "Asset" as const,
            title: a.name,
            subtitle: sub(a.code, a.typeName, "Asset"),
            href: `/asset/${a.id}`,
            keywords: lc("asset", a.name, a.code, a.typeName),
          })),
      ],
      [
        "equipment",
        "EQUIPMENT",
        async () =>
          (await listEquipment()).map((e) => ({
            key: `eq-${e.id}`,
            type: "Asset" as const,
            title: e.name,
            subtitle: sub(e.code, "Equipment"),
            href: `/equipment/${e.id}`,
            keywords: lc("equipment", e.name, e.code),
          })),
      ],
      [
        "people",
        undefined,
        async () =>
          (await api.getTeam()).map((u) => ({
            key: `u-${u.id}`,
            type: "People" as const,
            title: u.fullName,
            subtitle: u.roleName,
            href: `/settings`,
            keywords: lc(u.fullName, u.roleName),
          })),
      ],
    ];

    const wanted = sources.filter(([, need]) => can(need));
    setPending(wanted.length);
    let left = wanted.length;
    for (const [name, , run] of wanted) {
      run()
        .catch(() => [] as SearchItem[])
        .then((rows) => {
          setRecords((r) => ({ ...r, [name]: rows }));
          left -= 1;
          setPending(left);
          if (left === 0) {
            loading.current = false;
            loadedAt.current = Date.now();
          }
        });
    }
    if (!wanted.length) loading.current = false;
  }, [can]);

  // ⌘K / Ctrl+K toggles the palette from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      load();
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open, load]);

  const items = useMemo(() => [...screens, ...Object.values(records).flat()], [screens, records]);

  const groups = useMemo(() => {
    // Every word typed has to be found somewhere in the entry; entries whose title starts with
    // the query come first, then titles that contain it, then matches in the details.
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const q = words.join(" ");
    const scored = words.length
      ? items.flatMap((i) => {
          if (!words.every((w) => i.keywords.includes(w) || i.title.toLowerCase().includes(w))) return [];
          const t = i.title.toLowerCase();
          return [{ i, score: t.startsWith(q) ? 3 : t.includes(q) ? 2 : words.every((w) => t.includes(w)) ? 1.5 : 1 }];
        })
      : items.map((i) => ({ i, score: 0 }));
    const cap = tab === "All" ? (words.length ? 6 : 4) : 80;
    const types = tab === "All" ? ORDER : [tab];
    return types
      .map((t) => {
        const of = scored.filter((s) => s.i.type === t).sort((a, b) => b.score - a.score);
        return { type: t, total: of.length, best: of[0]?.score ?? 0, items: of.slice(0, cap).map((s) => s.i) };
      })
      .filter((g) => g.items.length > 0)
      // With something typed, the group holding the closest match leads; otherwise the fixed order.
      .sort((a, b) => (words.length ? b.best - a.best : 0));
  }, [items, tab, query]);

  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const counts = useMemo(() => {
    const out: Partial<Record<ItemType, number>> = {};
    for (const i of items) out[i.type] = (out[i.type] ?? 0) + 1;
    return out;
  }, [items]);
  const tabs = useMemo(() => ["All" as const, ...ORDER.filter((t) => (counts[t] ?? 0) > 0)], [counts]);

  useEffect(() => {
    setIndex(0);
  }, [query, tab]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setTab("All");
  }, []);

  const go = useCallback(
    (item: SearchItem) => {
      close();
      router.push(item.href);
    },
    [close, router]
  );

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndex((i) => Math.min(i + 1, flat.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (flat[index]) go(flat[index]);
    } else if (e.key === "Escape") {
      close();
    } else if (e.key === "Tab") {
      // Tab / Shift+Tab steps through the kinds of result.
      e.preventDefault();
      const at = tabs.indexOf(tab);
      setTab(tabs[(at + (e.shiftKey ? tabs.length - 1 : 1)) % tabs.length]);
    }
  }

  return (
    <>
      {/* Trigger — a prominent, consistent search bar shown in the header of every page */}
      <button
        onClick={() => setOpen(true)}
        className="flex w-44 items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-400 transition-colors duration-150 hover:border-gray-300 hover:bg-white sm:w-64 lg:w-80"
        title="Search everything (⌘K)"
      >
        <Search size={15} className="shrink-0" />
        <span className="flex-1 truncate text-left">Search everything…</span>
        <kbd className="hidden shrink-0 rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-400 sm:inline">
          ⌘K
        </kbd>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[10vh] backdrop-blur-sm"
          onClick={close}
        >
          <div
            className="animate-fade-in w-full max-w-2xl overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Search input */}
            <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-3">
              <Search size={18} className="shrink-0 text-gray-400" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Search screens, projects, tenders, parties, invoices, staff…"
                className="w-full bg-transparent text-sm text-gray-700 outline-none placeholder:text-gray-400"
              />
              {pending > 0 && <Spinner size={14} className="shrink-0 text-brand-accent" />}
              <button onClick={close} className="shrink-0 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                <X size={16} />
              </button>
            </div>

            {/* Kinds of result — only the ones this role has anything in */}
            <div className="no-scrollbar flex items-center gap-1 overflow-x-auto border-b border-gray-100 px-3">
              {tabs.map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`relative shrink-0 px-2.5 py-2 text-sm font-medium whitespace-nowrap transition-colors duration-150 ${
                    tab === t ? "text-brand-accent" : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {t === "All" ? "All" : TAB_LABEL[t]}
                  {tab === t && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand-accent" />}
                </button>
              ))}
            </div>

            {/* Results */}
            <div className="max-h-[56vh] overflow-y-auto py-2">
              {flat.length === 0 ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-400">
                  {pending > 0 ? (
                    <>
                      <Spinner size={16} className="text-brand-accent" /> Searching everything…
                    </>
                  ) : query ? (
                    `No results for “${query}”.`
                  ) : (
                    "Nothing to show yet."
                  )}
                </div>
              ) : (
                groups.map((group) => (
                  <div key={group.type} className="mb-1">
                    <div className="flex items-center gap-2 px-4 pb-1 pt-2 text-[11px] font-semibold tracking-wide text-gray-400 uppercase">
                      {GROUP_LABEL[group.type]}
                      <span className="text-gray-300">{group.total}</span>
                      {tab === "All" && group.total > group.items.length && (
                        <button onClick={() => setTab(group.type)} className="ml-auto font-medium tracking-normal text-brand-accent normal-case hover:underline">
                          Show all
                        </button>
                      )}
                    </div>
                    {group.items.map((item) => {
                      const flatIdx = flat.indexOf(item);
                      const active = flatIdx === index;
                      return (
                        <button
                          key={item.key}
                          onMouseEnter={() => setIndex(flatIdx)}
                          onClick={() => go(item)}
                          className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors duration-100 ${
                            active ? "bg-cyan-50" : "hover:bg-gray-50"
                          }`}
                        >
                          <ItemIcon item={item} />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-gray-800">{item.title}</div>
                            {item.subtitle && <div className="truncate text-xs text-gray-400">{item.subtitle}</div>}
                          </div>
                          {active && <CornerDownLeft size={14} className="shrink-0 text-brand-accent" />}
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>

            {/* Footer hints */}
            <div className="flex items-center gap-4 border-t border-gray-100 bg-gray-50/60 px-4 py-2 text-[11px] text-gray-400">
              <span className="flex items-center gap-1">
                <Hint>↑</Hint>
                <Hint>↓</Hint> to navigate
              </span>
              <span className="flex items-center gap-1">
                <Hint>tab</Hint> to switch kind
              </span>
              <span className="flex items-center gap-1">
                <Hint>↵</Hint> to open
              </span>
              <span className="flex items-center gap-1">
                <Hint>esc</Hint> to close
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const ICON: Record<Exclude<ItemType, "People">, [React.ComponentType<{ size?: number }>, string]> = {
  Page: [LayoutGrid, "bg-slate-100 text-slate-600"],
  Project: [FolderKanban, "bg-indigo-50 text-indigo-600"],
  Task: [ListChecks, "bg-cyan-50 text-brand-accent"],
  Tender: [Gavel, "bg-violet-50 text-violet-600"],
  Party: [Users, "bg-emerald-50 text-emerald-600"],
  Item: [Package, "bg-orange-50 text-orange-600"],
  Document: [FileText, "bg-rose-50 text-rose-600"],
  Procurement: [ClipboardList, "bg-sky-50 text-sky-600"],
  Staff: [HardHat, "bg-amber-50 text-amber-600"],
  Asset: [Truck, "bg-teal-50 text-teal-600"],
};

function ItemIcon({ item }: { item: SearchItem }) {
  if (item.type === "People") {
    return (
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white ${projectAvatarColor(item.key)}`}
      >
        {item.title ? projectInitials(item.title) : <UserRound size={14} />}
      </div>
    );
  }
  const [Icon, tone] = item.key.startsWith("eq-") ? [Boxes, ICON.Asset[1]] : ICON[item.type];
  return (
    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tone}`}>
      <Icon size={16} />
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border border-gray-200 bg-white px-1.5 py-0.5 font-medium text-gray-500">{children}</kbd>;
}
