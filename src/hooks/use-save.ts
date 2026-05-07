import { useQuery, queryOptions } from "@tanstack/react-query";
import { getSaveData } from "@/lib/tauri-commands";
import { queryKeys } from "@/lib/query-keys";
import type { SavePath } from "@/lib/core-types";

/**
 * Shared query options so route loaders and components hit the same cache
 * entry. Loaders call `queryClient.ensureQueryData(saveQuery(savePath))` to
 * preload save data before child components mount.
 */
export function saveQuery(savePath: SavePath) {
  return queryOptions({
    queryKey: queryKeys.saves.data(savePath),
    queryFn: () => getSaveData(savePath),
  });
}

export function useSaveData(savePath: SavePath | undefined) {
  return useQuery({
    ...saveQuery(savePath as SavePath),
    enabled: !!savePath,
  });
}
