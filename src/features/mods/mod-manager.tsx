import { useState } from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  GameBasePath,
  ModId,
  PlaysetId,
  ProfilePath,
} from "@/lib/core-types";
import type { FullModInfo } from "./types";
import { PlaysetSidebar } from "./playset-sidebar";
import { ModLibrary } from "./mod-library";
import { PlaysetEditor } from "./playset-editor";
import { ModDetailsSheet } from "./mod-details-sheet";
import {
  useActivePlayset,
  useInstallationMods,
  usePlaysetDrift,
  useWorkshopMetadata,
} from "./use-playsets";
import { extractWorkshopIds, type EnrichedMod } from "./workshop-metadata";

interface ModManagerProps {
  basePath: GameBasePath;
  profilePath: ProfilePath;
}

export function ModManager({ basePath, profilePath }: ModManagerProps) {
  const { data: activePlayset, isLoading: playsetLoading } = useActivePlayset(
    basePath,
    profilePath,
  );
  const { data: installationMods, isLoading: modsLoading } =
    useInstallationMods(basePath);
  const workshopIds = extractWorkshopIds(installationMods ?? []);
  const { data: workshopMap } = useWorkshopMetadata(basePath, workshopIds);
  const { data: drift } = usePlaysetDrift(
    basePath,
    profilePath,
    activePlayset?.id as PlaysetId | undefined,
  );

  const modsById = new Map<ModId, FullModInfo>(
    (installationMods ?? []).map((m) => [m.id, m]),
  );

  const [detailsTarget, setDetailsTarget] = useState<EnrichedMod | null>(null);

  if (playsetLoading) {
    return <ModManagerSkeleton />;
  }

  // Drag-and-drop state lives inside `<PlaysetEditor>` (reui Sortable manages
  // its own DndContext + sensors). The library list isn't a drag source today,
  // so there's nothing to wrap at this level.
  return (
    <>
      <ResizablePanelGroup orientation="horizontal" className="h-full">
        <ResizablePanel defaultSize="20" minSize="15" maxSize="30">
          <PlaysetSidebar
            basePath={basePath}
            profilePath={profilePath}
            activePlayset={activePlayset}
            drift={drift}
          />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize="50" minSize="30">
          <ModLibrary
            basePath={basePath}
            activePlayset={activePlayset}
            profilePath={profilePath}
            onShowDetails={setDetailsTarget}
            installationMods={installationMods}
            workshopMap={workshopMap}
            isLoadingMods={modsLoading}
          />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize="30" minSize="25" maxSize="50">
          <PlaysetEditor
            basePath={basePath}
            profilePath={profilePath}
            playset={activePlayset}
            modsById={modsById}
            workshopMap={workshopMap}
            drift={drift}
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
    </>
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
