import { useTransition } from "react";
import { useForm } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useProfileContents, useProfileDetail } from "@/hooks/use-profiles";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/cupertino/card";
import { Button } from "@/components/cupertino/button";
import { Input } from "@/components/cupertino/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/cupertino/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cloneProfile } from "@/lib/tauri-commands";
import type {
  ProfileSummary,
  GameInstallation,
  CloneOptions,
  ProfileContents,
} from "@/lib/types";
import {
  IconCopy,
  IconLoader2,
  IconChevronRight,
  IconLock,
  IconSettings2,
  IconSchool,
  IconDeviceFloppy,
  IconPuzzle,
  IconWorld,
  IconAlertTriangle,
} from "@tabler/icons-react";
import {
  CloneFormSchema,
  PRESET_LABELS,
  PRESET_DESCRIPTIONS,
  type ClonePreset,
  type CloneFormValues,
} from "./clone-form-schema";
import type { ReactNode } from "react";

// --- Utilities ---

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type CheckState = "all" | "none" | "some";

function groupCheckState(items: string[], selected: string[]): CheckState {
  if (items.length === 0) return "none";
  const selectedSet = new Set(selected);
  const count = items.filter((i) => selectedSet.has(i)).length;
  if (count === 0) return "none";
  if (count === items.length) return "all";
  return "some";
}

function toggleGroupItems(
  items: string[],
  current: string[],
  state: CheckState,
): string[] {
  const currentSet = new Set(current);
  if (state === "all") {
    items.forEach((i) => currentSet.delete(i));
  } else {
    items.forEach((i) => currentSet.add(i));
  }
  return Array.from(currentSet);
}

function toggleSingleItem(item: string, current: string[]): string[] {
  const set = new Set(current);
  if (set.has(item)) set.delete(item);
  else set.add(item);
  return Array.from(set);
}

// --- Preset logic ---

function buildPresetValues(
  preset: ClonePreset,
  contents: ProfileContents,
): Partial<CloneFormValues> {
  const allConfigPaths = contents.config_files.map((f) => f.path);
  const allProgressPaths = contents.progress_items.map((f) => f.path);
  const allSaveNames = contents.save_groups.flatMap((g) =>
    g.saves.map((s) => s.directory_name),
  );
  const allModIds = contents.active_mods.map((m) => m.id);

  switch (preset) {
    case "complete":
      return {
        selectedFiles: [...allConfigPaths, ...allProgressPaths],
        selectedDirs: contents.progress_items
          .filter((f) => f.is_dir)
          .map((f) => f.path),
        selectedSaves: allSaveNames,
        selectedMods: allModIds,
        filterMods: false,
        includeOnlineProfile: true,
      };
    case "recommended":
      return {
        selectedFiles: [...allConfigPaths, ...allProgressPaths],
        selectedDirs: contents.progress_items
          .filter((f) => f.is_dir)
          .map((f) => f.path),
        selectedSaves: [],
        selectedMods: allModIds,
        filterMods: false,
        includeOnlineProfile: false,
      };
    case "minimal":
      return {
        selectedFiles: allConfigPaths,
        selectedDirs: [],
        selectedSaves: [],
        selectedMods: [],
        filterMods: true,
        includeOnlineProfile: false,
      };
    case "saves-only":
      return {
        selectedFiles: [],
        selectedDirs: [],
        selectedSaves: allSaveNames,
        selectedMods: [],
        filterMods: true,
        includeOnlineProfile: false,
      };
    case "mods-testing":
      return {
        selectedFiles: allConfigPaths,
        selectedDirs: [],
        selectedSaves: [],
        selectedMods: allModIds,
        filterMods: false,
        includeOnlineProfile: false,
      };
    case "custom":
      // Don't change selections for custom
      return {};
  }
}

// --- Collapsible group row ---

function GroupRow({
  icon,
  label,
  count,
  size,
  state,
  onToggle,
  disabled,
  children,
}: {
  icon: ReactNode;
  label: string;
  count?: number;
  size: number;
  state: CheckState;
  onToggle: () => void;
  disabled?: boolean;
  children?: ReactNode;
}) {
  const hasChildren = !!children;

  return (
    <Collapsible defaultOpen={false}>
      <div className="flex items-center gap-2 rounded-md px-2 py-2 hover:bg-muted/50">
        {hasChildren ? (
          <CollapsibleTrigger className="group/trigger flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-muted">
            <IconChevronRight className="size-3.5 transition-transform group-data-[panel-open]/trigger:rotate-90" />
          </CollapsibleTrigger>
        ) : (
          <span className="size-5" />
        )}
        {disabled ? (
          <IconLock className="size-3.5 text-muted-foreground" />
        ) : (
          <Checkbox
            checked={state !== "none"}
            indeterminate={state === "some"}
            onCheckedChange={onToggle}
          />
        )}
        <span className="flex items-center gap-1.5 text-sm">
          {icon}
          <span className="font-medium">{label}</span>
          {count != null && (
            <Badge variant="secondary" className="ml-1 text-xs">
              {count}
            </Badge>
          )}
        </span>
        <span className="ml-auto text-xs text-muted-foreground">
          {formatSize(size)}
        </span>
      </div>
      {hasChildren && (
        <CollapsibleContent>
          <div className="ml-7 border-l pl-3">{children}</div>
        </CollapsibleContent>
      )}
    </Collapsible>
  );
}

// --- Individual item row ---

function ItemRow({
  label,
  size,
  checked,
  onToggle,
  subtitle,
}: {
  label: string;
  size: number;
  checked: boolean;
  onToggle: () => void;
  subtitle?: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50">
      <span className="size-5" />
      <Checkbox checked={checked} onCheckedChange={onToggle} />
      <span className="min-w-0 flex-1 text-sm">
        <span className="truncate">{label}</span>
        {subtitle && (
          <span className="ml-2 text-xs text-muted-foreground">{subtitle}</span>
        )}
      </span>
      <span className="text-xs text-muted-foreground">{formatSize(size)}</span>
    </label>
  );
}

// --- Inner form component (receives loaded data) ---

function CloneForm({
  profile,
  installation,
  contents,
  onlineUserName,
}: {
  profile: ProfileSummary;
  installation: GameInstallation;
  contents: ProfileContents;
  onlineUserName: string | undefined;
}) {
  const queryClient = useQueryClient();
  const [isPending, startTransition] = useTransition();

  const allConfigPaths = contents.config_files.map((f) => f.path);
  const allProgressPaths = contents.progress_items.map((f) => f.path);
  const allSaveNames = contents.save_groups.flatMap((g) =>
    g.saves.map((s) => s.directory_name),
  );
  const allModIds = contents.active_mods.map((m) => m.id);

  const configSize = contents.config_files.reduce((s, f) => s + f.size, 0);
  const progressSize = contents.progress_items.reduce((s, f) => s + f.size, 0);
  const requiredSize = contents.required_files.reduce((s, f) => s + f.size, 0);
  const totalSaveSize = contents.save_groups.reduce(
    (s, g) => s + g.total_size,
    0,
  );

  // Default to "Recommended" preset
  const recommendedDefaults = buildPresetValues("recommended", contents);

  const form = useForm({
    defaultValues: {
      newProfileName: `${profile.name} (Copy)`,
      preset: "recommended" as ClonePreset,
      selectedFiles: recommendedDefaults.selectedFiles ?? [],
      selectedDirs: recommendedDefaults.selectedDirs ?? [],
      selectedSaves: recommendedDefaults.selectedSaves ?? [],
      selectedMods: recommendedDefaults.selectedMods ?? [],
      filterMods: recommendedDefaults.filterMods ?? false,
      includeOnlineProfile: false,
    },
    validators: {
      onChange: CloneFormSchema,
    },
    onSubmit: ({ value }) => {
      const options: CloneOptions = {
        include_files: value.selectedFiles,
        include_dirs: value.selectedDirs,
        include_saves: value.selectedSaves,
        include_mods: value.selectedMods,
        filter_mods: value.filterMods || value.selectedMods.length !== allModIds.length,
        include_online_profile: value.includeOnlineProfile,
      };

      startTransition(async () => {
        try {
          await cloneProfile(profile.path, value.newProfileName, options);
          await queryClient.invalidateQueries({
            queryKey: ["profiles", installation.profiles_path],
          });
          toast.success(`Profile "${value.newProfileName}" created`, {
            description: `Cloned from "${profile.name}".`,
          });
        } catch (err) {
          toast.error(`Clone failed: ${(err as Error).message ?? err}`);
        }
      });
    },
  });

  function applyPreset(preset: ClonePreset) {
    if (preset === "custom") {
      form.setFieldValue("preset", "custom");
      return;
    }
    const values = buildPresetValues(preset, contents);
    form.setFieldValue("preset", preset);
    if (values.selectedFiles !== undefined)
      form.setFieldValue("selectedFiles", values.selectedFiles);
    if (values.selectedDirs !== undefined)
      form.setFieldValue("selectedDirs", values.selectedDirs);
    if (values.selectedSaves !== undefined)
      form.setFieldValue("selectedSaves", values.selectedSaves);
    if (values.selectedMods !== undefined)
      form.setFieldValue("selectedMods", values.selectedMods);
    if (values.filterMods !== undefined)
      form.setFieldValue("filterMods", values.filterMods);
    if (values.includeOnlineProfile !== undefined)
      form.setFieldValue("includeOnlineProfile", values.includeOnlineProfile);
  }

  function markCustom() {
    form.setFieldValue("preset", "custom");
  }

  return (
    <ScrollArea className="h-full">
      <div className="mx-auto max-w-2xl space-y-6 p-6">
        <div>
          <h2 className="text-2xl font-bold">Clone Profile</h2>
          <p className="text-muted-foreground">
            Create a copy of <strong>{profile.name}</strong>. Select what to
            include.
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            form.handleSubmit();
          }}
          className="space-y-6"
        >
          {/* Profile name */}
          <form.Field
            name="newProfileName"
            children={(field) => (
              <div className="space-y-2">
                <Label htmlFor="newProfileName">New Profile Name</Label>
                <Input
                  id="newProfileName"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  maxLength={64}
                  disabled={isPending}
                  autoFocus
                  className="max-w-sm"
                />
                {field.state.meta.isTouched && !field.state.meta.isValid && (
                  <p className="text-xs text-destructive">
                    {field.state.meta.errors
                      .filter(Boolean)
                      .map((err) => {
                        if (typeof err === "string") return err;
                        if (err && typeof err === "object" && "message" in err)
                          return (err as { message: string }).message;
                        return String(err);
                      })
                      .join(", ")}
                  </p>
                )}
              </div>
            )}
          />

          {/* Presets */}
          <form.Field
            name="preset"
            children={(field) => (
              <div className="space-y-2">
                <Label>Preset</Label>
                <div className="flex flex-wrap gap-2">
                  {(
                    Object.entries(PRESET_LABELS) as [ClonePreset, string][]
                  ).map(([key, label]) => (
                    <Button
                      key={key}
                      type="button"
                      variant={field.state.value === key ? "default" : "outline"}
                      size="sm"
                      onClick={() => applyPreset(key)}
                      disabled={isPending}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {PRESET_DESCRIPTIONS[field.state.value]}
                </p>
              </div>
            )}
          />

          {/* Component tree */}
          <form.Subscribe
            selector={(state) => ({
              selectedFiles: state.values.selectedFiles,
              selectedDirs: state.values.selectedDirs,
              selectedSaves: state.values.selectedSaves,
              selectedMods: state.values.selectedMods,
              includeOnlineProfile: state.values.includeOnlineProfile,
            })}
            children={({
              selectedFiles,
              selectedDirs,
              selectedSaves,
              selectedMods,
              includeOnlineProfile,
            }) => {
              const totalItems =
                selectedFiles.length +
                selectedDirs.length +
                selectedSaves.length;

              const selectedSize = (() => {
                let total = requiredSize;
                for (const f of contents.config_files) {
                  if (selectedFiles.includes(f.path)) total += f.size;
                }
                for (const f of contents.progress_items) {
                  if (
                    selectedFiles.includes(f.path) ||
                    selectedDirs.includes(f.path)
                  )
                    total += f.size;
                }
                for (const g of contents.save_groups) {
                  for (const s of g.saves) {
                    if (selectedSaves.includes(s.directory_name))
                      total += s.size;
                  }
                }
                return total;
              })();

              return (
                <>
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">
                          Select Components
                        </CardTitle>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => applyPreset("complete")}
                          >
                            Select All
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              form.setFieldValue("selectedFiles", []);
                              form.setFieldValue("selectedDirs", []);
                              form.setFieldValue("selectedSaves", []);
                              form.setFieldValue("selectedMods", []);
                              form.setFieldValue("filterMods", true);
                              form.setFieldValue("includeOnlineProfile", false);
                              markCustom();
                            }}
                          >
                            Clear All
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-1 pt-0">
                      {/* Required (always included) */}
                      <GroupRow
                        icon={<IconLock className="size-3.5" />}
                        label="Profile Data"
                        size={requiredSize}
                        state="all"
                        onToggle={() => {}}
                        disabled
                      />

                      {/* Configuration */}
                      <GroupRow
                        icon={<IconSettings2 className="size-3.5" />}
                        label="Configuration"
                        count={contents.config_files.length}
                        size={configSize}
                        state={groupCheckState(allConfigPaths, selectedFiles)}
                        onToggle={() => {
                          const state = groupCheckState(
                            allConfigPaths,
                            selectedFiles,
                          );
                          form.setFieldValue(
                            "selectedFiles",
                            toggleGroupItems(
                              allConfigPaths,
                              selectedFiles,
                              state,
                            ),
                          );
                          markCustom();
                        }}
                      >
                        {contents.config_files.map((f) => (
                          <ItemRow
                            key={f.path}
                            label={f.display_name}
                            size={f.size}
                            checked={selectedFiles.includes(f.path)}
                            onToggle={() => {
                              form.setFieldValue(
                                "selectedFiles",
                                toggleSingleItem(f.path, selectedFiles),
                              );
                              markCustom();
                            }}
                          />
                        ))}
                      </GroupRow>

                      {/* Progress */}
                      <GroupRow
                        icon={<IconSchool className="size-3.5" />}
                        label="Progress & State"
                        count={contents.progress_items.length}
                        size={progressSize}
                        state={groupCheckState(
                          allProgressPaths,
                          selectedFiles,
                        )}
                        onToggle={() => {
                          const state = groupCheckState(
                            allProgressPaths,
                            selectedFiles,
                          );
                          form.setFieldValue(
                            "selectedFiles",
                            toggleGroupItems(
                              allProgressPaths,
                              selectedFiles,
                              state,
                            ),
                          );
                          markCustom();
                        }}
                      >
                        {contents.progress_items.map((f) => (
                          <ItemRow
                            key={f.path}
                            label={f.display_name}
                            size={f.size}
                            checked={selectedFiles.includes(f.path)}
                            onToggle={() => {
                              form.setFieldValue(
                                "selectedFiles",
                                toggleSingleItem(f.path, selectedFiles),
                              );
                              markCustom();
                            }}
                          />
                        ))}
                      </GroupRow>

                      {/* Save groups */}
                      <GroupRow
                        icon={<IconDeviceFloppy className="size-3.5" />}
                        label="Save Games"
                        count={allSaveNames.length}
                        size={totalSaveSize}
                        state={groupCheckState(allSaveNames, selectedSaves)}
                        onToggle={() => {
                          const state = groupCheckState(
                            allSaveNames,
                            selectedSaves,
                          );
                          form.setFieldValue(
                            "selectedSaves",
                            toggleGroupItems(
                              allSaveNames,
                              selectedSaves,
                              state,
                            ),
                          );
                          markCustom();
                        }}
                      >
                        {contents.save_groups.map((group) => {
                          const groupNames = group.saves.map(
                            (s) => s.directory_name,
                          );
                          return (
                            <GroupRow
                              key={group.label}
                              icon={null}
                              label={group.label}
                              count={group.saves.length}
                              size={group.total_size}
                              state={groupCheckState(
                                groupNames,
                                selectedSaves,
                              )}
                              onToggle={() => {
                                const state = groupCheckState(
                                  groupNames,
                                  selectedSaves,
                                );
                                form.setFieldValue(
                                  "selectedSaves",
                                  toggleGroupItems(
                                    groupNames,
                                    selectedSaves,
                                    state,
                                  ),
                                );
                                markCustom();
                              }}
                            >
                              {group.saves.map((save) => (
                                <ItemRow
                                  key={save.directory_name}
                                  label={save.display_name}
                                  size={save.size}
                                  checked={selectedSaves.includes(
                                    save.directory_name,
                                  )}
                                  onToggle={() => {
                                    form.setFieldValue(
                                      "selectedSaves",
                                      toggleSingleItem(
                                        save.directory_name,
                                        selectedSaves,
                                      ),
                                    );
                                    markCustom();
                                  }}
                                  subtitle={save.last_modified ?? undefined}
                                />
                              ))}
                            </GroupRow>
                          );
                        })}
                      </GroupRow>

                      {/* Active Mods */}
                      {contents.active_mods.length > 0 && (
                        <GroupRow
                          icon={<IconPuzzle className="size-3.5" />}
                          label="Active Mods"
                          count={contents.active_mods.length}
                          size={0}
                          state={groupCheckState(allModIds, selectedMods)}
                          onToggle={() => {
                            const state = groupCheckState(
                              allModIds,
                              selectedMods,
                            );
                            form.setFieldValue(
                              "selectedMods",
                              toggleGroupItems(
                                allModIds,
                                selectedMods,
                                state,
                              ),
                            );
                            markCustom();
                          }}
                        >
                          {contents.active_mods.map((mod) => (
                            <label
                              key={mod.id}
                              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50"
                            >
                              <span className="size-5" />
                              <Checkbox
                                checked={selectedMods.includes(mod.id)}
                                onCheckedChange={() => {
                                  form.setFieldValue(
                                    "selectedMods",
                                    toggleSingleItem(mod.id, selectedMods),
                                  );
                                  markCustom();
                                }}
                              />
                              <span className="min-w-0 flex-1 truncate text-sm">
                                {mod.display_name}
                              </span>
                            </label>
                          ))}
                        </GroupRow>
                      )}

                      {/* Online Profile */}
                      <div className="flex items-center gap-2 rounded-md px-2 py-2 hover:bg-muted/50">
                        <span className="size-5" />
                        <Checkbox
                          checked={includeOnlineProfile}
                          onCheckedChange={() => {
                            form.setFieldValue(
                              "includeOnlineProfile",
                              !includeOnlineProfile,
                            );
                            markCustom();
                          }}
                        />
                        <span className="flex items-center gap-1.5 text-sm">
                          <IconWorld className="size-3.5" />
                          <span className="font-medium">
                            World of Trucks Connection
                          </span>
                        </span>
                        {onlineUserName && (
                          <Badge variant="outline" className="ml-auto text-xs">
                            {onlineUserName}
                          </Badge>
                        )}
                      </div>
                      {includeOnlineProfile && (
                        <div className="ml-12 flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2">
                          <IconAlertTriangle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
                          <p className="text-xs text-destructive">
                            WoT credentials will be copied to the cloned
                            profile. Only enable this if you own both profiles.
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Summary + submit */}
                  <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3">
                    <div className="flex items-center gap-3 text-sm">
                      <span className="font-medium">{totalItems} items</span>
                      <span className="text-muted-foreground">
                        {formatSize(selectedSize)}
                      </span>
                      {contents.active_mods.length > 0 && (
                        <Badge variant="outline" className="text-xs">
                          {selectedMods.length}/{contents.active_mods.length}{" "}
                          mods
                        </Badge>
                      )}
                    </div>
                    <Button type="submit" disabled={isPending} size="lg">
                      {isPending ? (
                        <IconLoader2 className="mr-2 size-4 animate-spin" />
                      ) : (
                        <IconCopy className="mr-2 size-4" />
                      )}
                      Clone Profile
                    </Button>
                  </div>
                </>
              );
            }}
          />
        </form>
      </div>
    </ScrollArea>
  );
}

// --- Outer component (data fetching) ---

interface ProfileCloneProps {
  profile: ProfileSummary;
  installation: GameInstallation;
}

export function ProfileClone({ profile, installation }: ProfileCloneProps) {
  const { data: contents, isLoading: contentsLoading } = useProfileContents(
    profile.path,
  );
  const { data: detail } = useProfileDetail(profile.path);

  if (contentsLoading || !contents) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 max-w-2xl" />
      </div>
    );
  }

  return (
    <CloneForm
      profile={profile}
      installation={installation}
      contents={contents}
      onlineUserName={detail?.online_user_name ?? undefined}
    />
  );
}
