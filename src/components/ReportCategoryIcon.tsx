import { CreditCard, Package, ClipboardList, Repeat, TrendingUp, Truck, Users } from "lucide-react";
import type { ReportCategory } from "@/lib/reports";

const ICONS: Record<ReportCategory["icon"], React.ComponentType<{ size?: number; className?: string }>> = {
  trending: TrendingUp,
  credit: CreditCard,
  clipboard: ClipboardList,
  repeat: Repeat,
  users: Users,
  truck: Truck,
  package: Package,
};

export function ReportCategoryIcon({
  icon,
  size = 16,
  className,
}: {
  icon: ReportCategory["icon"];
  size?: number;
  className?: string;
}) {
  const Icon = ICONS[icon];
  return <Icon size={size} className={className} />;
}
