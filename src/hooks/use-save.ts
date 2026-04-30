import { useQuery } from "@tanstack/react-query";
import { getSaveData } from "@/lib/tauri-commands";
import { queryKeys } from "@/lib/query-keys";
import type { SavePath } from "@/lib/core-types";

export function useSaveData(savePath: SavePath | undefined) {
  return useQuery({
    queryKey: queryKeys.saves.data(savePath!),
    queryFn: () => getSaveData(savePath!),
    enabled: !!savePath,
  });
}
