interface BubbleItem {
  name: string;
  quantity: number;
}

const SLOTS = [
  { left: "27%", top: "58%" },
  { left: "66%", top: "24%" },
  { left: "85%", top: "58%" },
  { left: "68%", top: "88%" },
];

function truncate(label: string, max = 14): string {
  return label.length > max ? `${label.slice(0, max - 2)}..` : label;
}

export function BubbleCluster({ items }: { items: BubbleItem[] }) {
  const sorted = [...items].sort((a, b) => b.quantity - a.quantity);
  const values = sorted.map((i) => i.quantity);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const diameter = (v: number) =>
    max === min ? 100 : 60 + ((v - min) / (max - min)) * 90;

  return (
    <div className="relative h-56 w-full">
      {sorted.map((item, i) => {
        const size = diameter(item.quantity);
        const slot = SLOTS[i % SLOTS.length];
        return (
          <div
            key={`${item.name}-${i}`}
            className="absolute flex flex-col items-center justify-center rounded-full bg-brand-accent/80 text-center text-white shadow-sm"
            style={{
              left: slot.left,
              top: slot.top,
              width: size,
              height: size,
              transform: "translate(-50%, -50%)",
            }}
          >
            <span className="px-2 text-[11px] leading-tight font-medium">
              {truncate(item.name)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
