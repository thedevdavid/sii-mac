import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/cupertino/button";
import { ScrollArea } from "@/components/cupertino/scroll-area";
import { IconPlus, IconUpload } from "@tabler/icons-react";
import { formatError } from "@/lib/format-error";
import type { GameBasePath, ProfilePath } from "@/lib/core-types";
import type { DriftReport, Playset } from "./types";
import { PlaysetSidebarItem } from "./playset-sidebar-item";
import { CreatePlaysetDialog } from "./create-playset-dialog";
import { RenamePlaysetDialog } from "./rename-playset-dialog";
import { DuplicatePlaysetDialog } from "./duplicate-playset-dialog";
import { DeletePlaysetDialog } from "./delete-playset-dialog";
import { usePlaysets } from "./use-playsets";
import {
  useSetActivePlayset,
  useImportPlayset,
} from "./use-playset-mutations";
import {
  exportPlaysetToFile,
  importPlaysetFromFile,
} from "./playset-import-export";

interface PlaysetSidebarProps {
  basePath: GameBasePath;
  profilePath: ProfilePath;
  activePlayset: Playset | undefined;
  drift: DriftReport | undefined;
}

export function PlaysetSidebar({
  basePath,
  profilePath,
  activePlayset,
  drift,
}: PlaysetSidebarProps) {
  const { data: playsets } = usePlaysets(basePath);

  const setActive = useSetActivePlayset(basePath, profilePath);
  const importMutation = useImportPlayset(basePath);

  const [createOpen, setCreateOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<Playset | null>(null);
  const [duplicateTarget, setDuplicateTarget] = useState<Playset | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Playset | null>(null);

  const handleExport = async (playset: Playset) => {
    try {
      const dest = await exportPlaysetToFile(basePath, playset.id, playset.name);
      if (dest) toast.success(`Exported "${playset.name}"`);
    } catch (err) {
      toast.error(`Export failed: ${formatError(err)}`);
    }
  };

  const handleImport = async () => {
    try {
      const imported = await importPlaysetFromFile(basePath);
      if (imported) toast.success(`Imported "${imported.name}"`);
      // Refresh list
      importMutation.reset();
    } catch (err) {
      toast.error(`Import failed: ${formatError(err)}`);
    }
  };

  const items = playsets ?? [];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border p-3">
        <h2 className="text-xs font-semibold">Playsets</h2>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleImport}
            aria-label="Import playset"
            title="Import playset"
          >
            <IconUpload className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setCreateOpen(true)}
            aria-label="Create playset"
            title="Create playset"
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
                onRename={() => setRenameTarget(playset)}
                onDuplicate={() => setDuplicateTarget(playset)}
                onExport={() => handleExport(playset)}
                onDelete={() => setDeleteTarget(playset)}
              />
            ))
          )}
        </div>
      </ScrollArea>

      <CreatePlaysetDialog
        basePath={basePath}
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
      <RenamePlaysetDialog
        basePath={basePath}
        playset={renameTarget}
        open={renameTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRenameTarget(null);
        }}
      />
      <DuplicatePlaysetDialog
        basePath={basePath}
        playset={duplicateTarget}
        open={duplicateTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDuplicateTarget(null);
        }}
      />
      <DeletePlaysetDialog
        basePath={basePath}
        profilePath={profilePath}
        playset={deleteTarget}
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      />
    </div>
  );
}
