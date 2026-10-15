import { useState, type ReactNode } from "react";
import { SearchableSelect } from "../../../shared/ui/SearchableSelect";
import {
  DEFAULT_RETRY_DELAY_MINUTES,
  RETRY_COUNT_OPTIONS,
  RETRY_DELAY_OPTIONS,
  withRetryCount,
  type AutomationRetry,
} from "../model/automationRetry";

/**
 * "Retry failed runs" for an automation. Off by default: a retry sends the
 * whole prompt again, which only suits work that is safe to repeat.
 */
export function AutomationRetrySection({
  retry,
  onChange,
}: {
  retry: AutomationRetry | null | undefined;
  onChange: (retry: AutomationRetry | null) => void;
}) {
  const [open, setOpen] = useState(Boolean(retry));
  return (
    <details
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className="rounded-md border border-content/10"
    >
      <summary className="cursor-pointer select-none px-3 py-2 text-[12px] font-medium text-content/70">
        Retry failed runs{retry ? " · on" : ""}
      </summary>
      <div className="divide-y divide-content/7 border-t border-content/7">
        <Row
          label="Retries"
          hint="A failed scheduled or event run starts again with the same prompt"
        >
          <SearchableSelect
            variant="pill"
            searchable={false}
            align="end"
            label="Retries"
            value={String(retry?.maxRetries ?? 0)}
            options={RETRY_COUNT_OPTIONS}
            onChange={(value) => onChange(withRetryCount(retry, Number(value)))}
          />
        </Row>
        <Row
          label="First retry after"
          hint="Each later retry waits twice as long"
        >
          <SearchableSelect
            variant="pill"
            searchable={false}
            align="end"
            label="First retry after"
            disabled={!retry}
            value={String(retry?.delayMinutes ?? DEFAULT_RETRY_DELAY_MINUTES)}
            options={RETRY_DELAY_OPTIONS}
            onChange={(value) =>
              retry && onChange({ ...retry, delayMinutes: Number(value) })
            }
          />
        </Row>
      </div>
    </details>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2.5">
      <span className="min-w-0">
        <span className="block text-[12px] text-content/75">{label}</span>
        <span className="mt-0.5 block text-[11px] leading-snug text-content/40">
          {hint}
        </span>
      </span>
      <span className="shrink-0">{children}</span>
    </div>
  );
}
