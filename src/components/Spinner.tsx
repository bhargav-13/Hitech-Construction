/** The order bricks land in, row by row from the bottom — the delay of each, in seconds. */
const BRICK_DELAYS = [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1.05, 1.2];

/**
 * The loader's styles, shipped with the component rather than globals.css so it is self-contained.
 * React hoists a `<style>` with `href` + `precedence` into the head once, however many loaders
 * are on screen.
 *
 * Nine bricks drop in one by one and build a wall, bottom row first; then the wall clears and
 * starts again. The grid is turned over so the first bricks land at the bottom.
 */
const BRICK_CSS = `
.ht-bricks{display:inline-grid;grid-template-columns:repeat(3,1fr);transform:rotate(180deg);flex-shrink:0;vertical-align:middle}
.ht-bricks>i{display:block;background:currentColor;opacity:0;animation:ht-brick 2.4s ease-out infinite}
@keyframes ht-brick{0%{opacity:0;transform:translateY(-140%)}8%,70%{opacity:1;transform:none}85%,100%{opacity:0;transform:none}}
@keyframes ht-brick-calm{0%,100%{opacity:.35}50%{opacity:1}}
@media (prefers-reduced-motion:reduce){.ht-bricks>i{animation:ht-brick-calm 3s ease-in-out infinite}}
`;

/**
 * The app's loader: a small wall built brick by brick.
 *
 * Same props as the old spinning ring, so every existing `<Spinner size className>` keeps working.
 * `size` is the wall's width; the bricks take `currentColor`, so `className="text-white"` inside a
 * button or `text-brand-accent` on a page colour it.
 */
export function Spinner({ size = 20, className = "" }: { size?: number; className?: string }) {
  const gap = Math.max(1, Math.round(size / 14));
  const brickW = Math.max(2, (size - gap * 2) / 3);
  const brickH = Math.max(1.5, brickW * 0.55);
  const radius = Math.max(0.5, brickW * 0.12);
  return (
    <>
      <style href="ht-bricks" precedence="default">
        {BRICK_CSS}
      </style>
      <span
        role="status"
        aria-label="Loading"
        className={`ht-bricks ${className}`}
        style={{ width: size, gap, height: brickH * 3 + gap * 2 }}
      >
        {BRICK_DELAYS.map((d) => (
          <i key={d} style={{ height: brickH, borderRadius: radius, animationDelay: `${d}s` }} />
        ))}
      </span>
    </>
  );
}

/** Full-height centered loader, used while a page is deciding whether the user is signed in. */
export function PageLoader({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex h-screen w-full flex-col items-center justify-center gap-4 bg-background">
      <Spinner size={56} className="text-brand-accent" />
      <span className="text-sm font-medium text-gray-500">{label}</span>
    </div>
  );
}
