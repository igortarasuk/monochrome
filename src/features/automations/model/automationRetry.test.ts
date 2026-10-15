import { beforeEach, expect, it, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));

import {
  claimDueAutomationRetries,
  retryRunNote,
  withRetryCount,
} from "./automationRetry";
import { formatAutomationRunAt, type AutomationRun } from "./automations";

const run = (patch: Partial<AutomationRun>): AutomationRun => ({
  id: "run-id",
  automationId: "automation-id",
  trigger: "scheduled",
  scheduledFor: 1,
  createdAt: 1,
  status: "pending",
  ...patch,
});

beforeEach(() => {
  invoke.mockReset();
  vi.stubGlobal("window", { dispatchEvent: vi.fn() });
});

it("keeps the chosen delay while the retry count changes", () => {
  expect(withRetryCount(null, 0)).toBeNull();
  expect(withRetryCount(null, 2)).toEqual({ maxRetries: 2, delayMinutes: 5 });
  expect(withRetryCount({ maxRetries: 2, delayMinutes: 15 }, 3)).toEqual({
    maxRetries: 3,
    delayMinutes: 15,
  });
  expect(withRetryCount({ maxRetries: 2, delayMinutes: 15 }, 0)).toBeNull();
});

it("labels a retry and the time it waits for", () => {
  const at = new Date(2026, 9, 12, 14, 5).getTime();
  expect(retryRunNote(run({}))).toBe("");
  expect(
    retryRunNote(
      run({ retry: { number: 1, rootRunId: "root", notBefore: at } }),
    ),
  ).toBe(`Retry 1, waits until ${formatAutomationRunAt(at)}`);
  expect(
    retryRunNote(
      run({ status: "failed", retry: { number: 2, rootRunId: "root" } }),
    ),
  ).toBe("Retry 2");
});

it("claims due retries and yields nothing when the claim fails", async () => {
  const due = [{ automation: { id: "automation-id" }, run: run({}) }];
  invoke.mockResolvedValueOnce(due);
  await expect(claimDueAutomationRetries(42)).resolves.toEqual(due);
  expect(invoke).toHaveBeenCalledWith("automation_retries_claim_due", {
    now: 42,
  });

  invoke.mockRejectedValueOnce(new Error("locked"));
  await expect(claimDueAutomationRetries(43)).resolves.toEqual([]);
});
