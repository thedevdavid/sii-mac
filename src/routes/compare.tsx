import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ProfileCompare } from "@/features/profiles/profile-compare";
import { useGameDetection } from "@/hooks/use-game-detection";
import { useAllProfiles } from "@/hooks/use-profiles";

const compareSearchSchema = z.object({
  pathA: z.string().optional(),
  pathB: z.string().optional(),
});

export const Route = createFileRoute("/compare")({
  component: ComparePage,
  validateSearch: compareSearchSchema,
});

function ComparePage() {
  const { data: installations } = useGameDetection();
  const { profilesByInstallation } = useAllProfiles(installations);

  return (
    <ProfileCompare
      installations={installations ?? []}
      profilesByInstallation={profilesByInstallation}
    />
  );
}
