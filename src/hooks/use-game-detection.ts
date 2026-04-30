import { useQuery } from "@tanstack/react-query";
import { detectGameInstallations } from "@/lib/tauri-commands";
import { queryKeys } from "@/lib/query-keys";

export function useGameDetection() {
  return useQuery({
    queryKey: queryKeys.installations.all(),
    queryFn: detectGameInstallations,
    staleTime: Infinity,
  });
}
