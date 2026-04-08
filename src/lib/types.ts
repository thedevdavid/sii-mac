export type Game = "ats" | "ets2";

export interface GameInstallation {
  game: Game;
  base_path: string;
  profiles_path: string;
}

export interface ProfileSummary {
  name: string;
  directory_name: string;
  path: string;
  company_name: string | null;
  save_count: number;
  last_modified: string | null;
}

export interface ProfileDetail {
  name: string;
  directory_name: string;
  path: string;
  company_name: string | null;
  experience_points: number | null;
  money: number | null;
  save_count: number;
  saves: SaveSummary[];
  last_modified: string | null;
  raw_profile_text: string | null;
}

export interface SaveSummary {
  name: string;
  directory_name: string;
  path: string;
  last_modified: string | null;
}

export interface BackupInfo {
  name: string;
  path: string;
  profile_name: string;
  game: Game;
  created_at: string;
}

export interface CloneOptions {
  include_saves: boolean;
  include_config: boolean;
  include_screenshots: boolean;
  selected_saves: string[];
}

export interface AppError {
  kind: string;
  message: string;
}

export function gameDisplayName(game: Game): string {
  return game === "ats"
    ? "American Truck Simulator"
    : "Euro Truck Simulator 2";
}

export function gameShortName(game: Game): string {
  return game === "ats" ? "ATS" : "ETS2";
}
