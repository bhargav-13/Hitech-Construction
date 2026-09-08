"use client";

import { CreatableSelect } from "@/components/CreatableSelect";
import { BUILT_IN_UOMS } from "@/lib/uoms";

/**
 * The unit picker used on every buying line — enquiry, work order, material issue.
 *
 * A thin wrapper over {@link CreatableSelect} bound to the shared UOM vocabulary, so a unit added
 * on an RFQ line is offered on the next work order too. See `lib/useUoms` for why the list is a
 * master rather than a constant.
 */
export function UnitSelect({
  value,
  onChange,
  size = "sm",
  className = "",
}: {
  value: string;
  onChange: (unit: string) => void;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <CreatableSelect
      value={value}
      onChange={onChange}
      masterKey="uom"
      builtIns={BUILT_IN_UOMS}
      createLabel="Add unit"
      size={size}
      className={className}
    />
  );
}
