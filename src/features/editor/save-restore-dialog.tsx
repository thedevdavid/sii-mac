import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { IconHistory, IconRotate } from "@tabler/icons-react";
import { Button } from "@/components/cupertino/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/cupertino/dialog";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item";
import {
  Empty,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/cupertino/empty";
import { formatError } from "@/lib/format-error";
import { queryKeys } from "@/lib/query-keys";
import {
  listSaveBackups,
  restoreSaveBackup,
  type SaveBackupKind,
} from "@/lib/tauri-commands";
import type { SavePath } from "@/lib/core-types";

interface Props {
  savePath: SavePath;
}

const KIND_LABEL: Record<SaveBackupKind, string> = {
  previous: "Previous edit",
  original: "Original (first edit)",
};

const KIND_DESCRIPTION: Record<SaveBackupKind, string> = {
  previous: "The state right before your most recent edit.",
  original: "The untouched game.sii from before SII Mac ever modified this save.",
};

export function SaveRestoreDialog({ savePath }: Props) {
  const queryClient = useQueryClient();
  const { data: backups, isLoading } = useQuery({
    queryKey: queryKeys.saves.backups(savePath),
    queryFn: () => listSaveBackups(savePath),
  });

  const restoreMutation = useMutation({
    mutationFn: (kind: SaveBackupKind) => restoreSaveBackup(savePath, kind),
    onSuccess: async (_, kind) => {
      toast.success(`Restored ${KIND_LABEL[kind].toLowerCase()}`);
      await queryClient.invalidateQueries({
        queryKey: queryKeys.saves.data(savePath),
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.saves.backups(savePath),
      });
    },
    onError: (err) => toast.error(`Restore failed: ${formatError(err)}`),
  });

  const hasAny = (backups?.length ?? 0) > 0;

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" aria-label="Restore save backup">
            <IconHistory className="size-3.5" />
            Restore
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Restore game.sii</DialogTitle>
          <DialogDescription>
            Roll game.sii back to a snapshot the editor took before writing.
            The current game.sii is rotated into the previous-edit slot first,
            so you can reverse the restore if needed.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <p className="text-xs text-muted-foreground">Looking for backups…</p>
        ) : !hasAny ? (
          <Empty>
            <EmptyMedia>
              <IconHistory className="size-6 text-muted-foreground" />
            </EmptyMedia>
            <EmptyTitle>No backups available</EmptyTitle>
            <EmptyDescription>
              Backups appear here automatically the first time you save edits
              to this save.
            </EmptyDescription>
          </Empty>
        ) : (
          <ItemGroup>
            {backups!.map((backup) => (
              <Item key={backup.kind} variant="outline">
                <ItemContent>
                  <ItemTitle>{KIND_LABEL[backup.kind]}</ItemTitle>
                  <ItemDescription>
                    {KIND_DESCRIPTION[backup.kind]}
                    {backup.modified_at && (
                      <> &middot; {formatDate(backup.modified_at)}</>
                    )}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <DialogClose
                    render={
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={restoreMutation.isPending}
                        onClick={() => restoreMutation.mutate(backup.kind)}
                      >
                        <IconRotate className="size-3.5" />
                        Restore
                      </Button>
                    }
                  />
                </ItemActions>
              </Item>
            ))}
          </ItemGroup>
        )}

        <DialogFooter>
          <DialogClose render={<Button variant="outline" size="sm">Close</Button>} />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
