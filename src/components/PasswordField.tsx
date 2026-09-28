"use client";

import { useState } from "react";
import { Copy, Eye, EyeOff, Wand2 } from "lucide-react";

/**
 * A password input an admin can read: an eye toggles it visible, Generate fills a random one and
 * shows it, Copy puts it on the clipboard so it can be handed to the member.
 *
 * The member's current password is shown separately (StoredPassword, Super Admin only).
 */
export function PasswordField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  function generate() {
    // No look-alikes (0/O, 1/l/I) — it's going to be read out or typed from a phone screen.
    const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
    const bytes = new Uint32Array(10);
    crypto.getRandomValues(bytes);
    const body = Array.from(bytes, (b) => chars[b % chars.length]).join("");
    onChange(`${body.slice(0, 5)}@${body.slice(5)}`);
    setVisible(true);
  }

  async function copy() {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the password is visible to copy by hand */
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <div className="relative flex-1">
        <input
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="new-password"
          className="input pr-9 font-mono"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          title={visible ? "Hide password" : "Show password"}
          className="absolute top-1/2 right-2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
        >
          {visible ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
      <button
        type="button"
        onClick={generate}
        title="Generate a password"
        className="flex shrink-0 items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-2 text-xs text-gray-600 hover:bg-gray-50"
      >
        <Wand2 size={13} /> Generate
      </button>
      <button
        type="button"
        onClick={copy}
        disabled={!value}
        title="Copy"
        className="shrink-0 rounded-lg border border-gray-200 px-2.5 py-2 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40"
      >
        {copied ? "Copied" : <Copy size={13} />}
      </button>
    </div>
  );
}
