import { useTransition } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { useProfileDetail } from "@/hooks/use-profiles";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/cupertino/card";
import { Button } from "@/components/cupertino/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/cupertino/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/cupertino/tabs";
import { Badge } from "@/components/ui/badge";
import {
  IconCurrencyDollar,
  IconStar,
  IconDeviceFloppy,
  IconClock,
  IconArchive,
  IconCopy,
  IconTrash,
  IconRoad,
  IconTruck,
  IconMap,
  IconVersions,
  IconPuzzle,
  IconUser,
  IconWorld,
  IconCalendar,
} from "@tabler/icons-react";
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

function formatDistance(distance: number | null | undefined, mapPath: string | null | undefined): string {
  if (distance == null) return "—";
  const isUSA = mapPath?.includes("usa");
  const unit = isUSA ? "mi" : "km";
  return `${distance.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${unit}`;
}

function formatBrand(brand: string | undefined): string {
  if (!brand) return "—";
  return brand
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatTimestamp(ts: number | undefined): string {
  if (ts == null) return "—";
  return format(new Date(ts * 1000), "PPp");
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

  const modCount = detail.active_mods?.length ?? 0;

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
            <Button variant="outline" onClick={() => onNavigate("clone")}>
              <IconCopy className="mr-2 size-4" />
              Clone
            </Button>
            <Button
              variant="outline"
              onClick={handleBackup}
              disabled={isPending}
            >
              <IconArchive className="mr-2 size-4" />
              Backup
            </Button>
            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <Button
                    variant="outline"
                    className="text-destructive hover:text-destructive"
                  />
                }
              >
                <IconTrash className="mr-2 size-4" />
                Delete
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Profile</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete &quot;{detail.name}&quot;?
                    This will permanently remove the profile and all its saves.
                    This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    onClick={handleDelete}
                  >
                    Delete Profile
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        {/* Primary stat cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {detail.money != null && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardDescription>Money</CardDescription>
                <IconCurrencyDollar className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  ${detail.money.toLocaleString()}
                </p>
              </CardContent>
            </Card>
          )}
          {(detail.cached_experience ?? detail.experience_points) != null && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardDescription>Experience</CardDescription>
                <IconStar className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  {(
                    detail.cached_experience ?? detail.experience_points
                  )?.toLocaleString()}
                </p>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardDescription>Saves</CardDescription>
              <IconDeviceFloppy className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{detail.save_count}</p>
            </CardContent>
          </Card>
          {detail.cached_distance != null && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardDescription>Distance</CardDescription>
                <IconRoad className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  {formatDistance(detail.cached_distance, detail.map_path)}
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Secondary info cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {detail.brand && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardDescription>Truck Brand</CardDescription>
                <IconTruck className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-lg font-semibold">
                  {formatBrand(detail.brand)}
                </p>
              </CardContent>
            </Card>
          )}
          {detail.map_path && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardDescription>Map</CardDescription>
                <IconMap className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-lg font-semibold">
                  {detail.map_path.includes("usa") ? "USA" : "Europe"}
                </p>
              </CardContent>
            </Card>
          )}
          {detail.version != null && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardDescription>Profile Version</CardDescription>
                <IconVersions className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-lg font-semibold">v{detail.version}</p>
              </CardContent>
            </Card>
          )}
          {detail.last_modified && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardDescription>Last Modified</CardDescription>
                <IconClock className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-lg font-semibold">
                  {detail.last_modified.split(" ")[0]}
                </p>
                <p className="text-xs text-muted-foreground">
                  {detail.last_modified.split(" ")[1]}
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Profile info section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Profile Info</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="flex items-center gap-3">
                <IconUser className="size-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Gender</p>
                  <p className="text-sm font-medium">
                    {detail.male != null
                      ? detail.male
                        ? "Male"
                        : "Female"
                      : "—"}
                  </p>
                </div>
              </div>
              {detail.logo && (
                <div className="flex items-center gap-3">
                  <IconStar className="size-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Company Logo
                    </p>
                    <p className="text-sm font-medium">
                      {detail.logo.replace(/_/g, " ")}
                    </p>
                  </div>
                </div>
              )}
              {detail.face != null && (
                <div className="flex items-center gap-3">
                  <IconUser className="size-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Face</p>
                    <p className="text-sm font-medium">#{detail.face}</p>
                  </div>
                </div>
              )}
              {detail.online_user_name && (
                <div className="flex items-center gap-3">
                  <IconWorld className="size-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">
                      World of Trucks
                    </p>
                    <p className="text-sm font-medium">
                      {detail.online_user_name}
                    </p>
                  </div>
                </div>
              )}
              {detail.creation_time != null && (
                <div className="flex items-center gap-3">
                  <IconCalendar className="size-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Created</p>
                    <p className="text-sm font-medium">
                      {formatTimestamp(detail.creation_time)}
                    </p>
                  </div>
                </div>
              )}
              {modCount > 0 && (
                <div className="flex items-center gap-3">
                  <IconPuzzle className="size-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Active Mods</p>
                    <p className="text-sm font-medium">
                      {modCount} mod{modCount !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Tabs: Recent Saves, Mods, Raw */}
        <Tabs defaultValue="recent-saves">
          <TabsList>
            <TabsTrigger value="recent-saves">Recent Saves</TabsTrigger>
            {modCount > 0 && (
              <TabsTrigger value="mods">
                Mods
                <Badge variant="secondary" className="ml-1.5 text-xs">
                  {modCount}
                </Badge>
              </TabsTrigger>
            )}
            <TabsTrigger value="raw">Raw Profile Data</TabsTrigger>
          </TabsList>
          <TabsContent value="recent-saves" className="mt-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {detail.saves.slice(0, 9).map((save) => (
                <Card key={save.path}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <IconDeviceFloppy className="size-4 shrink-0 text-muted-foreground" />
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
          {modCount > 0 && (
            <TabsContent value="mods" className="mt-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {detail.active_mods?.map((mod) => (
                      <div
                        key={mod.id}
                        className="flex items-center gap-2 rounded-md border px-3 py-2"
                      >
                        <IconPuzzle className="size-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {mod.display_name}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {mod.id}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          )}
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
