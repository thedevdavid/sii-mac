import { useQuery } from "@tanstack/react-query";
import {
  listProfiles,
  getProfileDetail,
  scanProfileContents,
} from "@/lib/tauri-commands";

export function useProfiles(profilesPath: string | undefined) {
  return useQuery({
    queryKey: ["profiles", profilesPath],
    queryFn: () => listProfiles(profilesPath!),
    enabled: !!profilesPath,
  });
}

export function useProfileDetail(profilePath: string | undefined) {
  return useQuery({
    queryKey: ["profile-detail", profilePath],
    queryFn: () => getProfileDetail(profilePath!),
    enabled: !!profilePath,
  });
}

export function useProfileContents(profilePath: string | undefined) {
  return useQuery({
    queryKey: ["profile-contents", profilePath],
    queryFn: () => scanProfileContents(profilePath!),
    enabled: !!profilePath,
  });
}
