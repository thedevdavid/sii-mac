import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { AppSidebar, type View } from "@/components/app-sidebar";
import { ProfileOverview } from "@/features/profiles/profile-overview";
import { ProfileSaves } from "@/features/profiles/profile-saves";
import { ProfileClone } from "@/features/profiles/profile-clone";
import { ProfileBackups } from "@/features/profiles/profile-backups";
import type { GameInstallation, ProfileSummary } from "@/lib/types";
import { useGameDetection } from "@/hooks/use-game-detection";
import { Settings, MousePointerClick } from "lucide-react";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const VIEW_LABELS: Record<View, string> = {
  overview: "Overview",
  saves: "Saves",
  clone: "Clone Profile",
  backups: "Backups",
  settings: "Settings",
};

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-12">
      <div className="flex size-16 items-center justify-center rounded-full bg-muted">
        <MousePointerClick className="size-7 text-muted-foreground" />
      </div>
      <h2 className="text-lg font-semibold">No profile selected</h2>
      <p className="max-w-sm text-center text-sm text-muted-foreground">
        Use the profile switcher in the top-left corner to select a game and
        profile. All actions require an active profile.
      </p>
    </div>
  );
}

function AppContent() {
  const { data: installations } = useGameDetection();
  const [selectedInstallation, setSelectedInstallation] =
    React.useState<GameInstallation | null>(null);
  const [selectedProfile, setSelectedProfile] =
    React.useState<ProfileSummary | null>(null);
  const [activeView, setActiveView] = React.useState<View>("overview");

  // Auto-select first installation when detected
  const firstInstallation = installations?.[0];
  if (firstInstallation && !selectedInstallation) {
    setSelectedInstallation(firstInstallation);
  }

  function handleProfileDeleted() {
    setSelectedProfile(null);
    setActiveView("overview");
  }

  function renderContent() {
    // No profile selected — show empty state for profile-scoped views
    if (!selectedProfile || !selectedInstallation) {
      if (activeView === "settings") {
        return (
          <div className="flex flex-col items-center justify-center gap-4 p-12">
            <Settings className="size-12 text-muted-foreground" />
            <p className="text-lg text-muted-foreground">Settings</p>
            <p className="text-sm text-muted-foreground">Coming soon</p>
          </div>
        );
      }
      return <EmptyState />;
    }

    switch (activeView) {
      case "overview":
        return (
          <ProfileOverview
            profile={selectedProfile}
            installation={selectedInstallation}
            onProfileDeleted={handleProfileDeleted}
            onNavigate={setActiveView}
          />
        );
      case "saves":
        return <ProfileSaves profile={selectedProfile} />;
      case "clone":
        return (
          <ProfileClone
            profile={selectedProfile}
            installation={selectedInstallation}
          />
        );
      case "backups":
        return (
          <ProfileBackups
            profile={selectedProfile}
            installation={selectedInstallation}
          />
        );
      case "settings":
        return (
          <div className="flex flex-col items-center justify-center gap-4 p-12">
            <Settings className="size-12 text-muted-foreground" />
            <p className="text-lg text-muted-foreground">Settings</p>
            <p className="text-sm text-muted-foreground">Coming soon</p>
          </div>
        );
    }
  }

  return (
    <SidebarProvider>
      <AppSidebar
        selectedInstallation={selectedInstallation}
        onSelectInstallation={setSelectedInstallation}
        selectedProfile={selectedProfile}
        onSelectProfile={setSelectedProfile}
        activeView={activeView}
        onViewChange={setActiveView}
      />
      <main className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-12 items-center border-b px-4">
          <SidebarTrigger />
          <h1 className="ml-2 text-sm font-medium">
            {VIEW_LABELS[activeView]}
          </h1>
        </header>
        <div className="flex-1 overflow-hidden">{renderContent()}</div>
      </main>
    </SidebarProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AppContent />
        <Toaster position="bottom-right" />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
