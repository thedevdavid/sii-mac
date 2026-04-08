import { invoke } from "@tauri-apps/api/core";
import type {
  BackupInfo,
  CloneOptions,
  GameInstallation,
  ProfileDetail,
  ProfileSummary,
  SaveSummary,
} from "./types";

export function detectGameInstallations(): Promise<GameInstallation[]> {
  return invoke("detect_game_installations");
}

export function listProfiles(profilesPath: string): Promise<ProfileSummary[]> {
  return invoke("list_profiles", { profilesPath });
}

export function getProfileDetail(profilePath: string): Promise<ProfileDetail> {
  return invoke("get_profile_detail", { profilePath });
}

export function cloneProfile(
  sourcePath: string,
  newName: string,
  options?: CloneOptions,
): Promise<ProfileSummary> {
  return invoke("clone_profile", { sourcePath, newName, options });
}

export function renameProfile(
  profilePath: string,
  newName: string,
): Promise<ProfileSummary> {
  return invoke("rename_profile", { profilePath, newName });
}

export function deleteProfile(profilePath: string): Promise<void> {
  return invoke("delete_profile", { profilePath });
}

export function listSaves(profilePath: string): Promise<SaveSummary[]> {
  return invoke("list_saves", { profilePath });
}

export function backupProfile(
  profilePath: string,
  backupDir?: string,
): Promise<string> {
  return invoke("backup_profile", { profilePath, backupDir });
}

export function listBackups(backupDir?: string): Promise<BackupInfo[]> {
  return invoke("list_backups", { backupDir });
}

export function restoreBackup(
  backupPath: string,
  profilesDir: string,
): Promise<string> {
  return invoke("restore_backup", { backupPath, profilesDir });
}
