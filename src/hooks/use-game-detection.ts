import { useQuery } from "@tanstack/react-query";
import { detectGameInstallations } from "@/lib/tauri-commands";

export function useGameDetection() {
  return useQuery({
    queryKey: ["game-installations"],
    queryFn: detectGameInstallations,
    staleTime: Infinity,
  });
}
