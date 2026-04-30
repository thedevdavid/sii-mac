import type {
  ClonePreset,
  CloneFormValues,
} from "@/features/profiles/clone-form-schema";
import type { ProfileContents } from "@/features/profiles/types";

/**
 * Translate a preset name into a partial `CloneFormValues` patch.
 *
 * Each preset is expressed as a pure function of the scanned `ProfileContents`.
 * Grouping the shared derivations up-front (paths, save names, mod ids) and
 * listing each preset as a flat object reads more like a table than the
 * original 5-way `switch` with repeated `.filter(is_dir)` calls.
 */
export function buildPresetValues(
  preset: ClonePreset,
  contents: ProfileContents,
): Partial<CloneFormValues> {
  const allConfigPaths = contents.config_files.map((f) => f.path);
  const allProgressPaths = contents.progress_items.map((f) => f.path);
  const allProgressDirs = contents.progress_items
    .filter((f) => f.is_dir)
    .map((f) => f.path);
  const allSaveNames = contents.save_groups.flatMap((g) =>
    g.saves.map((s) => s.directory_name),
  );
  const allModIds = contents.active_mods.map((m) => m.id);

  switch (preset) {
    case "complete":
      return {
        selectedFiles: [...allConfigPaths, ...allProgressPaths],
        selectedDirs: allProgressDirs,
        selectedSaves: allSaveNames,
        selectedMods: allModIds,
        filterMods: false,
        includeOnlineProfile: true,
      };
    case "recommended":
      return {
        selectedFiles: [...allConfigPaths, ...allProgressPaths],
        selectedDirs: allProgressDirs,
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
