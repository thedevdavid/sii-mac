import { z } from "zod";
import {
  FileEntrySchema,
  ModIdSchema,
  ProfileIdSchema,
  ProfilePathSchema,
  SaveIdSchema,
  SavePathSchema,
  TimestampSchema,
} from "@/lib/core-types";
import { ModEntrySchema } from "@/features/mods/types";

/**
 * Profile-level Zod schemas: sidebar summaries, detail views, content scans,
 * and clone options. These types represent what the backend returns for a
 * single profile or a list of profiles.
 */

// ---------------------------------------------------------------------------
// Summary (sidebar list)
// ---------------------------------------------------------------------------

export const ProfileSummarySchema = z.object({
  name: z.string(),
  directory_name: ProfileIdSchema,
  path: ProfilePathSchema,
  company_name: z.string().nullable(),
  save_count: z.number(),
  last_modified: TimestampSchema.nullable(),
  is_steam_cloud: z.boolean(),
});
export type ProfileSummary = z.infer<typeof ProfileSummarySchema>;

// ---------------------------------------------------------------------------
// Save summary (referenced from profile detail)
// ---------------------------------------------------------------------------

export const SaveSummarySchema = z.object({
  name: z.string(),
  directory_name: SaveIdSchema,
  path: SavePathSchema,
  last_modified: TimestampSchema.nullable(),
});
export type SaveSummary = z.infer<typeof SaveSummarySchema>;

// ---------------------------------------------------------------------------
// Profile detail (full profile data)
// ---------------------------------------------------------------------------
//
// The "rich" fields (face, brand, logo, male, map_path, cached_*, etc.) are
// `.nullish()` because they legitimately vary by game version and save age.
// `active_mods` is the odd one out — the Rust side always produces a Vec, so
// the schema drops the nullish and defaults to an empty array, matching
// reality.

export const ProfileDetailSchema = z.object({
  name: z.string(),
  directory_name: ProfileIdSchema,
  path: ProfilePathSchema,
  company_name: z.string().nullable(),
  experience_points: z.number().nullable(),
  money: z.number().nullable(),
  save_count: z.number(),
  saves: z.array(SaveSummarySchema),
  last_modified: TimestampSchema.nullable(),
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
  creation_time: TimestampSchema.nullish(),
  save_time: TimestampSchema.nullish(),
  version: z.number().nullish(),
  customization: z.number().nullish(),
  active_mods: z.array(ModEntrySchema).default([]),
});
export type ProfileDetail = z.infer<typeof ProfileDetailSchema>;

// ---------------------------------------------------------------------------
// Profile content scanning (clone UI)
// ---------------------------------------------------------------------------

export const SaveEntrySchema = z.object({
  directory_name: SaveIdSchema,
  display_name: z.string(),
  size: z.number(),
  last_modified: TimestampSchema.nullable(),
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

// ---------------------------------------------------------------------------
// Clone options (Tauri command input)
// ---------------------------------------------------------------------------

export const ModCloneStrategySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("keepAll") }),
  z.object({
    kind: z.literal("includeOnly"),
    mods: z.array(ModIdSchema),
  }),
]);
export type ModCloneStrategy = z.infer<typeof ModCloneStrategySchema>;

export const CloneOptionsSchema = z.object({
  include_files: z.array(z.string()),
  include_dirs: z.array(z.string()),
  include_saves: z.array(SaveIdSchema),
  mod_strategy: ModCloneStrategySchema,
  include_online_profile: z.boolean(),
});
export type CloneOptions = z.infer<typeof CloneOptionsSchema>;
