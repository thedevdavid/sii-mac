import { invoke, type Channel } from "@tauri-apps/api/core";
import { z, type ZodType } from "zod";
import {
  GameConfigKeySchema,
  GameConfigSchema,
  GameConfigValueSchema,
  GameInstallationSchema,
  type BackupPath,
  type GameBasePath,
  type GameConfig,
  type GameConfigKey,
  type GameInstallation,
  type GarageId,
  type JobId,
  type ModId,
  type ProfilePath,
  type ProfilesPath,
  type SavePath,
  type TrailerId,
  type TruckId,
} from "@/lib/core-types";
import {
  BulkActionSchema,
  GarageChangeSchema,
  PlayerChangesSchema,
  SaveDataSchema,
  TrailerChangesSchema,
  TruckChangesSchema,
  type BulkAction,
  type GarageChange,
  type PlayerChanges,
  type SaveData,
  type TrailerChanges,
  type TruckChanges,
} from "@/features/editor/types";
import {
  type CloneOptions,
  ProfileContentsSchema,
  ProfileDetailSchema,
  ProfileSummarySchema,
  SaveSummarySchema,
  type ProfileContents,
  type ProfileDetail,
  type ProfileSummary,
  type SaveSummary,
} from "@/features/profiles/types";
import {
  DriftReportSchema,
  FullModInfoSchema,
  PlaysetSchema,
  WorkshopMetadataSchema,
  PlaysetEntrySchema,
  PlaysetMetadataPatchSchema,
  type DriftReport,
  type FullModInfo,
  type Playset,
  type PlaysetEntry,
  type PlaysetMetadataPatch,
  type WorkshopMetadata,
} from "@/features/mods/types";
import type { PlaysetId } from "@/lib/core-types";
import { BackupInfoSchema, type BackupInfo } from "@/features/backups/types";

/**
 * Validate a value against a Zod schema. On failure, logs the issues + offending
 * value and throws a labeled error. Used both inbound (command responses) and
 * outbound (mutation payloads) so a schema drift or UI bug surfaces with enough
 * context to debug, rather than a bare ZodError popping up inside a query.
 */
function validateWithSchema<T>(
  schema: ZodType<T>,
  context: string,
  value: unknown,
): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    const message = firstIssue
      ? `${firstIssue.path.join(".") || "<root>"}: ${firstIssue.message}`
      : "unknown validation error";
    // eslint-disable-next-line no-console
    console.error(`[tauri] ${context} failed schema validation`, {
      issues: parsed.error.issues,
      value,
    });
    throw new Error(`${context}: ${message}`);
  }
  return parsed.data;
}

export async function detectGameInstallations(): Promise<GameInstallation[]> {
  const raw = await invoke("detect_game_installations");
  return validateWithSchema(
    z.array(GameInstallationSchema),
    "detect_game_installations",
    raw,
  );
}

export async function listProfiles(
  profilesPath: ProfilesPath,
): Promise<ProfileSummary[]> {
  const raw = await invoke("list_profiles", { profilesPath });
  return validateWithSchema(
    z.array(ProfileSummarySchema),
    "list_profiles",
    raw,
  );
}

export async function getProfileDetail(
  profilePath: ProfilePath,
): Promise<ProfileDetail> {
  const raw = await invoke("get_profile_detail", { profilePath });
  return validateWithSchema(ProfileDetailSchema, "get_profile_detail", raw);
}

export async function scanProfileContents(
  profilePath: ProfilePath,
): Promise<ProfileContents> {
  const raw = await invoke("scan_profile_contents", { profilePath });
  return validateWithSchema(
    ProfileContentsSchema,
    "scan_profile_contents",
    raw,
  );
}

export async function cloneProfile(
  sourcePath: ProfilePath,
  newName: string,
  gameBasePath: GameBasePath | undefined,
  options: CloneOptions | undefined,
  jobId: JobId,
  progress: Channel<unknown>,
): Promise<ProfileSummary> {
  const raw = await invoke("clone_profile", {
    sourcePath,
    newName,
    gameBasePath,
    options,
    jobId,
    progress,
  });
  return validateWithSchema(ProfileSummarySchema, "clone_profile", raw);
}

export async function renameProfile(
  profilePath: ProfilePath,
  newName: string,
): Promise<ProfileSummary> {
  const raw = await invoke("rename_profile", { profilePath, newName });
  return validateWithSchema(ProfileSummarySchema, "rename_profile", raw);
}

export async function deleteProfile(profilePath: ProfilePath): Promise<void> {
  await invoke("delete_profile", { profilePath });
}

export async function listSaves(
  profilePath: ProfilePath,
): Promise<SaveSummary[]> {
  const raw = await invoke("list_saves", { profilePath });
  return validateWithSchema(z.array(SaveSummarySchema), "list_saves", raw);
}

export async function backupProfile(
  profilePath: ProfilePath,
  backupDir: BackupPath | undefined,
  jobId: JobId,
  progress: Channel<unknown>,
): Promise<string> {
  const raw = await invoke("backup_profile", {
    profilePath,
    backupDir,
    jobId,
    progress,
  });
  return validateWithSchema(z.string(), "backup_profile", raw);
}

export async function listBackups(
  backupDir?: BackupPath,
): Promise<BackupInfo[]> {
  const raw = await invoke("list_backups", { backupDir });
  return validateWithSchema(z.array(BackupInfoSchema), "list_backups", raw);
}

export async function restoreBackup(
  backupPath: BackupPath,
  profilesDir: ProfilesPath,
  jobId: JobId,
  progress: Channel<unknown>,
): Promise<string> {
  const raw = await invoke("restore_backup", {
    backupPath,
    profilesDir,
    jobId,
    progress,
  });
  return validateWithSchema(z.string(), "restore_backup", raw);
}

export function setNativeVibrancy(enabled: boolean): Promise<void> {
  return invoke("set_native_vibrancy", { enabled });
}

// --- Save editor commands ---

export async function getSaveData(savePath: SavePath): Promise<SaveData> {
  const raw = await invoke("get_save_data", { savePath });
  return validateWithSchema(SaveDataSchema, "get_save_data", raw);
}

export async function updatePlayerData(
  savePath: SavePath,
  changes: PlayerChanges,
): Promise<void> {
  const validated = validateWithSchema(
    PlayerChangesSchema,
    "update_player_data.changes",
    changes,
  );
  await invoke("update_player_data", { savePath, changes: validated });
}

export async function updateTruck(
  savePath: SavePath,
  truckId: TruckId,
  changes: TruckChanges,
): Promise<void> {
  const validated = validateWithSchema(
    TruckChangesSchema,
    "update_truck.changes",
    changes,
  );
  await invoke("update_truck", { savePath, truckId, changes: validated });
}

export async function updateAllTrucks(
  savePath: SavePath,
  action: BulkAction,
): Promise<number> {
  const validatedAction = validateWithSchema(
    BulkActionSchema,
    "update_all_trucks.action",
    action,
  );
  const raw = await invoke("update_all_trucks", {
    savePath,
    action: validatedAction,
  });
  return validateWithSchema(z.number(), "update_all_trucks", raw);
}

export async function updateTrailer(
  savePath: SavePath,
  trailerId: TrailerId,
  changes: TrailerChanges,
): Promise<void> {
  const validated = validateWithSchema(
    TrailerChangesSchema,
    "update_trailer.changes",
    changes,
  );
  await invoke("update_trailer", { savePath, trailerId, changes: validated });
}

export async function repairAllTrailers(savePath: SavePath): Promise<number> {
  const raw = await invoke("repair_all_trailers", { savePath });
  return validateWithSchema(z.number(), "repair_all_trailers", raw);
}

export async function updateGarage(
  savePath: SavePath,
  garageId: GarageId,
  change: GarageChange,
): Promise<void> {
  const validated = validateWithSchema(
    GarageChangeSchema,
    "update_garage.change",
    change,
  );
  await invoke("update_garage", { savePath, garageId, change: validated });
}

export async function unlockAllGarages(savePath: SavePath): Promise<number> {
  const raw = await invoke("unlock_all_garages", { savePath });
  return validateWithSchema(z.number(), "unlock_all_garages", raw);
}

// --- Game config commands ---

export async function getGameConfig(
  gameBasePath: GameBasePath,
): Promise<GameConfig> {
  const raw = await invoke("get_game_config", { gameBasePath });
  return validateWithSchema(GameConfigSchema, "get_game_config", raw);
}

export async function updateGameConfig(
  gameBasePath: GameBasePath,
  key: GameConfigKey,
  value: string,
): Promise<void> {
  const validatedKey = validateWithSchema(
    GameConfigKeySchema,
    "update_game_config.key",
    key,
  );
  const validatedValue = validateWithSchema(
    GameConfigValueSchema,
    "update_game_config.value",
    value,
  );
  await invoke("update_game_config", {
    gameBasePath,
    key: validatedKey,
    value: validatedValue,
  });
}

// --- Custom game path commands ---

export async function addCustomGamePath(
  path: string,
): Promise<GameInstallation> {
  const raw = await invoke("add_custom_game_path", { path });
  return validateWithSchema(GameInstallationSchema, "add_custom_game_path", raw);
}

export async function removeCustomGamePath(path: string): Promise<void> {
  await invoke("remove_custom_game_path", { path });
}

// --- Mod scanning + management ---

/**
 * Scan every mod available in a game installation. Profile-independent: the
 * active/missing overlay is computed on the client from the profile's
 * `active_mods` list so this expensive call can be cached per installation
 * and reused across profile switches.
 */
export async function scanInstallationMods(
  basePath: GameBasePath,
): Promise<FullModInfo[]> {
  const raw = await invoke("scan_installation_mods", { basePath });
  return validateWithSchema(
    z.array(FullModInfoSchema),
    "scan_installation_mods",
    raw,
  );
}

export async function deleteLocalMod(
  basePath: GameBasePath,
  modId: ModId,
): Promise<void> {
  await invoke("delete_local_mod", { basePath, modId });
}

// --- Playset commands ---

export async function listPlaysets(basePath: GameBasePath): Promise<Playset[]> {
  const raw = await invoke("list_playsets", { basePath });
  return validateWithSchema(z.array(PlaysetSchema), "list_playsets", raw);
}

export async function getPlayset(
  basePath: GameBasePath,
  playsetId: PlaysetId,
): Promise<Playset> {
  const raw = await invoke("get_playset", { basePath, playsetId });
  return validateWithSchema(PlaysetSchema, "get_playset", raw);
}

export async function getActivePlayset(
  basePath: GameBasePath,
  profilePath: ProfilePath,
): Promise<Playset> {
  const raw = await invoke("get_active_playset", { basePath, profilePath });
  return validateWithSchema(PlaysetSchema, "get_active_playset", raw);
}

export async function createPlayset(
  basePath: GameBasePath,
  name: string,
): Promise<Playset> {
  const raw = await invoke("create_playset", { basePath, name });
  return validateWithSchema(PlaysetSchema, "create_playset", raw);
}

export async function duplicatePlayset(
  basePath: GameBasePath,
  playsetId: PlaysetId,
  newName: string,
): Promise<Playset> {
  const raw = await invoke("duplicate_playset", {
    basePath,
    playsetId,
    newName,
  });
  return validateWithSchema(PlaysetSchema, "duplicate_playset", raw);
}

export async function renamePlayset(
  basePath: GameBasePath,
  playsetId: PlaysetId,
  newName: string,
): Promise<Playset> {
  const raw = await invoke("rename_playset", { basePath, playsetId, newName });
  return validateWithSchema(PlaysetSchema, "rename_playset", raw);
}

export async function deletePlayset(
  basePath: GameBasePath,
  playsetId: PlaysetId,
): Promise<void> {
  await invoke("delete_playset", { basePath, playsetId });
}

export async function updatePlaysetMetadata(
  basePath: GameBasePath,
  playsetId: PlaysetId,
  patch: PlaysetMetadataPatch,
): Promise<Playset> {
  const validated = validateWithSchema(
    PlaysetMetadataPatchSchema,
    "update_playset_metadata.patch",
    patch,
  );
  const raw = await invoke("update_playset_metadata", {
    basePath,
    playsetId,
    patch: validated,
  });
  return validateWithSchema(PlaysetSchema, "update_playset_metadata", raw);
}

export async function setPlaysetEntries(
  basePath: GameBasePath,
  playsetId: PlaysetId,
  entries: PlaysetEntry[],
): Promise<Playset> {
  const validated = validateWithSchema(
    z.array(PlaysetEntrySchema),
    "set_playset_entries.entries",
    entries,
  );
  const raw = await invoke("set_playset_entries", {
    basePath,
    playsetId,
    entries: validated,
  });
  return validateWithSchema(PlaysetSchema, "set_playset_entries", raw);
}

export async function toggleEntryEnabled(
  basePath: GameBasePath,
  playsetId: PlaysetId,
  modId: ModId,
  enabled: boolean,
): Promise<Playset> {
  const raw = await invoke("toggle_entry_enabled", {
    basePath,
    playsetId,
    modId,
    enabled,
  });
  return validateWithSchema(PlaysetSchema, "toggle_entry_enabled", raw);
}

export async function addModToPlayset(
  basePath: GameBasePath,
  playsetId: PlaysetId,
  modId: ModId,
  displayName: string,
): Promise<Playset> {
  const raw = await invoke("add_mod_to_playset", {
    basePath,
    playsetId,
    modId,
    displayName,
  });
  return validateWithSchema(PlaysetSchema, "add_mod_to_playset", raw);
}

export async function removeModFromPlayset(
  basePath: GameBasePath,
  playsetId: PlaysetId,
  modId: ModId,
): Promise<Playset> {
  const raw = await invoke("remove_mod_from_playset", {
    basePath,
    playsetId,
    modId,
  });
  return validateWithSchema(PlaysetSchema, "remove_mod_from_playset", raw);
}

export async function reorderPlaysetEntries(
  basePath: GameBasePath,
  playsetId: PlaysetId,
  orderedModIds: ModId[],
): Promise<Playset> {
  const raw = await invoke("reorder_playset_entries", {
    basePath,
    playsetId,
    orderedModIds,
  });
  return validateWithSchema(PlaysetSchema, "reorder_playset_entries", raw);
}

export async function setActivePlayset(
  basePath: GameBasePath,
  profilePath: ProfilePath,
  playsetId: PlaysetId,
): Promise<void> {
  await invoke("set_active_playset", { basePath, profilePath, playsetId });
}

export async function applyPlayset(
  basePath: GameBasePath,
  profilePath: ProfilePath,
  playsetId: PlaysetId,
): Promise<DriftReport> {
  const raw = await invoke("apply_playset", {
    basePath,
    profilePath,
    playsetId,
  });
  return validateWithSchema(DriftReportSchema, "apply_playset", raw);
}

export async function saveActiveAsPlayset(
  basePath: GameBasePath,
  profilePath: ProfilePath,
  name: string,
): Promise<Playset> {
  const raw = await invoke("save_active_as_playset", {
    basePath,
    profilePath,
    name,
  });
  return validateWithSchema(PlaysetSchema, "save_active_as_playset", raw);
}

export async function acceptPlaysetDrift(
  basePath: GameBasePath,
  profilePath: ProfilePath,
  playsetId: PlaysetId,
): Promise<Playset> {
  const raw = await invoke("accept_playset_drift", {
    basePath,
    profilePath,
    playsetId,
  });
  return validateWithSchema(PlaysetSchema, "accept_playset_drift", raw);
}

export async function computePlaysetDrift(
  basePath: GameBasePath,
  profilePath: ProfilePath,
  playsetId: PlaysetId,
): Promise<DriftReport> {
  const raw = await invoke("compute_playset_drift", {
    basePath,
    profilePath,
    playsetId,
  });
  return validateWithSchema(DriftReportSchema, "compute_playset_drift", raw);
}

export async function exportPlayset(
  basePath: GameBasePath,
  playsetId: PlaysetId,
  destinationPath: string,
): Promise<void> {
  await invoke("export_playset", {
    basePath,
    playsetId,
    destinationPath,
  });
}

export async function importPlayset(
  basePath: GameBasePath,
  sourcePath: string,
): Promise<Playset> {
  const raw = await invoke("import_playset", { basePath, sourcePath });
  return validateWithSchema(PlaysetSchema, "import_playset", raw);
}

// --- Workshop metadata ---

export async function fetchWorkshopMetadata(
  workshopIds: string[],
): Promise<Record<string, WorkshopMetadata>> {
  const raw = await invoke("fetch_workshop_metadata", { workshopIds });
  return validateWithSchema(
    z.record(z.string(), WorkshopMetadataSchema),
    "fetch_workshop_metadata",
    raw,
  );
}

export async function clearWorkshopMetadataCache(): Promise<void> {
  await invoke("clear_workshop_metadata_cache");
}
