const AVATAR_COLORS = [
  "bg-indigo-600",
  "bg-violet-600",
  "bg-blue-700",
  "bg-indigo-800",
  "bg-purple-700",
];

export function projectInitials(name: string): string {
  const words = name.trim().split(/\s+/);
  const first = words[0]?.[0] ?? "";
  const second = words[1]?.[0] ?? "";
  return (first + second).toUpperCase();
}

export function projectAvatarColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function formatRupee(value: number): string {
  return `₹${value.toLocaleString("en-IN")}`;
}
