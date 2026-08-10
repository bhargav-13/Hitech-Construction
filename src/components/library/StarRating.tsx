"use client";

import { useState } from "react";
import { Star } from "lucide-react";

/**
 * Editable 0–5 star rating. Hovering previews the value you'd set; clicking the star that's already
 * lit clears the rating. Rows are clickable, so every star swallows its own click.
 */
export function StarRating({
  value,
  onChange,
  size = 14,
}: {
  value: number;
  onChange: (stars: number) => void;
  size?: number;
}) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;

  return (
    <div className="flex items-center gap-0.5" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          title={value === n ? "Click to clear" : `${n} star${n === 1 ? "" : "s"}`}
          onMouseEnter={() => setHover(n)}
          onClick={(e) => {
            e.stopPropagation();
            onChange(n);
          }}
          className="p-0.5 transition-transform duration-150 hover:scale-125 active:scale-95"
        >
          <Star
            size={size}
            className={
              n <= shown
                ? "fill-amber-400 text-amber-400"
                : "text-gray-300 hover:text-amber-300"
            }
          />
        </button>
      ))}
    </div>
  );
}
