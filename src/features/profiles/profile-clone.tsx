import React, { useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cloneProfile } from "@/lib/tauri-commands";
import type { ProfileSummary, GameInstallation, CloneOptions } from "@/lib/types";
import { Copy, Loader2, Save, Settings2, Image, CheckCheck } from "lucide-react";

interface ProfileCloneProps {
  profile: ProfileSummary;
  installation: GameInstallation;
}

export function ProfileClone({ profile, installation }: ProfileCloneProps) {
  const { data: detail, isLoading } = useProfileDetail(profile.path);
  const queryClient = useQueryClient();
  const [isPending, startTransition] = useTransition();

  const [includeSaves, setIncludeSaves] = React.useState(true);
  const [includeConfig, setIncludeConfig] = React.useState(true);
  const [includeScreenshots, setIncludeScreenshots] = React.useState(true);
  const [selectAllSaves, setSelectAllSaves] = React.useState(true);
  const [selectedSaves, setSelectedSaves] = React.useState<Set<string>>(
    new Set(),
  );

  // When detail loads, select all saves by default
  const saves = detail?.saves ?? [];

  function toggleSave(dirName: string) {
    setSelectedSaves((prev) => {
      const next = new Set(prev);
      if (next.has(dirName)) {
        next.delete(dirName);
      } else {
        next.add(dirName);
      }
      return next;
    });
    setSelectAllSaves(false);
  }

  function handleSelectAll(checked: boolean) {
    setSelectAllSaves(checked);
    if (checked) {
      setSelectedSaves(new Set());
    }
  }

  const effectiveSaveCount = includeSaves
    ? selectAllSaves
      ? saves.length
      : selectedSaves.size
    : 0;

  function handleSubmit(formData: FormData) {
    const newName = formData.get("newName") as string;
    if (!newName?.trim()) return;

    const options: CloneOptions = {
      include_saves: includeSaves,
      include_config: includeConfig,
      include_screenshots: includeScreenshots,
      selected_saves: includeSaves && !selectAllSaves
        ? Array.from(selectedSaves)
        : [],
    };

    startTransition(async () => {
      try {
        await cloneProfile(profile.path, newName.trim(), options);
        await queryClient.invalidateQueries({
          queryKey: ["profiles", installation.profiles_path],
        });
        toast.success(`Profile "${newName.trim()}" created`, {
          description: `Cloned from "${profile.name}" with ${effectiveSaveCount} saves. Switch to it using the profile selector.`,
        });
      } catch (err) {
        toast.error(`Clone failed: ${(err as Error).message ?? err}`);
      }
    });
  }

  if (isLoading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 max-w-2xl" />
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="mx-auto max-w-2xl space-y-6 p-6">
        <div>
          <h2 className="text-2xl font-bold">Clone Profile</h2>
          <p className="text-muted-foreground">
            Create a copy of <strong>{profile.name}</strong>. Choose what to
            include in the new profile.
          </p>
        </div>

        <form action={handleSubmit} className="space-y-6">
          {/* Name */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Profile Name</CardTitle>
            </CardHeader>
            <CardContent>
              <Input
                name="newName"
                defaultValue={`${profile.name} (Copy)`}
                maxLength={64}
                disabled={isPending}
                autoFocus
                className="max-w-sm"
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                The game will show this name in the profile selection screen.
              </p>
            </CardContent>
          </Card>

          {/* What to include */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">What to include</CardTitle>
              <CardDescription>
                Toggle what gets copied to the new profile.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Saves toggle */}
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-md bg-muted">
                    <Save className="size-4" />
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Save Games</Label>
                    <p className="text-xs text-muted-foreground">
                      {saves.length} saves in this profile
                    </p>
                  </div>
                </div>
                <Switch
                  checked={includeSaves}
                  onCheckedChange={setIncludeSaves}
                  disabled={isPending}
                />
              </div>

              {/* Config toggle */}
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-md bg-muted">
                    <Settings2 className="size-4" />
                  </div>
                  <div>
                    <Label className="text-sm font-medium">
                      Configuration
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Game settings, controls, graphics options
                    </p>
                  </div>
                </div>
                <Switch
                  checked={includeConfig}
                  onCheckedChange={setIncludeConfig}
                  disabled={isPending}
                />
              </div>

              {/* Screenshots toggle */}
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-md bg-muted">
                    <Image className="size-4" />
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Screenshots</Label>
                    <p className="text-xs text-muted-foreground">
                      In-game screenshots and thumbnails
                    </p>
                  </div>
                </div>
                <Switch
                  checked={includeScreenshots}
                  onCheckedChange={setIncludeScreenshots}
                  disabled={isPending}
                />
              </div>
            </CardContent>
          </Card>

          {/* Save selection */}
          {includeSaves && saves.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Select Saves</CardTitle>
                    <CardDescription>
                      {selectAllSaves
                        ? `All ${saves.length} saves will be cloned`
                        : `${selectedSaves.size} of ${saves.length} saves selected`}
                    </CardDescription>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleSelectAll(!selectAllSaves)}
                  >
                    <CheckCheck className="mr-1.5 size-3.5" />
                    {selectAllSaves ? "Select individually" : "Select all"}
                  </Button>
                </div>
              </CardHeader>
              {!selectAllSaves && (
                <CardContent>
                  <ScrollArea className="max-h-64">
                    <div className="space-y-1">
                      {saves.map((save) => (
                        <label
                          key={save.directory_name}
                          className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 hover:bg-muted"
                        >
                          <Checkbox
                            checked={selectedSaves.has(save.directory_name)}
                            onCheckedChange={() =>
                              toggleSave(save.directory_name)
                            }
                            disabled={isPending}
                          />
                          <div className="min-w-0 flex-1">
                            <span className="truncate text-sm font-medium">
                              {save.name}
                            </span>
                            {save.last_modified && (
                              <span className="ml-2 text-xs text-muted-foreground">
                                {save.last_modified}
                              </span>
                            )}
                          </div>
                        </label>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              )}
            </Card>
          )}

          {/* Summary + submit */}
          <Card>
            <CardContent className="flex items-center justify-between pt-6">
              <div className="flex flex-wrap gap-2">
                {includeSaves && (
                  <Badge variant="secondary">
                    {effectiveSaveCount} saves
                  </Badge>
                )}
                {includeConfig && (
                  <Badge variant="secondary">Config</Badge>
                )}
                {includeScreenshots && (
                  <Badge variant="secondary">Screenshots</Badge>
                )}
                {!includeSaves && !includeConfig && !includeScreenshots && (
                  <Badge variant="outline">Profile data only</Badge>
                )}
              </div>
              <Button type="submit" disabled={isPending} size="lg">
                {isPending ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <Copy className="mr-2 size-4" />
                )}
                Clone Profile
              </Button>
            </CardContent>
          </Card>
        </form>
      </div>
    </ScrollArea>
  );
}
