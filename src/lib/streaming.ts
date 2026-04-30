import { Channel, invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import { JobIdSchema, type JobId } from "@/lib/core-types";

/**
 * Wire shape of `ProgressEvent` from `src-tauri/src/progress.rs`.
 *
 * The Rust enum serializes with `#[serde(tag = "event", content = "data")]`,
 * which maps directly to a Zod discriminated union keyed by the `event` field.
 */
export const ProgressEventSchema = z.discriminatedUnion("event", [
  z.object({
    event: z.literal("started"),
    data: z.object({
      total: z.number().nullable(),
      label: z.string(),
    }),
  }),
  z.object({
    event: z.literal("progress"),
    data: z.object({
      current: z.number(),
      total: z.number().nullable(),
      label: z.string(),
    }),
  }),
  z.object({
    event: z.literal("completed"),
    data: z.object({
      message: z.string(),
    }),
  }),
  z.object({
    event: z.literal("failed"),
    data: z.object({
      error: z.string(),
    }),
  }),
  z.object({ event: z.literal("cancelled") }),
]);
export type ProgressEvent = z.infer<typeof ProgressEventSchema>;

export type ProgressStatus =
  | "idle"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

/**
 * Tagged union: each variant carries exactly the fields that exist in that
 * state. Consumers narrow on `status` and can't read `message` on a `running`
 * snapshot or `current` on a `completed` one.
 */
export type ProgressSnapshot =
  | { status: "idle" }
  | {
      status: "running";
      label: string;
      current: number;
      total: number | null;
    }
  | {
      status: "completed";
      label: string;
      current: number;
      total: number | null;
      message: string;
    }
  | {
      status: "failed";
      label: string;
      current: number;
      total: number | null;
      error: string;
    }
  | { status: "cancelled"; label: string; current: number; total: number | null };

export const initialProgress: ProgressSnapshot = { status: "idle" };

function runningBase(prev: ProgressSnapshot): {
  label: string;
  current: number;
  total: number | null;
} {
  if (prev.status === "idle") {
    return { label: "", current: 0, total: null };
  }
  return { label: prev.label, current: prev.current, total: prev.total };
}

/**
 * Apply an incoming `ProgressEvent` to a `ProgressSnapshot` reducer-style.
 * Callers use this to fold channel events into a React state value.
 */
export function reduceProgress(
  prev: ProgressSnapshot,
  event: ProgressEvent,
): ProgressSnapshot {
  switch (event.event) {
    case "started":
      return {
        status: "running",
        label: event.data.label,
        current: 0,
        total: event.data.total,
      };
    case "progress":
      return {
        status: "running",
        label: event.data.label,
        current: event.data.current,
        total: event.data.total,
      };
    case "completed": {
      const base = runningBase(prev);
      return {
        status: "completed",
        label: base.label,
        current: base.current,
        total: base.total,
        message: event.data.message,
      };
    }
    case "failed": {
      const base = runningBase(prev);
      return {
        status: "failed",
        label: base.label,
        current: base.current,
        total: base.total,
        error: event.data.error,
      };
    }
    case "cancelled": {
      const base = runningBase(prev);
      return {
        status: "cancelled",
        label: base.label,
        current: base.current,
        total: base.total,
      };
    }
  }
}

/**
 * Create a fresh Tauri `Channel<ProgressEvent>` + generate a unique `jobId`
 * that the caller passes to the streaming command. Emits parsed events via
 * the `onEvent` callback; invalid shapes are logged and dropped (schema
 * drift between Rust and TS shouldn't crash the UI).
 *
 * Runs in a Tauri webview on a desktop app — `crypto.randomUUID` is always
 * present, so no runtime fallback.
 */
export function createProgressChannel(
  onEvent: (event: ProgressEvent) => void,
): { jobId: JobId; channel: Channel<unknown> } {
  const jobId = JobIdSchema.parse(crypto.randomUUID());

  const channel = new Channel<unknown>();
  channel.onmessage = (raw) => {
    const parsed = ProgressEventSchema.safeParse(raw);
    if (!parsed.success) {
      // eslint-disable-next-line no-console
      console.error("[progress] unrecognized ProgressEvent shape", {
        issues: parsed.error.issues,
        raw,
      });
      return;
    }
    onEvent(parsed.data);
  };

  return { jobId, channel };
}

/**
 * Invoke the backend's `cancel_job` command to flip the cancellation flag
 * for an in-flight streaming command. Safe to call after the job completed —
 * returns `false` in that case but never throws for unrelated reasons.
 */
export async function cancelJob(jobId: JobId): Promise<boolean> {
  const raw = await invoke("cancel_job", { jobId });
  return z.boolean().parse(raw);
}
