import { createContext, use, useState } from "react";
import { useGameDetection } from "@/hooks/use-game-detection";
import type { GameInstallation, ProfileSummary } from "@/lib/types";

interface ProfileState {
  selectedProfile: ProfileSummary | null;
  setSelectedProfile: (profile: ProfileSummary | null) => void;
  selectedInstallation: GameInstallation | null;
  setSelectedInstallation: (installation: GameInstallation) => void;
}

const ProfileContext = createContext<ProfileState | null>(null);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const { data: installations } = useGameDetection();
  const [selectedInstallation, setSelectedInstallation] =
    useState<GameInstallation | null>(null);
  const [selectedProfile, setSelectedProfile] =
    useState<ProfileSummary | null>(null);

  const firstInstallation = installations?.[0];
  if (firstInstallation && !selectedInstallation) {
    setSelectedInstallation(firstInstallation);
  }

  return (
    <ProfileContext
      value={{
        selectedProfile,
        setSelectedProfile,
        selectedInstallation,
        setSelectedInstallation,
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
