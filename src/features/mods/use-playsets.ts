import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { formatError } from "@/lib/format-error";
import { queryKeys } from "@/lib/query-keys";
import type { GameBasePath, PlaysetId, ProfilePath } from "@/lib/core-types";
import {
  computePlaysetDrift,
  fetchWorkshopMetadata,
  getActivePlayset,
  getPlayset,
  listPlaysets,
  refreshInstallationMods,
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
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: queryKeys.playsets.active(basePath ?? "", profilePath ?? ""),
    queryFn: async () => {
      const playset = await getActivePlayset(
        basePath as GameBasePath,
        profilePath as ProfilePath,
      );
      // The backend reconciles a per-profile "live" temporary playset
      // against profile.sii every time this command runs. That side effect
      // can add or remove a playset in the installation library, so the
      // sidebar list cache must be refetched to stay in sync.
      void queryClient.invalidateQueries({
        queryKey: queryKeys.playsets.list(basePath ?? ""),
      });
      return playset;
    },
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
    queryKey: queryKeys.playsets.drift(
      basePath ?? "",
      profilePath ?? "",
      playsetId ?? "",
    ),
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
    // Filesystem scan is expensive — survive route navigations.
    gcTime: Number.POSITIVE_INFINITY,
  });
}

/**
 * Force a fresh disk scan and update the React Query cache. Mods added or
 * removed outside the app (manual file copy, mod manager, etc.) are otherwise
 * invisible because both the Rust scan cache and React Query store the result
 * with `staleTime: Infinity`.
 */
export function useRefreshInstallationMods(
  basePath: GameBasePath | null | undefined,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => refreshInstallationMods(basePath as GameBasePath),
    onSuccess: (mods) => {
      queryClient.setQueryData(queryKeys.mods.scan(basePath ?? ""), mods);
      // Drift recomputes against the freshly scanned mods, so its derived
      // result is now stale.
      queryClient.invalidateQueries({
        queryKey: queryKeys.playsets.driftPrefix(basePath ?? ""),
      });
      toast.success(`Rescanned: ${mods.length} mods found`);
    },
    onError: (err) => toast.error(`Refresh failed: ${formatError(err)}`),
  });
}

export function useWorkshopMetadata(
  basePath: GameBasePath | null | undefined,
  workshopIds: string[],
) {
  return useQuery({
    queryKey: queryKeys.workshop.metadataFor(basePath ?? "", workshopIds),
    queryFn: () => fetchWorkshopMetadata(workshopIds),
    enabled: Boolean(basePath) && workshopIds.length > 0,
    staleTime: Infinity,
    gcTime: Number.POSITIVE_INFINITY,
    retry: 1,
    refetchOnWindowFocus: false,
  });
}
