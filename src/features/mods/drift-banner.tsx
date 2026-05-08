import { IconAlertTriangle } from "@tabler/icons-react";
import type { DriftReport } from "./types";

interface DriftBannerProps {
  drift: DriftReport;
}

export function DriftBanner({ drift }: DriftBannerProps) {
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
    <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/5 p-2.5 text-[11px]">
      <IconAlertTriangle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
      <div className="min-w-0 flex-1">
        <div className="font-medium text-destructive">
          Profile differs from playset
        </div>
        <div className="text-muted-foreground">
          {summary}. Click{" "}
          <span className="font-medium text-foreground">Apply</span> to push
          this playset to the profile.
        </div>
      </div>
    </div>
  );
}

