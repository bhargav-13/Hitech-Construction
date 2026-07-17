"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CornerDownLeft,
  FolderKanban,
  ListChecks,
  Search,
  UserRound,
  X,
} from "lucide-react";
import * as api from "@/lib/api";
import { listTasks } from "@/lib/tasksApi";
import { projectAvatarColor, projectInitials } from "@/lib/projectHelpers";
import { Spinner } from "./Spinner";

type ItemType = "Project" | "Task" | "People";

interface SearchItem {
  key: string;
  type: ItemType;
  title: string;
  subtitle: string;
  href: string;
  keywords: string;
}

const TABS: ("All" | ItemType)[] = ["All", "Project", "Task", "People"];
const GROUP_LABEL: Record<ItemType, string> = { Project: "Projects", Task: "Tasks", People: "People" };
const ORDER: ItemType[] = ["Project", "Task", "People"];

export function GlobalSearch() {
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<SearchItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"All" | ItemType>("All");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadOnce = useCallback(async () => {
    if (items || loading) return;
    setLoading(true);
    try {
      const [projects, tasks, team] = await Promise.all([
        api.getProjects({ size: 500 }).then((r) => r.content).catch(() => []),
        listTasks().catch(() => []),
        api.getTeam().catch(() => []),
      ]);
      const mapped: SearchItem[] = [
        ...projects.map((p) => ({
          key: `p-${p.id}`,
          type: "Project" as const,
          title: p.name,
          subtitle: [p.projectCode, p.customerName].filter(Boolean).join(" · "),
          href: `/project/${p.id}`,
          keywords: `${p.name} ${p.projectCode ?? ""} ${p.customerName ?? ""} ${p.city ?? ""}`.toLowerCase(),
        })),
        ...tasks.map((t) => ({
          key: `t-${t.id}`,
          type: "Task" as const,
          title: t.title,
          subtitle: [t.code, t.clientName].filter(Boolean).join(" · "),
          href: `/taskopad/tasks`,
          keywords: `${t.title} ${t.code} ${t.clientName ?? ""}`.toLowerCase(),
        })),
        ...team.map((u) => ({
          key: `u-${u.id}`,
          type: "People" as const,
          title: u.fullName,
          subtitle: u.roleName,
          href: `/settings`,
          keywords: `${u.fullName} ${u.roleName}`.toLowerCase(),
        })),
      ];
      setItems(mapped);
    } finally {
      setLoading(false);
    }
  }, [items, loading]);

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
      loadOnce();
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open, loadOnce]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = items ?? [];
    if (q) list = list.filter((i) => i.keywords.includes(q));
    const cap = tab === "All" ? 5 : 50;
    const types = tab === "All" ? ORDER : [tab];
    return types
      .map((t) => ({ type: t as ItemType, items: list.filter((i) => i.type === t).slice(0, cap) }))
      .filter((g) => g.items.length > 0);
  }, [items, tab, query]);

  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  useEffect(() => {
    setIndex(0);
  }, [query, tab, items]);

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
    }
  }

  return (
    <>
      {/* Trigger — sits beside the notification bell */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-400 transition-colors duration-150 hover:border-gray-300 hover:bg-gray-100"
        title="Search everything (⌘K)"
      >
        <Search size={15} />
        <span className="hidden sm:inline">Search…</span>
        <kbd className="ml-1 hidden rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-400 sm:inline">
          ⌘K
        </kbd>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[10vh] backdrop-blur-sm"
          onClick={close}
        >
          <div
            className="animate-fade-in w-full max-w-xl overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl"
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
                placeholder="Search projects, tasks, people…"
                className="w-full bg-transparent text-sm text-gray-700 outline-none placeholder:text-gray-400"
              />
              <button onClick={close} className="shrink-0 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                <X size={16} />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-1 border-b border-gray-100 px-3">
              {TABS.map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`relative px-3 py-2 text-sm font-medium transition-colors duration-150 ${
                    tab === t ? "text-brand-accent" : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {t}
                  {tab === t && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand-accent" />}
                </button>
              ))}
            </div>

            {/* Results */}
            <div className="max-h-[52vh] overflow-y-auto py-2">
              {loading && !items ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-400">
                  <Spinner size={16} className="text-brand-accent" /> Searching everything…
                </div>
              ) : flat.length === 0 ? (
                <div className="py-10 text-center text-sm text-gray-400">
                  {query ? `No results for “${query}”.` : "Nothing to show yet."}
                </div>
              ) : (
                groups.map((group) => (
                  <div key={group.type} className="mb-1">
                    <div className="flex items-center gap-2 px-4 pb-1 pt-2 text-[11px] font-semibold tracking-wide text-gray-400 uppercase">
                      {GROUP_LABEL[group.type]}
                      <span className="text-gray-300">{group.items.length}</span>
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

function ItemIcon({ item }: { item: SearchItem }) {
  if (item.type === "Task") {
    return (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-50 text-brand-accent">
        <ListChecks size={16} />
      </div>
    );
  }
  if (item.type === "Project") {
    return (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
        <FolderKanban size={16} />
      </div>
    );
  }
  return (
    <div
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white ${projectAvatarColor(item.key)}`}
    >
      {item.title ? projectInitials(item.title) : <UserRound size={14} />}
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border border-gray-200 bg-white px-1.5 py-0.5 font-medium text-gray-500">{children}</kbd>;
}
