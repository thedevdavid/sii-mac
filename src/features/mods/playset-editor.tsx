import { useState } from "react";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Button } from "@/components/cupertino/button";
import { ScrollArea } from "@/components/cupertino/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/cupertino/dialog";
import { Input } from "@/components/cupertino/input";
import { Label } from "@/components/ui/label";
import { IconDeviceFloppy, IconPlayerPlay } from "@tabler/icons-react";
import type {
  GameBasePath,
  ModId,
  PlaysetId,
  ProfilePath,
} from "@/lib/core-types";
import type { Playset } from "./types";
import { PlaysetEntryRow } from "./playset-entry-row";
import { DriftBanner } from "./drift-banner";
import { ApplyPlaysetConfirmation } from "./apply-playset-confirmation";
import { playsetDndId } from "./dnd-ids";
import { usePlaysetDrift, useInstallationMods } from "./use-playsets";
import {
  useApplyPlayset,
  useReorderPlaysetEntries,
  useRemoveModFromPlayset,
  useToggleEntryEnabled,
  useSaveActiveAsPlayset,
  useAcceptPlaysetDrift,
} from "./use-playset-mutations";

interface PlaysetEditorProps {
  basePath: GameBasePath;
  profilePath: ProfilePath;
  playset: Playset | undefined;
}

export function PlaysetEditor({
  basePath,
  profilePath,
  playset,
}: PlaysetEditorProps) {
  const { data: drift } = usePlaysetDrift(
    basePath,
    profilePath,
    playset?.id as PlaysetId | undefined,
  );
  const { data: installationMods } = useInstallationMods(basePath);

  const applyMutation = useApplyPlayset(basePath, profilePath);
  const reorderMutation = useReorderPlaysetEntries(basePath, profilePath);
  const removeMutation = useRemoveModFromPlayset(basePath, profilePath);
  const toggleMutation = useToggleEntryEnabled(basePath, profilePath);
  const saveAsMutation = useSaveActiveAsPlayset(basePath, profilePath);
  const acceptDriftMutation = useAcceptPlaysetDrift(basePath, profilePath);

  const [applyConfirmOpen, setApplyConfirmOpen] = useState(false);
  const [saveAsOpen, setSaveAsOpen] = useState(false);

  if (!playset) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        No playset selected
      </div>
    );
  }

  const installedIds = new Set((installationMods ?? []).map((m) => m.id));
  const enabledCount = playset.entries.filter((e) => e.enabled).length;

  const moveEntry = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= playset.entries.length) return;
    const newOrder = [...playset.entries];
    const [moved] = newOrder.splice(index, 1);
    newOrder.splice(target, 0, moved);
    reorderMutation.mutate({
      playsetId: playset.id,
      orderedModIds: newOrder.map((e) => e.mod_id),
    });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 border-b border-border p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-xs font-semibold">
              {playset.name}
              {playset.is_temporary && (
                <span className="ml-1 text-[10px] italic text-muted-foreground">
                  (Temporary)
                </span>
              )}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {enabledCount} / {playset.entries.length} enabled
            </div>
          </div>
          <div className="flex gap-1">
            {playset.is_temporary && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSaveAsOpen(true)}
              >
                <IconDeviceFloppy className="size-3.5" />
                Save as…
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => setApplyConfirmOpen(true)}
              disabled={applyMutation.isPending}
            >
              <IconPlayerPlay className="size-3.5" />
              Apply
            </Button>
          </div>
        </div>

        {drift?.has_drift && (
          <DriftBanner
            drift={drift}
            onRevert={() =>
              applyMutation.mutate({
                playsetId: playset.id,
                playsetName: playset.name,
              })
            }
            onAcceptChanges={() =>
              acceptDriftMutation.mutate({ playsetId: playset.id })
            }
            isBusy={applyMutation.isPending || acceptDriftMutation.isPending}
          />
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-1 p-2">
          {playset.entries.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              Add mods from the library.
            </div>
          ) : (
            <SortableContext
              items={playset.entries.map((e) => playsetDndId(e.mod_id))}
              strategy={verticalListSortingStrategy}
            >
              {playset.entries.map((entry, index) => (
                <PlaysetEntryRow
                  key={entry.mod_id}
                  entry={entry}
                  index={index}
                  total={playset.entries.length}
                  isMissing={!installedIds.has(entry.mod_id)}
                  onToggleEnabled={(enabled) =>
                    toggleMutation.mutate({
                      playsetId: playset.id,
                      modId: entry.mod_id as ModId,
                      enabled,
                    })
                  }
                  onRemove={() =>
                    removeMutation.mutate({
                      playsetId: playset.id,
                      modId: entry.mod_id as ModId,
                      displayName: entry.display_name,
                    })
                  }
                  onMoveUp={() => moveEntry(index, -1)}
                  onMoveDown={() => moveEntry(index, 1)}
                />
              ))}
            </SortableContext>
          )}
        </div>
      </ScrollArea>

      <ApplyPlaysetConfirmation
        playset={playset}
        installationMods={installationMods}
        drift={drift}
        open={applyConfirmOpen}
        onOpenChange={setApplyConfirmOpen}
        isBusy={applyMutation.isPending}
        onConfirm={() => {
          applyMutation.mutate(
            { playsetId: playset.id, playsetName: playset.name },
            {
              onSettled: () => setApplyConfirmOpen(false),
            },
          );
        }}
      />

      <SaveAsDialog
        open={saveAsOpen}
        onOpenChange={setSaveAsOpen}
        defaultName={playset.name === "Temporary" ? "" : playset.name}
        onSubmit={async (name) => {
          await saveAsMutation.mutateAsync({ name });
          setSaveAsOpen(false);
        }}
        isPending={saveAsMutation.isPending}
      />
    </div>
  );
}

interface SaveAsDialogProps {
  open: boolean;
  defaultName: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (name: string) => void;
  isPending?: boolean;
}

function SaveAsDialog({
  open,
  defaultName,
  onOpenChange,
  onSubmit,
  isPending,
}: SaveAsDialogProps) {
  const [name, setName] = useState(defaultName);
  const trimmed = name.trim();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setName(defaultName);
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (trimmed) onSubmit(trimmed);
          }}
          className="space-y-4"
        >
          <DialogHeader>
            <DialogTitle>Save playset</DialogTitle>
            <DialogDescription>
              Give this playset a name. It will be promoted from temporary and
              stay tied to this profile until you switch.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="save-as-name" className="text-xs">
              Name
            </Label>
            <Input
              id="save-as-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              maxLength={128}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!trimmed || isPending}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
