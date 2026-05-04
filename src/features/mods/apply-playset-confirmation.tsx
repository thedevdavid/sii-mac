import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/cupertino/alert-dialog";
import { ScrollArea } from "@/components/cupertino/scroll-area";
import { IconAlertTriangle } from "@tabler/icons-react";
import type { ModId } from "@/lib/core-types";
import type { Playset, DriftReport, FullModInfo } from "./types";

interface ApplyPlaysetConfirmationProps {
  playset: Playset | null;
  modsById: ReadonlyMap<ModId, FullModInfo>;
  drift: DriftReport | undefined;
  open: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  isBusy?: boolean;
}

export function ApplyPlaysetConfirmation({
  playset,
  modsById,
  drift,
  open,
  onConfirm,
  onOpenChange,
  isBusy,
}: ApplyPlaysetConfirmationProps) {
  // The dialog is always mounted as a sibling — render the cheapest possible
  // tree when closed so opening another dialog or re-rendering the parent
  // doesn't iterate `playset.entries` / build sets unnecessarily.
  if (!open || !playset) {
    return (
      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogContent />
      </AlertDialog>
    );
  }

  const enabledEntries = playset.entries.filter((e) => e.enabled);
  const missingOnDisk = enabledEntries.filter((e) => !modsById.has(e.mod_id));

  const addingIds = drift?.missing_in_profile.map((m) => m.id) ?? [];
  const removingIds = drift?.extra_in_profile.map((m) => m.id) ?? [];

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Apply "{playset.name}"?</AlertDialogTitle>
          <AlertDialogDescription>
            Write {enabledEntries.length} enabled mod
            {enabledEntries.length === 1 ? "" : "s"} to profile.sii.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <ScrollArea className="max-h-[300px]">
          <div className="space-y-3 text-xs">
            {addingIds.length > 0 && (
              <DiffSection
                title={`Adding (${addingIds.length})`}
                items={drift?.missing_in_profile.map((m) => m.display_name) ?? []}
              />
            )}
            {removingIds.length > 0 && (
              <DiffSection
                title={`Removing (${removingIds.length})`}
                items={drift?.extra_in_profile.map((m) => m.display_name) ?? []}
              />
            )}
            {drift?.order_changed && (
              <div className="rounded border border-border p-2 text-muted-foreground">
                Load order will change.
              </div>
            )}
            {missingOnDisk.length > 0 && (
              <div className="flex gap-2 rounded border border-amber-500/50 bg-amber-500/5 p-2">
                <IconAlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
                <div>
                  <div className="font-medium text-amber-500">
                    {missingOnDisk.length} mod{missingOnDisk.length === 1 ? "" : "s"}{" "}
                    missing on disk
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    They'll be written as placeholders; the game ignores missing
                    entries at load time.
                  </div>
                </div>
              </div>
            )}
            {drift?.snapshot_drift && (
              <div className="flex gap-2 rounded border border-destructive/50 bg-destructive/5 p-2">
                <IconAlertTriangle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
                <div className="text-[10px] text-muted-foreground">
                  The profile has been modified outside the manager. Applying
                  will overwrite those changes.
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isBusy}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={isBusy}>
            Apply
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DiffSection({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded border border-border p-2">
      <div className="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">
        {title}
      </div>
      <ul className="space-y-0.5 text-[11px]">
        {items.slice(0, 10).map((item) => (
          <li key={item} className="truncate">
            {item}
          </li>
        ))}
        {items.length > 10 && (
          <li className="text-muted-foreground">
            … and {items.length - 10} more
          </li>
        )}
      </ul>
    </div>
  );
}
