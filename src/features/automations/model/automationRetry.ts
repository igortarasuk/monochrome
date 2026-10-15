import { invoke } from "@tauri-apps/api/core";
import {
  formatAutomationRunAt,
  notifyAutomationsChanged,
  type AutomationRun,
  type DueAutomationRun,
} from "./automations";

/** Opt-in per automation; without it a failed run stays failed. */
export type AutomationRetry = {
  maxRetries: number;
  /** Wait before the first retry, in minutes; every later wait doubles. */
  delayMinutes: number;
};

/** Present on a run that retries an earlier one. */
export type AutomationRunRetry = {
  /** 1 for the first retry. */
  number: number;
  rootRunId: string;
  /** Set while the retry waits out its delay. */
  notBefore?: number;
};

export const RETRY_COUNT_OPTIONS = [
  { value: "0", label: "Do not retry" },
  { value: "1", label: "Once" },
  { value: "2", label: "Twice" },
  { value: "3", label: "3 times" },
  { value: "5", label: "5 times" },
] as const;

export const RETRY_DELAY_OPTIONS = [
  { value: "1", label: "1 minute" },
  { value: "5", label: "5 minutes" },
  { value: "15", label: "15 minutes" },
  { value: "60", label: "1 hour" },
] as const;

export const DEFAULT_RETRY_DELAY_MINUTES = 5;

/** The policy for a chosen retry count; none when retries are off. */
export function withRetryCount(
  retry: AutomationRetry | null | undefined,
  maxRetries: number,
): AutomationRetry | null {
  if (maxRetries <= 0) return null;
  return {
    maxRetries,
    delayMinutes: retry?.delayMinutes ?? DEFAULT_RETRY_DELAY_MINUTES,
  };
}

/** What sets a retry apart in the run history; empty for a first attempt. */
export function retryRunNote(run: AutomationRun): string {
  const retry = run.retry;
  if (!retry) return "";
  const note = `Retry ${retry.number}`;
  return run.status === "pending" && retry.notBefore
    ? `${note}, waits until ${formatAutomationRunAt(retry.notBefore)}`
    : note;
}

/**
 * Retries whose delay has passed, ready to launch. A failure here must not
 * cost the scheduled runs claimed in the same pass, so it yields nothing and
 * the retries stay due for the next one.
 */
export async function claimDueAutomationRetries(
  now = Date.now(),
): Promise<DueAutomationRun[]> {
  try {
    const due = await invoke<DueAutomationRun[]>(
      "automation_retries_claim_due",
      { now },
    );
    if (due.length > 0) notifyAutomationsChanged();
    return due;
  } catch {
    return [];
  }
}
