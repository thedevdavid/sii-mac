import { useQuery, useQueries } from "@tanstack/react-query";
import {
  listProfiles,
  getProfileDetail,
  scanProfileContents,
} from "@/lib/tauri-commands";
import { queryKeys } from "@/lib/query-keys";
import type {
  GameInstallation,
  ProfilePath,
  ProfilesPath,
} from "@/lib/core-types";
import type { ProfileSummary } from "@/features/profiles/types";

export function useProfiles(profilesPath: ProfilesPath | undefined) {
  return useQuery({
    queryKey: queryKeys.profiles.list(profilesPath!),
    queryFn: () => listProfiles(profilesPath!),
    enabled: !!profilesPath,
    staleTime: Infinity,
  });
}

/** Fetch profiles for ALL installations in parallel. */
export function useAllProfiles(installations: GameInstallation[] | undefined) {
  const queries = useQueries({
    queries: (installations ?? []).map((inst) => ({
      queryKey: queryKeys.profiles.list(inst.profiles_path),
      queryFn: () => listProfiles(inst.profiles_path),
      staleTime: Infinity,
    })),
  });

  const profilesByInstallation = new Map<string, ProfileSummary[]>();
  (installations ?? []).forEach((inst, i) => {
    if (queries[i]?.data) {
      profilesByInstallation.set(inst.base_path, queries[i].data!);
    }
  });

  return {
    profilesByInstallation,
    isLoading: queries.some((q) => q.isLoading),
  };
}

export function useProfileDetail(profilePath: ProfilePath | undefined) {
  return useQuery({
    queryKey: queryKeys.profiles.detail(profilePath!),
    queryFn: () => getProfileDetail(profilePath!),
    enabled: !!profilePath,
    staleTime: Infinity,
  });
}

export function useProfileContents(profilePath: ProfilePath | undefined) {
  return useQuery({
    queryKey: queryKeys.profiles.contents(profilePath!),
    queryFn: () => scanProfileContents(profilePath!),
    enabled: !!profilePath,
    staleTime: Infinity,
  });
}
