import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/cupertino/tooltip";
import { Toaster } from "@/components/cupertino/sonner";
import { AppSidebar, type View } from "@/components/app-sidebar";
import { ProfileOverview } from "@/features/profiles/profile-overview";
import { ProfileSaves } from "@/features/profiles/profile-saves";
import { ProfileClone } from "@/features/profiles/profile-clone";
import { ProfileBackups } from "@/features/profiles/profile-backups";
import type { GameInstallation, ProfileSummary } from "@/lib/types";
import { useGameDetection } from "@/hooks/use-game-detection";
import { IconHandClick } from "@tabler/icons-react";
import { ThemeProvider } from "@/components/theme-provider";
import { ModeToggle } from "@/components/mode-toggle";

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
        <IconHandClick className="size-7 text-muted-foreground" />
      </div>
      <h2 className="text-lg font-semibold">No profile selected</h2>
      <p className="max-w-sm text-center text-sm text-muted-foreground">
        Use the profile switcher in the top-left corner to select a game and
        profile. All actions require an active profile.
      </p>
    </div>
  );
}

function SettingsView() {
  const [vibrancyMode, setVibrancyMode] = React.useState<"css" | "native">(
    () => (localStorage.getItem("siimac-vibrancy") as "css" | "native") || "css",
  );

  function handleVibrancyChange(mode: "css" | "native") {
    setVibrancyMode(mode);
    localStorage.setItem("siimac-vibrancy", mode);

    import("@/lib/tauri-commands").then(({ setNativeVibrancy }) => {
      setNativeVibrancy(mode === "native");
    });

    document.documentElement.classList.toggle("native-vibrancy", mode === "native");
  }

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">Appearance</h3>
          <p className="text-xs text-muted-foreground">
            Choose light, dark, or match your system setting.
          </p>
        </div>
        <ModeToggle />
      </div>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">Sidebar Translucency</h3>
          <p className="text-xs text-muted-foreground">
            CSS simulates the glass effect. Native uses real macOS vibrancy.
          </p>
        </div>
        <div className="flex gap-1 rounded-lg bg-muted p-0.5">
          <button
            onClick={() => handleVibrancyChange("css")}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-all ${
              vibrancyMode === "css"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground"
            }`}
          >
            CSS
          </button>
          <button
            onClick={() => handleVibrancyChange("native")}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-all ${
              vibrancyMode === "native"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground"
            }`}
          >
            Native
          </button>
        </div>
      </div>
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
        return <SettingsView />;
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
        return <SettingsView />;
    }
  }

  return (
    <SidebarProvider className="h-svh overflow-hidden">
      <AppSidebar
        selectedInstallation={selectedInstallation}
        onSelectInstallation={setSelectedInstallation}
        selectedProfile={selectedProfile}
        onSelectProfile={setSelectedProfile}
        activeView={activeView}
        onViewChange={setActiveView}
      />
      <main className="flex flex-1 flex-col overflow-hidden bg-background">
        {/* Traffic light spacer for overlay title bar */}
        <div className="h-[2.375rem] shrink-0" />
        <header
          data-tauri-drag-region
          className="flex h-12 items-center border-b px-4"
        >
          <SidebarTrigger />
          <h1 className="ml-2 text-sm font-medium">
            {VIEW_LABELS[activeView]}
          </h1>
        </header>
        <div className="flex-1 overflow-hidden" data-slot="content">
          {renderContent()}
        </div>
      </main>
    </SidebarProvider>
  );
}

function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="siimac-theme">
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AppContent />
        <Toaster position="bottom-right" />
      </TooltipProvider>
    </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
