import { IS_LINUX } from "../../../platform/tauri/platform";
import { readFlag, writeFlag } from "./storageFlags";

// "Reduce effects" is Monochrome's low-power mode: it adds `reduce-effects`
// to <html>, which styles/low-power.css turns into no backdrop blur, no
// idle animation loops and instant transitions, and the JS loops that cost
// the most (the empty-session arcade, the composer runner) stay unmounted.
// It defaults on for Linux, where WebKitGTK repaints every blurred layer on
// the CPU and the window is rarely throttled in the background.

const REDUCE_EFFECTS_KEY = "monocode.reduceEffects";

export const REDUCE_EFFECTS_DEFAULT = IS_LINUX;

/** Fired on `window` when the setting flips. */
export const REDUCE_EFFECTS_CHANGE_EVENT = "monocode:reduce-effects-change";

export function loadReduceEffects(): boolean {
  return readFlag(REDUCE_EFFECTS_KEY) ?? REDUCE_EFFECTS_DEFAULT;
}

export function saveReduceEffects(value: boolean) {
  writeFlag(REDUCE_EFFECTS_KEY, value);
  window.dispatchEvent(new Event(REDUCE_EFFECTS_CHANGE_EVENT));
}

export function applyReduceEffects(value: boolean) {
  document.documentElement.classList.toggle("reduce-effects", value);
  return value;
}

export function subscribeReduceEffects(listener: () => void) {
  window.addEventListener(REDUCE_EFFECTS_CHANGE_EVENT, listener);
  return () =>
    window.removeEventListener(REDUCE_EFFECTS_CHANGE_EVENT, listener);
}

/**
 * Whether decorative work should stay off: the setting, or the OS asking for
 * reduced motion. Continuous loops check this before they start.
 */
export function effectsReduced(): boolean {
  return (
    loadReduceEffects() ||
    !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}
