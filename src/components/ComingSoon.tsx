import { Construction } from "lucide-react";
import { AppShell } from "./AppShell";

export function ComingSoon({ title }: { title: string }) {
  return (
    <AppShell title={title}>
      <div className="flex h-full min-h-[420px] items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white">
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-cyan-50 text-brand-accent">
            <Construction size={28} />
          </div>
          <div className="text-base font-medium text-gray-700">{title} module coming soon</div>
          <div className="mt-1 max-w-xs text-sm text-gray-400">
            Send a screenshot of this screen from the live ERP and it'll be built next.
          </div>
        </div>
      </div>
    </AppShell>
  );
}
