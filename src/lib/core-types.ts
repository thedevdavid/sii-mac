import { z } from "zod";

/**
 * Core, feature-agnostic schemas and branded identifier types used across the
 * whole app. Feature-specific schemas live under `src/features/<name>/types.ts`
 * and import from here.
 */

// ---------------------------------------------------------------------------
// Branded identifier + path types
// ---------------------------------------------------------------------------
//
// Every identifier and file-system path that flows across the Tauri boundary
// is branded so the TypeScript compiler can catch "this is a SavePath, not a
// TruckId" bugs. Brands are phantom — zero runtime cost, serialize as plain
// strings over IPC.

export const ProfileIdSchema = z.string().min(1).brand<"ProfileId">();
export type ProfileId = z.infer<typeof ProfileIdSchema>;

export const ProfilePathSchema = z.string().min(1).brand<"ProfilePath">();
export type ProfilePath = z.infer<typeof ProfilePathSchema>;

export const ProfilesPathSchema = z.string().min(1).brand<"ProfilesPath">();
export type ProfilesPath = z.infer<typeof ProfilesPathSchema>;

export const SavePathSchema = z.string().min(1).brand<"SavePath">();
export type SavePath = z.infer<typeof SavePathSchema>;

/**
 * Derive the profile path from a save path. Save paths are always structured
 * as `{profilePath}/save/{saveId}`, so stripping the `/save/{id}` suffix
 * recovers the profile root.
 */
export function profilePathFromSave(savePath: SavePath): ProfilePath {
  const str = savePath as string;
  const idx = str.lastIndexOf("/save/");
  if (idx === -1) throw new Error(`Cannot derive profile path from "${str}"`);
  return ProfilePathSchema.parse(str.slice(0, idx));
}

export const SaveIdSchema = z.string().min(1).brand<"SaveId">();
export type SaveId = z.infer<typeof SaveIdSchema>;

export const GameBasePathSchema = z.string().min(1).brand<"GameBasePath">();
export type GameBasePath = z.infer<typeof GameBasePathSchema>;

export const BackupPathSchema = z.string().min(1).brand<"BackupPath">();
export type BackupPath = z.infer<typeof BackupPathSchema>;

export const TruckIdSchema = z.string().min(1).brand<"TruckId">();
export type TruckId = z.infer<typeof TruckIdSchema>;

export const TrailerIdSchema = z.string().min(1).brand<"TrailerId">();
export type TrailerId = z.infer<typeof TrailerIdSchema>;

export const GarageIdSchema = z.string().min(1).brand<"GarageId">();
export type GarageId = z.infer<typeof GarageIdSchema>;

export const DriverIdSchema = z.string().min(1).brand<"DriverId">();
export type DriverId = z.infer<typeof DriverIdSchema>;

export const BankIdSchema = z.string().min(1).brand<"BankId">();
export type BankId = z.infer<typeof BankIdSchema>;

export const PlayerIdSchema = z.string().min(1).brand<"PlayerId">();
export type PlayerId = z.infer<typeof PlayerIdSchema>;

export const JobIdSchema = z.string().min(1).brand<"JobId">();
export type JobId = z.infer<typeof JobIdSchema>;

/**
 * Mod identifier. The `active_mods` array in `profile.sii` holds both workshop
 * (`mod_workshop_package.XXXX`) and local file-stem IDs, so mod commands take
 * this generic brand. Callers that need to discriminate (e.g. `deleteLocalMod`)
 * check `source === "local"` on the accompanying `FullModInfo` first.
 */
export const ModIdSchema = z.string().min(1).brand<"ModId">();
export type ModId = z.infer<typeof ModIdSchema>;

/** Steam Workshop numeric item id (decimal). */
export const WorkshopIdSchema = z.string().min(1).brand<"WorkshopId">();
export type WorkshopId = z.infer<typeof WorkshopIdSchema>;

/** Playset identifier (UUIDv4 from the Rust backend). */
export const PlaysetIdSchema = z.string().min(1).brand<"PlaysetId">();
export type PlaysetId = z.infer<typeof PlaysetIdSchema>;

// ---------------------------------------------------------------------------
// Timestamps
// ---------------------------------------------------------------------------
//
// All timestamps crossing the Tauri boundary are RFC 3339 / ISO 8601 strings.
// Rust emits them via `chrono::DateTime::to_rfc3339()`. The schema keeps the
// wire representation as a string but `.datetime()` enforces the format at
// parse time so the UI can safely do `new Date(value)`.

export const TimestampSchema = z.string().datetime({ offset: true });
export type Timestamp = z.infer<typeof TimestampSchema>;

// ---------------------------------------------------------------------------
// Safe-integer refinement for money-like fields
// ---------------------------------------------------------------------------
//
// Known limitation: this refinement does NOT prevent precision loss. By the
// time a JSON number reaches Zod, `serde_json` has already deserialized the
// i64 into f64, silently rounding any value above `Number.MAX_SAFE_INTEGER`
// (≈9e15). The refinement catches only values that end up `NaN`/`Infinity`.
//
// ATS/ETS2 money caps in the low billions in practice, far below the safe
// range, so the f64 policy is acceptable. If a future game release changes
// that, switch the Rust side to serialize i64 as a string
// (`serde_with::DisplayFromStr`) and parse as bigint here.

export const SafeIntSchema = z.number().refine(Number.isSafeInteger, {
  message: "value exceeds JavaScript safe integer range",
});

// ---------------------------------------------------------------------------
// Game identification
// ---------------------------------------------------------------------------

export const GameSchema = z.enum(["ats", "ets2"]);
export type Game = z.infer<typeof GameSchema>;

export function gameDisplayName(game: Game): string {
  return game === "ats"
    ? "American Truck Simulator"
    : "Euro Truck Simulator 2";
}

export function gameShortName(game: Game): string {
  return game === "ats" ? "ATS" : "ETS2";
}

// ---------------------------------------------------------------------------
// Game installation
// ---------------------------------------------------------------------------

export const InstallSourceSchema = z.enum([
  "native",
  "crossOver",
  "proton",
  "custom",
]);
export type InstallSource = z.infer<typeof InstallSourceSchema>;

const INSTALL_SOURCE_LABELS: Record<InstallSource, string> = {
  native: "Native",
  crossOver: "CrossOver",
  proton: "Proton",
  custom: "Custom",
};

export function installSourceLabel(source: InstallSource): string {
  return INSTALL_SOURCE_LABELS[source];
}

export const GameInstallationSchema = z.object({
  game: GameSchema,
  base_path: GameBasePathSchema,
  profiles_path: ProfilesPathSchema,
  is_custom: z.boolean(),
  source: InstallSourceSchema,
});
export type GameInstallation = z.infer<typeof GameInstallationSchema>;

// ---------------------------------------------------------------------------
// File entry (used in profile contents scanning and clone UIs)
// ---------------------------------------------------------------------------

export const FileEntrySchema = z.object({
  name: z.string(),
  path: z.string(),
  display_name: z.string(),
  size: z.number(),
  is_dir: z.boolean(),
});
export type FileEntry = z.infer<typeof FileEntrySchema>;

// ---------------------------------------------------------------------------
// App error (wire format from Rust `AppError`)
// ---------------------------------------------------------------------------

export const AppErrorKindSchema = z.enum([
  "io",
  "siiDecode",
  "parse",
  "notFound",
  "alreadyExists",
  "invalidName",
  "invalidPath",
  "store",
  "permissionDenied",
  "steamCloudConflict",
  "backupCorrupted",
  "playsetNotFound",
  "playsetInvalid",
  "workshopApiError",
  "network",
  "cancelled",
]);
export type AppErrorKind = z.infer<typeof AppErrorKindSchema>;

export const AppErrorSchema = z.object({
  kind: AppErrorKindSchema,
  message: z.string(),
});
export type AppError = z.infer<typeof AppErrorSchema>;

export function isCancelledError(error: AppError): boolean {
  return error.kind === "cancelled";
}

// ---------------------------------------------------------------------------
// Game config (read + update payloads)
// ---------------------------------------------------------------------------

export const GameConfigSchema = z.object({
  developer: z.boolean(),
  console: z.boolean(),
  save_format: z.number(),
  config_path: z.string(),
});
export type GameConfig = z.infer<typeof GameConfigSchema>;

export const GameConfigKeySchema = z.enum([
  "g_developer",
  "g_console",
  "g_console_state",
  "g_save_format",
]);
export type GameConfigKey = z.infer<typeof GameConfigKeySchema>;

export const GameConfigValueSchema = z
  .string()
  .regex(/^\d+$/, "must be a digit string")
  .min(1)
  .max(10);
