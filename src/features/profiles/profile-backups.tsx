import { queryKeys } from "@/lib/query-keys";
import { formatError } from "@/lib/format-error";
import { useTransition } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/cupertino/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/cupertino/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/cupertino/empty";
import {
  Item,
  ItemGroup,
  ItemMedia,
  ItemContent,
  ItemTitle,
  ItemDescription,
  ItemActions,
} from "@/components/ui/item";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/cupertino/alert-dialog";
import {
  IconArchive,
  IconRotate,
  IconPlus,
  IconLoader2,
  IconFolderOpen,
  IconTrash,
} from "@tabler/icons-react";
import {
  listBackups,
  backupProfile,
  restoreBackup,
  deleteBackup,
  cleanupBackups,
} from "@/lib/tauri-commands";
import { getBackupRetention } from "@/hooks/use-backup-retention";
import { revealInFinder } from "@/lib/opener";
import { useProgressStream } from "@/hooks/use-progress-stream";
import { ProgressOverlay } from "@/components/progress-overlay";
import type { BackupPath, GameInstallation } from "@/lib/core-types";
import type { ProfileSummary } from "@/features/profiles/types";

interface ProfileBackupsProps {
  profile: ProfileSummary;
  installation: GameInstallation;
}

export function ProfileBackups({
  profile,
  installation,
}: ProfileBackupsProps) {
  const queryClient = useQueryClient();
  const [isPending, startTransition] = useTransition();
  const progressStream = useProgressStream();

  const { data: backups, isLoading } = useQuery({
    queryKey: queryKeys.backups.all(),
    queryFn: () => listBackups(),
  });

  const profileBackups = backups?.filter(
    (b) => b.profile_name === profile.name,
  );
  const otherBackups = backups?.filter(
    (b) => b.profile_name !== profile.name,
  );

  function handleCreateBackup() {
    const { jobId, channel } = progressStream.begin();
    startTransition(async () => {
      try {
        await backupProfile(profile.path, undefined, jobId, channel);
        const keep = getBackupRetention();
        if (keep > 0) {
          try {
            const removed = await cleanupBackups(keep);
            if (removed > 0) {
              toast.info(
                `Removed ${removed} older backup${removed === 1 ? "" : "s"} (keeping ${keep} per profile)`,
              );
            }
          } catch (err) {
            toast.error(`Auto-cleanup failed: ${formatError(err)}`);
          }
        }
        await queryClient.invalidateQueries({ queryKey: queryKeys.backups.all() });
      } catch (err) {
        if (progressStream.getStatus() === "idle") {
          toast.error(`Backup failed: ${formatError(err)}`);
        }
      }
    });
  }

  function handleDelete(backupPath: BackupPath, backupName: string) {
    startTransition(async () => {
      try {
        await deleteBackup(backupPath);
        toast.success(`Backup "${backupName}" deleted`);
        await queryClient.invalidateQueries({ queryKey: queryKeys.backups.all() });
      } catch (err) {
        toast.error(`Delete failed: ${formatError(err)}`);
      }
    });
  }

  function handleRestore(
    backupPath: BackupPath,
    backupName: string,
    overwrite: boolean,
  ) {
    const { jobId, channel } = progressStream.begin();
    startTransition(async () => {
      try {
        await restoreBackup(
          backupPath,
          installation.profiles_path,
          overwrite,
          jobId,
          channel,
        );
        toast.success(
          overwrite
            ? `Profile "${backupName}" restored from backup`
            : `Backup "${backupName}" restored as a new profile`,
        );
        await queryClient.invalidateQueries({
          queryKey: queryKeys.profiles.list(installation.profiles_path),
        });
        await queryClient.invalidateQueries({ queryKey: queryKeys.backups.all() });
      } catch (err) {
        if (progressStream.getStatus() === "idle") {
          toast.error(`Restore failed: ${formatError(err)}`);
        }
      }
    });
  }

  if (isLoading) {
    return (
      <div className="space-y-4 p-5">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <ProgressOverlay
        progress={progressStream.progress}
        onCancel={() => progressStream.cancel()}
        onDismiss={() => progressStream.reset()}
      />
      <div className="space-y-5 p-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Backups</h2>
          <Button size="sm" onClick={handleCreateBackup} disabled={isPending}>
            {isPending ? (
              <IconLoader2 className="size-3.5 animate-spin" />
            ) : (
              <IconPlus className="size-3.5" />
            )}
            Create Backup
          </Button>
        </div>

        {/* Current profile backups */}
        <div className="space-y-2">
          <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Current Profile
          </h3>
          {profileBackups && profileBackups.length > 0 ? (
            <ItemGroup>
              {profileBackups.map((backup) => (
                <Item key={backup.path} variant="outline">
                  <ItemMedia variant="icon">
                    <IconArchive className="size-4 text-muted-foreground" />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>{backup.profile_name}</ItemTitle>
                    <ItemDescription>
                      {formatDate(backup.created_at)}
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => revealInFinder(backup.path)}
                      aria-label="Reveal in Finder"
                    >
                      <IconFolderOpen className="size-3.5" />
                    </Button>
                    <RestoreDialog
                      backupPath={backup.path}
                      backupName={backup.profile_name}
                      isPending={isPending}
                      onRestore={handleRestore}
                    />
                    <DeleteBackupDialog
                      backupPath={backup.path}
                      backupName={backup.profile_name}
                      isPending={isPending}
                      onDelete={handleDelete}
                    />
                  </ItemActions>
                </Item>
              ))}
            </ItemGroup>
          ) : (
            <Empty>
              <EmptyMedia>
                <IconArchive className="size-6 text-muted-foreground" />
              </EmptyMedia>
              <EmptyTitle>No backups yet</EmptyTitle>
              <EmptyDescription>
                Create a backup to protect your progress.
              </EmptyDescription>
            </Empty>
          )}
        </div>

        {/* Other profile backups */}
        {otherBackups && otherBackups.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Other Profiles
            </h3>
            <ItemGroup>
              {otherBackups.map((backup) => (
                <Item key={backup.path} variant="outline" className="opacity-75">
                  <ItemMedia variant="icon">
                    <IconArchive className="size-4 text-muted-foreground" />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>
                      {backup.profile_name}
                      <Badge variant="outline" className="ml-2">
                        Other
                      </Badge>
                    </ItemTitle>
                    <ItemDescription>
                      {formatDate(backup.created_at)}
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => revealInFinder(backup.path)}
                      aria-label="Reveal in Finder"
                    >
                      <IconFolderOpen className="size-3.5" />
                    </Button>
                    <RestoreDialog
                      backupPath={backup.path}
                      backupName={backup.profile_name}
                      isPending={isPending}
                      onRestore={handleRestore}
                    />
                    <DeleteBackupDialog
                      backupPath={backup.path}
                      backupName={backup.profile_name}
                      isPending={isPending}
                      onDelete={handleDelete}
                    />
                  </ItemActions>
                </Item>
              ))}
            </ItemGroup>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

function RestoreDialog({
  backupPath,
  backupName,
  isPending,
  onRestore,
}: {
  backupPath: BackupPath;
  backupName: string;
  isPending: boolean;
  onRestore: (path: BackupPath, name: string, overwrite: boolean) => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={<Button variant="ghost" size="sm" disabled={isPending} />}
      >
        <IconRotate className="size-3.5" />
        Restore
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Restore "{backupName}"?</AlertDialogTitle>
          <AlertDialogDescription>
            This replaces the on-disk profile "{backupName}" with the contents
            of this backup. Your current state for that profile will be moved
            aside as <code>{backupName}.replaced-&lt;timestamp&gt;</code> so you
            can roll back manually if needed.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => onRestore(backupPath, backupName, true)}
          >
            Restore
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DeleteBackupDialog({
  backupPath,
  backupName,
  isPending,
  onDelete,
}: {
  backupPath: BackupPath;
  backupName: string;
  isPending: boolean;
  onDelete: (path: BackupPath, name: string) => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            disabled={isPending}
            aria-label={`Delete backup ${backupName}`}
            className="text-destructive hover:text-destructive"
          />
        }
      >
        <IconTrash className="size-3.5" />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this backup?</AlertDialogTitle>
          <AlertDialogDescription>
            Permanently removes the backup folder for "{backupName}" from
            disk. The on-disk profile is not affected. This can't be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => onDelete(backupPath, backupName)}>
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
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
