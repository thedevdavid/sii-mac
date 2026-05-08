import { cn } from "@/lib/utils";
import { Button } from "@/components/cupertino/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  IconBrandSteam,
  IconFolder,
  IconInfoCircle,
} from "@tabler/icons-react";
import type { EnrichedMod } from "./workshop-metadata";

interface ModLibraryRowProps {
  mod: EnrichedMod;
  isInPlayset: boolean;
  onToggleInPlayset: () => void;
  onViewDetails: () => void;
}

export function ModLibraryRow({
  mod,
  isInPlayset,
  onToggleInPlayset,
  onViewDetails,
}: ModLibraryRowProps) {
  const thumbnail = mod.workshop?.preview_url;
  const displayTitle = mod.workshop?.title ?? mod.display_name;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onToggleInPlayset}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggleInPlayset();
        }
      }}
      className={cn(
        "group flex cursor-pointer items-center gap-3 rounded-md border border-transparent p-2.5 text-xs transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        isInPlayset && "bg-primary/5 hover:bg-primary/10",
      )}
    >
      <Checkbox
        checked={isInPlayset}
        onCheckedChange={onToggleInPlayset}
        onClick={(e) => e.stopPropagation()}
        aria-label={
          isInPlayset
            ? `Remove ${displayTitle} from playset`
            : `Add ${displayTitle} to playset`
        }
      />

      <div className="shrink-0">
        {thumbnail ? (
          <img
            src={thumbnail}
            alt=""
            className="h-10 w-16 rounded border border-border object-cover"
          />
        ) : (
          <div className="flex h-10 w-16 items-center justify-center rounded border border-border bg-muted">
            {mod.source === "workshop" ? (
              <IconBrandSteam className="size-4 text-muted-foreground" />
            ) : (
              <IconFolder className="size-4 text-muted-foreground" />
            )}
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{displayTitle}</div>
        <div className="truncate text-[10px] text-muted-foreground">
          {[mod.author, mod.version && `v${mod.version}`]
            .filter(Boolean)
            .join(" · ")}
        </div>
      </div>

      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="View details"
        onClick={(e) => {
          e.stopPropagation();
          onViewDetails();
        }}
        className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
      >
        <IconInfoCircle className="size-3.5" />
      </Button>
    </div>
  );
}
