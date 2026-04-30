import { createContext, use, useState } from "react";
import { useGameDetection } from "@/hooks/use-game-detection";
import type { GameInstallation } from "@/lib/core-types";
import type { ProfileSummary } from "@/features/profiles/types";

interface ProfileState {
  selectedProfile: ProfileSummary | null;
  setSelectedProfile: (profile: ProfileSummary | null) => void;
  selectedInstallation: GameInstallation | null;
  setSelectedInstallation: (installation: GameInstallation) => void;
}

const ProfileContext = createContext<ProfileState | null>(null);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const { data: installations } = useGameDetection();
  const [explicitInstallation, setExplicitInstallation] =
    useState<GameInstallation | null>(null);
  const [selectedProfile, setSelectedProfile] =
    useState<ProfileSummary | null>(null);

  // Derive effective installation: explicit user selection → first auto-detected → null
  const selectedInstallation =
    explicitInstallation ?? installations?.[0] ?? null;

  return (
    <ProfileContext
      value={{
        selectedProfile,
        setSelectedProfile,
        selectedInstallation,
        setSelectedInstallation: setExplicitInstallation,
      }}
    >
      {children}
    </ProfileContext>
  );
}

export function useProfileState() {
  const ctx = use(ProfileContext);
  if (!ctx) throw new Error("useProfileState must be used within ProfileProvider");
  return ctx;
}
