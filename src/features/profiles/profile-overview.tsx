import { useTransition } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { useProfileDetail } from "@/hooks/use-profiles";
import { Button } from "@/components/cupertino/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/cupertino/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/cupertino/tabs";
import { Badge } from "@/components/ui/badge";
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
  IconDeviceFloppy,
  IconArchive,
  IconCopy,
  IconTrash,
  IconPuzzle,
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
import { ButtonGroup } from "@/components/ui/button-group";
import { deleteProfile, backupProfile } from "@/lib/tauri-commands";
import { revealInFinder, openModLink } from "@/lib/opener";
import type { ProfileSummary, GameInstallation } from "@/lib/types";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";

interface ProfileOverviewProps {
  profile: ProfileSummary;
  installation: GameInstallation;
  onProfileDeleted: () => void;
}

function formatDistance(
  distance: number | null | undefined,
  mapPath: string | null | undefined,
): string {
  if (distance == null) return "—";
  const isUSA = mapPath?.includes("usa");
  const unit = isUSA ? "mi" : "km";
  return `${distance.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${unit}`;
}

function formatBrand(brand: string | undefined): string {
  if (!brand) return "—";
  return brand.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatTimestamp(ts: number | undefined): string {
  if (ts == null) return "—";
  return format(new Date(ts * 1000), "PPp");
}

function SectionHeader({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h3
      className={`text-xs font-medium uppercase tracking-wider text-muted-foreground ${className ?? ""}`}
    >
      {children}
    </h3>
  );
}

function StatRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Item variant="outline">
      <ItemContent>
        <ItemTitle>{label}</ItemTitle>
      </ItemContent>
      <ItemActions>
        <span className="text-sm font-medium">{value ?? "—"}</span>
      </ItemActions>
    </Item>
  );
}

export function ProfileOverview({
  profile,
  installation,
  onProfileDeleted,
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
      <div className="space-y-5 p-5">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-40 w-full rounded-lg" />
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    );
  }

  if (!detail) return null;

  const modCount = detail.active_mods?.length ?? 0;

  return (
    <ScrollArea className="h-full">
      <div className="space-y-5 p-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-baseline gap-2">
            <h2 className="text-sm font-semibold">{detail.name}</h2>
            {detail.company_name && (
              <span className="text-xs text-muted-foreground">
                {detail.company_name}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <ButtonGroup>
              <Button variant="outline" size="sm" render={<Link to="/clone" />}>
                <IconCopy className="size-3.5" />
                Clone
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleBackup}
                disabled={isPending}
              >
                <IconArchive className="size-3.5" />
                Backup
              </Button>
            </ButtonGroup>
            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                  />
                }
              >
                <IconTrash className="size-3.5" />
                Delete
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Profile</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete &quot;{detail.name}&quot;?
                    This will permanently remove the profile and all its saves.
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

        {/* Profile Stats */}
        <div className="space-y-2">
          <SectionHeader>Profile Stats</SectionHeader>
          <ItemGroup>
            {detail.money != null && (
              <StatRow
                label="Money"
                value={`$${detail.money.toLocaleString()}`}
              />
            )}
            {(detail.cached_experience ?? detail.experience_points) != null && (
              <StatRow
                label="Experience"
                value={(
                  detail.cached_experience ?? detail.experience_points
                )?.toLocaleString()}
              />
            )}
            <StatRow label="Saves" value={detail.save_count} />
            {detail.cached_distance != null && (
              <StatRow
                label="Distance"
                value={formatDistance(
                  detail.cached_distance,
                  detail.map_path,
                )}
              />
            )}
          </ItemGroup>
        </div>

        {/* Vehicle & Map Info */}
        <div className="space-y-2">
          <SectionHeader>Vehicle & Map</SectionHeader>
          <ItemGroup>
            {detail.brand && (
              <StatRow label="Truck Brand" value={formatBrand(detail.brand)} />
            )}
            {detail.map_path && (
              <StatRow
                label="Map"
                value={detail.map_path.includes("usa") ? "USA" : "Europe"}
              />
            )}
            {detail.version != null && (
              <StatRow label="Profile Version" value={`v${detail.version}`} />
            )}
            {detail.last_modified && (
              <StatRow label="Last Modified" value={detail.last_modified} />
            )}
          </ItemGroup>
        </div>

        {/* Profile Details */}
        <div className="space-y-2">
          <SectionHeader>Profile Details</SectionHeader>
          <ItemGroup>
            {detail.male != null && (
              <StatRow
                label="Gender"
                value={detail.male ? "Male" : "Female"}
              />
            )}
            {detail.online_user_name && (
              <StatRow
                label="World of Trucks"
                value={detail.online_user_name}
              />
            )}
            {detail.creation_time != null && (
              <StatRow
                label="Created"
                value={formatTimestamp(detail.creation_time)}
              />
            )}
            {modCount > 0 && (
              <StatRow
                label="Active Mods"
                value={`${modCount} mod${modCount !== 1 ? "s" : ""}`}
              />
            )}
          </ItemGroup>
        </div>

        {/* Tabs: Recent Saves, Mods, Raw */}
        <Tabs defaultValue="recent-saves">
          <TabsList>
            <TabsTrigger value="recent-saves">Recent Saves</TabsTrigger>
            {modCount > 0 && (
              <TabsTrigger value="mods">
                Mods
                <Badge variant="secondary" className="ml-1.5">
                  {modCount}
                </Badge>
              </TabsTrigger>
            )}
            <TabsTrigger value="raw">Raw Profile Data</TabsTrigger>
          </TabsList>

          <TabsContent value="recent-saves" className="mt-4">
            {detail.saves.length > 0 ? (
              <ItemGroup>
                {detail.saves.slice(0, 9).map((save) => (
                  <Item
                    key={save.path}
                    variant="outline"
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => revealInFinder(save.path)}
                  >
                    <ItemMedia variant="icon">
                      <IconDeviceFloppy className="size-4 text-muted-foreground" />
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle>{save.name}</ItemTitle>
                      {save.last_modified && (
                        <ItemDescription>{save.last_modified}</ItemDescription>
                      )}
                    </ItemContent>
                  </Item>
                ))}
              </ItemGroup>
            ) : (
              <p className="py-6 text-center text-xs text-muted-foreground">
                No saves found for this profile
              </p>
            )}
            {detail.saves.length > 9 && (
              <Button
                variant="link"
                className="mt-3"
                render={<Link to="/saves" />}
              >
                View all {detail.saves.length} saves
              </Button>
            )}
          </TabsContent>

          {modCount > 0 && (
            <TabsContent value="mods" className="mt-4">
              <ItemGroup>
                {detail.active_mods?.map((mod) => (
                  <Item
                    key={mod.id}
                    variant="outline"
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => openModLink(mod.id, installation.base_path)}
                  >
                    <ItemMedia variant="icon">
                      <IconPuzzle className="size-4 text-muted-foreground" />
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle>{mod.display_name}</ItemTitle>
                      <ItemDescription>{mod.id}</ItemDescription>
                    </ItemContent>
                  </Item>
                ))}
              </ItemGroup>
            </TabsContent>
          )}

          <TabsContent value="raw" className="mt-4">
            {detail.raw_profile_text ? (
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg border bg-muted/30 p-4 font-mono text-xs">
                {detail.raw_profile_text.slice(0, 5000)}
                {detail.raw_profile_text.length > 5000 && "\n\n... truncated"}
              </pre>
            ) : (
              <p className="py-6 text-center text-xs text-muted-foreground">
                Could not decode profile data
              </p>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </ScrollArea>
  );
}
