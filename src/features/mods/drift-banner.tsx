import { IconAlertTriangle } from "@tabler/icons-react";
import { Button } from "@/components/cupertino/button";
import type { DriftReport } from "./types";

interface DriftBannerProps {
  drift: DriftReport;
  /** Push the playset onto the profile — adds `missing_in_profile`, removes `extra_in_profile`. */
  onApplyToProfile: () => void;
  /** Pull the live profile into the playset — adds `extra_in_profile` to the playset, removes `missing_in_profile` from it. */
  onUpdatePlaysetFromProfile: () => void;
  isBusy?: boolean;
}

/**
 * Drift reconciliation has two distinct directions:
 *   missing_in_profile = playset has it, profile doesn't
 *     → Apply  ADDS to profile / Pull REMOVES from playset
 *   extra_in_profile   = profile has it, playset doesn't
 *     → Apply  REMOVES from profile / Pull ADDS to playset
 *
 * The button labels collapse the parenthetical "(N add, M remove)" noise
 * by spelling out the dominant action verb per direction. Only when both
 * sides have changes does the secondary count appear.
 */
export function DriftBanner({
  drift,
  onApplyToProfile,
  onUpdatePlaysetFromProfile,
  isBusy,
}: DriftBannerProps) {
  const missing = drift.missing_in_profile.length;
  const extra = drift.extra_in_profile.length;

  return (
    <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-2.5 text-[11px]">
      <div className="flex items-start gap-2">
        <IconAlertTriangle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
        <div className="min-w-0 flex-1">
          <div className="font-medium text-destructive">
            Profile differs from playset
          </div>
          <ul className="mt-0.5 space-y-0.5 text-muted-foreground">
            {missing > 0 && (
              <li>
                <span className="font-medium text-foreground">{missing}</span>{" "}
                in playset, inactive in profile
              </li>
            )}
            {extra > 0 && (
              <li>
                <span className="font-medium text-foreground">{extra}</span>{" "}
                active in profile, not in playset
              </li>
            )}
            {drift.order_changed && missing === 0 && extra === 0 && (
              <li>load order differs</li>
            )}
            {drift.snapshot_drift && (
              <li>playset edited since last apply</li>
            )}
          </ul>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 pl-5">
        <Button
          size="sm"
          onClick={onApplyToProfile}
          disabled={isBusy}
          title="Make the profile match the playset."
        >
          {applyLabel(missing, extra)}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onUpdatePlaysetFromProfile}
          disabled={isBusy}
          title="Make the playset match the profile."
        >
          {pullLabel(missing, extra)}
        </Button>
      </div>
    </div>
  );
}

function applyLabel(missing: number, extra: number): string {
  if (missing > 0 && extra > 0) {
    return `Apply playset (+${missing}, −${extra})`;
  }
  if (missing > 0) return `Activate ${missing} in profile`;
  if (extra > 0) return `Deactivate ${extra} in profile`;
  return "Apply playset";
}

function pullLabel(missing: number, extra: number): string {
  if (missing > 0 && extra > 0) {
    return `Pull from profile (+${extra}, −${missing})`;
  }
  if (missing > 0) return `Drop ${missing} from playset`;
  if (extra > 0) return `Add ${extra} to playset`;
  return "Pull from profile";
}
