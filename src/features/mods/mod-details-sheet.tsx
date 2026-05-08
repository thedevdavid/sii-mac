import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/cupertino/sheet";
import { Button } from "@/components/cupertino/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/cupertino/scroll-area";
import {
  IconBrandSteam,
  IconFolder,
  IconThumbDown,
  IconThumbUp,
  IconTrash,
  IconUsers,
} from "@tabler/icons-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { formatError } from "@/lib/format-error";
import { toast } from "sonner";
import { deleteLocalMod } from "@/lib/tauri-commands";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import type { GameBasePath } from "@/lib/core-types";
import { BBCode } from "@/lib/bbcode";
import { formatSubscriberCount, formatVoteRatio } from "./workshop-metadata";
import type { EnrichedMod } from "./workshop-metadata";

interface ModDetailsSheetProps {
  basePath: GameBasePath;
  mod: EnrichedMod | null;
  onOpenChange: (open: boolean) => void;
}

export function ModDetailsSheet({
  basePath,
  mod,
  onOpenChange,
}: ModDetailsSheetProps) {
  const queryClient = useQueryClient();
  const open = mod !== null;

  const handleOpenWorkshop = async () => {
    if (!mod?.workshop_id) return;
    try {
      await openUrl(`steam://url/CommunityFilePage/${mod.workshop_id}`);
    } catch (err) {
      toast.error(`Could not open Steam: ${formatError(err)}`);
    }
  };

  const handleDelete = async () => {
    if (!mod || mod.source !== "local") return;
    if (!confirm(`Permanently delete ${mod.display_name} from disk?`)) return;
    try {
      await deleteLocalMod(basePath, mod.id);
      toast.success(`Deleted ${mod.display_name}`);
      queryClient.invalidateQueries({ queryKey: queryKeys.mods.scan(basePath) });
      onOpenChange(false);
    } catch (err) {
      toast.error(`Delete failed: ${formatError(err)}`);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[420px] sm:max-w-[420px]">
        {mod && (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2 text-sm">
                {mod.source === "workshop" ? (
                  <IconBrandSteam className="size-4" />
                ) : (
                  <IconFolder className="size-4" />
                )}
                {mod.workshop?.title ?? mod.display_name}
              </SheetTitle>
              <SheetDescription className="text-xs">
                {mod.author && <span>by {mod.author}</span>}
                {mod.version && (
                  <span className="ml-2 text-muted-foreground">
                    v{mod.version}
                  </span>
                )}
              </SheetDescription>
            </SheetHeader>

            <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 text-xs">
              {mod.workshop?.preview_url && (
                <img
                  src={mod.workshop.preview_url}
                  alt={mod.display_name}
                  className="aspect-video w-full rounded border border-border object-cover"
                />
              )}

              {mod.categories.length > 0 && (
                <div>
                  <div className="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">
                    Categories
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {mod.categories.map((c) => (
                      <Badge key={c} variant="secondary" className="text-[10px]">
                        {c}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {mod.compatible_versions.length > 0 && (
                <div>
                  <div className="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">
                    Compatible with
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {mod.compatible_versions.map((v) => (
                      <Badge key={v} variant="outline" className="text-[10px]">
                        {v}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {mod.workshop && (
                <div className="flex min-h-0 flex-1 flex-col gap-2 rounded border border-border p-3">
                  <div className="text-[10px] font-semibold uppercase text-muted-foreground">
                    Workshop
                  </div>
                  <div className="flex items-center gap-4 text-[11px]">
                    <div className="flex items-center gap-1">
                      <IconUsers className="size-3" />
                      {formatSubscriberCount(mod.workshop.subscribers)}
                    </div>
                    {(mod.workshop.votes_up || mod.workshop.votes_down) && (
                      <div className="flex items-center gap-1">
                        <IconThumbUp className="size-3" />
                        {mod.workshop.votes_up ?? 0}
                        <IconThumbDown className="ml-1 size-3" />
                        {mod.workshop.votes_down ?? 0}
                        {formatVoteRatio(
                          mod.workshop.votes_up,
                          mod.workshop.votes_down,
                        ) && (
                          <span className="ml-1 text-muted-foreground">
                            (
                            {formatVoteRatio(
                              mod.workshop.votes_up,
                              mod.workshop.votes_down,
                            )}
                            )
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  {mod.workshop.description && (
                    <ScrollArea className="min-h-0 flex-1 pr-3">
                      <BBCode source={mod.workshop.description} />
                    </ScrollArea>
                  )}
                </div>
              )}

              <div className="text-[10px] text-muted-foreground">
                <div>ID: <code>{mod.id}</code></div>
                {mod.size != null && <div>Size: {formatBytes(mod.size)}</div>}
              </div>
            </div>

            <SheetFooter className="flex-row gap-2 border-t border-border p-3">
              {mod.workshop_id && (
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={handleOpenWorkshop}
                >
                  <IconBrandSteam className="size-3.5" />
                  Open in Steam
                </Button>
              )}
              {mod.source === "local" && (
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 text-destructive"
                  onClick={handleDelete}
                >
                  <IconTrash className="size-3.5" />
                  Delete file
                </Button>
              )}
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
