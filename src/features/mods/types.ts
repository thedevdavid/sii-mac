import { z } from "zod";
import {
  ModIdSchema,
  PlaysetIdSchema,
  TimestampSchema,
  WorkshopIdSchema,
} from "@/lib/core-types";

/**
 * Mod-related Zod schemas. Imported by `features/profiles` (profile mod list),
 * the editor's mod tab, and clone/compare UIs.
 */

export const ModEntrySchema = z.object({
  id: ModIdSchema,
  display_name: z.string(),
});
export type ModEntry = z.infer<typeof ModEntrySchema>;

export const ModStatusSchema = z.enum(["active", "inactive", "missing"]);
export type ModStatus = z.infer<typeof ModStatusSchema>;

export const ModSourceSchema = z.enum(["workshop", "local"]);
export type ModSource = z.infer<typeof ModSourceSchema>;

export const FullModInfoSchema = z.object({
  id: ModIdSchema,
  display_name: z.string(),
  status: ModStatusSchema,
  source: ModSourceSchema,
  author: z.string().nullish(),
  version: z.string().nullish(),
  categories: z.array(z.string()),
  compatible_versions: z.array(z.string()),
  size: z.number().nullish(),
  workshop_id: WorkshopIdSchema.nullish(),
});
export type FullModInfo = z.infer<typeof FullModInfoSchema>;

// ---------------------------------------------------------------------------
// Playset schemas
// ---------------------------------------------------------------------------
//
// The Rust backend serializes these with snake_case field names (matching the
// existing `FullModInfo` / `ProfileDetail` convention). Do not change to
// camelCase without updating every `#[serde(...)]` attribute on the Rust side.

export const PlaysetEntrySchema = z.object({
  mod_id: ModIdSchema,
  display_name: z.string(),
  enabled: z.boolean(),
  order: z.number().int().nonnegative(),
  /**
   * Pins the entry's absolute position during the auto-fix reorder. Older
   * playset payloads predate this field — the default keeps them unlocked so
   * Zod doesn't reject them.
   */
  locked: z.boolean().default(false),
  /**
   * Sticky-cluster id. Entries sharing the same `lock_group` stay contiguous
   * in their current relative order during auto-reorder, but the cluster as
   * a whole may move. `null` / absent = not in any group. Older payloads
   * predate this field so it defaults to `null`.
   */
  lock_group: z.string().nullable().default(null),
});
export type PlaysetEntry = z.infer<typeof PlaysetEntrySchema>;

export const PlaysetSchema = z.object({
  id: PlaysetIdSchema,
  name: z.string(),
  is_temporary: z.boolean(),
  created_at: TimestampSchema,
  updated_at: TimestampSchema,
  color: z.string().nullish(),
  is_favorite: z.boolean(),
  thumbnail_path: z.string().nullish(),
  entries: z.array(PlaysetEntrySchema),
});
export type Playset = z.infer<typeof PlaysetSchema>;

/**
 * Patch type for `update_playset_metadata`. Flat optional fields plus explicit
 * `clear_*` booleans — this mirrors the Rust `PlaysetMetadataPatch` and avoids
 * the `Option<Option<T>>` pattern that doesn't round-trip through serde.
 */
export const PlaysetMetadataPatchSchema = z.object({
  name: z.string().optional(),
  color: z.string().optional(),
  clear_color: z.boolean().optional(),
  is_favorite: z.boolean().optional(),
  thumbnail_path: z.string().optional(),
  clear_thumbnail_path: z.boolean().optional(),
});
export type PlaysetMetadataPatch = z.infer<typeof PlaysetMetadataPatchSchema>;

export const DriftReportSchema = z.object({
  has_drift: z.boolean(),
  missing_in_profile: z.array(ModEntrySchema),
  extra_in_profile: z.array(ModEntrySchema),
  order_changed: z.boolean(),
  snapshot_drift: z.boolean(),
  live_entries: z.array(ModEntrySchema),
});
export type DriftReport = z.infer<typeof DriftReportSchema>;

export const WorkshopMetadataSchema = z.object({
  workshop_id: WorkshopIdSchema,
  title: z.string(),
  description: z.string(),
  preview_url: z.string().nullish(),
  tags: z.array(z.string()),
  file_size: z.number().nullish(),
  subscribers: z.number().nullish(),
  time_updated: z.number().nullish(),
  votes_up: z.number().nullish(),
  votes_down: z.number().nullish(),
});
export type WorkshopMetadata = z.infer<typeof WorkshopMetadataSchema>;

export type WorkshopMetadataMap = Record<string, WorkshopMetadata>;

export const PlaysetExportSchema = z.object({
  version: z.number().int(),
  exported_at: TimestampSchema,
  exported_by: z.string().nullish(),
  playset: PlaysetSchema,
});
export type PlaysetExport = z.infer<typeof PlaysetExportSchema>;
