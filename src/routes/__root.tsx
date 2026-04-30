import {
  createRootRouteWithContext,
  Outlet,
  useMatches,
} from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Toaster } from "@/components/cupertino/sonner";
import { AppSidebar } from "@/components/app-sidebar";
import { ProfileProvider, useProfileState } from "@/lib/profile-context";

export interface RouterContext {
  queryClient: QueryClient;
}

const ROUTE_LABELS: Record<string, string> = {
  "/": "Overview",
  "/overview": "Overview",
  "/saves": "Saves",
  "/mods": "Mods",
  "/compare": "Compare",
  "/clone": "Clone Profile",
  "/backups": "Backups",
  "/settings": "Settings",
};

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
});

function RootLayout() {
  const matches = useMatches();
  const currentPath = matches[matches.length - 1]?.pathname ?? "/";
  const pageTitle = ROUTE_LABELS[currentPath]
    ?? (currentPath.startsWith("/editor/") ? "Save Editor" : "Overview");

  return (
    <ProfileProvider>
      <RootContent pageTitle={pageTitle} />
    </ProfileProvider>
  );
}

function RootContent({ pageTitle }: { pageTitle: string }) {
  const {
    selectedProfile,
    setSelectedProfile,
    selectedInstallation,
    setSelectedInstallation,
  } = useProfileState();

  return (
    <SidebarProvider className="h-svh overflow-hidden">
      <AppSidebar
        selectedInstallation={selectedInstallation}
        onSelectInstallation={setSelectedInstallation}
        selectedProfile={selectedProfile}
        onSelectProfile={setSelectedProfile}
      />
      <main className="flex flex-1 flex-col overflow-hidden bg-background">
        <div className="h-[2.375rem] shrink-0" />
        <header
          data-tauri-drag-region
          className="flex h-10 items-center border-b px-4"
        >
          <SidebarTrigger />
          <h1 className="ml-2 text-sm font-medium">{pageTitle}</h1>
        </header>
        <div className="flex-1 overflow-hidden" data-slot="content">
          <Outlet />
        </div>
      </main>
      <Toaster position="bottom-right" />
    </SidebarProvider>
  );
}
