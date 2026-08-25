"use client";

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
