// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  REDUCE_EFFECTS_CHANGE_EVENT,
  REDUCE_EFFECTS_DEFAULT,
  applyReduceEffects,
  effectsReduced,
  loadReduceEffects,
  saveReduceEffects,
  subscribeReduceEffects,
} from "./reduceEffects";
import { IS_LINUX } from "../../../platform/tauri/platform";

const KEY = "monocode.reduceEffects";

function matchMedia(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches })) as unknown as typeof window.matchMedia,
  );
}

describe("reduce effects", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("reduce-effects");
    matchMedia(false);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults on for Linux only", () => {
    expect(REDUCE_EFFECTS_DEFAULT).toBe(IS_LINUX);
    expect(loadReduceEffects()).toBe(IS_LINUX);
  });

  it("stores the choice and tells listeners", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeReduceEffects(listener);
    saveReduceEffects(true);
    expect(localStorage.getItem(KEY)).toBe("1");
    expect(loadReduceEffects()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    window.dispatchEvent(new Event(REDUCE_EFFECTS_CHANGE_EVENT));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("marks the document so the stylesheet can switch", () => {
    applyReduceEffects(true);
    expect(document.documentElement.classList.contains("reduce-effects")).toBe(
      true,
    );
    applyReduceEffects(false);
    expect(document.documentElement.classList.contains("reduce-effects")).toBe(
      false,
    );
  });

  it("reduces for the setting or the OS preference", () => {
    saveReduceEffects(false);
    expect(effectsReduced()).toBe(false);
    matchMedia(true);
    expect(effectsReduced()).toBe(true);
    matchMedia(false);
    saveReduceEffects(true);
    expect(effectsReduced()).toBe(true);
  });
});
