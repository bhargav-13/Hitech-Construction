"use client";

import { Bell, Gift, Link2, UserCircle } from "lucide-react";

export function Topbar({ title }: { title: string }) {
  return (
    <header className="flex h-16 flex-shrink-0 items-center justify-between border-b border-black/5 bg-white px-6">
      <h1 className="text-lg font-semibold text-gray-800">{title}</h1>
      <div className="flex items-center gap-5 text-sm text-brand-accent">
        <button className="flex items-center gap-1.5 hover:underline">
          <Link2 size={16} />
          Integrate Tally/Zoho
        </button>
        <button className="flex items-center gap-1.5 hover:underline">
          <Gift size={16} />
          Refer &amp; Earn
        </button>
        <button className="text-gray-500 hover:text-gray-700">
          <Bell size={20} />
        </button>
        <button className="text-orange-500 hover:text-orange-600">
          <UserCircle size={26} />
        </button>
      </div>
    </header>
  );
}
