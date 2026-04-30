import { NoProfileSelected } from "@/components/no-profile-selected";
import { createFileRoute } from "@tanstack/react-router";
import { ModManager } from "@/features/mods/mod-manager";
import { useProfileState } from "@/lib/profile-context";

export const Route = createFileRoute("/mods")({
  component: ModsPage,
});

function ModsPage() {
  const { selectedProfile, selectedInstallation } = useProfileState();

  if (!selectedProfile || !selectedInstallation) {
    return <NoProfileSelected />;
  }

  return (
    <ModManager
      basePath={selectedInstallation.base_path}
      profilePath={selectedProfile.path}
    />
  );
}
