import { useState } from "react";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { toast } from "sonner";
import { Button } from "@/components/cupertino/button";
import { ScrollArea } from "@/components/cupertino/scroll-area";
import {
  IconDeviceFloppy,
  IconPlayerPlay,
  IconWand,
} from "@tabler/icons-react";
import type {
  GameBasePath,
  ModId,
  ProfilePath,
} from "@/lib/core-types";
import type { FullModInfo, Playset, WorkshopMetadataMap } from "./types";
import type { DriftReport } from "./types";
import { PlaysetEntryRow } from "./playset-entry-row";
import { PlaysetSelectionToolbar } from "./playset-selection-toolbar";
import { DriftBanner } from "./drift-banner";
import { ApplyPlaysetConfirmation } from "./apply-playset-confirmation";
import { AutoFixPreviewDialog } from "./auto-fix-preview-dialog";
import { LoadOrderPopover } from "./load-order-popover";
import { SaveAsDialog } from "./save-as-dialog";
import { playsetDndId } from "./dnd-ids";
import { analyzeAndReorder, reorderIsNoOp } from "./load-order";
import { useAutoFixMode } from "@/hooks/use-autofix-mode";
import { playsetActionHelp } from "./playset-actions-help";
import {
  useApplyPlayset,
  useReorderPlaysetEntries,
  useRemoveModFromPlayset,
  useToggleEntryEnabled,
  useToggleEntryLocked,
  useSaveActiveAsPlayset,
  useSetEntriesLockGroup,
} from "./use-playset-mutations";

interface PlaysetEditorProps {
  basePath: GameBasePath;
  profilePath: ProfilePath;
  playset: Playset | undefined;
  modsById: ReadonlyMap<ModId, FullModInfo>;
  workshopMap: WorkshopMetadataMap | undefined;
  drift: DriftReport | undefined;
}

type DialogKind = "apply" | "saveAs" | "autoFix" | null;

export function PlaysetEditor({
  basePath,
  profilePath,
  playset,
  modsById,
  workshopMap,
  drift,
}: PlaysetEditorProps) {
  const applyMutation = useApplyPlayset(basePath, profilePath);
  const reorderMutation = useReorderPlaysetEntries(basePath, profilePath);
  const removeMutation = useRemoveModFromPlayset(basePath, profilePath);
  const toggleMutation = useToggleEntryEnabled(basePath, profilePath);
  const lockMutation = useToggleEntryLocked(basePath, profilePath);
  const saveAsMutation = useSaveActiveAsPlayset(basePath, profilePath);
  const groupMutation = useSetEntriesLockGroup(basePath, profilePath);

  const [autoFixMode] = useAutoFixMode();
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [selectedIds, setSelectedIds] = useState<Set<ModId>>(new Set());
  const close = () => setDialog(null);

  const toggleSelected = (modId: ModId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(modId)) {
        next.delete(modId);
      } else {
        next.add(modId);
      }
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());

  if (!playset) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        No playset selected
      </div>
    );
  }

  const resolveDisplayName = (modId: ModId, fallback: string): string => {
    const mod = modsById.get(modId);
    if (mod?.workshop_id && workshopMap?.[mod.workshop_id]?.title) {
      return workshopMap[mod.workshop_id].title;
    }
    return fallback;
  };
  const enabledCount = playset.entries.filter((e) => e.enabled).length;
  const allLocked =
    playset.entries.length > 0 && playset.entries.every((e) => e.locked);

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

  const moveEntryToEdge = (index: number, edge: "top" | "bottom") => {
    if (index < 0 || index >= playset.entries.length) return;
    const newOrder = [...playset.entries];
    const [moved] = newOrder.splice(index, 1);
    if (edge === "top") {
      newOrder.unshift(moved);
    } else {
      newOrder.push(moved);
    }
    reorderMutation.mutate({
      playsetId: playset.id,
      orderedModIds: newOrder.map((e) => e.mod_id),
    });
  };

  const moveSelectionToEdge = (edge: "top" | "bottom") => {
    if (selectedIds.size === 0) return;
    const selected = playset.entries.filter((e) =>
      selectedIds.has(e.mod_id as ModId),
    );
    const others = playset.entries.filter(
      (e) => !selectedIds.has(e.mod_id as ModId),
    );
    const newOrder =
      edge === "top" ? [...selected, ...others] : [...others, ...selected];
    reorderMutation.mutate({
      playsetId: playset.id,
      orderedModIds: newOrder.map((e) => e.mod_id) as ModId[],
    });
  };

  const applyToSelection = (
    mutate: (modId: ModId, displayName: string) => void,
  ) => {
    for (const entry of playset.entries) {
      const id = entry.mod_id as ModId;
      if (selectedIds.has(id)) {
        mutate(id, entry.display_name);
      }
    }
  };

  const bulkSetEnabled = (enabled: boolean) => {
    applyToSelection((modId) =>
      toggleMutation.mutate({ playsetId: playset.id, modId, enabled }),
    );
  };
  const bulkSetLocked = (locked: boolean) => {
    applyToSelection((modId) =>
      lockMutation.mutate({ playsetId: playset.id, modId, locked }),
    );
  };
  const bulkRemove = () => {
    applyToSelection((modId, displayName) =>
      removeMutation.mutate({ playsetId: playset.id, modId, displayName }),
    );
    clearSelection();
  };

  const bulkGroup = () => {
    if (selectedIds.size < 2) return;
    const groupId = crypto.randomUUID();
    groupMutation.mutate({
      playsetId: playset.id,
      modIds: Array.from(selectedIds),
      lockGroup: groupId,
    });
  };

  const bulkUngroup = () => {
    if (selectedIds.size === 0) return;
    groupMutation.mutate({
      playsetId: playset.id,
      modIds: Array.from(selectedIds),
      lockGroup: null,
    });
  };

  const selectedEntries = playset.entries.filter((e) =>
    selectedIds.has(e.mod_id as ModId),
  );
  const selectionGroups = new Set(
    selectedEntries.map((e) => e.lock_group ?? null),
  );
  const allShareGroup =
    selectedEntries.length >= 2 &&
    selectionGroups.size === 1 &&
    !selectionGroups.has(null);
  const anyHasGroup = selectedEntries.some((e) => e.lock_group != null);

  const runAutoFix = (orderedIds: ModId[]) => {
    reorderMutation.mutate({
      playsetId: playset.id,
      orderedModIds: orderedIds,
    });
    const movedCount = orderedIds.reduce((acc, modId, newIdx) => {
      return playset.entries[newIdx]?.mod_id === modId ? acc : acc + 1;
    }, 0);
    const lockedCount = playset.entries.filter((e) => e.locked).length;
    toast.success(
      lockedCount > 0
        ? `Reordered ${movedCount} mod${movedCount === 1 ? "" : "s"} (${lockedCount} locked unchanged)`
        : `Reordered ${movedCount} mod${movedCount === 1 ? "" : "s"}`,
    );
  };

  const handleAutoFix = () => {
    if (autoFixMode === "immediate") {
      const { plannedOrder } = analyzeAndReorder(
        playset.entries,
        modsById,
        workshopMap,
      );
      if (reorderIsNoOp(playset.entries, plannedOrder)) {
        toast.success("Already in recommended order");
        return;
      }
      runAutoFix(plannedOrder);
    } else {
      setDialog("autoFix");
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 border-b border-border p-3">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="min-w-0 flex-1 basis-[12rem]">
            <div className="truncate text-xs font-semibold">
              {playset.name}
              {playset.is_temporary && (
                <span className="ml-1 text-[10px] italic text-muted-foreground">
                  (Temporary)
                </span>
              )}
            </div>
            <div className="whitespace-nowrap text-[10px] text-muted-foreground">
              {enabledCount} / {playset.entries.length} enabled
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <LoadOrderPopover />
            <Button
              size="sm"
              variant="outline"
              onClick={handleAutoFix}
              disabled={
                allLocked ||
                reorderMutation.isPending ||
                playset.entries.length === 0
              }
              title={
                allLocked ? "All entries are locked" : playsetActionHelp.autoFix
              }
            >
              <IconWand className="size-3.5" />
              Auto-fix order
            </Button>
            {playset.is_temporary && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setDialog("saveAs")}
                title={playsetActionHelp.saveAs}
              >
                <IconDeviceFloppy className="size-3.5" />
                Save as…
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => setDialog("apply")}
              disabled={applyMutation.isPending}
              title={playsetActionHelp.apply}
            >
              <IconPlayerPlay className="size-3.5" />
              Apply
            </Button>
          </div>
        </div>

        {drift?.has_drift && <DriftBanner drift={drift} />}

        {selectedIds.size > 0 && (
          <PlaysetSelectionToolbar
            selectedCount={selectedIds.size}
            totalCount={playset.entries.length}
            allShareGroup={allShareGroup}
            anyHasGroup={anyHasGroup}
            onClear={clearSelection}
            onSelectAll={() =>
              setSelectedIds(
                new Set(playset.entries.map((e) => e.mod_id as ModId)),
              )
            }
            onEnable={() => bulkSetEnabled(true)}
            onDisable={() => bulkSetEnabled(false)}
            onLock={() => bulkSetLocked(true)}
            onUnlock={() => bulkSetLocked(false)}
            onGroup={bulkGroup}
            onUngroup={bulkUngroup}
            onMoveToTop={() => moveSelectionToEdge("top")}
            onMoveToBottom={() => moveSelectionToEdge("bottom")}
            onRemove={bulkRemove}
            isBusy={
              reorderMutation.isPending ||
              toggleMutation.isPending ||
              lockMutation.isPending ||
              removeMutation.isPending ||
              groupMutation.isPending
            }
          />
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-1 p-2">
          {playset.entries.length === 0 ? (
            drift && drift.live_entries.length > 0 ? (
              <div className="space-y-2">
                <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-[11px]">
                  <div className="font-medium text-amber-600 dark:text-amber-400">
                    {drift.live_entries.length} active mod
                    {drift.live_entries.length === 1 ? "" : "s"} in profile
                  </div>
                  <div className="mt-0.5 text-muted-foreground">
                    These mods are loaded in the game but not part of this
                    playset. Use “Save changes” above to import them.
                  </div>
                </div>
                {drift.live_entries.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center gap-2 rounded-md border border-dashed border-border/60 bg-muted/20 px-2.5 py-1.5"
                  >
                    <span className="size-1.5 rounded-full bg-amber-500" />
                    <span className="min-w-0 flex-1 truncate text-xs">
                      {resolveDisplayName(
                        entry.id as ModId,
                        entry.display_name,
                      )}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center text-xs text-muted-foreground">
                Add mods from the library.
              </div>
            )
          ) : (
            <SortableContext
              items={playset.entries.map((e) => playsetDndId(e.mod_id))}
              strategy={verticalListSortingStrategy}
            >
              {playset.entries.map((entry, index) => (
                <PlaysetEntryRow
                  key={entry.mod_id}
                  entry={entry}
                  displayName={resolveDisplayName(
                    entry.mod_id,
                    entry.display_name,
                  )}
                  index={index}
                  total={playset.entries.length}
                  isMissing={!modsById.has(entry.mod_id)}
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
                  onMoveToTop={() => moveEntryToEdge(index, "top")}
                  onMoveToBottom={() => moveEntryToEdge(index, "bottom")}
                  isSelected={selectedIds.has(entry.mod_id as ModId)}
                  hasSelection={selectedIds.size > 0}
                  onToggleSelected={() =>
                    toggleSelected(entry.mod_id as ModId)
                  }
                  onToggleLocked={(locked) =>
                    lockMutation.mutate({
                      playsetId: playset.id,
                      modId: entry.mod_id as ModId,
                      locked,
                    })
                  }
                />
              ))}
            </SortableContext>
          )}
        </div>
      </ScrollArea>

      <ApplyPlaysetConfirmation
        playset={playset}
        modsById={modsById}
        drift={drift}
        open={dialog === "apply"}
        onOpenChange={(open) => !open && close()}
        isBusy={applyMutation.isPending}
        onConfirm={() => {
          applyMutation.mutate(
            { playsetId: playset.id, playsetName: playset.name },
            { onSettled: close },
          );
        }}
      />

      <AutoFixPreviewDialog
        open={dialog === "autoFix"}
        onOpenChange={(open) => !open && close()}
        entries={playset.entries}
        modsById={modsById}
        workshopMap={workshopMap}
        isBusy={reorderMutation.isPending}
        onApply={(plannedOrder) => {
          runAutoFix(plannedOrder);
          close();
        }}
      />

      <SaveAsDialog
        open={dialog === "saveAs"}
        onOpenChange={(open) => !open && close()}
        defaultName={playset.name === "Temporary" ? "" : playset.name}
        onSubmit={async (name) => {
          await saveAsMutation.mutateAsync({ name });
          close();
        }}
      />
    </div>
  );
}
