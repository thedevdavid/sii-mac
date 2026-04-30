import { useRef, useState } from "react";
import { Channel } from "@tauri-apps/api/core";
import {
  cancelJob,
  createProgressChannel,
  initialProgress,
  reduceProgress,
  type ProgressSnapshot,
  type ProgressStatus,
} from "@/lib/streaming";
import type { JobId } from "@/lib/core-types";

/**
 * State + control surface for a single streaming command invocation.
 *
 * The hook intentionally tracks one job at a time — consumers that need
 * concurrent streams should instantiate the hook once per stream.
 */
export interface ProgressStream {
  progress: ProgressSnapshot;
  /** Reset progress back to idle without canceling. */
  reset: () => void;
  /**
   * Start a new job: returns the jobId + Channel the caller passes to invoke.
   * Throws if a job is already in flight — the caller should await the prior
   * invocation first, or call `cancel()` and wait for the terminal event.
   */
  begin: () => { jobId: JobId; channel: Channel<unknown> };
  /** Request cancellation of the active job (no-op if idle or finished). */
  cancel: () => Promise<void>;
  /**
   * Read the current status without closing over the `progress` snapshot.
   * Use this inside async try/catch handlers where the captured `progress`
   * would be stale by the time the catch fires.
   */
  getStatus: () => ProgressStatus;
}

export function useProgressStream(): ProgressStream {
  const [progress, setProgress] = useState<ProgressSnapshot>(initialProgress);
  const activeJobIdRef = useRef<JobId | null>(null);
  const statusRef = useRef<ProgressStatus>("idle");

  function setAndRef(next: ProgressSnapshot) {
    statusRef.current = next.status;
    setProgress(next);
  }

  function reset() {
    activeJobIdRef.current = null;
    setAndRef(initialProgress);
  }

  function begin() {
    // Re-entrancy guard: a second begin() while a prior job is still
    // running would overwrite activeJobIdRef and orphan the old job from
    // cancel(). Callers should await the previous invocation (or cancel it)
    // before starting a new one.
    if (statusRef.current === "running") {
      throw new Error(
        "useProgressStream.begin() called while a job is still running",
      );
    }

    const { jobId, channel } = createProgressChannel((event) => {
      setProgress((prev) => {
        const next = reduceProgress(prev, event);
        statusRef.current = next.status;
        // On terminal events, release the activeJobIdRef so a late cancel()
        // doesn't flip a flag for a job that already finished (and whose
        // UUID may have been reclaimed by the registry).
        if (
          next.status === "completed" ||
          next.status === "failed" ||
          next.status === "cancelled"
        ) {
          activeJobIdRef.current = null;
        }
        return next;
      });
    });
    activeJobIdRef.current = jobId;
    setAndRef({
      status: "running",
      label: "",
      current: 0,
      total: null,
    });
    return { jobId, channel };
  }

  async function cancel() {
    const jobId = activeJobIdRef.current;
    if (!jobId) return;
    try {
      await cancelJob(jobId);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[progress] cancelJob failed", err);
    }
  }

  function getStatus() {
    return statusRef.current;
  }

  return { progress, reset, begin, cancel, getStatus };
}
