import { useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Skeleton } from "@/components/ui/skeleton";
import type { GameBasePath, ProfilePath } from "@/lib/core-types";
import { PlaysetSidebar } from "./playset-sidebar";
import { ModLibrary } from "./mod-library";
import { PlaysetEditor } from "./playset-editor";
import { ModDetailsSheet } from "./mod-details-sheet";
import { useActivePlayset, useInstallationMods } from "./use-playsets";
import { useReorderPlaysetEntries } from "./use-playset-mutations";
import { parseDndId } from "./dnd-ids";
import type { EnrichedMod } from "./workshop-metadata";

interface ModManagerProps {
  basePath: GameBasePath;
  profilePath: ProfilePath;
}

export function ModManager({ basePath, profilePath }: ModManagerProps) {
  const { data: activePlayset, isLoading: playsetLoading } = useActivePlayset(
    basePath,
    profilePath,
  );
  const { isLoading: modsLoading } = useInstallationMods(basePath);
  const reorderMutation = useReorderPlaysetEntries(basePath, profilePath);

  const [detailsTarget, setDetailsTarget] = useState<EnrichedMod | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || !activePlayset) return;
    const activeId = parseDndId(active.id as string);
    const overId = parseDndId(over.id as string);
    if (!activeId || !overId) return;
    if (activeId.source !== "playset" || overId.source !== "playset") return;
    if (activeId.modId === overId.modId) return;

    const current = activePlayset.entries.map((e) => e.mod_id);
    const fromIdx = current.indexOf(activeId.modId);
    const toIdx = current.indexOf(overId.modId);
    if (fromIdx < 0 || toIdx < 0) return;

    const reordered = [...current];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);

    reorderMutation.mutate({
      playsetId: activePlayset.id,
      orderedModIds: reordered as typeof current,
    });
  };

  if (playsetLoading || modsLoading) {
    return <ModManagerSkeleton />;
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <ResizablePanelGroup orientation="horizontal" className="h-full">
        <ResizablePanel defaultSize="20" minSize="15" maxSize="30">
          <PlaysetSidebar basePath={basePath} profilePath={profilePath} />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize="50" minSize="30">
          <ModLibrary
            basePath={basePath}
            activePlayset={activePlayset}
            profilePath={profilePath}
            onShowDetails={setDetailsTarget}
          />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize="30" minSize="25" maxSize="50">
          <PlaysetEditor
            basePath={basePath}
            profilePath={profilePath}
            playset={activePlayset}
          />
        </ResizablePanel>
      </ResizablePanelGroup>

      <ModDetailsSheet
        basePath={basePath}
        mod={detailsTarget}
        onOpenChange={(open) => {
          if (!open) setDetailsTarget(null);
        }}
      />
    </DndContext>
  );
}

function ModManagerSkeleton() {
  return (
    <div className="flex h-full">
      <div className="w-[20%] space-y-2 border-r border-border p-3">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
      <div className="flex-1 space-y-2 border-r border-border p-3">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-7 w-full" />
        <div className="space-y-1 pt-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
      <div className="w-[30%] space-y-2 p-3">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    </div>
  );
}
