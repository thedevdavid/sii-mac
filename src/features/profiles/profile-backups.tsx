import { useTransition } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
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
} from "@/components/ui/alert-dialog";
import {
  Archive,
  RotateCcw,
  Plus,
  Clock,
  Loader2,
} from "lucide-react";
import {
  listBackups,
  backupProfile,
  restoreBackup,
} from "@/lib/tauri-commands";
import type { ProfileSummary, GameInstallation } from "@/lib/types";

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

  const { data: backups, isLoading } = useQuery({
    queryKey: ["backups"],
    queryFn: () => listBackups(),
  });

  // Filter backups to this profile
  const profileBackups = backups?.filter(
    (b) => b.profile_name === profile.name,
  );
  const otherBackups = backups?.filter(
    (b) => b.profile_name !== profile.name,
  );

  function handleCreateBackup() {
    startTransition(async () => {
      try {
        const path = await backupProfile(profile.path);
        toast.success(`Backup created for "${profile.name}"`, {
          description: path,
        });
        await queryClient.invalidateQueries({ queryKey: ["backups"] });
      } catch (err) {
        toast.error(`Backup failed: ${(err as Error).message ?? err}`);
      }
    });
  }

  function handleRestore(backupPath: string, backupName: string) {
    startTransition(async () => {
      try {
        await restoreBackup(backupPath, installation.profiles_path);
        toast.success(`Backup "${backupName}" restored`, {
          description:
            "The profile has been restored. Switch to it using the profile selector.",
        });
        await queryClient.invalidateQueries({
          queryKey: ["profiles", installation.profiles_path],
        });
        await queryClient.invalidateQueries({ queryKey: ["backups"] });
      } catch (err) {
        toast.error(`Restore failed: ${(err as Error).message ?? err}`);
      }
    });
  }

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="mx-auto max-w-2xl space-y-6 p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold">Backups</h2>
            <p className="text-muted-foreground">
              Create and restore profile backups for{" "}
              <strong>{profile.name}</strong>.
            </p>
          </div>
          <Button onClick={handleCreateBackup} disabled={isPending}>
            {isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Plus className="mr-2 size-4" />
            )}
            Create Backup
          </Button>
        </div>

        {/* Current profile backups */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">
            Backups for this profile
          </h3>
          {profileBackups && profileBackups.length > 0 ? (
            profileBackups.map((backup) => (
              <Card key={backup.path}>
                <CardContent className="flex items-center justify-between pt-6">
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-md bg-muted">
                      <Archive className="size-5" />
                    </div>
                    <div>
                      <p className="font-medium">{backup.profile_name}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock className="size-3" />
                        {formatDate(backup.created_at)}
                      </div>
                    </div>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger render={() => (<Button
                        variant="outline"
                        size="sm"
                        disabled={isPending}
                      >
                        <RotateCcw className="mr-1.5 size-3.5" />
                        Restore
                      </Button>)} />
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Restore Backup</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will create a new profile from this backup. If a
                          profile with the same name already exists, the restore
                          will fail. You can rename or delete the existing
                          profile first.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() =>
                            handleRestore(backup.path, backup.profile_name)
                          }
                        >
                          Restore
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 py-8">
                <Archive className="size-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  No backups yet. Create one to protect your progress.
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Other profile backups */}
        {otherBackups && otherBackups.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">
              Other profile backups
            </h3>
            {otherBackups.map((backup) => (
              <Card key={backup.path} className="opacity-75">
                <CardContent className="flex items-center justify-between pt-6">
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-md bg-muted">
                      <Archive className="size-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{backup.profile_name}</p>
                        <Badge variant="outline" className="text-xs">
                          Other profile
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock className="size-3" />
                        {formatDate(backup.created_at)}
                      </div>
                    </div>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger render={() => (<Button
                        variant="outline"
                        size="sm"
                        disabled={isPending}
                      >
                        <RotateCcw className="mr-1.5 size-3.5" />
                        Restore
                      </Button>)} />
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Restore Backup</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will create a new profile named "
                          {backup.profile_name}" from this backup. If that
                          profile already exists, the restore will fail.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() =>
                            handleRestore(backup.path, backup.profile_name)
                          }
                        >
                          Restore
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </ScrollArea>
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
