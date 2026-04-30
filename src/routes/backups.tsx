import { NoProfileSelected } from "@/components/no-profile-selected";
import { createFileRoute } from "@tanstack/react-router";
import { ProfileBackups } from "@/features/profiles/profile-backups";
import { useProfileState } from "@/lib/profile-context";

export const Route = createFileRoute("/backups")({
  component: BackupsPage,
});

function BackupsPage() {
  const { selectedProfile, selectedInstallation } = useProfileState();

  if (!selectedProfile || !selectedInstallation) {
    return <NoProfileSelected />;
  }

  return (
    <ProfileBackups
      profile={selectedProfile}
      installation={selectedInstallation}
    />
  );
}
