import { NoProfileSelected } from "@/components/no-profile-selected";
import { createFileRoute } from "@tanstack/react-router";
import { ProfileClone } from "@/features/profiles/profile-clone";
import { useProfileState } from "@/lib/profile-context";

export const Route = createFileRoute("/clone")({
  component: ClonePage,
});

function ClonePage() {
  const { selectedProfile, selectedInstallation } = useProfileState();

  if (!selectedProfile || !selectedInstallation) {
    return <NoProfileSelected />;
  }

  return (
    <ProfileClone
      profile={selectedProfile}
      installation={selectedInstallation}
    />
  );
}
