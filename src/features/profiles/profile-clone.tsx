import { queryKeys } from "@/lib/query-keys";
import { formatError } from "@/lib/format-error";
import { useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useProfileContents, useProfileDetail } from "@/hooks/use-profiles";
// No Card imports — using section headers + bordered containers (macOS pattern)
import { Button } from "@/components/cupertino/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/cupertino/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cloneProfile } from "@/lib/tauri-commands";
import { useAppForm } from "@/lib/form";
import type { GameInstallation } from "@/lib/core-types";
import {
  CloneOptionsSchema,
  type CloneOptions,
  type ProfileContents,
  type ProfileSummary,
} from "@/features/profiles/types";
import {
  IconLock,
  IconSettings2,
  IconSchool,
  IconDeviceFloppy,
  IconPuzzle,
  IconWorld,
  IconAlertTriangle,
  IconInfoCircle,
} from "@tabler/icons-react";
import {
  CloneFormSchema,
  PRESET_LABELS,
  PRESET_DESCRIPTIONS,
  type ClonePreset,
} from "./clone-form-schema";
import {
  formatSize,
  groupCheckState,
  toggleGroupItems,
  toggleSingleItem,
} from "./clone-utils";
import { buildPresetValues } from "./clone-presets";
import { GroupRow, ItemRow } from "./clone-rows";
import { useProgressStream } from "@/hooks/use-progress-stream";
import { ProgressOverlay } from "@/components/progress-overlay";

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
  const progressStream = useProgressStream();

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

  const form = useAppForm({
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
    validators: { onSubmit: CloneFormSchema },
    onSubmit: ({ value }) => {
      const shouldFilter =
        value.filterMods || value.selectedMods.length !== allModIds.length;
      // Parse through the schema so plain-string form values get promoted to
      // the branded SaveId/ModId types the Tauri command expects.
      const options: CloneOptions = CloneOptionsSchema.parse({
        include_files: value.selectedFiles,
        include_dirs: value.selectedDirs,
        include_saves: value.selectedSaves,
        mod_strategy: shouldFilter
          ? { kind: "includeOnly", mods: value.selectedMods }
          : { kind: "keepAll" },
        include_online_profile: value.includeOnlineProfile,
      });

      const { jobId, channel } = progressStream.begin();
      startTransition(async () => {
        try {
          await cloneProfile(
            profile.path,
            value.newProfileName,
            installation.base_path,
            options,
            jobId,
            channel,
          );
          await queryClient.invalidateQueries({
            queryKey: queryKeys.profiles.list(installation.profiles_path),
          });
          toast.success(`Profile "${value.newProfileName}" created`, {
            description: `Cloned from "${profile.name}".`,
          });
        } catch (err) {
          // Failed/Cancelled events already displayed via ProgressOverlay,
          // but non-streaming errors (schema drift, pre-validation) still
          // need a toast fallback. Read via getStatus() to avoid a stale
          // closure over `progressStream.progress`.
          if (progressStream.getStatus() === "idle") {
            toast.error(`Clone failed: ${formatError(err)}`);
          }
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
      <ProgressOverlay
        progress={progressStream.progress}
        onCancel={() => progressStream.cancel()}
        onDismiss={() => progressStream.reset()}
        title="Cloning profile"
      />
      <div className="space-y-5 p-5">
        <div>
          <h2 className="text-sm font-semibold">Clone Profile</h2>
          <p className="text-xs text-muted-foreground">
            Create a copy of {profile.name}. Select what to include.
          </p>
        </div>

        {profile.is_steam_cloud && (
          <div className="flex items-start gap-2.5 rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2.5">
            <IconInfoCircle className="mt-0.5 size-4 shrink-0 text-blue-500" />
            <div className="text-xs">
              <p className="font-medium text-blue-500">
                Steam Cloud profile detected
              </p>
              <p className="mt-0.5 text-muted-foreground">
                The cloned profile will be created as a <strong>local profile</strong> in
                the <code className="rounded bg-muted px-1">profiles/</code> directory
                without Steam Cloud sync. To enable Cloud sync for the clone, use the
                in-game profile settings after launching the game.
              </p>
            </div>
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            form.handleSubmit();
          }}
          className="space-y-5"
        >
          <form.AppField name="newProfileName">
            {(field) => (
              <field.TextField
                id="newProfileName"
                label="New Profile Name"
                className="max-w-sm"
                inputProps={{
                  maxLength: 64,
                  disabled: isPending,
                  autoFocus: true,
                }}
              />
            )}
          </form.AppField>

          {/* Presets */}
          <form.AppField name="preset">
            {(field) => (
              <div className="space-y-2">
                <Label>Preset</Label>
                <ButtonGroup>
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
                </ButtonGroup>
                <p className="text-xs text-muted-foreground">
                  {PRESET_DESCRIPTIONS[field.state.value]}
                </p>
              </div>
            )}
          </form.AppField>

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
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Components
                      </h3>
                      <ButtonGroup>
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          onClick={() => applyPreset("complete")}
                        >
                          Select All
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
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
                      </ButtonGroup>
                    </div>
                    <div className="space-y-1 rounded-lg border p-2">
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
                          {contents.active_mods.map((mod) => {
                            const checkboxId = `clone-mod-${mod.id}`;
                            return (
                              <div
                                key={mod.id}
                                className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50"
                              >
                                <span className="size-5" />
                                <Checkbox
                                  id={checkboxId}
                                  checked={selectedMods.includes(mod.id)}
                                  onCheckedChange={() => {
                                    form.setFieldValue(
                                      "selectedMods",
                                      toggleSingleItem(mod.id, selectedMods),
                                    );
                                    markCustom();
                                  }}
                                />
                                <Label
                                  htmlFor={checkboxId}
                                  className="min-w-0 flex-1 cursor-pointer truncate text-sm font-normal"
                                >
                                  {mod.display_name}
                                </Label>
                              </div>
                            );
                          })}
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
                    </div>
                  </div>

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
                    <form.AppForm>
                      <form.SubmitButton label="Clone Profile" size="lg" />
                    </form.AppForm>
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
      <div className="space-y-5 p-5">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-64 w-full rounded-lg" />
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
