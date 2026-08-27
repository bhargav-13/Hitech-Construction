"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Spinner } from "@/components/Spinner";
import { apiRequest } from "@/lib/api";
import { useCompanies, companyAccent, companyInitials, type Company } from "@/lib/companyScope";
import { Check, ImageUp, Lock, Save, Search, Trash2, Users } from "lucide-react";

/**
 * Settings ▸ Companies — the letterhead for each firm the group trades as.
 *
 * These details are what gets stamped on invoices and statements, which is why they're editable
 * here rather than seeded: the migration deliberately leaves address and GSTIN blank so the client
 * enters their own registration rather than inheriting a guess.
 *
 * `code` and the enabled flag are not editable. The code is referenced by seeds and backfills, and
 * enabling a company is a claim that its data is genuinely separated — that belongs to a migration
 * once the modules are split, not to a form.
 */
export function CompanySettings() {
  const { companies, loading } = useCompanies();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  // Derived rather than synced in an effect: the list arrives asynchronously, and falling back to
  // the first company keeps a valid selection without a render pass that shows nothing.
  const selected = companies.find((c) => c.id === selectedId) ?? companies[0] ?? null;

  if (loading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center gap-2 text-sm text-gray-400">
        <Spinner size={16} className="text-brand-accent" /> Loading…
      </div>
    );
  }

  if (companies.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
        No companies are set up for your account.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 lg:flex-row">
      <div className="w-full shrink-0 space-y-2 lg:w-64">
        {companies.map((c) => {
          const accent = companyAccent(c);
          const isActive = c.id === selected?.id;
          return (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-all duration-150 ${
                isActive ? "border-brand-accent bg-cyan-50/50" : "border-gray-200 bg-white hover:bg-gray-50"
              }`}
            >
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg text-xs font-semibold ${
                  c.logoDataUrl ? "bg-white ring-1 ring-gray-200" : accent.tile
                }`}
              >
                {c.logoDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.logoDataUrl} alt="" className="h-full w-full object-contain p-0.5" />
                ) : (
                  companyInitials(c.name)
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-gray-800">{c.name}</span>
                <span className="block truncate text-xs text-gray-500">{c.gstin || "GSTIN not set"}</span>
              </span>
              {!c.enabled && <Lock size={13} className="shrink-0 text-gray-400" />}
            </button>
          );
        })}
      </div>

      <div className="min-w-0 flex-1">{selected && <CompanyForm key={selected.id} company={selected} />}</div>
    </div>
  );
}

/** Shrinks whatever image is picked down to a header-sized logo, so the PDF stays light. */
function resizeLogo(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn't read that file."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("That doesn't look like an image."));
      img.onload = () => {
        const maxDim = 220;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas not supported."));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/png"));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function CompanyForm({ company }: { company: Company }) {
  const [draft, setDraft] = useState<Company>(company);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const set = useCallback(<K extends keyof Company>(key: K, value: Company[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setSaved(false);
  }, []);

  async function onPickLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      set("logoDataUrl", await resizeLogo(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't process that image.");
    }
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      await apiRequest<Company>(`/api/v1/companies/${company.id}`, { method: "PUT", body: draft });
      setSaved(true);
      // The sidebar reads this list from a store loaded once per page load, so a rename or a new
      // logo wouldn't show until the next navigation. Reloading is the honest, cheap fix for a
      // form that is edited perhaps twice a year.
      setTimeout(() => window.location.reload(), 600);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save this company.");
      setSaving(false);
    }
  }

  const accent = companyAccent(draft);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-gray-800">{company.name}</h3>
          <p className="mt-0.5 text-sm text-gray-500">
            Printed on every invoice, statement and export raised by this firm.
          </p>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-4 py-2 text-sm font-medium text-white transition-all duration-150 hover:opacity-90 active:scale-95 disabled:opacity-50"
        >
          {saving ? <Spinner size={14} /> : <Save size={14} />} {saving ? "Saving…" : "Save"}
        </button>
      </div>

      {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}
      {saved && <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Saved.</div>}

      {!company.enabled && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
          <Lock size={15} className="mt-0.5 shrink-0" />
          <span>
            This company can be set up now, but can&apos;t be switched into until each module keeps its data
            separately. Details saved here are kept and used the moment it&apos;s turned on.
          </span>
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <span className="mb-2 block text-[11px] font-medium tracking-wide text-gray-400 uppercase">Logo</span>
        <div className="flex items-center gap-4">
          <div
            className={`flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg text-sm font-semibold ${
              draft.logoDataUrl ? "border border-dashed border-gray-300 bg-gray-50" : accent.tile
            }`}
          >
            {draft.logoDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={draft.logoDataUrl} alt="Company logo" className="h-full w-full object-contain" />
            ) : (
              companyInitials(draft.name)
            )}
          </div>
          <div className="flex gap-2">
            <input ref={fileRef} type="file" accept="image/*" onChange={onPickLogo} className="hidden" />
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 transition-all duration-150 hover:bg-gray-50 active:scale-95"
            >
              <ImageUp size={14} /> Upload
            </button>
            {draft.logoDataUrl && (
              <button
                onClick={() => set("logoDataUrl", null)}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 transition-all duration-150 hover:bg-rose-50 hover:text-rose-600 active:scale-95"
              >
                <Trash2 size={14} /> Remove
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 rounded-xl border border-gray-200 bg-white p-5 sm:grid-cols-2">
        <Field label="Business Name" required>
          <input value={draft.name} onChange={(e) => set("name", e.target.value)} className="input" />
        </Field>
        <Field label="Legal Name">
          <input value={draft.legalName ?? ""} onChange={(e) => set("legalName", e.target.value)} className="input" />
        </Field>
        <Field label="GSTIN">
          <input
            value={draft.gstin ?? ""}
            onChange={(e) => set("gstin", e.target.value.toUpperCase())}
            placeholder="24AAAAA0000A1ZN"
            className="input"
          />
        </Field>
        <Field label="PAN">
          <input
            value={draft.pan ?? ""}
            onChange={(e) => set("pan", e.target.value.toUpperCase())}
            className="input"
          />
        </Field>
        <Field label="State" hint="Decides CGST/SGST vs IGST on every invoice.">
          <input value={draft.state ?? ""} onChange={(e) => set("state", e.target.value)} placeholder="Gujarat" className="input" />
        </Field>
        <Field label="City">
          <input value={draft.city ?? ""} onChange={(e) => set("city", e.target.value)} className="input" />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Address">
            <textarea
              value={draft.address ?? ""}
              onChange={(e) => set("address", e.target.value)}
              rows={2}
              className="input resize-none"
            />
          </Field>
        </div>
        <Field label="Phone">
          <input value={draft.phone ?? ""} onChange={(e) => set("phone", e.target.value)} className="input" />
        </Field>
        <Field label="Email">
          <input value={draft.email ?? ""} onChange={(e) => set("email", e.target.value)} className="input" />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Footer Note" hint="Printed at the foot of every PDF.">
            <input value={draft.footerNote ?? ""} onChange={(e) => set("footerNote", e.target.value)} className="input" />
          </Field>
        </div>
      </div>

      <CompanyStaff companyId={company.id} companyName={company.name} />

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <span className="mb-1 block text-[11px] font-medium tracking-wide text-gray-400 uppercase">Accent colour</span>
        <p className="mb-3 text-xs text-gray-500">
          Paints the strip down the sidebar so it&apos;s obvious which firm&apos;s books are on screen.
        </p>
        <div className="flex gap-2">
          {(["cyan", "amber", "emerald", "violet"] as const).map((a) => (
            <button
              key={a}
              onClick={() => set("accent", a)}
              aria-label={a}
              className={`h-9 w-9 rounded-lg transition-all duration-150 active:scale-90 ${companyAccent({ ...draft, accent: a }).bar} ${
                draft.accent === a ? "ring-2 ring-gray-800 ring-offset-2" : "opacity-70 hover:opacity-100"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium tracking-wide text-gray-400 uppercase">
        {label}
        {required && <span className="text-rose-500"> *</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-gray-400">{hint}</span>}
    </label>
  );
}

interface CompanyUser {
  id: number;
  fullName: string | null;
  email: string | null;
  roleName: string | null;
  member: boolean;
}

/**
 * Who works in this company.
 *
 * A user account is deliberately global — one person, one login, one password — because the whole
 * point of the switcher is that somebody can work in both firms. What is per-company is *access*:
 * this list. Someone with no tick here is refused (403) if they try to act as this company, and
 * doesn't appear in its assignee, follower or project-member pickers.
 *
 * Super Admin reaches every company whether ticked or not, so the ticks are about ordinary staff.
 */
function CompanyStaff({ companyId, companyName }: { companyId: number; companyName: string }) {
  const [users, setUsers] = useState<CompanyUser[] | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    apiRequest<CompanyUser[]>(`/api/v1/companies/${companyId}/users`)
      .then((list) => {
        if (cancelled) return;
        setUsers(list);
        setPicked(new Set(list.filter((u) => u.member).map((u) => u.id)));
      })
      .catch(() => {
        // Most likely no USER_MANAGEMENT:VIEW — hide the panel rather than show a broken one.
        if (!cancelled) setUsers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  if (users === null || users.length === 0) return null;

  const q = search.trim().toLowerCase();
  const shown = q
    ? users.filter((u) => [u.fullName, u.email, u.roleName].some((f) => f?.toLowerCase().includes(q)))
    : users;

  function toggle(id: number) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      await apiRequest<void>(`/api/v1/companies/${companyId}/users`, { method: "PUT", body: [...picked] });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the staff list.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-gray-400 uppercase">
          <Users size={13} /> Who works here
        </span>
        <span className="text-xs text-gray-500">
          {picked.size} of {users.length} selected
        </span>
      </div>
      <p className="mb-3 text-xs text-gray-500">
        Only these people can switch into {companyName}, and only they appear in its assignee and
        project-member lists. Super Admins always have access.
      </p>

      <div className="mb-2 flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-1.5 focus-within:border-cyan-500">
        <Search size={14} className="text-gray-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, email or role…"
          className="w-full text-sm outline-none"
        />
      </div>

      <div className="max-h-64 space-y-0.5 overflow-y-auto rounded-lg border border-gray-100 p-1">
        {shown.map((u) => {
          const on = picked.has(u.id);
          return (
            <label
              key={u.id}
              className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors duration-150 hover:bg-gray-50"
            >
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors duration-150 ${
                  on ? "border-cyan-600 bg-cyan-600 text-white" : "border-gray-300 bg-white"
                }`}
              >
                {on && <Check size={11} strokeWidth={3} />}
              </span>
              <input type="checkbox" checked={on} onChange={() => toggle(u.id)} className="sr-only" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-gray-800">{u.fullName || u.email || `User ${u.id}`}</span>
                <span className="block truncate text-[11px] text-gray-500">
                  {[u.roleName, u.email].filter(Boolean).join(" · ")}
                </span>
              </span>
            </label>
          );
        })}
        {shown.length === 0 && <p className="px-2 py-3 text-center text-xs text-gray-400">Nobody matches that.</p>}
      </div>

      {error && <div className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}

      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-xs text-gray-500">
          {saved ? "Staff list saved." : "Changes here save separately from the details above."}
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => setPicked(new Set(users.map((u) => u.id)))}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 transition-all duration-150 hover:bg-gray-50 active:scale-95"
          >
            Select all
          </button>
          <button
            onClick={() => setPicked(new Set())}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 transition-all duration-150 hover:bg-gray-50 active:scale-95"
          >
            Clear
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg border border-brand-accent px-3 py-1.5 text-xs font-medium text-brand-accent transition-all duration-150 hover:bg-cyan-50 active:scale-95 disabled:opacity-50"
          >
            {saving ? <Spinner size={12} /> : <Save size={12} />} Save staff
          </button>
        </div>
      </div>
    </div>
  );
}
