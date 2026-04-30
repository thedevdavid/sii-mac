import { queryKeys } from "@/lib/query-keys";
import { formatError } from "@/lib/format-error";
import React, { useTransition } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { useProfileDetail } from "@/hooks/use-profiles";
import { Button } from "@/components/cupertino/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/cupertino/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Item,
  ItemGroup,
  ItemMedia,
  ItemContent,
  ItemTitle,
  ItemDescription,
  ItemActions,
  ItemSeparator,
} from "@/components/ui/item";
import {
  IconDeviceFloppy,
  IconArchive,
  IconCopy,
  IconTrash,
  IconPuzzle,
  IconCloud,
  IconWorld,
  IconTruck,
  IconPencil,
  IconFolderOpen,
  IconMap,
  IconClock,
  IconTag,
  IconChevronRight,
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
import { revealInFinder } from "@/lib/opener";
import { useProgressStream } from "@/hooks/use-progress-stream";
import { ProgressOverlay } from "@/components/progress-overlay";
import { getBrandColor, getBrandDisplayName } from "@/lib/truck-brands";
import { calculateLevel } from "@/lib/level-calc";
import { getSaveType } from "@/lib/save-utils";
import { gameShortName, type GameInstallation } from "@/lib/core-types";
import type { ProfileSummary } from "@/features/profiles/types";
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
  return `${distance.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${isUSA ? "mi" : "km"}`;
}

function formatTimestamp(ts: string | null | undefined): string {
  if (ts == null) return "—";
  return format(new Date(ts), "PPp");
}

function StatRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-medium">{value ?? "—"}</span>
    </div>
  );
}

function StatChip({ icon, value, label }: { icon: React.ReactNode; value: React.ReactNode; label?: string }) {
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      {icon}
      <span className="font-medium text-foreground">{value}</span>
      {label && <span>{label}</span>}
    </span>
  );
}

const AVATAR_HUES = [210, 340, 160, 30, 270, 190, 50, 300];
function avatarColor(face: number | null | undefined): string {
  return `hsl(${AVATAR_HUES[(face ?? 0) % AVATAR_HUES.length]}, 55%, 45%)`;
}

export function ProfileOverview({ profile, installation, onProfileDeleted }: ProfileOverviewProps) {
  const { data: detail, isLoading } = useProfileDetail(profile.path);
  const queryClient = useQueryClient();
  const [isPending, startTransition] = useTransition();
  const progressStream = useProgressStream();

  function handleBackup() {
    const { jobId, channel } = progressStream.begin();
    startTransition(async () => {
      try {
        await backupProfile(profile.path, undefined, jobId, channel);
      } catch (err) {
        if (progressStream.getStatus() === "idle") {
          toast.error(`Backup failed: ${formatError(err)}`);
        }
      }
    });
  }

  function handleDelete() {
    startTransition(async () => {
      try {
        await deleteProfile(profile.path);
        toast.success(`Profile "${profile.name}" deleted`);
        await queryClient.invalidateQueries({ queryKey: queryKeys.profiles.list(installation.profiles_path) });
        onProfileDeleted();
      } catch (err) {
        toast.error(`Delete failed: ${formatError(err)}`);
      }
    });
  }

  if (isLoading) {
    return (
      <div className="space-y-5 p-5">
        <Skeleton className="h-16 w-full rounded-lg" />
        <div className="grid gap-5 lg:grid-cols-2"><Skeleton className="h-60 rounded-lg" /><Skeleton className="h-60 rounded-lg" /></div>
      </div>
    );
  }

  if (!detail) return null;

  const modCount = detail.active_mods?.length ?? 0;
  const xp = detail.cached_experience ?? detail.experience_points ?? 0;
  const levelInfo = calculateLevel(xp, installation.game);
  const isUSA = detail.map_path?.includes("usa");
  const currencySymbol = isUSA ? "$" : "€";
  const mostRecentSave = detail.saves[0];

  return (
    <ScrollArea className="h-full">
      <ProgressOverlay
        progress={progressStream.progress}
        onCancel={() => progressStream.cancel()}
        onDismiss={() => progressStream.reset()}
      />
      <div className="space-y-4 p-5">
        {/* HEADER */}
        <div className="flex items-center gap-3 rounded-lg border p-3">
          <Avatar size="lg">
            <AvatarFallback style={{ backgroundColor: avatarColor(detail.face) }} className="text-sm font-semibold text-white">
              {detail.name.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold">{detail.name}</span>
              {profile.is_steam_cloud && <Badge variant="secondary" className="shrink-0 gap-0.5"><IconCloud className="size-3" />Cloud</Badge>}
              <Badge variant="outline" className="shrink-0">{gameShortName(installation.game)}</Badge>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {detail.company_name && <span>{detail.company_name}</span>}
              {detail.online_user_name && <span className="flex items-center gap-0.5"><IconWorld className="size-3" />{detail.online_user_name}</span>}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button variant="outline" size="sm" render={<Link to="/clone" />}><IconCopy className="size-3.5" />Clone</Button>
            <Button variant="outline" size="sm" onClick={handleBackup} disabled={isPending}><IconArchive className="size-3.5" />Backup</Button>
            <AlertDialog>
              <AlertDialogTrigger render={<Button variant="outline" size="sm" className="text-destructive hover:bg-destructive/10" />}>
                <IconTrash className="size-3.5" />
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader><AlertDialogTitle>Delete Profile</AlertDialogTitle><AlertDialogDescription>Permanently delete &quot;{detail.name}&quot; and all saves?</AlertDialogDescription></AlertDialogHeader>
                <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={handleDelete}>Delete</AlertDialogAction></AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        {/* QUICK STATS */}
        <div className="flex flex-wrap items-center gap-4 text-muted-foreground">
          <StatChip icon={<IconDeviceFloppy className="size-3" />} value={detail.save_count} label="saves" />
          {modCount > 0 && <StatChip icon={<IconPuzzle className="size-3" />} value={modCount} label="mods" />}
          {detail.creation_time != null && <StatChip icon={<IconClock className="size-3" />} value={formatTimestamp(detail.creation_time)} />}
          {detail.version != null && <StatChip icon={<IconTag className="size-3" />} value={`v${detail.version}`} />}
        </div>

        {/* TWO COLUMNS */}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
          {/* LEFT */}
          <div className="space-y-4">
            {/* Player & Progression */}
            <div className="rounded-lg border p-3">
              <h3 className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Player & Progression</h3>
              <div className="divide-y">
                {detail.money != null && <StatRow label="Money" value={`${currencySymbol}${detail.money.toLocaleString()}`} />}
                {xp > 0 && (
                  <>
                    <StatRow label="Experience" value={xp.toLocaleString()} />
                    <div className="py-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Level</span>
                        <span className="font-medium">{levelInfo.level} <span className="text-muted-foreground">({levelInfo.xpIntoLevel.toLocaleString()}/{levelInfo.xpNeededForNext.toLocaleString()})</span></span>
                      </div>
                      <Progress value={Math.round(levelInfo.progress * 100)} className="mt-1 h-1.5" />
                    </div>
                  </>
                )}
                {detail.cached_distance != null && <StatRow label="Distance" value={formatDistance(detail.cached_distance, detail.map_path)} />}
                {detail.male != null && <StatRow label="Gender" value={detail.male ? "Male" : "Female"} />}
              </div>
            </div>

            {/* Current Vehicle */}
            <div className="rounded-lg border p-3">
              <h3 className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Current Vehicle</h3>
              {detail.brand ? (
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-lg" style={{ backgroundColor: getBrandColor(detail.brand) + "20" }}>
                    <IconTruck className="size-5" style={{ color: getBrandColor(detail.brand) }} />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{getBrandDisplayName(detail.brand)}</p>
                    {detail.map_path && <p className="flex items-center gap-1 text-xs text-muted-foreground"><IconMap className="size-3" />{isUSA ? "USA" : "Europe"}</p>}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No vehicle data available</p>
              )}
            </div>

            {/* Mods summary — links to /mods */}
            {modCount > 0 && (
              <Link to="/mods" className="block">
                <div className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-muted/50">
                  <div className="flex items-center gap-2">
                    <IconPuzzle className="size-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs font-medium">{modCount} Active Mods</p>
                      <p className="text-[10px] text-muted-foreground">
                        {detail.active_mods?.slice(0, 3).map((m) => m.display_name).join(", ")}
                        {modCount > 3 && ` +${modCount - 3} more`}
                      </p>
                    </div>
                  </div>
                  <IconChevronRight className="size-4 text-muted-foreground" />
                </div>
              </Link>
            )}
          </div>

          {/* RIGHT — Recent Saves */}
          <div className="rounded-lg border p-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Recent Saves</h3>
              {detail.saves.length > 6 && (
                <Button variant="link" size="sm" className="h-auto p-0 text-[10px]" render={<Link to="/saves" />}>
                  View all {detail.saves.length}
                </Button>
              )}
            </div>
            {detail.saves.length > 0 ? (
              <ItemGroup className="gap-0">
                {detail.saves.slice(0, 6).map((save, i) => (
                  <React.Fragment key={save.path}>
                    {i > 0 && <ItemSeparator className="my-0" />}
                    <Item
                      size="xs"
                      render={<Link to="/editor/$saveId" params={{ saveId: save.directory_name }} />}
                    >
                      <ItemMedia variant="icon">
                        <IconDeviceFloppy className="size-3.5 text-muted-foreground" />
                      </ItemMedia>
                      <ItemContent>
                        <ItemTitle>{save.name}</ItemTitle>
                        {save.last_modified && <ItemDescription>{save.last_modified}</ItemDescription>}
                      </ItemContent>
                      <ItemActions>
                        <Badge variant="secondary" className="text-[10px]">{getSaveType(save.directory_name)}</Badge>
                        <IconChevronRight className="size-3.5 text-muted-foreground" />
                      </ItemActions>
                    </Item>
                  </React.Fragment>
                ))}
              </ItemGroup>
            ) : (
              <p className="py-6 text-center text-xs text-muted-foreground">No saves found</p>
            )}
          </div>
        </div>

        {/* QUICK ACTIONS */}
        <div className="flex items-center gap-2">
          {mostRecentSave && (
            <Button variant="outline" size="sm" render={<Link to="/editor/$saveId" params={{ saveId: mostRecentSave.directory_name }} />}>
              <IconPencil className="size-3.5" />Edit Latest Save
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => revealInFinder(profile.path)}>
            <IconFolderOpen className="size-3.5" />Open in Finder
          </Button>
        </div>
      </div>
    </ScrollArea>
  );
}
