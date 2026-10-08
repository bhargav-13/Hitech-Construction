/**
 * Dropdown lists and date pickers render their pop-up at the document root (a portal), outside
 * whatever popover they sit in, and mark it with `data-floating-panel`. A popover's "click outside
 * closes me" check must treat a click there as inside — otherwise choosing an option in a Select
 * inside the Filter popover closed the popover and the choice was lost.
 */
export function isInFloatingPanel(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("[data-floating-panel]") != null;
}
