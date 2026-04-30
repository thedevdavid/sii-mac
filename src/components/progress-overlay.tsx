import { useEffect, useRef } from "react";
import { IconLoader2, IconX, IconCheck, IconAlertTriangle } from "@tabler/icons-react";
import { Button } from "@/components/cupertino/button";
import { Progress } from "@/components/ui/progress";
import type { ProgressSnapshot } from "@/lib/streaming";

interface ProgressOverlayProps {
  progress: ProgressSnapshot;
  onCancel: () => void;
  onDismiss: () => void;
  /** Title shown in the overlay header. Defaults to the event label. */
  title?: string;
}

/**
 * Modal-style overlay rendered on top of the page content while a streaming
 * command is running. Shows:
 *   - a title + current-step label
 *   - a progress bar (indeterminate when `total` is null)
 *   - a Cancel button while running, Dismiss when finished
 *   - success/error/cancelled status icons
 *
 * Consumers pass the result of `useProgressStream()` plus the cancel handler.
 */
const HEADER_BY_STATUS: Record<
  Exclude<ProgressSnapshot["status"], "idle">,
  string
> = {
  running: "Working…",
  completed: "Done",
  failed: "Failed",
  cancelled: "Cancelled",
};

function bodyText(progress: ProgressSnapshot): string {
  switch (progress.status) {
    case "idle":
      return "";
    case "running":
      return progress.label || "Working…";
    case "completed":
      return progress.message;
    case "failed":
      return progress.error;
    case "cancelled":
      return "Operation cancelled.";
  }
}

export function ProgressOverlay({
  progress,
  onCancel,
  onDismiss,
  title,
}: ProgressOverlayProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const actionButtonRef = useRef<HTMLButtonElement | null>(null);
  const isVisible = progress.status !== "idle";
  const isRunning = progress.status === "running";

  // Focus the primary action when the overlay appears, and trap Tab within
  // the dialog so keyboard users can't accidentally interact with content
  // behind the backdrop.
  useEffect(() => {
    if (!isVisible) return;
    actionButtonRef.current?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        if (isRunning) onCancel();
        else onDismiss();
        return;
      }
      if (e.key === "Tab") {
        const root = dialogRef.current;
        if (!root) return;
        const focusable = root.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isVisible, isRunning, onCancel, onDismiss]);

  if (!isVisible) return null;

  const percent =
    isRunning && progress.total != null && progress.total > 0
      ? Math.min(100, Math.round((progress.current / progress.total) * 100))
      : null;

  const heading = title ?? HEADER_BY_STATUS[progress.status];

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="progress-overlay-title"
      aria-describedby="progress-overlay-description"
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-xl border bg-background p-5 shadow-lg">
        <div className="mb-3 flex items-center gap-2">
          <StatusIcon status={progress.status} />
          <h2 id="progress-overlay-title" className="text-sm font-semibold">
            {heading}
          </h2>
        </div>

        <p
          id="progress-overlay-description"
          className="mb-3 min-h-[1.25rem] text-xs text-muted-foreground"
        >
          {bodyText(progress)}
        </p>

        {isRunning && (
          <div className="mb-4 space-y-1.5">
            <Progress value={percent} />
            {progress.total != null && (
              <div className="text-right text-[10px] text-muted-foreground">
                {progress.current} / {progress.total}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2">
          {isRunning ? (
            <Button
              ref={actionButtonRef}
              variant="outline"
              size="sm"
              onClick={onCancel}
            >
              Cancel
            </Button>
          ) : (
            <Button
              ref={actionButtonRef}
              variant="outline"
              size="sm"
              onClick={onDismiss}
            >
              Close
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: ProgressSnapshot["status"] }) {
  switch (status) {
    case "running":
      return <IconLoader2 className="size-4 animate-spin text-primary" />;
    case "completed":
      return <IconCheck className="size-4 text-green-500" />;
    case "failed":
      return <IconAlertTriangle className="size-4 text-destructive" />;
    case "cancelled":
      return <IconX className="size-4 text-muted-foreground" />;
    default:
      return null;
  }
}
