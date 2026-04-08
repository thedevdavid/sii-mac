import { z } from "zod";

export const ClonePresetSchema = z.enum([
  "complete",
  "recommended",
  "minimal",
  "saves-only",
  "mods-testing",
  "custom",
]);
export type ClonePreset = z.infer<typeof ClonePresetSchema>;

export const CloneFormSchema = z.object({
  newProfileName: z
    .string()
    .trim()
    .min(1, "Profile name is required")
    .max(64, "Profile name must be 64 characters or fewer"),
  preset: ClonePresetSchema,
  selectedFiles: z.array(z.string()),
  selectedDirs: z.array(z.string()),
  selectedSaves: z.array(z.string()),
  selectedMods: z.array(z.string()),
  filterMods: z.boolean(),
  includeOnlineProfile: z.boolean(),
});
export type CloneFormValues = z.infer<typeof CloneFormSchema>;

export const PRESET_LABELS: Record<ClonePreset, string> = {
  complete: "Complete",
  recommended: "Recommended",
  minimal: "Minimal",
  "saves-only": "Saves Only",
  "mods-testing": "Mod Testing",
  custom: "Custom",
};

export const PRESET_DESCRIPTIONS: Record<ClonePreset, string> = {
  complete: "Exact duplicate including online profile",
  recommended: "Fresh career, same setup",
  minimal: "Clean slate with game config only",
  "saves-only": "Transfer saves to a different profile",
  "mods-testing": "Test mod combinations without saves",
  custom: "Full granular control",
};
