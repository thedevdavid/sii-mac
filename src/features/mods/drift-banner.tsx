import { Button } from "@/components/cupertino/button";
import { IconAlertTriangle } from "@tabler/icons-react";
import type { DriftReport } from "./types";
import { playsetActionHelp } from "./playset-actions-help";

interface DriftBannerProps {
  drift: DriftReport;
  onRevert: () => void;
  onAcceptChanges: () => void;
  isBusy?: boolean;
}

export function DriftBanner({
  drift,
  onRevert,
  onAcceptChanges,
  isBusy,
}: DriftBannerProps) {
  const parts: string[] = [];
  if (drift.missing_in_profile.length > 0) {
    parts.push(`${drift.missing_in_profile.length} removed`);
  }
  if (drift.extra_in_profile.length > 0) {
    parts.push(`${drift.extra_in_profile.length} added`);
  }
  if (drift.order_changed) parts.push("load order changed");
  if (drift.snapshot_drift) parts.push("playset edited since apply");
  const summary = parts.length > 0 ? parts.join(" · ") : "out of sync";

  return (
    <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/5 p-2 text-[11px]">
      <IconAlertTriangle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
      <div className="min-w-0 flex-1">
        <div className="font-medium text-destructive">Profile modified</div>
        <div className="text-muted-foreground">
          The profile differs from this playset: {summary}.
        </div>
      </div>
      <div className="flex shrink-0 gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="text-[11px]"
          onClick={onRevert}
          disabled={isBusy}
          title={playsetActionHelp.revertDrift}
        >
          Revert
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="text-[11px]"
          onClick={onAcceptChanges}
          disabled={isBusy}
          title={playsetActionHelp.acceptDrift}
        >
          Save changes
        </Button>
      </div>
    </div>
  );
}
