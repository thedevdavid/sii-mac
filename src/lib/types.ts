import { z } from "zod";

// --- Core enums ---

export const GameSchema = z.enum(["ats", "ets2"]);
export type Game = z.infer<typeof GameSchema>;

// --- Game installation ---

export const GameInstallationSchema = z.object({
  game: GameSchema,
  base_path: z.string(),
  profiles_path: z.string(),
});
export type GameInstallation = z.infer<typeof GameInstallationSchema>;

// --- Profile summary (sidebar list) ---

export const ProfileSummarySchema = z.object({
  name: z.string(),
  directory_name: z.string(),
  path: z.string(),
  company_name: z.string().nullable(),
  save_count: z.number(),
  last_modified: z.string().nullable(),
});
export type ProfileSummary = z.infer<typeof ProfileSummarySchema>;

// --- Save summary ---

export const SaveSummarySchema = z.object({
  name: z.string(),
  directory_name: z.string(),
  path: z.string(),
  last_modified: z.string().nullable(),
});
export type SaveSummary = z.infer<typeof SaveSummarySchema>;

// --- Mod entry ---

export const ModEntrySchema = z.object({
  id: z.string(),
  display_name: z.string(),
});
export type ModEntry = z.infer<typeof ModEntrySchema>;

// --- Profile detail (full profile data) ---

export const ProfileDetailSchema = z.object({
  name: z.string(),
  directory_name: z.string(),
  path: z.string(),
  company_name: z.string().nullable(),
  experience_points: z.number().nullable(),
  money: z.number().nullable(),
  save_count: z.number(),
  saves: z.array(SaveSummarySchema),
  last_modified: z.string().nullable(),
  raw_profile_text: z.string().nullable(),
  // Rich profile fields — nullish because Rust Option<T> serializes None as null
  face: z.number().nullish(),
  brand: z.string().nullish(),
  logo: z.string().nullish(),
  male: z.boolean().nullish(),
  map_path: z.string().nullish(),
  cached_experience: z.number().nullish(),
  cached_distance: z.number().nullish(),
  cached_stats: z.array(z.number()).nullish(),
  online_user_name: z.string().nullish(),
  creation_time: z.number().nullish(),
  save_time: z.number().nullish(),
  version: z.number().nullish(),
  customization: z.number().nullish(),
  active_mods: z.array(ModEntrySchema).nullish(),
});
export type ProfileDetail = z.infer<typeof ProfileDetailSchema>;

// --- Backup info ---

export const BackupInfoSchema = z.object({
  name: z.string(),
  path: z.string(),
  profile_name: z.string(),
  game: GameSchema,
  created_at: z.string(),
});
export type BackupInfo = z.infer<typeof BackupInfoSchema>;

// --- Profile content scanning ---

export const FileEntrySchema = z.object({
  name: z.string(),
  path: z.string(),
  display_name: z.string(),
  size: z.number(),
  is_dir: z.boolean(),
});
export type FileEntry = z.infer<typeof FileEntrySchema>;

export const SaveEntrySchema = z.object({
  directory_name: z.string(),
  display_name: z.string(),
  size: z.number(),
  last_modified: z.string().nullable(),
  has_preview: z.boolean(),
});
export type SaveEntry = z.infer<typeof SaveEntrySchema>;

export const SaveGroupSchema = z.object({
  label: z.string(),
  saves: z.array(SaveEntrySchema),
  total_size: z.number(),
});
export type SaveGroup = z.infer<typeof SaveGroupSchema>;

export const ProfileContentsSchema = z.object({
  required_files: z.array(FileEntrySchema),
  config_files: z.array(FileEntrySchema),
  progress_items: z.array(FileEntrySchema),
  save_groups: z.array(SaveGroupSchema),
  active_mods: z.array(ModEntrySchema),
  total_size: z.number(),
});
export type ProfileContents = z.infer<typeof ProfileContentsSchema>;

// --- Clone options ---

export const CloneOptionsSchema = z.object({
  include_files: z.array(z.string()),
  include_dirs: z.array(z.string()),
  include_saves: z.array(z.string()),
  include_mods: z.array(z.string()),
  filter_mods: z.boolean(),
  include_online_profile: z.boolean(),
});
export type CloneOptions = z.infer<typeof CloneOptionsSchema>;

// --- Error ---

export const AppErrorSchema = z.object({
  kind: z.string(),
  message: z.string(),
});
export type AppError = z.infer<typeof AppErrorSchema>;

// --- Helpers ---

export function gameDisplayName(game: Game): string {
  return game === "ats"
    ? "American Truck Simulator"
    : "Euro Truck Simulator 2";
}

export function gameShortName(game: Game): string {
  return game === "ats" ? "ATS" : "ETS2";
}
