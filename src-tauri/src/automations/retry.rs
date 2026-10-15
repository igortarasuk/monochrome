//! Retries for failed automation runs: a failed run is followed by a new
//! pending run that waits out an exponentially growing delay.

use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

use super::{
    apply_run_summary, get, trim_history, write_automation, write_run, Automation, AutomationRun,
    DueAutomationRun, CHANGED,
};
use crate::session_store::SessionStore;

const MAX_RETRIES: i64 = 5;
const MAX_DELAY_MINUTES: i64 = 720;

/// Opt-in per automation; absent means a failed run stays failed.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RetryPolicy {
    max_retries: i64,
    /// Wait before the first retry; every later wait doubles.
    delay_minutes: i64,
}

/// Present on a run that retries an earlier one.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunRetry {
    /// 1 for the first retry.
    number: i64,
    /// The run that failed first; every retry in the chain points at it.
    root_run_id: String,
    /// Set while the retry waits out its delay; cleared once it is claimed.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    not_before: Option<i64>,
}

pub(super) fn validate(policy: Option<&RetryPolicy>) -> Result<(), String> {
    let Some(policy) = policy else {
        return Ok(());
    };
    if !(0..=MAX_RETRIES).contains(&policy.max_retries)
        || !(1..=MAX_DELAY_MINUTES).contains(&policy.delay_minutes)
    {
        return Err("Invalid automation retry settings.".into());
    }
    Ok(())
}

/// A policy that never retries is stored as no policy.
pub(super) fn normalize(policy: Option<RetryPolicy>) -> Option<RetryPolicy> {
    policy.filter(|policy| policy.max_retries > 0)
}

/// True while a retry still waits out its delay. Restart recovery leaves such
/// a run alone; `automation_retries_claim_due` launches it when it is due.
pub(super) fn waiting(run: &AutomationRun) -> bool {
    run.status == "pending"
        && run
            .retry
            .as_ref()
            .is_some_and(|retry| retry.not_before.is_some())
}

fn delay_ms(policy: &RetryPolicy, number: i64) -> i64 {
    let doublings = (number - 1).clamp(0, 16) as u32;
    policy
        .delay_minutes
        .saturating_mul(1_i64 << doublings)
        .min(MAX_DELAY_MINUTES)
        .saturating_mul(60_000)
}

/// Queues the retry that follows `failed`, if its automation allows one more.
/// A test run is never retried: the person who started it is watching.
pub(super) fn schedule(
    conn: &Connection,
    automation: &Automation,
    failed: &AutomationRun,
    now: i64,
) -> Result<Option<AutomationRun>, String> {
    let Some(policy) = automation.retry.as_ref() else {
        return Ok(None);
    };
    if failed.status != "failed" || failed.trigger == "manual" || !automation.enabled {
        return Ok(None);
    }
    let number = failed.retry.as_ref().map_or(0, |retry| retry.number) + 1;
    if number > policy.max_retries {
        return Ok(None);
    }
    let root_run_id = failed
        .retry
        .as_ref()
        .map_or_else(|| failed.id.clone(), |retry| retry.root_run_id.clone());
    let run = AutomationRun {
        id: Uuid::new_v4().to_string(),
        created_at: now,
        started_at: None,
        completed_at: None,
        status: "pending".into(),
        session_id: None,
        error: None,
        retry: Some(RunRetry {
            number,
            root_run_id,
            not_before: Some(now.saturating_add(delay_ms(policy, number))),
        }),
        ..failed.clone()
    };
    write_run(conn, &run)?;
    Ok(Some(run))
}

/// Hands out the retries whose delay has passed. A claimed retry loses its
/// `not_before`, so a second pass, or a restart, cannot launch it twice.
fn claim_due(conn: &Connection, now: i64) -> Result<(Vec<DueAutomationRun>, bool), String> {
    let mut statement = conn
        .prepare(
            "SELECT run_json FROM automation_runs WHERE run_json LIKE '%\"notBefore\"%'
             ORDER BY created_at, id",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|error| error.to_string())?;
    let mut runs = Vec::new();
    for row in rows {
        let raw = row.map_err(|error| error.to_string())?;
        // A prompt may contain the marker too; only a waiting retry counts.
        if let Ok(run) = serde_json::from_str::<AutomationRun>(&raw) {
            if waiting(&run) {
                runs.push(run);
            }
        }
    }
    drop(statement);

    let mut due = Vec::new();
    let mut changed = false;
    for mut run in runs {
        let Some(not_before) = run.retry.as_ref().and_then(|retry| retry.not_before) else {
            continue;
        };
        if not_before > now {
            continue;
        }
        let Some(mut automation) = get(conn, &run.automation_id)? else {
            continue;
        };
        if let Some(retry) = run.retry.as_mut() {
            retry.not_before = None;
        }
        changed = true;
        let grace_ms = automation.missed_run_grace_minutes.saturating_mul(60_000);
        let dropped = if !automation.enabled {
            Some((
                "cancelled",
                "The automation was turned off before the retry.",
            ))
        } else if now.saturating_sub(not_before) > grace_ms {
            Some(("skipped", "Missed the retry beyond its grace period."))
        } else {
            None
        };
        if let Some((status, error)) = dropped {
            run.status = status.into();
            run.completed_at = Some(now);
            run.error = Some(error.into());
            apply_run_summary(&mut automation, &run);
            write_run(conn, &run)?;
            write_automation(conn, &automation)?;
            trim_history(conn, &run.automation_id)?;
            continue;
        }
        write_run(conn, &run)?;
        due.push(DueAutomationRun { automation, run });
    }
    Ok((due, changed))
}

#[tauri::command(async)]
pub fn automation_retries_claim_due(
    app: AppHandle,
    store: State<'_, SessionStore>,
    now: i64,
) -> Result<Vec<DueAutomationRun>, String> {
    let mut conn = store.lock_conn()?;
    let tx = conn.transaction().map_err(|error| error.to_string())?;
    let (due, changed) = claim_due(&tx, now)?;
    tx.commit().map_err(|error| error.to_string())?;
    drop(conn);
    if changed {
        let _ = app.emit(CHANGED, ());
    }
    Ok(due)
}

#[cfg(test)]
mod tests {
    use super::super::ensure_tables;
    use super::*;

    const MINUTE: i64 = 60_000;

    fn store(retry: serde_json::Value, enabled: bool) -> (Connection, Automation) {
        let conn = Connection::open_in_memory().unwrap();
        ensure_tables(&conn).unwrap();
        let automation: Automation = serde_json::from_value(serde_json::json!({
            "id": "automation-id", "name": "A", "prompt": "p", "harness": "codex",
            "model": "m", "cwd": "/tmp", "workspaceMode": "current", "reuseSession": false,
            "runtimeMode": "auto", "scheduleKind": "daily", "minute": 0, "time": "09:00",
            "dayOfWeek": 1, "triggers": [], "missedRunGraceMinutes": 60, "enabled": enabled,
            "nextRunAt": 1, "createdAt": 1, "updatedAt": 1, "retry": retry
        }))
        .unwrap();
        write_automation(&conn, &automation).unwrap();
        (conn, automation)
    }

    fn failed_run(conn: &Connection, trigger: &str) -> AutomationRun {
        let mut run = super::super::new_run("automation-id", trigger, 1_000, 1_000, "Do the work");
        run.status = "failed".into();
        run.error = Some("boom".into());
        run.session_id = Some("session-id".into());
        write_run(conn, &run).unwrap();
        run
    }

    fn policy() -> serde_json::Value {
        serde_json::json!({ "maxRetries": 2, "delayMinutes": 5 })
    }

    #[test]
    fn a_stored_automation_without_a_policy_never_retries() {
        let (conn, automation) = store(serde_json::Value::Null, true);
        assert!(automation.retry.is_none());
        assert!(serde_json::to_value(&automation)
            .unwrap()
            .get("retry")
            .is_none());
        let failed = failed_run(&conn, "scheduled");
        assert!(schedule(&conn, &automation, &failed, 2_000)
            .unwrap()
            .is_none());
    }

    #[test]
    fn retries_double_their_wait_until_the_limit() {
        let (conn, automation) = store(policy(), true);
        let failed = failed_run(&conn, "scheduled");

        let first = schedule(&conn, &automation, &failed, 10_000)
            .unwrap()
            .unwrap();
        let retry = first.retry.clone().unwrap();
        assert_eq!(retry.number, 1);
        assert_eq!(retry.root_run_id, failed.id);
        assert_eq!(retry.not_before, Some(10_000 + 5 * MINUTE));
        assert_eq!(first.status, "pending");
        assert_eq!(first.prompt.as_deref(), Some("Do the work"));
        assert!(first.error.is_none() && first.session_id.is_none());
        assert!(waiting(&first));

        let mut first_failed = first.clone();
        first_failed.status = "failed".into();
        let second = schedule(&conn, &automation, &first_failed, 20_000)
            .unwrap()
            .unwrap();
        let retry = second.retry.clone().unwrap();
        assert_eq!(retry.number, 2);
        assert_eq!(retry.root_run_id, failed.id);
        assert_eq!(retry.not_before, Some(20_000 + 10 * MINUTE));

        let mut second_failed = second;
        second_failed.status = "failed".into();
        assert!(schedule(&conn, &automation, &second_failed, 30_000)
            .unwrap()
            .is_none());
    }

    #[test]
    fn only_failed_runs_of_an_enabled_automation_retry() {
        let (conn, automation) = store(policy(), true);
        let manual = failed_run(&conn, "manual");
        assert!(schedule(&conn, &automation, &manual, 2_000)
            .unwrap()
            .is_none());
        let mut cancelled = failed_run(&conn, "scheduled");
        cancelled.status = "cancelled".into();
        assert!(schedule(&conn, &automation, &cancelled, 2_000)
            .unwrap()
            .is_none());

        let (conn, disabled) = store(policy(), false);
        let failed = failed_run(&conn, "event");
        assert!(schedule(&conn, &disabled, &failed, 2_000)
            .unwrap()
            .is_none());
    }

    #[test]
    fn the_wait_is_capped() {
        let policy = RetryPolicy {
            max_retries: 5,
            delay_minutes: 600,
        };
        assert_eq!(delay_ms(&policy, 1), 600 * MINUTE);
        assert_eq!(delay_ms(&policy, 2), MAX_DELAY_MINUTES * MINUTE);
        assert_eq!(delay_ms(&policy, 5), MAX_DELAY_MINUTES * MINUTE);
    }

    #[test]
    fn a_retry_is_claimed_once_when_due() {
        let (conn, automation) = store(policy(), true);
        let failed = failed_run(&conn, "scheduled");
        let retry = schedule(&conn, &automation, &failed, 10_000)
            .unwrap()
            .unwrap();
        let due_at = retry.retry.as_ref().unwrap().not_before.unwrap();

        let (early, changed) = claim_due(&conn, due_at - 1).unwrap();
        assert!(early.is_empty() && !changed);

        let (due, changed) = claim_due(&conn, due_at).unwrap();
        assert!(changed);
        assert_eq!(due.len(), 1);
        assert_eq!(due[0].run.id, retry.id);
        assert_eq!(due[0].run.status, "pending");
        assert!(!waiting(&due[0].run));
        assert_eq!(due[0].run.retry.as_ref().unwrap().number, 1);

        let (again, changed) = claim_due(&conn, due_at + MINUTE).unwrap();
        assert!(again.is_empty() && !changed);
    }

    #[test]
    fn a_retry_missed_beyond_the_grace_period_is_skipped() {
        let (conn, automation) = store(policy(), true);
        let failed = failed_run(&conn, "scheduled");
        let retry = schedule(&conn, &automation, &failed, 10_000)
            .unwrap()
            .unwrap();
        let due_at = retry.retry.as_ref().unwrap().not_before.unwrap();

        let (due, changed) = claim_due(&conn, due_at + 61 * MINUTE).unwrap();
        assert!(due.is_empty() && changed);
        let runs = super::super::list_runs(&conn, "automation-id").unwrap();
        let stored = runs.iter().find(|run| run.id == retry.id).unwrap();
        assert_eq!(stored.status, "skipped");
        assert!(stored.completed_at.is_some());
    }

    #[test]
    fn a_retry_of_a_disabled_automation_is_cancelled() {
        let (conn, mut automation) = store(policy(), true);
        let failed = failed_run(&conn, "scheduled");
        let retry = schedule(&conn, &automation, &failed, 10_000)
            .unwrap()
            .unwrap();
        automation.enabled = false;
        write_automation(&conn, &automation).unwrap();

        let (due, _) = claim_due(&conn, i64::MAX / 2).unwrap();
        assert!(due.is_empty());
        let runs = super::super::list_runs(&conn, "automation-id").unwrap();
        let stored = runs.iter().find(|run| run.id == retry.id).unwrap();
        assert_eq!(stored.status, "cancelled");
        assert_eq!(
            get(&conn, "automation-id")
                .unwrap()
                .unwrap()
                .last_run_status
                .as_deref(),
            Some("cancelled")
        );
    }

    #[test]
    fn validates_the_policy() {
        let policy = |max_retries, delay_minutes| RetryPolicy {
            max_retries,
            delay_minutes,
        };
        assert!(validate(None).is_ok());
        assert!(validate(Some(&policy(3, 5))).is_ok());
        assert!(validate(Some(&policy(6, 5))).is_err());
        assert!(validate(Some(&policy(1, 0))).is_err());
        assert!(normalize(Some(policy(0, 5))).is_none());
        assert_eq!(normalize(Some(policy(1, 5))), Some(policy(1, 5)));
    }
}
