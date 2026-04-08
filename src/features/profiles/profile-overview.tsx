import { useTransition } from "react";
import { toast } from "sonner";
import { useProfileDetail } from "@/hooks/use-profiles";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DollarSign,
  Star,
  HardDrive,
  Clock,
  Save,
  Archive,
  Copy,
  Trash2,
} from "lucide-react";
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
import { deleteProfile, backupProfile } from "@/lib/tauri-commands";
import type { ProfileSummary, GameInstallation } from "@/lib/types";
import type { View } from "@/components/app-sidebar";
import { useQueryClient } from "@tanstack/react-query";

interface ProfileOverviewProps {
  profile: ProfileSummary;
  installation: GameInstallation;
  onProfileDeleted: () => void;
  onNavigate: (view: View) => void;
}

export function ProfileOverview({
  profile,
  installation,
  onProfileDeleted,
  onNavigate,
}: ProfileOverviewProps) {
  const { data: detail, isLoading } = useProfileDetail(profile.path);
  const queryClient = useQueryClient();
  const [isPending, startTransition] = useTransition();

  function handleBackup() {
    startTransition(async () => {
      try {
        const path = await backupProfile(profile.path);
        toast.success(`Backup created for "${profile.name}"`, {
          description: path,
        });
      } catch (err) {
        toast.error(`Backup failed: ${(err as Error).message ?? err}`);
      }
    });
  }

  function handleDelete() {
    startTransition(async () => {
      try {
        await deleteProfile(profile.path);
        toast.success(`Profile "${profile.name}" deleted`);
        await queryClient.invalidateQueries({
          queryKey: ["profiles", installation.profiles_path],
        });
        onProfileDeleted();
      } catch (err) {
        toast.error(`Delete failed: ${(err as Error).message ?? err}`);
      }
    });
  }

  if (isLoading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      </div>
    );
  }

  if (!detail) return null;

  return (
    <ScrollArea className="h-full">
      <div className="space-y-6 p-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold">{detail.name}</h2>
            {detail.company_name && (
              <p className="text-muted-foreground">{detail.company_name}</p>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => onNavigate("clone")}
            >
              <Copy className="mr-2 size-4" />
              Clone
            </Button>
            <Button
              variant="outline"
              onClick={handleBackup}
              disabled={isPending}
            >
              <Archive className="mr-2 size-4" />
              Backup
            </Button>
            <AlertDialog>
                <AlertDialogTrigger render={() => (<Button
                    variant="outline"
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="mr-2 size-4" />
                    Delete
                  </Button>)} />
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Profile</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete "{detail.name}"? This will
                    permanently remove the profile and all its saves. This
                    cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" onClick={handleDelete}>
                    Delete Profile
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        {/* Stats cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {detail.money != null && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardDescription>Money</CardDescription>
                <DollarSign className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  ${detail.money.toLocaleString()}
                </p>
              </CardContent>
            </Card>
          )}
          {detail.experience_points != null && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardDescription>Experience</CardDescription>
                <Star className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  {detail.experience_points.toLocaleString()}
                </p>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardDescription>Saves</CardDescription>
              <HardDrive className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{detail.save_count}</p>
            </CardContent>
          </Card>
          {detail.last_modified && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardDescription>Last Modified</CardDescription>
                <Clock className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  {detail.last_modified.split(" ")[0]}
                </p>
                <p className="text-xs text-muted-foreground">
                  {detail.last_modified.split(" ")[1]}
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Recent saves + Raw data tabs */}
        <Tabs defaultValue="recent-saves">
          <TabsList>
            <TabsTrigger value="recent-saves">Recent Saves</TabsTrigger>
            <TabsTrigger value="raw">Raw Profile Data</TabsTrigger>
          </TabsList>
          <TabsContent value="recent-saves" className="mt-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {detail.saves.slice(0, 9).map((save) => (
                <Card key={save.path}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <Save className="size-4 shrink-0 text-muted-foreground" />
                      <CardTitle className="truncate text-sm">
                        {save.name}
                      </CardTitle>
                    </div>
                  </CardHeader>
                  {save.last_modified && (
                    <CardContent>
                      <p className="text-xs text-muted-foreground">
                        {save.last_modified}
                      </p>
                    </CardContent>
                  )}
                </Card>
              ))}
            </div>
            {detail.saves.length > 9 && (
              <Button
                variant="link"
                className="mt-3"
                onClick={() => onNavigate("saves")}
              >
                View all {detail.saves.length} saves
              </Button>
            )}
            {detail.saves.length === 0 && (
              <p className="py-8 text-center text-muted-foreground">
                No saves found for this profile
              </p>
            )}
          </TabsContent>
          <TabsContent value="raw" className="mt-4">
            <Card>
              <CardContent className="pt-6">
                {detail.raw_profile_text ? (
                  <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-4 font-mono text-xs">
                    {detail.raw_profile_text.slice(0, 5000)}
                    {detail.raw_profile_text.length > 5000 &&
                      "\n\n... truncated"}
                  </pre>
                ) : (
                  <p className="py-8 text-center text-muted-foreground">
                    Could not decode profile data
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </ScrollArea>
  );
}
