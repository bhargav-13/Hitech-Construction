"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { VyaparShell } from "@/components/vyapar/VyaparShell";
import { Spinner } from "@/components/Spinner";
import * as vyapar from "@/lib/vyaparApi";
import type { FirmProfile } from "@/lib/vyaparApi";
import { clearFirmProfileCache } from "@/lib/vyaparExport";
import { ImageUp, Save, Trash2 } from "lucide-react";

const EMPTY: FirmProfile = { businessName: "", address: "", phone: "", email: "", gstin: "", state: "", logoDataUrl: null, footerNote: "" };

/** Shrinks whatever image the user picks down to a header-sized logo so the PDF stays light. */
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

/** Firm Profile — the letterhead (name, logo, GSTIN, address) stamped onto every PDF and print-out. */
export default function FirmProfilePage() {
  const [profile, setProfile] = useState<FirmProfile>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      try {
        setProfile(await vyapar.getFirmProfile());
      } catch {
        setProfile(EMPTY);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const set = useCallback(<K extends keyof FirmProfile>(key: K, value: FirmProfile[K]) => {
    setProfile((p) => ({ ...p, [key]: value }));
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
      const result = await vyapar.updateFirmProfile(profile);
      setProfile(result);
      clearFirmProfileCache();
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the firm profile.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <VyaparShell>
        <div className="flex min-h-[300px] items-center justify-center gap-2 text-sm text-gray-400">
          <Spinner size={16} className="text-brand-accent" /> Loading…
        </div>
      </VyaparShell>
    );
  }

  return (
    <VyaparShell>
      <div className="animate-fade-in max-w-2xl space-y-5">
        <div>
          <h2 className="text-base font-semibold text-gray-800">Firm Profile</h2>
          <p className="mt-0.5 text-sm text-gray-500">Shown on every PDF and print-out — invoices, ledgers, statements and reports.</p>
        </div>

        {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}

        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <span className="mb-2 block text-[11px] font-medium tracking-wide text-gray-400 uppercase">Logo</span>
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-gray-300 bg-gray-50">
              {profile.logoDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.logoDataUrl} alt="Firm logo" className="h-full w-full object-contain" />
              ) : (
                <ImageUp size={20} className="text-gray-300" />
              )}
            </div>
            <div className="flex items-center gap-2">
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickLogo} />
              <button
                onClick={() => fileRef.current?.click()}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 transition-all duration-150 hover:bg-gray-50 active:scale-95"
              >
                {profile.logoDataUrl ? "Change" : "Upload"}
              </button>
              {profile.logoDataUrl && (
                <button
                  onClick={() => set("logoDataUrl", null)}
                  className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-rose-500 transition-all duration-150 hover:bg-rose-50 active:scale-95"
                >
                  <Trash2 size={14} /> Remove
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 rounded-xl border border-gray-200 bg-white p-5 sm:grid-cols-2">
          <F label="Business Name" full>
            <input value={profile.businessName ?? ""} onChange={(e) => set("businessName", e.target.value)} className="input" placeholder="Hitech Construction" />
          </F>
          <F label="Address" full>
            <textarea value={profile.address ?? ""} onChange={(e) => set("address", e.target.value)} className="input" rows={2} placeholder="Street, city, PIN" />
          </F>
          <F label="Phone">
            <input value={profile.phone ?? ""} onChange={(e) => set("phone", e.target.value)} className="input" />
          </F>
          <F label="Email">
            <input value={profile.email ?? ""} onChange={(e) => set("email", e.target.value)} className="input" />
          </F>
          <F label="GSTIN">
            <input value={profile.gstin ?? ""} onChange={(e) => set("gstin", e.target.value.toUpperCase())} className="input font-mono" />
          </F>
          <F label="State">
            <input value={profile.state ?? ""} onChange={(e) => set("state", e.target.value)} className="input" />
          </F>
          <F label="Footer Note" full>
            <input value={profile.footerNote ?? ""} onChange={(e) => set("footerNote", e.target.value)} className="input" placeholder="Thank you for your business!" />
          </F>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-4 py-2 text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95 disabled:opacity-50"
          >
            <Save size={15} /> {saving ? "Saving…" : "Save"}
          </button>
          {saved && <span className="text-sm text-emerald-600">Saved</span>}
        </div>
      </div>
    </VyaparShell>
  );
}

function F({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <label className={`block ${full ? "sm:col-span-2" : ""}`}>
      <span className="mb-1 block text-[11px] font-medium tracking-wide text-gray-400 uppercase">{label}</span>
      {children}
    </label>
  );
}
