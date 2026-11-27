"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * A figure that always fits the box it is in.
 *
 * Stat cards print a full rupee amount (₹20,90,492.00 — the client rejected Cr/L shorthand) in a
 * large face, in tiles whose width depends on the screen and on the icon beside the number. A long
 * amount ran under the icon or out of the card. This keeps the figure on one line and shrinks it
 * just enough to fit — a short count keeps its full size — and, if even the smallest size is too
 * wide, lets it wrap rather than hide digits. The full text is always in the tooltip.
 *
 * Use it in place of the `<div>` holding the number, with the same classes.
 */
export function FitText({
  children,
  className = "",
  /** The smallest it may shrink to, as a fraction of its normal size. */
  min = 0.55,
  title,
}: {
  children: React.ReactNode;
  className?: string;
  min?: number;
  title?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const text = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const outer = box.current;
    const inner = text.current;
    if (!outer || !inner) return;
    const fit = () => {
      // Measure at full size, on one line.
      inner.style.fontSize = "";
      inner.style.whiteSpace = "nowrap";
      const room = outer.clientWidth;
      const need = inner.scrollWidth;
      if (!room || need <= room) return;
      const scale = room / need;
      if (scale >= min) {
        inner.style.fontSize = `${Math.floor(scale * 1000) / 1000}em`;
      } else {
        // Smaller than this stops being readable: wrap instead of hiding part of the number.
        inner.style.fontSize = `${min}em`;
        inner.style.whiteSpace = "normal";
      }
    };
    fit();
    const watch = new ResizeObserver(fit);
    watch.observe(outer);
    return () => watch.disconnect();
  }, [children, min]);

  const tip = title ?? (typeof children === "string" || typeof children === "number" ? String(children) : undefined);
  return (
    <div ref={box} title={tip} className={`min-w-0 max-w-full overflow-hidden ${className}`}>
      <span ref={text} className="inline-block max-w-full whitespace-nowrap break-words align-bottom leading-tight">
        {children}
      </span>
    </div>
  );
}
