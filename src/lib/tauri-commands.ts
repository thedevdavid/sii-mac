import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import {
  BackupInfoSchema,
  type CloneOptions,
  GameInstallationSchema,
  ProfileContentsSchema,
  ProfileDetailSchema,
  ProfileSummarySchema,
  SaveSummarySchema,
  type BackupInfo,
  type GameInstallation,
  type ProfileContents,
  type ProfileDetail,
  type ProfileSummary,
  type SaveSummary,
} from "./types";

export async function detectGameInstallations(): Promise<GameInstallation[]> {
  const raw = await invoke("detect_game_installations");
  return z.array(GameInstallationSchema).parse(raw);
}

export async function listProfiles(
  profilesPath: string,
): Promise<ProfileSummary[]> {
  const raw = await invoke("list_profiles", { profilesPath });
  return z.array(ProfileSummarySchema).parse(raw);
}

export async function getProfileDetail(
  profilePath: string,
): Promise<ProfileDetail> {
  const raw = await invoke("get_profile_detail", { profilePath });
  return ProfileDetailSchema.parse(raw);
}

export async function scanProfileContents(
  profilePath: string,
): Promise<ProfileContents> {
  const raw = await invoke("scan_profile_contents", { profilePath });
  return ProfileContentsSchema.parse(raw);
}

export async function cloneProfile(
  sourcePath: string,
  newName: string,
  options?: CloneOptions,
): Promise<ProfileSummary> {
  const raw = await invoke("clone_profile", { sourcePath, newName, options });
  return ProfileSummarySchema.parse(raw);
}

export async function renameProfile(
  profilePath: string,
  newName: string,
): Promise<ProfileSummary> {
  const raw = await invoke("rename_profile", { profilePath, newName });
  return ProfileSummarySchema.parse(raw);
}

export async function deleteProfile(profilePath: string): Promise<void> {
  await invoke("delete_profile", { profilePath });
}

export async function listSaves(
  profilePath: string,
): Promise<SaveSummary[]> {
  const raw = await invoke("list_saves", { profilePath });
  return z.array(SaveSummarySchema).parse(raw);
}

export async function backupProfile(
  profilePath: string,
  backupDir?: string,
): Promise<string> {
  const raw = await invoke("backup_profile", { profilePath, backupDir });
  return z.string().parse(raw);
}

export async function listBackups(
  backupDir?: string,
): Promise<BackupInfo[]> {
  const raw = await invoke("list_backups", { backupDir });
  return z.array(BackupInfoSchema).parse(raw);
}

export async function restoreBackup(
  backupPath: string,
  profilesDir: string,
): Promise<string> {
  const raw = await invoke("restore_backup", { backupPath, profilesDir });
  return z.string().parse(raw);
}

export function setNativeVibrancy(enabled: boolean): Promise<void> {
  return invoke("set_native_vibrancy", { enabled });
}
