import { NoProfileSelected } from "@/components/no-profile-selected";
import { createFileRoute } from "@tanstack/react-router";
import { ProfileSaves } from "@/features/profiles/profile-saves";
import { useProfileState } from "@/lib/profile-context";

export const Route = createFileRoute("/saves")({
  component: SavesPage,
});

function SavesPage() {
  const { selectedProfile } = useProfileState();

  if (!selectedProfile) {
    return <NoProfileSelected />;
  }

  return <ProfileSaves profile={selectedProfile} />;
}
