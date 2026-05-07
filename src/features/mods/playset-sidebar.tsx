import { useState } from "react";
import { Button } from "@/components/cupertino/button";
import { ScrollArea } from "@/components/cupertino/scroll-area";
import { IconPlus, IconUpload } from "@tabler/icons-react";
import type { GameBasePath, ProfilePath } from "@/lib/core-types";
import type { DriftReport, Playset } from "./types";
import { PlaysetSidebarItem } from "./playset-sidebar-item";
import { CreatePlaysetDialog } from "./create-playset-dialog";
import { RenamePlaysetDialog } from "./rename-playset-dialog";
import { DuplicatePlaysetDialog } from "./duplicate-playset-dialog";
import { DeletePlaysetDialog } from "./delete-playset-dialog";
import { usePlaysets } from "./use-playsets";
import {
  useExportPlayset,
  useImportPlayset,
  useSetActivePlayset,
} from "./use-playset-mutations";

interface PlaysetSidebarProps {
  basePath: GameBasePath;
  profilePath: ProfilePath;
  activePlayset: Playset | undefined;
  drift: DriftReport | undefined;
}

type DialogState =
  | { kind: "create" }
  | { kind: "rename"; target: Playset }
  | { kind: "duplicate"; target: Playset }
  | { kind: "delete"; target: Playset }
  | null;

export function PlaysetSidebar({
  basePath,
  profilePath,
  activePlayset,
  drift,
}: PlaysetSidebarProps) {
  const { data: playsets } = usePlaysets(basePath);

  const setActive = useSetActivePlayset(basePath, profilePath);
  const importMutation = useImportPlayset(basePath);
  const exportMutation = useExportPlayset(basePath);

  const [dialog, setDialog] = useState<DialogState>(null);
  const close = () => setDialog(null);

  const items = playsets ?? [];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border p-3">
        <h2 className="text-xs font-semibold">Playsets</h2>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => importMutation.mutate()}
            disabled={importMutation.isPending}
            aria-label="Import playset"
            title="Import playset from a JSON file"
          >
            <IconUpload className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setDialog({ kind: "create" })}
            aria-label="Create playset"
            title="Create a new empty playset"
          >
            <IconPlus className="size-3.5" />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-0.5 p-2">
          {items.length === 0 ? (
            <div className="p-4 text-center text-xs text-muted-foreground">
              No playsets yet
            </div>
          ) : (
            items.map((playset) => (
              <PlaysetSidebarItem
                key={playset.id}
                playset={playset}
                isActive={activePlayset?.id === playset.id}
                hasDrift={Boolean(drift?.has_drift)}
                onSelect={() => {
                  if (activePlayset?.id !== playset.id) {
                    setActive.mutate({ playsetId: playset.id });
                  }
                }}
                onRename={() => setDialog({ kind: "rename", target: playset })}
                onDuplicate={() =>
                  setDialog({ kind: "duplicate", target: playset })
                }
                onExport={() =>
                  exportMutation.mutate({
                    playsetId: playset.id,
                    defaultName: playset.name,
                  })
                }
                onDelete={() => setDialog({ kind: "delete", target: playset })}
              />
            ))
          )}
        </div>
      </ScrollArea>

      <CreatePlaysetDialog
        basePath={basePath}
        open={dialog?.kind === "create"}
        onOpenChange={(open) => !open && close()}
      />
      <RenamePlaysetDialog
        basePath={basePath}
        playset={dialog?.kind === "rename" ? dialog.target : null}
        open={dialog?.kind === "rename"}
        onOpenChange={(open) => !open && close()}
      />
      <DuplicatePlaysetDialog
        basePath={basePath}
        playset={dialog?.kind === "duplicate" ? dialog.target : null}
        open={dialog?.kind === "duplicate"}
        onOpenChange={(open) => !open && close()}
      />
      <DeletePlaysetDialog
        basePath={basePath}
        profilePath={profilePath}
        playset={dialog?.kind === "delete" ? dialog.target : null}
        open={dialog?.kind === "delete"}
        onOpenChange={(open) => !open && close()}
      />
    </div>
  );
}
