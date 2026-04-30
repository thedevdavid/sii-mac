//! Streaming progress events for long-running commands.
//!
//! Slow commands (clone, backup/restore, workshop scan) take a
//! `tauri::ipc::Channel<ProgressEvent>` argument so the frontend can render a
//! progress overlay and cancel mid-operation. The channel is one-way
//! (Rust→JS) and scoped to a single invocation.
//!
//! ## Throttling
//!
//! `Channel::send` serializes + crosses the IPC bridge on every call — on
//! large payloads that can block for tens of milliseconds. Producers use
//! [`ProgressEmitter`] which throttles emissions by elapsed time so the UI
//! never gets more than roughly one event per 50 ms.
//!
//! ## Cancellation
//!
//! Tauri 2 has no built-in cancellation. The pattern here is:
//!
//! 1. The frontend generates a `job_id` string before it issues the invoke.
//! 2. The Rust command registers the id in the [`CancelRegistry`] managed
//!    state and keeps a local `Arc<AtomicBool>` flag.
//! 3. The command checks [`CancelGuard::is_cancelled`] at every work-unit
//!    boundary (file copy loop iteration, mod scan iteration).
//! 4. If the user hits cancel, the frontend calls `cancel_job(job_id)` which
//!    flips the flag. The command's next check sees it and returns
//!    `AppError::Cancelled`.
//!
//! The registry is a `Mutex<HashMap<String, Arc<AtomicBool>>>` — a sync
//! `std::sync::Mutex` per the Tauri best practice because we never hold the
//! lock across an `.await`.

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::ipc::Channel;

use crate::error::AppError;

/// A single event sent over the progress channel. Serializes as a
/// discriminated union tagged by `event`, matching Zod's
/// `z.discriminatedUnion("event", …)` on the frontend.
#[derive(Debug, Clone, Serialize)]
#[serde(
    tag = "event",
    content = "data",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum ProgressEvent {
    /// Fired once when the command starts, carries the total unit count when
    /// known in advance (e.g. file count for a clone). `None` means
    /// indeterminate progress.
    Started { total: Option<u64>, label: String },
    /// Fired while work is in progress. Producers should throttle to roughly
    /// one event every 50 ms.
    Progress {
        current: u64,
        total: Option<u64>,
        label: String,
    },
    /// Fired exactly once on successful completion. The `message` is usually
    /// shown as a success toast.
    Completed { message: String },
    /// Fired if the command fails mid-operation.
    Failed { error: String },
    /// Fired when the user cancels via `cancel_job`.
    Cancelled,
}

/// Throttles `ProgressEvent::Progress` emissions to no more than one every
/// ~50 ms while always forwarding the terminal `Completed`/`Failed`/
/// `Cancelled` events.
///
/// Holds an optional [`CancelGuard`] flag so a failed `channel.send` (the
/// webview dropped the channel) can flip the cancellation flag and abort the
/// command at the next work-unit check. Without this, a backgrounded or
/// webview-killed command would keep running until it finished its entire
/// workload with nothing listening.
pub struct ProgressEmitter {
    channel: Channel<ProgressEvent>,
    last_sent: Instant,
    min_interval: Duration,
    /// Latest progress snapshot dropped by throttling. Flushed before any
    /// terminal event so the UI lands on the final `current / total`.
    pending: Option<(u64, Option<u64>, String)>,
    /// Cancellation flag flipped when `channel.send` fails — the webview is no
    /// longer listening, so the command should wind down at its next check.
    abort_on_send_failure: Option<Arc<AtomicBool>>,
}

impl ProgressEmitter {
    pub fn new(channel: Channel<ProgressEvent>) -> Self {
        Self {
            channel,
            // Start in the past so the first Progress event isn't throttled.
            last_sent: Instant::now() - Duration::from_secs(1),
            min_interval: Duration::from_millis(50),
            pending: None,
            abort_on_send_failure: None,
        }
    }

    /// Bind the emitter to a cancellation flag so a channel send failure (the
    /// webview dropped the receiver) flips the flag and unwinds the command
    /// at its next `CancelGuard::check()`.
    pub fn with_cancel_flag(mut self, flag: Arc<AtomicBool>) -> Self {
        self.abort_on_send_failure = Some(flag);
        self
    }

    fn try_send(&self, event: ProgressEvent) {
        if self.channel.send(event).is_err() {
            if let Some(flag) = &self.abort_on_send_failure {
                flag.store(true, Ordering::SeqCst);
            }
        }
    }

    /// Emit the initial `Started` event. Always sent (unthrottled).
    pub fn started(&mut self, label: impl Into<String>, total: Option<u64>) {
        self.try_send(ProgressEvent::Started {
            total,
            label: label.into(),
        });
        self.last_sent = Instant::now();
    }

    /// Emit a `Progress` event. Calls within `min_interval` of the previous
    /// emission are recorded as pending so the final frame before a terminal
    /// event still lands in the UI — the caller can invoke this every loop
    /// iteration without swamping the IPC bridge.
    pub fn progress(&mut self, current: u64, total: Option<u64>, label: impl Into<String>) {
        let label = label.into();
        if self.last_sent.elapsed() < self.min_interval {
            self.pending = Some((current, total, label));
            return;
        }
        self.try_send(ProgressEvent::Progress {
            current,
            total,
            label,
        });
        self.pending = None;
        self.last_sent = Instant::now();
    }

    /// Push any throttled-out progress event before firing a terminal event.
    fn flush_pending(&mut self) {
        if let Some((current, total, label)) = self.pending.take() {
            self.try_send(ProgressEvent::Progress {
                current,
                total,
                label,
            });
        }
    }

    /// Emit the terminal `Completed` event. Always sent, and flushes any
    /// pending throttled progress first so the UI lands on the final frame.
    pub fn completed(&mut self, message: impl Into<String>) {
        self.flush_pending();
        self.try_send(ProgressEvent::Completed {
            message: message.into(),
        });
    }

    /// Emit the terminal `Failed` event. Always sent (pending progress flushed).
    pub fn failed(&mut self, error: impl Into<String>) {
        self.flush_pending();
        self.try_send(ProgressEvent::Failed {
            error: error.into(),
        });
    }

    /// Emit the terminal `Cancelled` event. Always sent (pending progress flushed).
    pub fn cancelled(&mut self) {
        self.flush_pending();
        self.try_send(ProgressEvent::Cancelled);
    }
}

/// Managed state: maps a frontend-supplied `job_id` to the cancellation flag
/// that its command polls.
#[derive(Default)]
pub struct CancelRegistry {
    inner: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

impl CancelRegistry {
    /// Acquire the internal map, transparently recovering from a poisoned
    /// mutex. A panic from a previous command holder wouldn't have left the
    /// `HashMap<String, Arc<AtomicBool>>` in a broken state (both values are
    /// panic-safe), so `into_inner()` is always correct here. Panicking the
    /// whole app because an unrelated command panicked mid-lock would cost
    /// all in-flight work, which is strictly worse.
    fn lock(&self) -> std::sync::MutexGuard<'_, HashMap<String, Arc<AtomicBool>>> {
        match self.inner.lock() {
            Ok(guard) => guard,
            Err(poisoned) => {
                crate::warn_fallback!("cancel_registry: recovered from poisoned mutex");
                poisoned.into_inner()
            }
        }
    }

    /// Register a new job and return its cancellation flag. The caller should
    /// hold the returned `CancelGuard` for the lifetime of the command — when
    /// it drops, the registry entry is cleaned up. If the same `job_id` is
    /// ever registered twice, the first registration is orphaned so the
    /// second one can run — see the comment at the `insert` call.
    pub fn register(&self, job_id: String) -> CancelGuard<'_> {
        let flag = Arc::new(AtomicBool::new(false));
        {
            let mut map = self.lock();
            // A duplicate job_id means the frontend recycled a UUID (which
            // shouldn't happen with `crypto.randomUUID()`) or a stale hook
            // re-issued the same token. Flipping the old flag best-effort
            // so the still-running command winds down, then overwrite the
            // entry with the new flag.
            if let Some(existing) = map.insert(job_id.clone(), flag.clone()) {
                crate::warn_fallback!(
                    "cancel_registry: duplicate job_id `{job_id}` — flipping old cancel flag"
                );
                existing.store(true, Ordering::SeqCst);
            }
        }
        CancelGuard {
            registry: self,
            job_id,
            flag,
        }
    }

    /// Flip the cancellation flag for a registered job. Silently no-ops if
    /// the job already completed or never registered — the frontend treats
    /// cancel as fire-and-forget.
    pub fn cancel(&self, job_id: &str) {
        let map = self.lock();
        if let Some(flag) = map.get(job_id) {
            flag.store(true, Ordering::SeqCst);
        }
    }

    fn unregister(&self, job_id: &str) {
        let mut map = self.lock();
        map.remove(job_id);
    }
}

/// RAII handle returned by `CancelRegistry::register`. Drops clean up the
/// registry entry automatically.
pub struct CancelGuard<'a> {
    registry: &'a CancelRegistry,
    job_id: String,
    flag: Arc<AtomicBool>,
}

impl<'a> CancelGuard<'a> {
    fn is_cancelled(&self) -> bool {
        self.flag.load(Ordering::SeqCst)
    }

    /// Shortcut: return `Err(AppError::Cancelled)` if the user cancelled.
    /// Use this at work-unit boundaries inside long-running commands.
    pub fn check(&self) -> Result<(), AppError> {
        if self.is_cancelled() {
            Err(AppError::Cancelled)
        } else {
            Ok(())
        }
    }

    /// Expose the raw cancellation flag so a `ProgressEmitter` can flip it
    /// when the frontend drops the channel (see `with_cancel_flag`).
    pub fn flag(&self) -> Arc<AtomicBool> {
        Arc::clone(&self.flag)
    }
}

impl Drop for CancelGuard<'_> {
    fn drop(&mut self) {
        self.registry.unregister(&self.job_id);
    }
}

/// Tauri command: flip the cancellation flag for a running job.
///
/// The frontend calls this from the cancel button of the progress overlay.
/// Fire-and-forget — if the job already finished, this is a silent no-op
/// and the returned `true` just acknowledges receipt. The frontend doesn't
/// care whether the flag actually flipped anything, only that the cancel
/// request was delivered.
#[tauri::command]
pub fn cancel_job(state: tauri::State<'_, CancelRegistry>, job_id: String) -> bool {
    state.cancel(&job_id);
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cancelled_wire_shape() {
        // Serde's adjacently-tagged enum serializes a unit variant as
        // `{"event":"cancelled"}` without a `data` field. The TS
        // `ProgressEventSchema` discriminated union has a matching branch
        // `z.object({ event: z.literal("cancelled") })` with no `data`
        // property, so the round-trip is exact.
        let json = serde_json::to_string(&ProgressEvent::Cancelled).unwrap();
        assert_eq!(json, r#"{"event":"cancelled"}"#);
    }

    #[test]
    fn test_progress_wire_shape() {
        let json = serde_json::to_string(&ProgressEvent::Progress {
            current: 5,
            total: Some(10),
            label: "copying".into(),
        })
        .unwrap();
        assert!(json.contains(r#""event":"progress""#));
        assert!(json.contains(r#""current":5"#));
        assert!(json.contains(r#""label":"copying""#));
    }

    #[test]
    fn test_cancel_registry_recovers_from_poisoned_mutex() {
        use std::sync::Arc as SArc;
        use std::thread;

        let registry = SArc::new(CancelRegistry::default());

        // Poison the mutex by panicking inside the lock.
        let r = SArc::clone(&registry);
        let _ = thread::spawn(move || {
            let _guard = r.inner.lock().unwrap();
            panic!("intentional poisoning");
        })
        .join();

        // Registry should still be usable after poisoning.
        let guard = registry.register("job1".to_string());
        registry.cancel("job1");
        assert!(guard.is_cancelled(), "cancel flag should be set");
    }

    #[test]
    fn test_cancel_registry_duplicate_job_id_flips_old_flag() {
        let registry = CancelRegistry::default();
        let g1 = registry.register("dupe".to_string());
        assert!(!g1.is_cancelled());
        let g2 = registry.register("dupe".to_string());
        assert!(
            g1.is_cancelled(),
            "old guard should be flipped when id is reused"
        );
        assert!(!g2.is_cancelled(), "new guard should start fresh");
    }

    #[test]
    fn test_cancel_guard_drop_cleans_up_registry() {
        let registry = CancelRegistry::default();
        {
            let _guard = registry.register("ephemeral".to_string());
            let map = registry.inner.lock().unwrap();
            assert!(map.contains_key("ephemeral"));
        }
        let map = registry.inner.lock().unwrap();
        assert!(
            !map.contains_key("ephemeral"),
            "dropping the guard must remove the entry"
        );
    }
}
