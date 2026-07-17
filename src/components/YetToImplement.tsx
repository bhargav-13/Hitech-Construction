import { Hammer } from "lucide-react";

/**
 * Shared placeholder for project workspace tabs whose UI hasn't been built yet.
 * Keeps the demo honest — the tab exists and is navigable, but clearly flags it as pending.
 */
export function YetToImplement({
  label,
  icon: Icon = Hammer,
}: {
  label: string;
  icon?: React.ComponentType<{ size?: number }>;
}) {
  return (
    <div className="animate-fade-in flex min-h-[380px] items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white">
      <div className="flex flex-col items-center text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-cyan-50 text-brand-accent">
          <Icon size={26} />
        </div>
        <div className="text-base font-semibold text-gray-700">{label}</div>
        <div className="mt-1 max-w-xs text-sm text-gray-400">
          This section is yet to be implemented. The layout is coming next.
        </div>
        <span className="mt-4 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-600">
          Yet to be implemented
        </span>
      </div>
    </div>
  );
}
