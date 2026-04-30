import { NoProfileSelected } from "@/components/no-profile-selected";
import { createFileRoute } from "@tanstack/react-router";
import { ProfileOverview } from "@/features/profiles/profile-overview";
import { useProfileState } from "@/lib/profile-context";

export const Route = createFileRoute("/overview")({
  component: OverviewPage,
});

function OverviewPage() {
  const { selectedProfile, selectedInstallation, setSelectedProfile } =
    useProfileState();

  if (!selectedProfile || !selectedInstallation) {
    return <NoProfileSelected />;
  }

  return (
    <ProfileOverview
      profile={selectedProfile}
      installation={selectedInstallation}
      onProfileDeleted={() => setSelectedProfile(null)}
    />
  );
}
