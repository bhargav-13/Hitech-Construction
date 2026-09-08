"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * "The user has started filling this in" — the signal behind the discard confirmation on drawers
 * and modals.
 *
 * <p>Native fields announce themselves: typing fires `input`, a checkbox or file picker fires
 * `change`, and a container can catch both by listening in the capture phase. The app's custom
 * controls don't — `Select` renders its list in a portal at the document root, so picking an option
 * never bubbles through the panel the field lives in, and `DatePicker` is the same. They call
 * {@link notifyFormTouched} with their own (in-panel) element instead, which raises a bubbling event
 * the panel does see.
 *
 * <p>This deliberately tracks *interaction*, not a value diff. A form that has been typed into and
 * then typed back to its original text still cost the user work, and asking before throwing that
 * away is the cheaper mistake — losing a half-filled tender to a stray click on the backdrop is the
 * complaint this exists to answer.
 */

export const FORM_TOUCHED_EVENT = "onsite:form-touched";

/** Raise the touched signal from a custom control, so its nearest panel can hear it. */
export function notifyFormTouched(el: HTMLElement | null | undefined) {
  el?.dispatchEvent(new CustomEvent(FORM_TOUCHED_EVENT, { bubbles: true }));
}

/**
 * Wire a panel element up to every touch signal inside it. Returns a teardown; read the flag
 * through the ref the caller owns.
 */
export function watchFormTouches(el: HTMLElement, onTouch: () => void): () => void {
  el.addEventListener("input", onTouch, true);
  el.addEventListener("change", onTouch, true);
  el.addEventListener(FORM_TOUCHED_EVENT, onTouch, true);
  return () => {
    el.removeEventListener("input", onTouch, true);
    el.removeEventListener("change", onTouch, true);
    el.removeEventListener(FORM_TOUCHED_EVENT, onTouch, true);
  };
}

/** The one wording used everywhere a half-filled form is about to be thrown away. */
export const DISCARD_PROMPT = "Current changes will be discarded. Do you wish to continue?";

/**
 * The whole guard in one call, for any panel that closes on a backdrop click.
 *
 * `Drawer` and `Modal` had this wired by hand and every hand-rolled overlay in the app did not — so
 * a half-filled payslip edit, material issue or link-payment dialog was still thrown away by a
 * mis-aimed click, which is the complaint this answers. Attach `panelRef` to the panel and call
 * `confirmDiscard()` before closing:
 *
 *     const { panelRef, confirmDiscard } = useDiscardGuard();
 *     <div className="fixed inset-0 …" onClick={() => confirmDiscard() && onClose()}>
 *       <div ref={panelRef} onClick={(e) => e.stopPropagation()}>…</div>
 *
 * Returns true when it is safe to close: nothing was touched, or the user said discard it.
 */
export function useDiscardGuard(enabled = true) {
  const panelRef = useRef<HTMLDivElement>(null);
  const touched = useRef(false);

  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    return watchFormTouches(el, () => {
      touched.current = true;
    });
  }, []);

  const confirmDiscard = useCallback(
    () => !(enabled && touched.current) || confirm(DISCARD_PROMPT),
    [enabled],
  );

  return { panelRef, confirmDiscard };
}
