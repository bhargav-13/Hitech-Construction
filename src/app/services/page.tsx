import {
  Banknote,
  FileCheck,
  GraduationCap,
  HardHat,
  ScrollText,
  Umbrella,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";

const SERVICES = [
  {
    icon: Banknote,
    title: "Project Loans & Finance",
    desc: "Working capital and equipment loans for ongoing government contracts.",
    badge: "Popular",
  },
  {
    icon: Umbrella,
    title: "Workmen Insurance",
    desc: "Group accident cover for site workers, compliant with labour laws.",
    badge: "",
  },
  {
    icon: FileCheck,
    title: "Tender Assistance",
    desc: "Document preparation and bid submission support for e-tenders.",
    badge: "New",
  },
  {
    icon: ScrollText,
    title: "GST & Compliance Filing",
    desc: "Monthly GSTR filing, TDS returns and labour cess compliance.",
    badge: "",
  },
  {
    icon: HardHat,
    title: "Safety Audit & Training",
    desc: "On-site safety audits and toolbox training for crews.",
    badge: "",
  },
  {
    icon: GraduationCap,
    title: "Skill Certification",
    desc: "NSDC-aligned certification for masons, operators and electricians.",
    badge: "",
  },
];

export default function ServicesPage() {
  return (
    <AppShell title="Services">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-800">Our Services</h2>
        <p className="text-sm text-gray-400">Value-added services for your business.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {SERVICES.map((s) => (
          <div key={s.title} className="relative rounded-xl border border-gray-200 bg-white p-5">
            {s.badge && (
              <span className="absolute top-3 right-3 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-medium text-rose-600">
                {s.badge}
              </span>
            )}
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-teal-50 text-brand-accent">
              <s.icon size={20} />
            </div>
            <div className="mb-1 text-sm font-semibold text-gray-800">{s.title}</div>
            <p className="mb-3 text-xs text-gray-500">{s.desc}</p>
            <button className="text-xs font-medium text-brand-accent hover:underline">
              Learn more &gt;
            </button>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
