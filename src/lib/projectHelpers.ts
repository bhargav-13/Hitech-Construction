import { inr } from "./format";

const AVATAR_COLORS = [
  "bg-indigo-600",
  "bg-violet-600",
  "bg-blue-700",
  "bg-indigo-800",
  "bg-purple-700",
];

export function projectInitials(name: string): string {
  // Strip brackets/punctuation (e.g. "(Gram Panchayat)") so initials stay letters only.
  const words = name
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function projectAvatarColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

/** Kept as the familiar name used across the app; delegates to the canonical formatter. */
export function formatRupee(value: number): string {
  return inr(value);
}
