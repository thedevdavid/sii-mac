import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import type { GameBasePath, PlaysetId, ProfilePath } from "@/lib/core-types";
import {
  computePlaysetDrift,
  fetchWorkshopMetadata,
  getActivePlayset,
  getPlayset,
  listPlaysets,
  scanInstallationMods,
} from "@/lib/tauri-commands";

export function usePlaysets(basePath: GameBasePath | null | undefined) {
  return useQuery({
    queryKey: queryKeys.playsets.list(basePath ?? ""),
    queryFn: () => listPlaysets(basePath as GameBasePath),
    enabled: Boolean(basePath),
    staleTime: Infinity,
  });
}

export function usePlaysetDetail(
  basePath: GameBasePath | null | undefined,
  playsetId: PlaysetId | null | undefined,
) {
  return useQuery({
    queryKey: queryKeys.playsets.detail(basePath ?? "", playsetId ?? ""),
    queryFn: () =>
      getPlayset(basePath as GameBasePath, playsetId as PlaysetId),
    enabled: Boolean(basePath && playsetId),
    staleTime: Infinity,
  });
}

export function useActivePlayset(
  basePath: GameBasePath | null | undefined,
  profilePath: ProfilePath | null | undefined,
) {
  return useQuery({
    queryKey: queryKeys.playsets.active(profilePath ?? ""),
    queryFn: () =>
      getActivePlayset(basePath as GameBasePath, profilePath as ProfilePath),
    enabled: Boolean(basePath && profilePath),
    staleTime: Infinity,
  });
}

export function usePlaysetDrift(
  basePath: GameBasePath | null | undefined,
  profilePath: ProfilePath | null | undefined,
  playsetId: PlaysetId | null | undefined,
) {
  return useQuery({
    queryKey: queryKeys.playsets.drift(profilePath ?? "", playsetId ?? ""),
    queryFn: () =>
      computePlaysetDrift(
        basePath as GameBasePath,
        profilePath as ProfilePath,
        playsetId as PlaysetId,
      ),
    enabled: Boolean(basePath && profilePath && playsetId),
    staleTime: Infinity,
  });
}

export function useInstallationMods(basePath: GameBasePath | null | undefined) {
  return useQuery({
    queryKey: queryKeys.mods.scan(basePath ?? ""),
    queryFn: () => scanInstallationMods(basePath as GameBasePath),
    enabled: Boolean(basePath),
    staleTime: Infinity,
    gcTime: Number.POSITIVE_INFINITY,
  });
}

export function useWorkshopMetadata(
  basePath: GameBasePath | null | undefined,
  workshopIds: string[],
) {
  const idsKey = workshopIds.slice().sort().join(",");
  return useQuery({
    queryKey: [...queryKeys.workshop.metadata(basePath ?? ""), idsKey] as const,
    queryFn: () => fetchWorkshopMetadata(workshopIds),
    enabled: Boolean(basePath) && workshopIds.length > 0,
    staleTime: Infinity,
    gcTime: Number.POSITIVE_INFINITY,
    retry: 1,
    refetchOnWindowFocus: false,
  });
}
